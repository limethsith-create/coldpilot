// Cron endpoint: runs one engine pass. Protected by CRON_SECRET (Vercel Cron
// sends the Authorization: Bearer <CRON_SECRET> header automatically).
const { tick } = require('../lib/engine');
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const provided = auth.replace('Bearer ', '') || req.query.key;
  if (secret && provided !== secret) { res.status(401).json({ error: 'unauthorized' }); return; }
  try { res.status(200).json({ ok: true, ...(await tick()) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
