const store = require('../lib/store');
module.exports = async (req, res) => {
  const { id, u } = req.query;
  const rec = id && (await store.getState()).sentMessages['track:' + id];
  if (rec) await store.addEvent({ type: 'click', inbox: rec.inbox, lead: rec.lead, meta: { url: u } });
  res.redirect(u || '/');
};
