// trusted group-time computation for live hangouts. free times are private in the
// database (owners only), so ranking runs here: the route first checks membership as
// the caller, then this reads everyone's blocks with the server key and returns only
// what the specification allows: aggregate counts, ranked options and names.
// the algorithm is the client's own module, so there is one definition.

const path = require("node:path");

const {
  pathToFileURL
} = require("node:url");

let slotsModule;

const loadSlots = () => slotsModule ||= import(pathToFileURL(path.join(__dirname, "../../client/src/utils/hangoutSlots.js")).href);

const publicMember = ({
  intervals,
  ...member
}) => member;

const publicPeople = result => ({
  ...result,
  available: result.available.map(publicMember),
  cannot: result.cannot.map(publicMember),
  noReply: result.noReply.map(publicMember)
});

// rows: { hangout, organiserid, members: [{ user_id, display_name }], settings, replies, blocks }

function buildMembers(rows) {
  const ids = [...new Set([rows.organiserId, ...rows.members.map(m => m.user_id)])];
  return ids.map(id => ({
    id,
    name: rows.members.find(m => m.user_id === id)?.display_name || "Member",
    role: id === rows.organiserId ? "host" : "member",
    required: id === rows.organiserId || Boolean(rows.settings.find(s => s.user_id === id)?.required),
    responded: rows.replies.some(r => r.user_id === id),
    intervals: rows.blocks.filter(b => b.user_id === id).map(b => ({
      start: Date.parse(b.starts_at),
      end: Date.parse(b.ends_at)
    }))
  }));
}

async function hangoutTime(rows, viewerId, {
  minMinutes
} = {}) {
  const {
    rankSlots,
    heatmap,
    rescueSuggestions
  } = await loadSlots();
  const h = rows.hangout;
  if (!h.date_start) {
    const error = new Error("This hangout already has a fixed time.");
    error.status = 409;
    throw error;
  }
  const dateRange = {
    start: h.date_start,
    end: h.date_end
  };
  const members = buildMembers(rows);
  const me = members.find(m => m.id === viewerId);
  const isHost = viewerId === rows.organiserId;
  const ranking = rankSlots(members, dateRange, minMinutes ? {
    minMinutes
  } : {});
  return {
    isHost,
    me: me ? publicMember(me) : null,
    myIntervals: me?.intervals || [],
    members: members.map(publicMember),
    heatmap: heatmap(members, dateRange),
    options: ranking.options.map(publicPeople),
    pendingRequired: ranking.pendingRequired.map(publicMember),
    rescue: isHost ? rescueSuggestions(members, dateRange, rows.organiserId) : [],
    dateRange,
    lockedSlot: h.locked_start ? {
      startTime: h.locked_start,
      endTime: h.locked_end
    } : null,
    stage: h.stage
  };
}

async function previewTime(rows, slot) {
  const {
    previewSlot
  } = await loadSlots();
  return publicPeople(previewSlot(buildMembers(rows), {
    start: rows.hangout.date_start,
    end: rows.hangout.date_end
  }, slot));
}

// reads with the service-role client. only called after the caller's membership check.

async function readHangoutRows(admin, eventId) {
  const one = async query => {
    const {
      data,
      error
    } = await query;
    if (error) throw error;
    return data;
  };
  const event = await one(admin.from("events").select("organiser_id, kind").eq("id", eventId).maybeSingle());
  if (!event || event.kind !== "hangout") {
    const error = new Error("This isn't a hangout.");
    error.status = 404;
    throw error;
  }
  const [hangout, registrations, settings, replies, blocks] = await Promise.all([one(admin.from("hangouts").select("date_start, date_end, locked_start, locked_end, stage").eq("event_id", eventId).single()), one(admin.from("registrations").select("user_id").eq("event_id", eventId).eq("status", "confirmed")), one(admin.from("hangout_member_settings").select("user_id, required").eq("event_id", eventId)), one(admin.from("hangout_replies").select("user_id").eq("event_id", eventId)), one(admin.from("hangout_free_blocks").select("user_id, starts_at, ends_at").eq("event_id", eventId))]);
  const ids = [event.organiser_id, ...registrations.map(r => r.user_id)];
  const profiles = await one(admin.from("profiles").select("id, display_name").in("id", ids));
  return {
    hangout,
    organiserId: event.organiser_id,
    settings,
    replies,
    blocks,
    members: ids.map(id => ({
      user_id: id,
      display_name: profiles.find(p => p.id === id)?.display_name || ""
    }))
  };
}
module.exports = {
  hangoutTime,
  previewTime,
  readHangoutRows,
  buildMembers
};
