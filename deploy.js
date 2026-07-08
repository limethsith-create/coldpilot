// Runs on the user's PC (has network). Reads token from token.txt, deploys to
// Vercel via API, sets env vars, prints the live URL to deploy-out.txt.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const TOKEN = (fs.existsSync('token.txt') ? fs.readFileSync('token.txt', 'utf8') : process.env.VERCEL_TOKEN || '').trim();
if (!TOKEN) { console.error('no token'); process.exit(1); }
const SKIP = new Set(['node_modules', '.git', '.vercel', 'deploy.js', 'token.txt', 'deploy-out.txt', 'chunks', 'build_browserjs.js', 'deploy_browser.js']);
const files = [];
(function walk(d, rel = '') { for (const n of fs.readdirSync(d)) { if (SKIP.has(n)) continue; const f = path.join(d, n); const r = rel ? rel + '/' + n : n; if (fs.statSync(f).isDirectory()) walk(f, r); else files.push({ file: r, data: fs.readFileSync(f).toString('base64'), encoding: 'base64' }); } })('.');
const H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
const PW = 'coldpilot-7431';
const CRON_SECRET = crypto.randomBytes(12).toString('hex');
(async () => {
  const t = await (await fetch('https://api.vercel.com/v2/teams?slug=aviance', { headers: H })).json();
  const teamId = t.id || (t.teams && t.teams[0] && t.teams[0].id);
  const qs = teamId ? ('?teamId=' + teamId) : '';
  console.log('team', teamId || 'personal', 'files', files.length);

  // ensure project + env vars exist before deploy so they apply on first build
  await fetch('https://api.vercel.com/v10/projects' + qs, { method: 'POST', headers: H, body: JSON.stringify({ name: 'coldpilot' }) }).then(r => r.json()).catch(() => {});
  for (const [key, value] of [['DASHBOARD_PASSWORD', PW], ['CRON_SECRET', CRON_SECRET]]) {
    await fetch('https://api.vercel.com/v10/projects/coldpilot/env' + qs, { method: 'POST', headers: H, body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview', 'development'] }) }).then(r => r.json()).catch(() => {});
  }

  const body = { name: 'coldpilot', files, target: 'production', projectSettings: { framework: null, buildCommand: null, outputDirectory: null, installCommand: null } };
  const res = await fetch('https://api.vercel.com/v13/deployments' + qs, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) { console.error('DEPLOY_ERROR', res.status, JSON.stringify(j.error || j).slice(0, 600)); process.exit(1); }
  console.log('DEPLOY_ID ' + j.id);
  console.log('BUILDING https://' + j.url);
  // poll
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await (await fetch('https://api.vercel.com/v13/deployments/' + j.id + qs, { headers: H })).json();
    console.log('state ' + (s.readyState || s.status));
    if (['READY', 'ERROR', 'CANCELED'].includes(s.readyState)) {
      const alias = (s.alias && s.alias[0]) || s.url;
      console.log('FINAL ' + s.readyState);
      console.log('LIVE_URL https://' + (s.url));
      console.log('ALIAS https://' + alias);
      console.log('LOGIN admin / ' + PW);
      break;
    }
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
