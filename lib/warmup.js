// Peer-to-peer warmup between our own inboxes (async, serverless).
const store = require('./store');
const mailer = require('./mailer');
const TOPICS = [
  ['Quick question about the timeline', 'Hey,\n\nDo you have a rough idea when the next phase kicks off?\n\nThanks!'],
  ['Notes from earlier', 'Hi,\n\nSharing a few notes from earlier - overall things look on track.\n\nCheers'],
  ['Following up on the doc', 'Hey,\n\nDid you get a chance to look at the doc I mentioned? No rush.\n\nBest'],
  ['Scheduling for next week', 'Hi,\n\nDoes Tuesday or Wednesday afternoon work for a quick sync?\n\nThanks'],
  ['Small update', 'Hi,\n\nQuick update: made progress on my end, more to share by end of week.\n\nBest'],
];
const REPLIES = ['Thanks for this - looks good on my end.', 'Got it, appreciate the update!', 'Sounds good, let\'s plan for that.', 'Perfect, thanks for the heads up.'];
const pick = a => a[Math.floor(Math.random() * a.length)];

async function sendOne(fromInbox, inboxes) {
  const peers = inboxes.filter(i => i.email !== fromInbox.email && !i.disabled);
  if (!peers.length) return null;
  const state = await store.getState();
  const open = (state.warmupThreads || []).filter(t => t.to === fromInbox.email && !t.replied);
  if (open.length && Math.random() < 0.4) {
    const t = pick(open); const target = inboxes.find(i => i.email === t.from);
    if (target) {
      await mailer.sendWarmupEmail(fromInbox, target, 'Re: ' + t.subject, pick(REPLIES), t.messageId);
      t.replied = true; await store.saveState(state);
      await store.addEvent({ type: 'warmup_reply', inbox: fromInbox.email, lead: target.email });
      return 'reply';
    }
  }
  const to = pick(peers); const [subject, body] = pick(TOPICS);
  const info = await mailer.sendWarmupEmail(fromInbox, to, subject, body);
  state.warmupThreads = (state.warmupThreads || []).slice(-200);
  state.warmupThreads.push({ from: fromInbox.email, to: to.email, subject, messageId: info.messageId, replied: false, ts: Date.now() });
  await store.saveState(state);
  return 'new';
}
module.exports = { sendOne };
