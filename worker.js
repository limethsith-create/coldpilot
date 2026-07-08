// ColdPilot local engine — the ACTUAL sender. Runs on your PC or a VPS where
// SMTP/IMAP work (Vercel serverless can't send email reliably). It:
//   • serves the same dashboard + APIs (password-protected) on localhost
//   • runs the engine every few minutes inside your send window
//   • persists everything to disk (data-live/)
//   • optionally exposes the dashboard online via a tunnel
process.env.CP_LOCAL = '1';
const path = require('path');
const express = require('express');
const store = require('./lib/store');
const engine = require('./lib/engine');

const app = express();
const settings = store.getSettings();
const PORT = process.env.PORT || 4400;
const PW = settings.dashboardPassword;

// password gate for dashboard + data APIs; tracking/unsub/tick stay public
app.use((req, res, next) => {
  const p = req.path;
  if (p.startsWith('/api/open') || p.startsWith('/api/click') || p.startsWith('/api/unsub') || p.startsWith('/api/tick') || p === '/app.js') return next();
  if (!PW) return next();
  if (req.headers.authorization === 'Basic ' + Buffer.from('admin:' + PW).toString('base64')) return next();
  res.set('WWW-Authenticate', 'Basic realm="ColdPilot"').status(401).send('Authentication required');
});

// mount the same serverless handlers
for (const r of ['stats', 'dns', 'verify', 'open', 'click', 'unsub', 'tick']) {
  app.all('/api/' + r, require('./api/' + r));
}
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('[coldpilot] dashboard on http://localhost:' + PORT + '  (admin / ' + PW + ')'));

// engine loop — small slice every few minutes so sends spread naturally
const TICK_MIN = settings.tickMinutes || 4;
async function loop() {
  const hr = new Date().getHours();
  if (hr < 7 || hr > 21) return; // quiet overnight
  try { const r = await engine.tick({ maxSends: settings.perTick || 4 }); if (r.sent) console.log('[coldpilot] tick sent', r.sent); }
  catch (e) { console.log('[coldpilot] tick error', e.message); }
}
setTimeout(loop, 8000);
setInterval(loop, TICK_MIN * 60 * 1000);
console.log('[coldpilot] engine running — ticks every ' + TICK_MIN + ' min inside your window');

// optional public tunnel
if (settings.publicDashboard) {
  (async () => {
    try {
      const localtunnel = require('localtunnel');
      const t = await localtunnel({ port: PORT });
      const st = await store.getState(); st.publicUrl = t.url; await store.saveState(st);
      let ip = ''; try { ip = (await (await fetch('https://loca.lt/mytunnelpassword')).text()).trim(); } catch {}
      console.log('\n==============================================================');
      console.log('  PUBLIC DASHBOARD: ' + t.url + '   (login admin / ' + PW + ')');
      if (ip) console.log('  first visit tunnel password: ' + ip);
      console.log('==============================================================\n');
    } catch (e) { console.log('[coldpilot] tunnel skipped:', e.message); }
  })();
}
