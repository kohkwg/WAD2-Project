const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createEventEvidenceStore } = require('../services/eventEvidenceStore');
const NOW = '2030-01-01T00:00:00.000Z';
const USER = 'user-1';
const EVENT = '11111111-1111-4111-8111-111111111111';
const candidate = (id, tags = ['music'], fields = {}) => ({
  id, title: id, organiser_id: 'organiser', status: 'published', starts_at: '2030-01-02T00:00:00Z',
  registration_closes_at: null, capacity: 10, spots_left: 5, tags, ...fields,
});
function fixture({ failure, tables = {}, readCap = 200, rpcError } = {}) {
  const data = {
    profiles: [{ id: USER, lat: 1.3, lng: 103.8 }],
    profile_interests: [{ profile_id: USER, interest_id: 1, interests: { slug: 'music' } }],
    user_event_preferences: [], registrations: [], check_ins: [], event_members: [],
    events_with_counts: [candidate(EVENT)], events: [], ...tables,
  };
  const calls = [], tokens = [];
  const client = {
    from(table) {
      const filters = [];
      let range = null;
      const query = new Proxy({}, { get(_target, method) {
        if (method === 'then') return resolve => {
          if (failure === table) return resolve({ data: null, error: { code: table === 'user_event_preferences' ? '42P01' : 'error', message: 'Read failed' } });
          let rows = data[table] || [];
          for (const [name, field, value] of filters) {
            rows = rows.filter(row => name === 'eq' ? row[field] === value : name === 'in' ? value.includes(row[field]) : row[field] > value);
          }
          if (range) rows = rows.slice(range[0], Math.min(range[1] + 1, range[0] + readCap));
          resolve({ data: range ? rows : rows[0] ?? null, error: null });
        };
        return (...args) => {
          calls.push({ table, method, args });
          if (['eq', 'in', 'gt'].includes(method)) filters.push([method, ...args]);
          if (method === 'range') range = args;
          return query;
        };
      } });
      return query;
    },
    async rpc(name, params) {
      calls.push({ name, params });
      if (rpcError) return { data: null, error: rpcError };
      const eventId = params.p_event_id;
      let pref = data.user_event_preferences.find(row => row.event_id === eventId);
      if (name === 'set_recommendation_event_preference') {
        if (!pref) {
          pref = { user_id: USER, event_id: eventId, save_active: false, saved_at: null, dismissed: false, first_confirmed_at: null };
          data.user_event_preferences.push(pref);
        }
        const action = params.p_action;
        if (action === 'save') { pref.saved_at ??= NOW; pref.save_active = true; }
        if (action === 'unsave') pref.save_active = false;
        if (action === 'dismiss') pref.dismissed = true;
        if (action === 'undo_dismiss') pref.dismissed = false;
      }
      const reg = data.registrations.find(row => row.event_id === eventId && row.user_id === USER);
      const attendance = data.check_ins.find(row => row.registration_id === reg?.id && row.event_id === eventId && row.user_id === USER);
      return { data: {
        eventId, save: { active: pref?.save_active === true, timestamp: pref?.saved_at ?? null },
        rsvp: { active: reg?.status === 'confirmed', timestamp: pref?.first_confirmed_at ?? null },
        attendance: { verified: !!attendance && attendance.fraud_flag === false, timestamp: attendance?.checked_in_at ?? null },
        dismissed: pref?.dismissed === true,
      }, error: null };
    },
  };
  const filename = path.join(__dirname, '../routes/recommendations.js');
  const localRequire = createRequire(filename);
  const moduleStub = { exports: {} };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: moduleStub, Date: FixedDate,
    require: name => name === '../lib/userSupabase' ? token => { tokens.push(token); return client; }
      : name === '../lib/requireAuth' ? (_req, _res, next) => next()
        : name === '../services/eventEvidenceStore' ? { createEventEvidenceStore: token => {
          tokens.push(token); return createEventEvidenceStore(token, { clientFactory: () => client });
        } } : localRequire(name),
  }, { filename });
  return { data, calls, tokens, async request(route = '/', { method = 'get', query = {}, body = {}, params = {} } = {}) {
    const handler = moduleStub.exports.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
    await handler({ query, body, params, user: { id: USER }, accessToken: 'caller-jwt' }, response);
    return response;
  } };
}
module.exports = { fixture, candidate, USER, EVENT, NOW };
