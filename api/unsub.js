const store = require('../lib/store');
module.exports = async (req, res) => {
  const id = req.query.id;
  const rec = id && (await store.getState()).sentMessages['track:' + id];
  if (rec) {
    await store.addUnsub(rec.lead);
    const leads = await store.getLeads();
    const l = leads.find(x => x.email === rec.lead);
    if (l) { l.status = 'unsubscribed'; await store.saveLeads(leads); }
    await store.addEvent({ type: 'unsubscribe', inbox: rec.inbox, lead: rec.lead });
  }
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send('<body style="font-family:sans-serif;text-align:center;padding-top:80px"><h2>You have been unsubscribed.</h2><p>You will not hear from us again.</p></body>');
};
