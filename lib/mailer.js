// SMTP send via nodemailer. Fresh transport per invocation (serverless).
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const store = require('./store');

function transportFor(inbox) {
  return nodemailer.createTransport({
    host: inbox.smtp.host, port: inbox.smtp.port,
    secure: inbox.smtp.secure ?? inbox.smtp.port === 465,
    auth: { user: inbox.smtp.user || inbox.email, pass: inbox.smtp.pass },
  });
}
function base(settings) { return (settings.publicUrl || process.env.PUBLIC_URL || '').replace(/\/$/, ''); }
function textToHtml(t) { return t.split(/\n\n+/).map(p => `<p style="margin:0 0 1em 0">${p.replace(/\n/g, '<br>')}</p>`).join(''); }

async function sendCampaignEmail(inbox, lead, rendered, settings, stepIndex) {
  const id = crypto.randomBytes(8).toString('hex');
  const b = base(settings);
  const unsubUrl = `${b}/api/unsub?id=${id}`;
  let html = textToHtml(rendered.body);
  if (settings.clickTracking && b) html = html.replace(/href="(https?:\/\/[^"]+)"/g, (_, u) => `href="${b}/api/click?id=${id}&u=${encodeURIComponent(u)}"`);
  if (settings.openTracking && b) html += `<img src="${b}/api/open?id=${id}" width="1" height="1" alt="" style="display:none">`;
  if (settings.unsubscribeFooter !== false) html += `<p style="margin-top:2em;font-size:12px;color:#888">${settings.footerText || ''}<br><a href="${unsubUrl}" style="color:#888">Unsubscribe</a></p>`;

  const info = await transportFor(inbox).sendMail({
    from: `"${inbox.name}" <${inbox.email}>`, to: lead.email, subject: rendered.subject,
    text: rendered.body + (b ? `\n\n--\nUnsubscribe: ${unsubUrl}` : ''), html,
    headers: b ? { 'List-Unsubscribe': `<${unsubUrl}>, <mailto:${inbox.email}?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {},
  });
  const state = await store.getState();
  state.sentMessages[info.messageId] = { lead: lead.email, inbox: inbox.email, step: stepIndex, trackId: id };
  state.sentMessages['track:' + id] = { lead: lead.email, inbox: inbox.email, step: stepIndex };
  await store.saveState(state);
  await store.addEvent({ type: 'sent', inbox: inbox.email, lead: lead.email, step: stepIndex, meta: { subject: rendered.subject, messageId: info.messageId } });
  return info;
}
async function sendWarmupEmail(fromInbox, toInbox, subject, body, inReplyTo) {
  const headers = { 'X-CP-Warmup': '1' };
  if (inReplyTo) { headers['In-Reply-To'] = inReplyTo; headers['References'] = inReplyTo; }
  const info = await transportFor(fromInbox).sendMail({ from: `"${fromInbox.name}" <${fromInbox.email}>`, to: toInbox.email, subject, text: body, headers });
  await store.addEvent({ type: 'warmup_sent', inbox: fromInbox.email, lead: toInbox.email, meta: { subject } });
  return info;
}
module.exports = { sendCampaignEmail, sendWarmupEmail, transportFor };
