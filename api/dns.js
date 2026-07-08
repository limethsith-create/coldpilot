const dns = require('dns').promises;
const store = require('../lib/store');

async function onDBL(domain) {
  // Spamhaus Domain Block List — resolves to 127.0.1.x if the domain is listed.
  try { const a = await dns.resolve4(domain + '.dbl.spamhaus.org'); return a.some(ip => ip.startsWith('127.0.1.')); }
  catch { return false; }
}
async function dnsHealth(domain) {
  const out = { domain, spf: false, dmarc: false, mx: false, dmarcPolicy: null, blocklisted: false, issues: [] };
  try { out.mx = (await dns.resolveMx(domain)).length > 0; } catch { }
  try { out.spf = (await dns.resolveTxt(domain)).map(r => r.join('')).some(t => t.startsWith('v=spf1')); } catch { }
  try { const rec = (await dns.resolveTxt('_dmarc.' + domain)).map(r => r.join('')).find(t => t.startsWith('v=DMARC1')); if (rec) { out.dmarc = true; out.dmarcPolicy = (rec.match(/p=(\w+)/) || [])[1] || null; } } catch { }
  out.blocklisted = await onDBL(domain);
  if (!out.mx) out.issues.push('No MX — mail will hard-bounce');
  if (!out.spf) out.issues.push('No SPF — mail may be rejected');
  if (!out.dmarc) out.issues.push('No DMARC — required by Gmail/Yahoo');
  else if (out.dmarcPolicy === 'none') out.issues.push('DMARC p=none — tighten to quarantine');
  if (out.blocklisted) out.issues.push('Domain is on Spamhaus DBL blocklist');
  return out;
}
module.exports = async (req, res) => {
  const domains = [...new Set(store.getInboxes().map(i => i.email.split('@')[1]))];
  res.status(200).json(await Promise.all(domains.map(dnsHealth)));
};
