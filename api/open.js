const store = require('../lib/store');
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
module.exports = async (req, res) => {
  const id = req.query.id;
  const rec = id && (await store.getState()).sentMessages['track:' + id];
  if (rec) await store.addEvent({ type: 'open', inbox: rec.inbox, lead: rec.lead, step: rec.step });
  res.setHeader('Content-Type', 'image/png'); res.status(200).send(PIXEL);
};
