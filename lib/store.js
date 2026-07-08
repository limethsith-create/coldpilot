// Storage layer. Uses Vercel KV when configured (KV_REST_API_URL present),
// otherwise falls back to the committed read-only snapshot so the app always
// deploys and the dashboard always renders.
const fs = require('fs');
const path = require('path');

const HAS_KV = !!process.env.KV_REST_API_URL;
let kv = null;
if (HAS_KV) { try { kv = require('@vercel/kv').kv; } catch { } }

const CFG = path.join(process.cwd(), 'config');
const readCfg = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(CFG, f), 'utf8')); } catch { return fb; } };
const seed = (() => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'seed.json'), 'utf8')); } catch { return {}; } })();

// in-memory cache for the no-KV fallback (per invocation)
const mem = {
  leads: seed.leads || [],
  events: seed.events || [],
  state: seed.state || { sentMessages: {}, imapCursors: {}, warmupThreads: [], publicUrl: null },
  queue: seed.queue || { date: null, jobs: [] },
  unsubscribes: seed.unsubscribes || [],
};

async function kvGet(key, fb) { if (!kv) return mem[key]; const v = await kv.get(key); return v === null || v === undefined ? fb : v; }
async function kvSet(key, val) { if (!kv) { mem[key] = val; return; } await kv.set(key, val); }

module.exports = {
  HAS_KV,
  // config (committed, read-only)
  getSettings: () => {
    const s = readCfg('settings.json', {});
    s.dashboardPassword = process.env.DASHBOARD_PASSWORD || s.dashboardPassword || 'coldpilot-7431';
    s.publicUrl = process.env.PUBLIC_URL || null;
    return s;
  },
  getInboxes: () => readCfg('inboxes.json', []).map(i => {
    // resolve SMTP/IMAP passwords from env vars (never committed)
    const clone = JSON.parse(JSON.stringify(i));
    if (clone.smtp?.passEnv) clone.smtp.pass = process.env[clone.smtp.passEnv] || '';
    if (clone.imap?.passEnv) clone.imap.pass = process.env[clone.imap.passEnv] || clone.smtp?.pass || '';
    return clone;
  }),
  getTemplates: () => readCfg('templates.json', { steps: [] }),

  // dynamic data (KV or memory)
  getLeads: () => kvGet('leads', []),
  saveLeads: (v) => kvSet('leads', v),
  getEvents: () => kvGet('events', []),
  addEvent: async (ev) => {
    const events = await kvGet('events', []);
    events.push({ ts: new Date().toISOString(), ...ev });
    // keep the log bounded so KV stays small
    await kvSet('events', events.slice(-2000));
    return ev;
  },
  getState: () => kvGet('state', { sentMessages: {}, imapCursors: {}, warmupThreads: [], publicUrl: null }),
  saveState: (v) => kvSet('state', v),
  getQueue: () => kvGet('queue', { date: null, jobs: [] }),
  saveQueue: (v) => kvSet('queue', v),
  getUnsubs: () => kvGet('unsubscribes', []),
  addUnsub: async (email) => {
    const u = await kvGet('unsubscribes', []);
    if (!u.includes(email.toLowerCase())) { u.push(email.toLowerCase()); await kvSet('unsubscribes', u); }
  },
};
