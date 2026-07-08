// Bulk-verify the current lead list. Marks invalid addresses so they never send.
const store = require('../lib/store');
const { verifyLeads } = require('../lib/verify');
module.exports = async (req, res) => {
  try {
    const leads = await store.getLeads();
    const summary = await verifyLeads(leads);
    await store.saveLeads(leads);
    res.status(200).json({ ok: true, ...summary });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
