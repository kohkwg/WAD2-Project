/**
 * Automatic event planner: suggests a programme and a task list for a new event from
 * past events. Pure functions only: no database, network or clock (pass `now`).
 *
 * target:    { title, description, category, tags[], capacity, startsAt, endsAt }
 * candidate: { id, title, description, category, tags[], capacity, startsAt, endsAt,
 *              own (bool), attendance (0..1 | null),
 *              programme: [{ title, description, startsAt, endsAt }],
 *              tasks: [{ title, notes, position }] }
 *
 * `own` candidates are the caller's own events; only they may carry tasks (other
 * organisers' tasks are private, so callers never supply them). Programme times are
 * returned as fractions of the event's length so the caller can fit them to the new
 * event's final dates.
 *
 * 1. Exact title (ignoring case/spacing): copy the best past event's programme, and
 *    its tasks when that event is the caller's own.
 * 2. Otherwise score similar ended events (text, tags, category, size), weight them
 *    by similarity, age and attendance, group matching items and keep the ones that
 *    enough neighbours share. Community patterns need >= 3 events and 40% of the
 *    (weighted) neighbours; own events need 40% too, but a single event is enough.
 */

const CONFIG = Object.freeze({
  weights: Object.freeze({ text: 0.40, tags: 0.30, category: 0.15, scale: 0.15 }),
  textFieldWeights: Object.freeze({ title: 3, category: 2, tags: 2, description: 1 }),
  minSimilarity: 0.40,
  minText: 0.08, // a shared tag and a similar size alone never make events neighbours
  maxNeighbours: 10, // per pool (own / community)
  recencyHalfLifeDays: 365,
  minRecency: 0.25,
  clusterJaccard: 0.6,
  clusterTimeGap: 0.2, // programme items merge only if they sit at a similar point of the event
  dedupeTimeGap: 0.15,
  community: Object.freeze({ minEvents: 3, minShare: 0.4 }),
  own: Object.freeze({ minEvents: 1, minShare: 0.4 }),
  roundMinutes: 5,
});

const DAY_MS = 86400000;
const MINUTE_MS = 60000;
const STOPWORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "to", "with", "our", "my", "your"]);
const clamp01 = value => Math.max(0, Math.min(1, value));
const isNumber = value => typeof value === "number" && Number.isFinite(value);

function normalizeTitle(title) {
  return String(title ?? "").normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

function tokenize(text) {
  const tokens = String(text ?? "").normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return tokens
    .filter(token => token.length > 1 && !STOPWORDS.has(token))
    .map(token => (token.length > 3 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token));
}

function tagList(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).filter(tag => typeof tag === "string" && tag.trim()).map(tag => tag.trim().toLowerCase()))];
}

function termFrequencies(event) {
  const frequencies = new Map();
  const add = (tokens, weight) => tokens.forEach(token => frequencies.set(token, (frequencies.get(token) || 0) + weight));
  const fields = CONFIG.textFieldWeights;
  add(tokenize(event.title), fields.title);
  add(tokenize(event.description), fields.description);
  add(tokenize(event.category), fields.category);
  add(tagList(event.tags).flatMap(tokenize), fields.tags);
  return frequencies;
}

function inverseDocumentFrequencies(vectors) {
  const documentFrequency = new Map();
  for (const vector of vectors) for (const token of vector.keys()) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
  const idf = new Map();
  for (const [token, count] of documentFrequency) idf.set(token, Math.log((vectors.length + 1) / (count + 1)) + 1);
  return idf;
}

function cosine(a, b, idf) {
  let dot = 0, normA = 0, normB = 0;
  for (const [token, tf] of a) {
    const weight = tf * (idf.get(token) || 1);
    normA += weight * weight;
    if (b.has(token)) dot += weight * b.get(token) * (idf.get(token) || 1);
  }
  for (const [token, tf] of b) normB += (tf * (idf.get(token) || 1)) ** 2;
  return normA && normB ? clamp01(dot / Math.sqrt(normA * normB)) : null;
}

// Shared tokens relative to the smaller title: 1 when one title's words all appear in the other's
function containment(a, b) {
  const left = new Set(a), right = new Set(b);
  if (!left.size || !right.size) return null;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared++;
  return shared / Math.min(left.size, right.size);
}

function jaccard(a, b) {
  const left = new Set(a), right = new Set(b);
  if (!left.size || !right.size) return null;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared++;
  return shared / (left.size + right.size - shared);
}

// 1 when equal, falling to 0 at a 4x difference; null when either is missing
function ratioSimilarity(a, b) {
  if (!(isNumber(a) && a > 0 && isNumber(b) && b > 0)) return null;
  return 1 - Math.min(1, Math.abs(Math.log(a / b)) / Math.log(4));
}

function durationMinutes(event) {
  const minutes = (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / MINUTE_MS;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function similarityFrom(target, candidate, targetVector, candidateVector, idf) {
  const scaleParts = [ratioSimilarity(target.capacity, candidate.capacity), ratioSimilarity(durationMinutes(target), durationMinutes(candidate))].filter(isNumber);
  const category = normalizeTitle(target.category) && normalizeTitle(candidate.category)
    ? (normalizeTitle(target.category) === normalizeTitle(candidate.category) ? 1 : 0)
    : null;
  const parts = {
    text: cosine(targetVector, candidateVector, idf),
    tags: jaccard(tagList(target.tags), tagList(candidate.tags)),
    category,
    scale: scaleParts.length ? scaleParts.reduce((sum, value) => sum + value, 0) / scaleParts.length : null,
  };
  // Components a pair cannot provide (no tags, no capacity...) are left out and the
  // remaining weights renormalised, so missing data never counts as a mismatch.
  let total = 0, weighted = 0;
  for (const [name, weight] of Object.entries(CONFIG.weights)) {
    if (isNumber(parts[name])) { total += weight; weighted += weight * parts[name]; }
  }
  return { score: total ? weighted / total : 0, parts };
}

function similarity(target, candidate) {
  const targetVector = termFrequencies(target);
  const candidateVector = termFrequencies(candidate);
  const idf = inverseDocumentFrequencies([targetVector, candidateVector]);
  return similarityFrom(target, candidate, targetVector, candidateVector, idf);
}

function neighbourWeight(score, candidate, nowMs) {
  const ageDays = Math.max(0, (nowMs - Date.parse(candidate.endsAt)) / DAY_MS);
  const recency = Math.max(CONFIG.minRecency, 0.5 ** (ageDays / CONFIG.recencyHalfLifeDays));
  const attendance = isNumber(candidate.attendance) ? clamp01(candidate.attendance) : 0.5;
  return score * recency * (0.7 + 0.3 * attendance);
}

function hasEnded(candidate, nowMs) {
  const end = Date.parse(candidate.endsAt);
  return Number.isFinite(end) && end < nowMs;
}

function weightedMedian(entries) {
  const sorted = entries.filter(entry => isNumber(entry.value) && entry.weight > 0).sort((a, b) => a.value - b.value);
  if (!sorted.length) return null;
  const half = sorted.reduce((sum, entry) => sum + entry.weight, 0) / 2;
  let running = 0;
  for (const entry of sorted) {
    running += entry.weight;
    if (running >= half) return entry.value;
  }
  return sorted.at(-1).value;
}

// A candidate's programme as fractions of its own length (null when it has no valid length)
function programmeFractions(candidate) {
  const length = durationMinutes(candidate);
  if (!length) return [];
  const eventStart = Date.parse(candidate.startsAt);
  return (candidate.programme || []).flatMap(item => {
    const title = String(item?.title ?? "").trim();
    const start = Date.parse(item?.startsAt);
    if (!title || !Number.isFinite(start)) return [];
    const end = Date.parse(item?.endsAt);
    return [{
      title,
      description: String(item?.description ?? "").trim(),
      startFraction: clamp01((start - eventStart) / MINUTE_MS / length),
      durationFraction: Number.isFinite(end) && end > start ? clamp01((end - start) / MINUTE_MS / length) : null,
    }];
  }).sort((a, b) => a.startFraction - b.startFraction);
}

function orderedTasks(candidate) {
  return (candidate.tasks || [])
    .map((task, index) => ({ title: String(task?.title ?? "").trim(), notes: String(task?.notes ?? "").trim(), position: isNumber(task?.position) ? task.position : index }))
    .filter(task => task.title)
    .sort((a, b) => a.position - b.position);
}

function itemTokens(title) {
  const tokens = tokenize(title);
  return tokens.length ? tokens : [normalizeTitle(title)];
}

// Greedy grouping of similar item titles; one item per event per group. `near` (optional)
// can veto a merge, e.g. the same title at a very different time.
function clusterItems(items, near = () => true) {
  const clusters = [];
  for (const item of [...items].sort((a, b) => b.weight - a.weight)) {
    let best = null, bestScore = 0;
    for (const cluster of clusters) {
      if (cluster.members.some(member => member.eventId === item.eventId) || !near(item, cluster.members[0])) continue;
      // Similar wording: enough shared words, or one title's words all appear in the other
      const score = Math.max(jaccard(cluster.tokens, item.tokens) ?? 0, (containment(cluster.tokens, item.tokens) ?? 0) >= 1 ? CONFIG.clusterJaccard : 0);
      if (score >= CONFIG.clusterJaccard && score > bestScore) { best = cluster; bestScore = score; }
    }
    if (best) best.members.push(item);
    else clusters.push({ tokens: item.tokens, members: [item] });
  }
  return clusters;
}

function keepClusters(clusters, totalWeight, rule) {
  return clusters.filter(cluster => {
    const share = totalWeight > 0 ? cluster.members.reduce((sum, member) => sum + member.weight, 0) / totalWeight : 0;
    return cluster.members.length >= rule.minEvents && share >= rule.minShare;
  });
}

function dominantTitle(members) {
  const byTitle = new Map();
  for (const member of members) {
    const key = normalizeTitle(member.title);
    const entry = byTitle.get(key) || { title: member.title, weight: 0 };
    entry.weight += member.weight;
    byTitle.set(key, entry);
  }
  return [...byTitle.values()].sort((a, b) => b.weight - a.weight)[0].title;
}

function heaviest(members, field) {
  return [...members].sort((a, b) => b.weight - a.weight).find(member => member[field])?.[field] || "";
}

function poolNeighbours(target, candidates, nowMs) {
  const targetVector = termFrequencies(target);
  const ended = candidates.filter(candidate => candidate && hasEnded(candidate, nowMs) && candidate.id !== target.id);
  const vectors = ended.map(termFrequencies);
  const idf = inverseDocumentFrequencies([targetVector, ...vectors]);
  return ended
    .map((candidate, index) => ({ candidate, ...similarityFrom(target, candidate, targetVector, vectors[index], idf) }))
    .filter(entry => entry.score >= CONFIG.minSimilarity && (entry.parts.text === null || entry.parts.text >= CONFIG.minText))
    .sort((a, b) => b.score - a.score || Date.parse(b.candidate.endsAt) - Date.parse(a.candidate.endsAt))
    .slice(0, CONFIG.maxNeighbours)
    .map(entry => ({ ...entry, weight: neighbourWeight(entry.score, entry.candidate, nowMs) }));
}

function programmeClusters(neighbours, rule) {
  const withItems = neighbours.map(entry => ({ ...entry, items: programmeFractions(entry.candidate) })).filter(entry => entry.items.length);
  const totalWeight = withItems.reduce((sum, entry) => sum + entry.weight, 0);
  const items = withItems.flatMap(entry => entry.items.map(item => ({ ...item, eventId: entry.candidate.id, weight: entry.weight, tokens: itemTokens(item.title) })));
  const nearInTime = (item, seed) => Math.abs(item.startFraction - seed.startFraction) <= CONFIG.clusterTimeGap;
  return keepClusters(clusterItems(items, nearInTime), totalWeight, rule).map(cluster => ({
    tokens: cluster.tokens,
    item: {
      title: dominantTitle(cluster.members),
      description: heaviest(cluster.members, "description"),
      startFraction: weightedMedian(cluster.members.map(member => ({ value: member.startFraction, weight: member.weight }))),
      durationFraction: weightedMedian(cluster.members.filter(member => member.durationFraction !== null).map(member => ({ value: member.durationFraction, weight: member.weight }))),
    },
  }));
}

function taskClusters(neighbours, rule) {
  const withTasks = neighbours.map(entry => ({ ...entry, tasks: orderedTasks(entry.candidate) })).filter(entry => entry.tasks.length);
  const totalWeight = withTasks.reduce((sum, entry) => sum + entry.weight, 0);
  const items = withTasks.flatMap(entry => entry.tasks.map((task, index) => ({
    title: task.title, notes: task.notes, eventId: entry.candidate.id, weight: entry.weight, tokens: itemTokens(task.title),
    order: entry.tasks.length > 1 ? index / (entry.tasks.length - 1) : 0.5,
  })));
  return keepClusters(clusterItems(items), totalWeight, rule).map(cluster => {
    const weight = cluster.members.reduce((sum, member) => sum + member.weight, 0);
    return {
      order: cluster.members.reduce((sum, member) => sum + member.order * member.weight, 0) / weight,
      task: { title: dominantTitle(cluster.members), notes: heaviest(cluster.members, "notes") },
    };
  }).sort((a, b) => a.order - b.order).map(entry => entry.task);
}

function exactMatch(target, candidates, nowMs) {
  const wanted = normalizeTitle(target.title);
  const exact = candidates.filter(candidate => candidate && candidate.id !== target.id && hasEnded(candidate, nowMs) && normalizeTitle(candidate.title) === wanted);
  const best = pool => exact
    .filter(candidate => Boolean(candidate.own) === pool)
    .map(candidate => ({ candidate, score: similarity(target, candidate).score }))
    .sort((a, b) => b.score - a.score
      || Date.parse(b.candidate.endsAt) - Date.parse(a.candidate.endsAt)
      || (isNumber(b.candidate.attendance) ? b.candidate.attendance : -1) - (isNumber(a.candidate.attendance) ? a.candidate.attendance : -1))
    .map(entry => entry.candidate)[0] || null;
  const own = best(true);
  const community = best(false);
  const programmeFrom = [own, community].find(candidate => candidate && programmeFractions(candidate).length) || null;
  const tasks = own ? orderedTasks(own) : [];
  if (!programmeFrom && !tasks.length) return null;
  const used = [programmeFrom, tasks.length ? own : null].filter(Boolean);
  return {
    source: "exact",
    basedOn: [...new Map(used.map(candidate => [candidate.id, { title: candidate.title, kind: candidate.own ? "own" : "community" }])).values()],
    programme: programmeFrom ? programmeFractions(programmeFrom) : [],
    tasks: tasks.map(({ title, notes }) => ({ title, notes })),
    confidence: 1,
  };
}

const EMPTY = Object.freeze({ source: "none", basedOn: [], programme: [], tasks: [], confidence: 0 });

function suggestPlan(target, candidates, { now = Date.now() } = {}) {
  if (!target || !normalizeTitle(target.title) || !Array.isArray(candidates)) return { ...EMPTY };
  const nowMs = now instanceof Date ? now.getTime() : now;

  const exact = exactMatch(target, candidates, nowMs);
  if (exact) return exact;

  const own = poolNeighbours(target, candidates.filter(candidate => candidate?.own), nowMs);
  const community = poolNeighbours(target, candidates.filter(candidate => candidate && !candidate.own), nowMs);

  const ownProgramme = programmeClusters(own, CONFIG.own);
  // A community item is dropped when one of your own already covers it at about the same time
  const covered = cluster => ownProgramme.some(kept => Math.abs(kept.item.startFraction - cluster.item.startFraction) <= CONFIG.dedupeTimeGap
    && ((jaccard(kept.tokens, cluster.tokens) ?? 0) >= CONFIG.clusterJaccard || (containment(kept.tokens, cluster.tokens) ?? 0) >= 1));
  const communityProgramme = programmeClusters(community, CONFIG.community).filter(cluster => !covered(cluster));
  const programme = [...ownProgramme, ...communityProgramme].map(cluster => cluster.item).sort((a, b) => a.startFraction - b.startFraction);
  const tasks = taskClusters(own, CONFIG.own);
  if (!programme.length && !tasks.length) return { ...EMPTY };

  const usedOwn = ownProgramme.length > 0 || tasks.length > 0;
  const usedCommunity = communityProgramme.length > 0;
  const used = [...(usedOwn ? own.map(entry => ({ ...entry, kind: "own" })) : []), ...(usedCommunity ? community.map(entry => ({ ...entry, kind: "community" })) : [])];
  const averageScore = used.reduce((sum, entry) => sum + entry.score, 0) / used.length;
  return {
    source: usedOwn && usedCommunity ? "mixed" : usedOwn ? "own" : "community",
    basedOn: [...new Map(used.map(entry => [entry.candidate.id, { title: entry.candidate.title, kind: entry.kind }])).values()],
    programme,
    tasks,
    confidence: Math.round(averageScore * Math.min(1, used.length / 3) * 100) / 100,
  };
}

module.exports = { CONFIG, normalizeTitle, tokenize, similarity, suggestPlan };
