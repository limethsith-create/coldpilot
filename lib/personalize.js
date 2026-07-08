// Merge fields, fallbacks, spintax, optional AI first line.
function mergeFields(text, lead) {
  return text.replace(/\{\{\s*([\w.]+)(?:\|([^}]*))?\s*\}\}/g, (_, key, fallback) => {
    const val = lead[key] ?? lead[key.toLowerCase()];
    return (val !== undefined && String(val).trim() !== '') ? String(val).trim() : (fallback ?? '');
  });
}
function spintax(text) {
  let out = text, guard = 0;
  const re = /\{([^{}]*\|[^{}]*)\}/;
  while (re.test(out) && guard++ < 50) {
    out = out.replace(re, (_, group) => { const o = group.split('|'); return o[Math.floor(Math.random() * o.length)]; });
  }
  return out;
}
async function aiFirstLine(lead, settings) {
  const key = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return '';
  const context = Object.entries(lead).filter(([k]) => !['email', 'status', 'step', 'lastContact'].includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: settings.aiModel || 'claude-haiku-4-5-20251001', max_tokens: 100, messages: [{ role: 'user', content: `Write ONE short, natural, specific opening line for a cold email to this person. No greeting, no cliches, no quotes.\n\n${context}\n\nReturn only the line.` }] }),
    });
    const j = await res.json();
    return (j.content?.[0]?.text || '').trim();
  } catch { return ''; }
}
async function render(template, lead, settings) {
  let subject = template.subject || '', body = template.body || '';
  if (body.includes('{{ai_first_line}}') || subject.includes('{{ai_first_line}}')) {
    lead = { ...lead, ai_first_line: await aiFirstLine(lead, settings || {}) };
  }
  return { subject: spintax(mergeFields(subject, lead)), body: spintax(mergeFields(body, lead)) };
}
module.exports = { render, mergeFields, spintax };
