// Builds the dashboard stats object from KV/snapshot.
const store = require('./store');
const limits = require('./limits');

async function buildStats() {
  const events = await store.getEvents();
  const inboxes = store.getInboxes();
  const leads = await store.getLeads();
  const settings = store.getSettings();
  const queue = await store.getQueue();
  const today = new Date().toISOString().slice(0, 10);
  const count = (type, f) => events.filter(e => e.type === type && (!f || f(e))).length;
  const byDay = {};
  for (const e of events) {
    if (!['sent', 'reply', 'open', 'click', 'bounce', 'unsubscribe'].includes(e.type)) continue;
    const d = e.ts.slice(0, 10);
    byDay[d] = byDay[d] || { date: d, sent: 0, reply: 0, open: 0, click: 0, bounce: 0, unsubscribe: 0 };
    byDay[d][e.type]++;
  }
  const pausedToday = new Set(events.filter(e => e.type === 'guardrail' && e.ts.slice(0,10) === today).map(e => e.inbox));
  const inboxStats = inboxes.map(inbox => {
    const plan = limits.inboxPlan(inbox, settings);
    const isToday = e => e.ts.slice(0, 10) === today;
    return {
      email: inbox.email, domain: inbox.email.split('@')[1], warmupDay: plan.warmupDay,
      phase: inbox.disabled ? 'disabled' : (pausedToday.has(inbox.email) ? 'paused' : plan.phase),
      paused: pausedToday.has(inbox.email), warmupTargetToday: plan.warmup, coldTargetToday: plan.cold,
      sentToday: count('sent', e => e.inbox === inbox.email && isToday(e)),
      warmupToday: count('warmup_sent', e => e.inbox === inbox.email && isToday(e)),
      totalSent: count('sent', e => e.inbox === inbox.email),
      replies: count('reply', e => e.inbox === inbox.email),
      bounces: count('bounce', e => e.inbox === inbox.email),
      rescued: events.filter(e => e.type === 'warmup_rescued' && e.inbox === inbox.email).reduce((s, e) => s + (e.meta?.count || 0), 0),
    };
  });
  const vcount = k => leads.filter(l => (l.verify || 'unchecked') === k).length;
  const listHealth = { valid: vcount('valid'), risky: vcount('risky'), invalid: vcount('invalid'), unchecked: vcount('unchecked') };
  const totalSent = count('sent');
  return {
    now: new Date().toISOString(), publicUrl: settings.publicUrl, storage: store.HAS_KV ? 'kv' : 'snapshot',
    totals: { sent: totalSent, opens: count('open'), clicks: count('click'), replies: count('reply'), bounces: count('bounce'), unsubs: count('unsubscribe'),
      replyRate: totalSent ? +(100 * count('reply') / totalSent).toFixed(1) : 0, bounceRate: totalSent ? +(100 * count('bounce') / totalSent).toFixed(1) : 0 },
    leads: { total: leads.length, queued: leads.filter(l => !l.status || l.status === 'new').length, active: leads.filter(l => l.status === 'active').length,
      replied: leads.filter(l => l.status === 'replied').length, bounced: leads.filter(l => l.status === 'bounced').length,
      finished: leads.filter(l => l.status === 'finished').length, unsubscribed: (await store.getUnsubs()).length },
    queueToday: { date: queue.date, coldPlanned: 0, coldDone: count('sent', e => e.ts.slice(0,10)===today), warmupPlanned: 0, warmupDone: count('warmup_sent', e => e.ts.slice(0,10)===today) },
    listHealth,
    inboxes: inboxStats,
    daily: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    recent: events.slice(-40).reverse(),
  };
}
module.exports = { buildStats };
