// Storage layer — three modes:
//  • Vercel KV        (KV_REST_API_URL set)      → cloud persistence for the dashboard
//  • Local disk       (CP_LOCAL=1)               → the always-on engine on your PC / VPS
//  • Snapshot memory  (neither)                  → Vercel dashboard renders read-only
const fs = require('fs');
const path = require('path');

const HAS_KV = !!process.env.KV_REST_API_URL;
const LOCAL = process.env.CP_LOCAL === '1';
let kv = null;
if (HAS_KV) { try { kv = require('@vercel/kv').kv; } catch { } }

const CFG = path.join(process.cwd(), 'config');
const readCfg = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(CFG, f), 'utf8')); } catch { return fb; } };
const seed = (() => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'seed.json'), 'utf8')); } catch { return {}; } })();

const DATA_DIR = process.env.CP_DATA_DIR || path.join(process.cwd(), 'data-live');
if (LOCAL && !fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const diskFile = k => path.join(DATA_DIR, k + '.json');
function diskRead(k, fb) { try { return JSON.parse(fs.readFileSync(diskFile(k), 'utf8')); } catch { return fb; } }
function diskWrite(k, v) { const f = diskFile(k); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f); }

const defaults = {
  leads: seed.leads || [],
  events: seed.events || [],
  state: seed.state || { sentMessages: {}, imapCursors: {}, warmupThreads: [], publicUrl: null },
  queue: seed.queue || { date: null, jobs: [] },
  unsubscribes: seed.unsubscribes || [],
};
const mem = JSON.parse(JSON.stringify(defaults));

async function get(key, fb) {
  if (kv) { const v = await kv.get(key); return v === null || v === undefined ? fb : v; }
  if (LOCAL) return diskRead(key, fb);
  return mem[key];
}
async function set(key, val) {
  if (kv) { await kv.set(key, val); return; }
  if (LOCAL) { diskWrite(key, val); return; }
  mem[key] = val;
}

module.exports = {
  HAS_KV, LOCAL,
  getSettings: () => {
    const s = readCfg('settings.json', {});
    s.dashboardPassword = process.env.DASHBOARD_PASSWORD || s.dashboardPassword || 'coldpilot-7431';
    s.publicUrl = process.env.PUBLIC_URL || s.publicUrl || null;
    return s;
  },
  getInboxes: () => readCfg('inboxes.json', []).map(i => {
    const clone = JSON.parse(JSON.stringify(i));
    // passwords may be inline (local) or from env vars (Vercel)
    if (clone.smtp?.passEnv) clone.smtp.pass = process.env[clone.smtp.passEnv] || clone.smtp.pass || '';
    if (clone.imap?.passEnv) clone.imap.pass = process.env[clone.imap.passEnv] || clone.imap.pass || clone.smtp?.pass || '';
    if (clone.imap && !clone.imap.pass && clone.smtp?.pass) clone.imap.pass = clone.smtp.pass;
    return clone;
  }),
  getTemplates: () => readCfg('templates.json', { steps: [] }),

  getLeads: () => get('leads', []),
  saveLeads: (v) => set('leads', v),
  getEvents: () => get('events', []),
  addEvent: async (ev) => {
    const events = await get('events', []);
    events.push({ ts: new Date().toISOString(), ...ev });
    await set('events', events.slice(-2000));
    return ev;
  },
  getState: () => get('state', { sentMessages: {}, imapCursors: {}, warmupThreads: [], publicUrl: null }),
  saveState: (v) => set('state', v),
  getQueue: () => get('queue', { date: null, jobs: [] }),
  saveQueue: (v) => set('queue', v),
  getUnsubs: () => get('unsubscribes', []),
  addUnsub: async (email) => {
    const u = await get('unsubscribes', []);
    if (!u.includes(email.toLowerCase())) { u.push(email.toLowerCase()); await set('unsubscribes', u); }
  },
};
