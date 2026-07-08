const dns = require('dns').promises;
const store = require('../lib/store');
async function dnsHealth(domain) {
  const out = { domain, spf: false, dmarc: false, mx: false, dmarcPolicy: null };
  try { out.mx = (await dns.resolveMx(domain)).length > 0; } catch { }
  try { out.spf = (await dns.resolveTxt(domain)).map(r => r.join('')).some(t => t.startsWith('v=spf1')); } catch { }
  try { const rec = (await dns.resolveTxt('_dmarc.' + domain)).map(r => r.join('')).find(t => t.startsWith('v=DMARC1')); if (rec) { out.dmarc = true; out.dmarcPolicy = (rec.match(/p=(\w+)/) || [])[1] || null; } } catch { }
  return out;
}
module.exports = async (req, res) => {
  const domains = [...new Set(store.getInboxes().map(i => i.email.split('@')[1]))];
  res.status(200).json(await Promise.all(domains.map(dnsHealth)));
};
