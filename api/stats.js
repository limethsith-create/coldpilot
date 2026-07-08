const { buildStats } = require('../lib/stats');
module.exports = async (req, res) => {
  try { res.status(200).json(await buildStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
