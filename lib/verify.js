// Pre-send email verification — the single biggest lever against inbox bans.
// A dead/invalid address that bounces is what suppresses inbox placement and
// gets mailboxes suspended. We verify BEFORE sending so bad addresses never
// go out. Works in serverless (DNS-based): syntax, disposable, role, MX.
// (Deep SMTP-handshake verification needs port 25, which serverless blocks —
//  plug a verification API via VERIFY_API if you want mailbox-level checks.)
const dns = require('dns').promises;

const DISPOSABLE = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','temp-mail.org','throwawaymail.com','yopmail.com','trashmail.com','getnada.com','sharklasers.com','maildrop.cc','fakeinbox.com','mailnesia.com','dispostable.com','tempinbox.com','emailondeck.com','moakt.com','mohmal.com','spamgourmet.com']);
const ROLE = new Set(['info','admin','sales','support','contact','help','office','hello','team','billing','marketing','noreply','no-reply','postmaster','webmaster','abuse','careers','jobs','hr','enquiries','inquiries','service','accounts']);

const mxCache = new Map();
async function hasMX(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok = false;
  try { const mx = await dns.resolveMx(domain); ok = mx && mx.length > 0; }
  catch { try { await dns.resolve(domain, 'A'); ok = true; } catch { ok = false; } }
  mxCache.set(domain, ok);
  return ok;
}

async function verifyEmail(email) {
  email = String(email || '').trim().toLowerCase();
  const m = email.match(/^([^\s@]+)@([^\s@]+\.[^\s@]+)$/);
  if (!m) return { email, status: 'invalid', reason: 'bad syntax' };
  const local = m[1], domain = m[2];
  if (/[^a-z0-9._%+\-]/.test(local)) return { email, status: 'invalid', reason: 'illegal chars' };
  if (email.length > 254) return { email, status: 'invalid', reason: 'too long' };
  if (DISPOSABLE.has(domain)) return { email, status: 'invalid', reason: 'disposable domain' };
  if (!(await hasMX(domain))) return { email, status: 'invalid', reason: 'no mail server (MX)' };
  const base = local.split('+')[0];
  if (ROLE.has(base)) return { email, status: 'risky', reason: 'role address (high complaint risk)' };
  return { email, status: 'valid', reason: 'ok' };
}

// Verify a whole lead list, updating each lead's verify status. Bounded batches.
async function verifyLeads(leads) {
  const summary = { valid: 0, risky: 0, invalid: 0, checked: 0 };
  for (const l of leads) {
    if (l.verify && l.verifyAt && (Date.now() - new Date(l.verifyAt).getTime()) < 90 * 86400000) {
      summary[l.verify] = (summary[l.verify] || 0) + 1; continue; // cached < 90 days
    }
    const r = await verifyEmail(l.email);
    l.verify = r.status; l.verifyReason = r.reason; l.verifyAt = new Date().toISOString();
    if (r.status === 'invalid') l.status = 'invalid'; // never send -> no bounce
    summary[r.status]++; summary.checked++;
  }
  return summary;
}

module.exports = { verifyEmail, verifyLeads };
