// The serverless engine. One tick = plan today's work if needed, send a slice
// of due warmup+cold emails, and poll IMAP for replies/bounces. Designed to be
// called by Vercel Cron (daily) or an external pinger (more often). Each call
// does a bounded amount of work so it stays within serverless time limits.
const store = require('./store');
const limits = require('./limits');
const warmup = require('./warmup');
const mailer = require('./mailer');
const personalize = require('./personalize');
const { ImapFlow } = require('imapflow');

const todayStr = () => new Date().toISOString().slice(0, 10);

async function eligibleLeads(templates) {
  const leads = await store.getLeads();
  const unsubs = await store.getUnsubs();
  const now = Date.now();
  return leads.filter(l => {
    if (unsubs.includes(l.email.toLowerCase())) return false;
    if (['replied', 'bounced', 'unsubscribed', 'finished'].includes(l.status)) return false;
    const step = l.step || 0;
    if (step >= templates.steps.length) return false;
    if (step === 0) return true;
    const wait = (templates.steps[step].waitDays || 3) * 86400000;
    return l.lastContact && (now - new Date(l.lastContact).getTime()) >= wait;
  });
}

// Send up to `max` emails this tick across all active inboxes, respecting caps.
async function sendSlice(max) {
  const settings = store.getSettings();
  const inboxes = store.getInboxes().filter(i => !i.disabled);
  const templates = store.getTemplates();
  const events = await store.getEvents();
  const today = todayStr();
  const coldDays = settings.sendDays || [1, 2, 3, 4, 5];
  const isColdDay = coldDays.includes(new Date().getDay());
  const sentToday = (email, types) => events.filter(e => e.inbox === email && types.includes(e.type) && e.ts.slice(0, 10) === today).length;

  let sent = 0;
  const pool = await eligibleLeads(templates);
  let poolIdx = 0;

  for (const inbox of inboxes) {
    if (sent >= max) break;
    const plan = limits.inboxPlan(inbox, settings);

    // warmup up to remaining daily target
    let wSent = sentToday(inbox.email, ['warmup_sent', 'warmup_reply']);
    while (wSent < plan.warmup && sent < max) {
      try { await warmup.sendOne(inbox, store.getInboxes()); wSent++; sent++; }
      catch (e) { await store.addEvent({ type: 'error', inbox: inbox.email, meta: { where: 'warmup', message: e.message } }); break; }
    }

    // cold sends (only on sending days)
    if (!isColdDay) continue;
    let cSent = sentToday(inbox.email, ['sent']);
    while (cSent < plan.cold && sent < max) {
      let lead = pool.find(l => !l._done && l.assignedInbox === inbox.email);
      if (!lead) { while (poolIdx < pool.length && (pool[poolIdx]._done || (pool[poolIdx].assignedInbox && pool[poolIdx].assignedInbox !== inbox.email))) poolIdx++; lead = pool[poolIdx]; }
      if (!lead) break;
      lead._done = true;
      const step = lead.step || 0;
      const template = templates.steps[step];
      if (!template) continue;
      try {
        const rendered = await personalize.render(template, lead, settings);
        await mailer.sendCampaignEmail(inbox, lead, rendered, settings, step);
        const leads = await store.getLeads();
        const L = leads.find(x => x.email === lead.email);
        if (L) { L.step = step + 1; L.status = L.step >= templates.steps.length ? 'finished' : 'active'; L.lastContact = new Date().toISOString(); L.assignedInbox = inbox.email; await store.saveLeads(leads); }
        cSent++; sent++;
      } catch (e) { await store.addEvent({ type: 'error', inbox: inbox.email, lead: lead.email, meta: { where: 'cold', message: e.message } }); }
    }
  }
  return sent;
}

// Poll IMAP for replies + bounces + rescue warmup from spam.
async function pollReplies() {
  const inboxes = store.getInboxes().filter(i => !i.disabled && i.imap);
  for (const inbox of inboxes) {
    const client = new ImapFlow({ host: inbox.imap.host, port: inbox.imap.port || 993, secure: true, auth: { user: inbox.imap.user || inbox.email, pass: inbox.imap.pass }, logger: false });
    try {
      await client.connect();
      const state = await store.getState();
      const since = state.imapCursors[inbox.email] ? new Date(state.imapCursors[inbox.email]) : new Date(Date.now() - 2 * 86400000);
      const leads = await store.getLeads();
      const leadMap = Object.fromEntries(leads.map(l => [l.email.toLowerCase(), l]));
      let changed = false;
      const lock = await client.getMailboxLock('INBOX');
      try {
        for await (const msg of client.fetch({ since }, { envelope: true, headers: ['x-cp-warmup'] })) {
          const from = (msg.envelope.from?.[0]?.address || '').toLowerCase();
          const subject = msg.envelope.subject || '';
          const hdrs = msg.headers ? msg.headers.toString().toLowerCase() : '';
          if (hdrs.includes('x-cp-warmup')) continue;
          if (/mailer-daemon|postmaster/.test(from) || /undeliver|delivery status|returned mail|failure notice/i.test(subject)) {
            const bounced = leads.find(l => subject.toLowerCase().includes(l.email.toLowerCase()));
            await store.addEvent({ type: 'bounce', inbox: inbox.email, lead: bounced?.email || 'unknown', meta: { subject } });
            if (bounced) { bounced.status = 'bounced'; changed = true; }
            continue;
          }
          if (leadMap[from] && leadMap[from].status !== 'replied') {
            leadMap[from].status = 'replied'; changed = true;
            await store.addEvent({ type: 'reply', inbox: inbox.email, lead: from, meta: { subject } });
          }
        }
      } finally { lock.release(); }
      // rescue warmup mail from spam
      for (const name of ['[Gmail]/Spam', 'Junk', 'Junk Email', 'Spam']) {
        try { await client.mailboxOpen(name); const uids = await client.search({ header: { 'x-cp-warmup': '1' } }, { uid: true });
          if (uids && uids.length) { await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); await client.messageMove(uids, 'INBOX', { uid: true }); await store.addEvent({ type: 'warmup_rescued', inbox: inbox.email, meta: { count: uids.length } }); }
          break;
        } catch { }
      }
      if (changed) await store.saveLeads(leads);
      state.imapCursors[inbox.email] = new Date().toISOString();
      await store.saveState(state);
    } catch (e) { await store.addEvent({ type: 'error', inbox: inbox.email, meta: { where: 'imap', message: e.message } }); }
    finally { try { await client.logout(); } catch { } }
  }
}

async function tick(opts = {}) {
  const maxSends = opts.maxSends || 25; // bounded per invocation
  const sent = await sendSlice(maxSends);
  await pollReplies();
  await store.addEvent({ type: 'tick', meta: { sent } });
  return { sent };
}

module.exports = { tick, sendSlice, pollReplies };
