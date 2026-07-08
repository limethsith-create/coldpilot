const $ = s => document.querySelector(s);
const fmt = n => (n ?? 0).toLocaleString();
const ease = t => 1 - Math.pow(1 - t, 3);

function countUp(el, to, opts = {}) {
  const dur = 900, start = performance.now(), from = 0;
  const suffix = opts.suffix || '', dec = opts.dec || 0;
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const v = from + (to - from) * ease(p);
    el.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function healthScore(s) {
  const active = s.inboxes.filter(i => i.phase !== 'disabled');
  if (s.totals.sent === 0) {
    if (active.length === 0) return { score: 32, verdict: 'Awaiting mailboxes', desc: 'Connect a sending mailbox to begin warming up your domains.' };
    const avg = active.reduce((a, i) => a + Math.min(1, i.warmupDay / 42), 0) / active.length;
    return { score: Math.round(45 + avg * 40), verdict: 'Warming up', desc: `${active.length} mailbox${active.length > 1 ? 'es' : ''} building reputation. Cold sending unlocks around day 15.` };
  }
  let score = 100;
  score -= Math.min(45, s.totals.bounceRate * 12);
  score -= Math.min(20, s.totals.unsubs * 2);
  if (s.totals.replyRate > 3) score = Math.min(100, score + 5);
  score = Math.max(20, Math.round(score));
  const verdict = score >= 85 ? 'Excellent' : score >= 65 ? 'Healthy' : score >= 45 ? 'Needs attention' : 'At risk';
  const desc = score >= 65 ? 'Deliverability signals are strong across your mailboxes.' : 'Bounce or complaint rates are climbing — slow down and review your list.';
  return { score, verdict, desc };
}

function drawGauge(score) {
  const arc = $('#gaugeArc'); const C = 2 * Math.PI * 86;
  arc.style.transition = 'stroke-dashoffset 1.3s cubic-bezier(.2,.8,.2,1)';
  arc.setAttribute('stroke-dasharray', C);
  requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', C * (1 - score / 100)));
  countUp($('#healthNum'), score);
}

function kpiCard(ic, lbl, val, sub, opts = {}) {
  const el = document.createElement('div'); el.className = 'kpi fade';
  el.innerHTML = `<div class="ic">${ic}</div><div class="lbl">${lbl}</div><div class="v">0</div><div class="sub">${sub}</div>`;
  requestAnimationFrame(() => countUp(el.querySelector('.v'), val, opts));
  return el;
}
const I = {
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.8"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  reply:'<svg viewBox="0 0 24 24" fill="none" stroke="#2dd4a7" stroke-width="1.8"><path d="M9 17l-5-5 5-5M4 12h11a5 5 0 015 5v1"/></svg>',
  bounce:'<svg viewBox="0 0 24 24" fill="none" stroke="#ff5d73" stroke-width="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  fire:'<svg viewBox="0 0 24 24" fill="none" stroke="#ffb547" stroke-width="1.8"><path d="M12 2s4 4 4 8a4 4 0 01-8 0c0-1 .5-2 1-3 .5 2 2 2 2 2s-1-3 1-7z"/><path d="M6 14a6 6 0 0012 0"/></svg>',
};

function drawChart(daily) {
  const wrap = $('#chartWrap');
  if (!daily.length) {
    wrap.innerHTML = `<div class="emptychart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg><div>No momentum yet — launch a campaign to see sends &amp; replies build here.</div></div>`;
    return;
  }
  const W = 720, H = 230, pL = 8, pB = 24, pT = 12;
  const max = Math.max(...daily.map(d => d.sent), 4);
  const x = i => pL + i * ((W - pL * 2) / Math.max(1, daily.length - 1));
  const y = v => pT + (1 - v / max) * (H - pT - pB);
  const linePts = daily.map((d, i) => `${x(i)},${y(d.sent)}`).join(' ');
  const area = `M${x(0)},${H - pB} L${daily.map((d, i) => `${x(i)},${y(d.sent)}`).join(' L')} L${x(daily.length - 1)},${H - pB} Z`;
  const replyPts = daily.map((d, i) => `${x(i)},${y(d.reply)}`).join(' ');
  let bars = '';
  daily.forEach((d, i) => { if (d.bounce) bars += `<rect x="${x(i) - 3}" y="${y(d.bounce)}" width="6" height="${H - pB - y(d.bounce)}" rx="2" fill="#ff5d73" opacity=".8"/>`; });
  let gl = '';
  for (let g = 0; g <= 3; g++) { const yy = pT + g * ((H - pT - pB) / 3); gl += `<line x1="${pL}" y1="${yy}" x2="${W - pL}" y2="${yy}" stroke="var(--line)" stroke-dasharray="2 4"/>`; }
  wrap.innerHTML = `<svg id="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c6cff" stop-opacity=".45"/><stop offset="1" stop-color="#7c6cff" stop-opacity="0"/></linearGradient></defs>
    ${gl}${bars}
    <path d="${area}" fill="url(#ag)"/>
    <polyline points="${linePts}" fill="none" stroke="#7c6cff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${replyPts}" fill="none" stroke="#2dd4a7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${daily.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.sent)}" r="2.5" fill="#0b0d14" stroke="#7c6cff" stroke-width="2"><title>${d.date}: ${d.sent} sent, ${d.reply} replies</title></circle>`).join('')}
  </svg>`;
}

function funnel(L) {
  const rows = [
    ['Total leads', L.total, '#7c6cff'], ['Queued', L.queued, '#4cc2ff'], ['In sequence', L.active, '#a78bfa'],
    ['Finished · no reply', L.finished, '#ffb547'], ['Replied', L.replied, '#2dd4a7'], ['Bounced', L.bounced, '#ff5d73'], ['Unsubscribed', L.unsubscribed, '#ff5d73'],
  ];
  const max = Math.max(L.total, 1);
  $('#funnel').innerHTML = rows.map(([n, v, c]) => `
    <div class="frow"><div class="top"><span>${n}</span><span class="n">${fmt(v)}</span></div>
    <div class="track"><div class="fill" style="width:0;background:${c}"></div></div></div>`).join('');
  requestAnimationFrame(() => $('#funnel').querySelectorAll('.fill').forEach((f, i) => f.style.width = (100 * rows[i][1] / max) + '%'));
}

function ring(pct, color) {
  const r = 32, C = 2 * Math.PI * r;
  return `<svg width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="6"/><circle cx="38" cy="38" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)"/></svg>`;
}

function inboxes(list) {
  $('#ibxCount').textContent = `${list.filter(i=>i.phase!=='disabled').length} active · ${list.length} total`;
  const colorFor = p => p === 'full' ? '#2dd4a7' : p === 'ramping' ? '#4cc2ff' : p === 'warming' ? '#ffb547' : '#59617a';
  $('#inboxes').innerHTML = list.map(i => {
    const pct = i.phase === 'disabled' ? 0 : Math.min(1, i.warmupDay / 42);
    const col = colorFor(i.phase);
    return `<div class="ibx fade"><div class="ring">${ring(pct, col)}<div class="c"><b>${i.phase==='disabled'?'—':i.warmupDay}</b><span>${i.phase==='disabled'?'off':'day'}</span></div></div>
      <div class="meta"><div class="em">${i.email}</div><div class="dm">${i.domain}</div>
      <span class="badge ${i.phase}">${i.phase}</span>
      <div class="mini"><span>Sent <b>${fmt(i.totalSent)}</b></span><span>Replies <b>${fmt(i.replies)}</b></span><span>Rescued <b>${fmt(i.rescued)}</b></span></div></div></div>`;
  }).join('');
}

function feed(events) {
  if (!events.length) { $('#feed').innerHTML = `<div class="emptyfeed">Activity will stream here once warmup and sending begin.</div>`; return; }
  const label = { sent:'Sent', reply:'Reply', open:'Open', click:'Click', bounce:'Bounce', unsubscribe:'Unsubscribe', warmup_sent:'Warmup', warmup_reply:'Warmup reply', warmup_rescued:'Spam rescue', error:'Error', tick:'Engine tick', plan:'Planned' };
  const rel = ts => { const d = (Date.now() - new Date(ts)) / 1000; if (d < 60) return 'just now'; if (d < 3600) return Math.floor(d/60)+'m ago'; if (d < 86400) return Math.floor(d/3600)+'h ago'; return Math.floor(d/86400)+'d ago'; };
  $('#feed').innerHTML = events.map(e => {
    const detail = e.type === 'tick' ? `${e.meta?.sent ?? 0} emails processed` : e.type === 'error' ? `${e.meta?.where}: ${e.meta?.message}` : e.type === 'warmup_rescued' ? `${e.meta?.count} moved out of spam` : `${e.lead || ''}${e.inbox ? ' · ' + e.inbox : ''}`;
    return `<div class="ev ${e.type}"><div class="d"></div><div class="tx"><b>${label[e.type] || e.type}</b> ${detail}<div class="t">${rel(e.ts)}</div></div></div>`;
  }).join('');
}

async function loadDns() {
  try {
    const d = await (await fetch('/api/dns')).json();
    $('#dns').innerHTML = d.map(r => {
      const ck = (ok, name) => `<span class="ck ${ok?'ok':'no'}">${ok?'✓':'✗'} ${name}</span>`;
      return `<div class="dnsrow"><span class="dom">${r.domain}</span><div class="checks">${ck(r.mx,'MX')}${ck(r.spf,'SPF')}${ck(r.dmarc,'DMARC')}</div></div>`;
    }).join('') || `<div class="emptyfeed">No domains configured yet.</div>`;
  } catch { $('#dns').innerHTML = `<div class="emptyfeed">DNS check unavailable.</div>`; }
}

async function load() {
  try {
    const s = await (await fetch('/api/stats')).json();
    $('#updated').innerHTML = `<span class="dot" style="background:var(--accent);box-shadow:0 0 8px var(--accent)"></span>${new Date(s.now).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
    $('#statusLine').textContent = s.publicUrl ? 'Live · Vercel' : 'Live · Vercel';
    $('#storageLine').textContent = s.storage === 'kv' ? 'persistent storage' : 'snapshot mode';

    const h = healthScore(s);
    drawGauge(h.score); $('#verdict').textContent = h.verdict; $('#verdictDesc').textContent = h.desc;
    const good = h.score >= 65;
    const pill = $('#healthPill'); pill.className = 'pill' + (good ? '' : ' warn');
    $('#healthPillTxt').textContent = good ? 'All systems nominal' : h.verdict;

    const t = s.totals, q = s.queueToday;
    const k = $('#kpis'); k.innerHTML = '';
    k.appendChild(kpiCard(I.send, 'Emails sent', t.sent, `<span class="delta flat">${q.coldDone}/${q.coldPlanned||0} today</span>`));
    k.appendChild(kpiCard(I.reply, 'Reply rate', t.replyRate, `${fmt(t.replies)} replies`, { suffix:'%', dec:1 }));
    k.appendChild(kpiCard(I.bounce, 'Bounce rate', t.bounceRate, `<span class="delta ${t.bounceRate>3?'down':'up'}">${t.bounceRate>3?'high':'safe'}</span> ${fmt(t.bounces)} bounces`, { suffix:'%', dec:1 }));
    k.appendChild(kpiCard(I.fire, 'Warmups today', q.warmupDone, `auto-ramping · ${fmt(t.unsubs)} unsubs`));

    drawChart(s.daily); funnel(s.leads); inboxes(s.inboxes); feed(s.recent);

    const disabled = s.inboxes.filter(i => i.phase === 'disabled').length;
    $('#banner').innerHTML = disabled === s.inboxes.length && s.inboxes.length
      ? `<div class="banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z"/></svg><div><b>Mailboxes are paused.</b> <span>Add real domains + inbox credentials in Vercel, set <code>disabled:false</code>, and the engine starts warming and sending automatically.</span></div></div>`
      : '';
  } catch (e) { $('#updated').textContent = 'reconnecting…'; }
}
load(); loadDns();
setInterval(load, 30000); setInterval(loadDns, 600000);
