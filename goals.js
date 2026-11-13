/* ===================================================================
   Goals: focus goals, progress goals, the yearly ritual, best time to
   go, stamps (passport) and "near you". Loaded after map.js and
   social.js; shares the app's globals (items, save, esc, toast, …).

   Data lives on each entry:
     it.focus    = { until: 'YYYY-MM-DD' | null, since: ms }
     it.progress = { target, unit, log: [{ at, amount }] }
   and in localStorage: bucketlist.plans (yearly plan), bucketlist.stamps
   (earned stamps), bucketlist.near (travel mode).
   =================================================================== */

const MAX_FOCUS = 3;
const DAYMS = 864e5;
const jsonGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const jsonSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const isoDay = t => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const shortDate = s => { const d = new Date(s + 'T12:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };

/* ---------- Progress goals ----------
   Any unit works. Presets give a sensible step for the check-in; anything else counts in 1s. */
const UNITS = [
  { u: 'kg', step: 0.5, dec: 1 }, { u: 'km', step: 5, dec: 1 }, { u: 'books', one: 'book', step: 1 },
  { u: 'days', one: 'day', step: 1 }, { u: 'hours', one: 'hour', step: 1 }, { u: 'times', one: 'time', step: 1 },
  { u: 'pages', one: 'page', step: 10 }, { u: 'sessions', one: 'session', step: 1 }, { u: 'countries', one: 'country', step: 1 },
  { u: '€', step: 50, money: true }, { u: '$', step: 50, money: true }, { u: '£', step: 50, money: true },
];
const unitInfo = u => UNITS.find(x => x.u === u) || { u, step: 1 };
const progValue = it => (it.progress?.log || []).reduce((s, l) => s + l.amount, 0);
const progPct = it => it.progress?.target ? Math.max(0, Math.min(1, progValue(it) / it.progress.target)) : 0;
const fmtNum = (n, u) => { const d = unitInfo(u).dec ?? (Number.isInteger(n) ? 0 : 1); return (+n.toFixed(d)).toLocaleString(); };
// "3.5 kg", "1 book", "€250"
function fmtAmount(n, u) {
  const x = unitInfo(u), v = fmtNum(n, u);
  if (x.money) return `${u}${v}`;
  return `${v} ${Math.abs(n) === 1 && x.one ? x.one : u}`;
}
const progLine = it => `${fmtNum(progValue(it), it.progress.unit)} of ${fmtAmount(it.progress.target, it.progress.unit)}`;
const lastCheckin = it => (it.progress?.log || []).reduce((m, l) => Math.max(m, l.at), 0);

/* ---------- Focus goals ---------- */
const focusItems = () => items.filter(i => i.focus && !i.done).sort((a, b) => (a.focus.until || '9999').localeCompare(b.focus.until || '9999'));
const daysTo = until => Math.ceil((new Date(until + 'T23:59:59') - Date.now()) / DAYMS);
const SEASON_NAMES = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
const seasonName = () => SEASON_NAMES[new Date().getMonth()];
function seasonEnd() { // last day of the current (northern) season
  const n = new Date(), m = n.getMonth(), y = n.getFullYear();
  const end = m === 11 ? [y + 1, 2] : m < 2 ? [y, 2] : m < 5 ? [y, 5] : m < 8 ? [y, 8] : [y, 11];
  return isoDay(new Date(end[0], end[1], 0, 12).getTime());
}
function ringHtml(it, size = 46) {
  let p, big, small;
  if (it.progress) { p = progPct(it); big = Math.round(p * 100); small = '%'; }
  else if (it.focus?.until) {
    const left = Math.max(0, daysTo(it.focus.until)), span = Math.max(1, (new Date(it.focus.until) - (it.focus.since || it.createdAt)) / DAYMS);
    p = Math.min(1, Math.max(.04, 1 - left / span)); big = left; small = left === 1 ? 'day' : 'days';
  } else { p = 0; big = '–'; small = ''; }
  return `<span class="g-ring" style="--p:${p * 100}%;--s:${size}px"><span>${big}<small>${small}</small></span></span>`;
}
function focusSub(it) {
  const parts = [];
  if (it.progress) parts.push(progLine(it));
  if (it.focus?.until) { const d = daysTo(it.focus.until); parts.push(d < 0 ? `was due ${shortDate(it.focus.until)}` : d === 0 ? 'due today' : `by ${shortDate(it.focus.until)}`); }
  else if (!it.progress) parts.push('No date yet');
  return parts.join(' · ');
}

/* My list, above the filters. Nothing at all when there's nothing to show. */
function renderFocusArea() {
  const el = $('#focusArea');
  if (!el) return;
  const f = focusItems();
  const banner = typeof challengeBanner === 'function' ? challengeBanner() : '';
  const plan = planFor(new Date().getFullYear());
  if (!f.length && !banner) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `${banner}
    ${f.length ? `<div class="focus-head"><span class="eyebrow gold-eye">Your focus · ${seasonName()}</span>
      ${plan?.ids.length ? `<button class="link-quiet" data-g="ritual">${new Date().getFullYear()} plan · ${planDone(plan)}/${plan.ids.length}</button>` : ''}</div>
    <div class="focus-rows">${f.map(it => {
      const cover = coverOf(it);
      return `<div class="focus-row" data-g="open" data-id="${it.id}" role="button" tabindex="0">
        <i class="focus-img" style="${cover ? `background-image:${cssUrl(cover)}` : `background:${toneBg(TYPES[it.type] || TYPES.other)}`}"></i>
        <span class="focus-t"><b>${esc(it.title)}</b><small>${esc(focusSub(it))}</small></span>
        ${it.progress ? `<button class="focus-plus" data-g="checkin" data-id="${it.id}" aria-label="Check in">+</button>` : ''}
        ${ringHtml(it)}
      </div>`;
    }).join('')}</div>` : ''}`;
}

/* Focus sheet: pick a target date (or none, for progress goals) */
const focusDlg = $('#focusDlg');
let focusFor = null;
function openFocus(it) {
  focusFor = it;
  const others = focusItems().filter(i => i.id !== it.id);
  const full = !it.focus && others.length >= MAX_FOCUS;
  const eom = isoDay(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 12).getTime());
  const eoy = `${new Date().getFullYear()}-12-31`;
  const cur = it.focus?.until || '';
  const preset = (v, l) => `<button type="button" class="chip ${cur === v ? 'active' : ''}" data-until="${v}">${l}</button>`;
  $('#focusBody').innerHTML = `
    <div class="eyebrow">Focus · ${seasonName()}</div>
    <h2>${esc(it.title)}</h2>
    ${full ? `<p class="hint-line">You already have ${MAX_FOCUS} focus goals. Swap one out:</p>
      <div class="swap">${others.map(o => `<button type="button" class="pick-row-btn" data-swap="${o.id}"><span>${esc(o.title)}</span><small>Remove from focus</small></button>`).join('')}</div>`
    : `<p class="hint-line">Focus goals sit at the top of your list with a countdown. Pick when you want it done.</p>
      <div class="chips chips-wrap">${preset(eom, 'End of month')}${preset(seasonEnd(), `End of ${seasonName().toLowerCase()}`)}${preset(eoy, 'End of the year')}${it.progress ? preset('', 'No date') : ''}</div>
      <label class="focus-date">Or pick a date<input type="date" id="focusDate" min="${isoDay(Date.now())}" value="${cur}"></label>`}
    <div class="form-actions">
      ${it.focus ? `<button type="button" class="btn" data-fx="remove">Remove focus</button>` : `<button type="button" class="btn" data-fx="cancel">Cancel</button>`}
      ${full ? '' : `<button type="button" class="btn solid" data-fx="save">${it.focus ? 'Save' : 'Make it a focus'}</button>`}
    </div>`;
  focusDlg.showModal();
}
focusDlg.addEventListener('click', e => {
  const it = focusFor; if (!it) return;
  const u = e.target.closest('[data-until]');
  if (u) { $('#focusDate').value = u.dataset.until; focusDlg.querySelectorAll('[data-until]').forEach(b => b.classList.toggle('active', b === u)); return; }
  const sw = e.target.closest('[data-swap]');
  if (sw) { const o = items.find(i => i.id === sw.dataset.swap); delete o.focus; save(); return openFocus(it); }
  const a = e.target.closest('[data-fx]')?.dataset.fx;
  if (a === 'cancel') return focusDlg.close();
  if (a === 'remove') { delete it.focus; save(); focusDlg.close(); refresh(); return toast('Removed from focus'); }
  if (a === 'save') {
    const until = $('#focusDate').value || null;
    if (!until && !it.progress) return toast('Pick a date for it');
    it.focus = { until, since: it.focus?.since || Date.now() };
    save(); focusDlg.close(); refresh();
    toast(until ? `Focus · ${daysTo(until)} days to go` : 'Added to your focus');
  }
});

/* Check-in sheet: one number, one tap */
const checkinDlg = $('#checkinDlg');
let ck = null; // { it, amount }
function openCheckin(it) {
  const x = unitInfo(it.progress.unit);
  ck = { it, amount: x.step };
  renderCheckin();
  checkinDlg.showModal();
}
function renderCheckin() {
  const { it, amount } = ck, p = it.progress, after = progValue(it) + amount;
  const last = lastCheckin(it);
  $('#checkinBody').innerHTML = `
    <div class="eyebrow">Check in${last ? ` · last ${ago(last)}` : ''}</div>
    <h2>${esc(it.title)}</h2>
    <div class="ck-stepper">
      <button type="button" class="ck-rnd" data-ck="-">−</button>
      <div class="ck-num"><input id="ckAmount" type="number" inputmode="decimal" step="any" value="${fmtNum(amount, p.unit).replace(/,/g, '')}" aria-label="Amount"><small>${esc(p.unit)} since last time</small></div>
      <button type="button" class="ck-rnd gold" data-ck="+">+</button>
    </div>
    <div class="bar-thin"><i style="width:${Math.min(100, Math.max(0, after / p.target * 100))}%"></i></div>
    <p class="ck-after">${after >= p.target ? 'That reaches your target 🎉' : `${fmtNum(Math.max(0, after), p.unit)} of ${fmtAmount(p.target, p.unit)} · ${fmtAmount(Math.max(0, p.target - after), p.unit)} to go`}</p>
    <button type="button" class="btn solid wide" data-ck="log">Log it</button>
    <button type="button" class="link-quiet" data-ck="none">No change this time</button>`;
}
checkinDlg.addEventListener('click', e => {
  const a = e.target.closest('[data-ck]')?.dataset.ck;
  if (!a || !ck) return;
  const step = unitInfo(ck.it.progress.unit).step;
  if (a === '+' || a === '-') { ck.amount = +(ck.amount + (a === '+' ? step : -step)).toFixed(3); return renderCheckin(); }
  if (a === 'none') { ck.amount = 0; }
  logProgress(ck.it, ck.amount);
  checkinDlg.close();
});
checkinDlg.addEventListener('input', e => { if (e.target.id === 'ckAmount') { const v = parseFloat(e.target.value); ck.amount = isNaN(v) ? 0 : v; const keep = e.target.selectionStart; renderCheckin(); const i = $('#ckAmount'); i.focus(); try { i.setSelectionRange(keep, keep); } catch {} } });
function logProgress(it, amount) {
  it.progress.log = [...(it.progress.log || []), { at: Date.now(), amount }];
  save();
  if (progValue(it) >= it.progress.target && !it.done) return reachTarget(it);
  refresh();
  toast(amount ? `${amount > 0 ? '+' : ''}${fmtAmount(amount, it.progress.unit)} · ${Math.round(progPct(it) * 100)}% there` : 'Noted. Next time!');
}
// Hitting the target completes the goal, exactly like tapping Complete
function reachTarget(it) {
  it.done = true; it.doneAt = Date.now(); delete it.focus;
  save();
  onEntryCompleted(it);
  syncVisitFor(it);
  refresh();
  toast('Target reached 🎉 It\'s off your list');
  checkStamps({ completed: it });
  openMemory(it);
}

/* ---------- Best time to go ----------
   Topics (time-critical, with a peak) win over the country's general best months. Months are 1–12. */
const TOPICS = [
  [/northern lights|aurora/i, { peak: [12, 1, 2], good: [9, 10, 11, 3], note: 'Darkest, clearest nights' }],
  [/cherry blossom|sakura|hanami/i, { peak: [3, 4], good: [], note: 'Peak bloom late March – early April' }],
  [/autumn leaves|fall foliage|koyo|foliage/i, { peak: [10, 11], good: [9], note: 'Leaves turn mid-October to November' }],
  [/whale shark/i, { peak: [7, 8], good: [6, 9], note: 'Whale shark season (Mexico)' }],
  [/safari|great migration|wildebeest/i, { peak: [7, 8, 9], good: [6, 10, 1, 2], note: 'Great migration in the Mara, July–September' }],
  [/\bski(ing)?\b|snowboard/i, { peak: [1, 2, 3], good: [12, 4], note: 'Best snow January–March' }],
  [/midnight sun/i, { peak: [6, 7], good: [5, 8], note: 'The sun barely sets' }],
  [/lavender/i, { peak: [7], good: [6], note: 'Provence in full bloom' }],
  [/tulip/i, { peak: [4], good: [3, 5], note: 'Keukenhof is open mid-March to mid-May' }],
  [/oktoberfest/i, { peak: [9], good: [10], note: 'Late September to early October' }],
  [/carnival|carnaval/i, { peak: [2], good: [3], note: 'The week before Lent' }],
  [/nazar[ée]|big waves/i, { peak: [11, 12, 1], good: [10, 2], note: 'The biggest swells arrive in winter' }],
  [/torres del paine|patagonia/i, { peak: [12, 1, 2], good: [11, 3], note: 'Southern summer: long days, open trails' }],
  [/machu picchu|inca trail/i, { peak: [6, 7, 8], good: [5, 9], note: 'Dry season. The trail closes in February' }],
  [/cappadocia|hot air balloon|balloon/i, { peak: [5, 9], good: [4, 6, 10], note: 'Calm mornings, mild weather' }],
  [/d[ií]a de (los )?muertos|day of the dead/i, { peak: [11], good: [10], note: 'October 31 – November 2' }],
  [/sakura|blossom/i, { peak: [4], good: [3], note: 'Spring bloom' }],
];
const COUNTRY_SEASONS = {
  JPN: [3, 4, 5, 10, 11], MEX: [11, 12, 1, 2, 3, 4], ISL: [6, 7, 8], NOR: [6, 7, 8], SWE: [6, 7, 8], FIN: [6, 7, 8], DNK: [5, 6, 7, 8],
  THA: [11, 12, 1, 2], VNM: [2, 3, 4], IDN: [5, 6, 7, 8, 9], IND: [10, 11, 12, 1, 2, 3], MAR: [3, 4, 5, 9, 10, 11], EGY: [10, 11, 12, 1, 2, 3, 4],
  JOR: [3, 4, 5, 9, 10, 11], TUR: [4, 5, 6, 9, 10], GRC: [5, 6, 9, 10], ITA: [4, 5, 6, 9, 10], ESP: [4, 5, 6, 9, 10], PRT: [4, 5, 6, 9, 10],
  FRA: [5, 6, 9], HRV: [5, 6, 9], GBR: [5, 6, 7, 8, 9], IRL: [5, 6, 7, 8, 9], DEU: [5, 6, 7, 8, 9], NLD: [4, 5, 6, 9], CHE: [6, 7, 8, 9],
  AUT: [6, 7, 8, 9], USA: [5, 6, 9, 10], CAN: [6, 7, 8, 9], PER: [5, 6, 7, 8, 9], CHL: [11, 12, 1, 2, 3], ARG: [10, 11, 3, 4], BRA: [5, 6, 7, 8, 9],
  COL: [12, 1, 2, 3, 7, 8], CRI: [12, 1, 2, 3, 4], CUB: [11, 12, 1, 2, 3, 4], AUS: [9, 10, 11, 3, 4, 5], NZL: [12, 1, 2, 3], ZAF: [3, 4, 5, 9, 10, 11],
  KEN: [1, 2, 6, 7, 8, 9, 10], TZA: [6, 7, 8, 9, 10, 1, 2], CHN: [4, 5, 9, 10], KOR: [4, 5, 9, 10], NPL: [10, 11, 3, 4], LKA: [12, 1, 2, 3, 4],
  MDV: [12, 1, 2, 3, 4], PHL: [12, 1, 2, 3, 4, 5], KHM: [11, 12, 1, 2, 3], ARE: [11, 12, 1, 2, 3], NAM: [5, 6, 7, 8, 9, 10], BWA: [5, 6, 7, 8, 9, 10],
  CZE: [5, 6, 9], HUN: [5, 6, 9], POL: [5, 6, 7, 8, 9], ROU: [5, 6, 7, 8, 9], SVN: [5, 6, 7, 8, 9], MNE: [5, 6, 9], BEL: [5, 6, 7, 8, 9],
  ECU: [6, 7, 8, 9], BOL: [5, 6, 7, 8, 9, 10], GTM: [11, 12, 1, 2, 3, 4], PAN: [12, 1, 2, 3, 4], ISR: [3, 4, 5, 10, 11], OMN: [10, 11, 12, 1, 2, 3],
  GEO: [5, 6, 9, 10], MNG: [6, 7, 8], RUS: [6, 7, 8], MYS: [3, 4, 5, 6, 7, 8, 9], SGP: [2, 3, 4, 5, 6, 7, 8], FJI: [5, 6, 7, 8, 9, 10], TWN: [3, 4, 5, 10, 11],
};
function seasonOf(it) {
  const text = `${it.title} ${it.place || ''}`;
  const topic = TOPICS.find(([re]) => re.test(text));
  if (topic) return { ...topic[1], topical: true };
  const cid = typeof countryForEntry === 'function' && WORLD ? countryForEntry(it) : null;
  return cid && COUNTRY_SEASONS[cid] ? { peak: [], good: COUNTRY_SEASONS[cid], note: `Best months to visit ${WORLD.byId[cid].name}`, topical: false } : null;
}
const inWindow = (s, m) => s.peak.includes(m) || s.good.includes(m);
// Weeks until a topical peak opens (only within 10 weeks), else null
function peakSoon(it) {
  if (it.done) return null;
  const s = seasonOf(it);
  if (!s?.topical || !s.peak.length) return null;
  const now = new Date(), m = now.getMonth() + 1;
  if (s.peak.includes(m)) return 0;
  for (let k = 1; k <= 3; k++) {
    const mm = (m - 1 + k) % 12 + 1;
    if (s.peak.includes(mm)) {
      const start = new Date(now.getFullYear(), now.getMonth() + k, 1);
      const w = Math.round((start - now) / (7 * DAYMS));
      return w <= 10 ? Math.max(1, w) : null;
    }
  }
  return null;
}
const MONTH_LETTER = 'JFMAMJJASOND';
function monthRanges(ms) {
  const set = new Set(ms), out = [];
  for (let m = 1; m <= 12; m++) if (set.has(m) && !set.has(m === 1 ? 12 : m - 1)) {
    let e = m; while (set.has(e % 12 + 1) && e % 12 + 1 !== m) e = e % 12 + 1;
    out.push(m === e ? MONTHS[m - 1] : `${MONTHS[m - 1].slice(0, 3)}–${MONTHS[e - 1].slice(0, 3)}`);
  }
  return out.length ? out : [];
}
function seasonHtml(it) {
  const s = seasonOf(it);
  if (!s) return '';
  const now = new Date().getMonth() + 1, soon = peakSoon(it);
  const all = [...s.peak, ...s.good];
  const status = s.peak.includes(now) ? 'In season now' : soon ? `In season in ${soon} week${soon === 1 ? '' : 's'}` : s.good.includes(now) ? 'A good time to go' : `Best: ${monthRanges(all).join(', ')}`;
  return `<div class="best">
      <div class="best-head"><span class="eyebrow">Best time to go</span><span class="best-status ${s.peak.includes(now) || soon ? 'gold' : ''}">${status}</span></div>
      <div class="months">${MONTH_LETTER.split('').map((l, k) => `<i class="${s.peak.includes(k + 1) ? 'pk' : s.good.includes(k + 1) ? 'ok' : ''} ${k + 1 === now ? 'now' : ''}" title="${MONTHS[k]}"><span>${l}</span></i>`).join('')}</div>
      <p class="hint-line">${esc(s.note)}</p>
    </div>`;
}

/* ---------- Entry page block ---------- */
function goalBlock(it) {
  let html = '';
  if (it.progress) {
    const v = progValue(it), p = it.progress, log = [...(p.log || [])].reverse();
    // weekly totals for the last 8 weeks
    const weeks = Array.from({ length: 8 }, (_, k) => { const end = Date.now() - (7 - k) * 7 * DAYMS; return (p.log || []).filter(l => l.at <= end).reduce((s, l) => s + l.amount, 0); });
    const max = Math.max(p.target, ...weeks, 1);
    html += `<div class="prog">
      <div class="prog-top"><span class="prog-num">${fmtNum(v, p.unit)}</span><span class="prog-of">of ${esc(fmtAmount(p.target, p.unit))}</span><span class="prog-pct">${Math.round(progPct(it) * 100)}%</span></div>
      <div class="bar-thin"><i style="width:${progPct(it) * 100}%"></i></div>
      ${(p.log || []).length > 1 ? `<div class="spark">${weeks.map(w => `<i style="height:${Math.max(4, w / max * 100)}%"></i>`).join('')}</div>` : ''}
      ${!it.done ? `<button class="btn solid" data-g="checkin" data-id="${it.id}">Check in</button>` : ''}
      ${log.length ? `<div class="prog-log">${log.slice(0, 4).map((l, n) => `<div><span>${ago(l.at)}</span><b>${l.amount ? (l.amount > 0 ? '+' : '') + esc(fmtAmount(l.amount, p.unit)) : 'No change'}</b>${n === 0 && !it.done ? `<button class="link-quiet" data-g="undo" data-id="${it.id}">Undo</button>` : ''}</div>`).join('')}</div>` : ''}
    </div>`;
  }
  if (it.focus && !it.done) html += `<button class="focus-pill" data-g="focus" data-id="${it.id}">${ringHtml(it, 34)}<span><b>Focus</b><small>${esc(focusSub(it))}</small></span><em>Change</em></button>`;
  html += seasonHtml(it);
  if (typeof sameGoalHtml === 'function') html += sameGoalHtml(it);
  return html;
}
// One small pill on a card, at most: a peak coming up beats friends with the same goal
function cardBadge(i) {
  if (i.done) return '';
  const soon = peakSoon(i);
  if (soon != null) return `<span class="card-pill gold">${soon === 0 ? 'In season now' : `In season in ${soon} wk`}</span>`;
  return typeof sameGoalPill === 'function' ? sameGoalPill(i) : '';
}
function cardProgress(i) {
  if (!i.progress || i.done) return '';
  return `<div class="card-prog"><div class="bar-thin"><i style="width:${progPct(i) * 100}%"></i></div><small>${esc(progLine(i))}</small></div>`;
}

/* ---------- Yearly ritual ----------
   No card on the home screen: the hero's pill changes with the year
   (Plan your year → Your year so far → Wrapped), and the plan sheet opens
   by itself once in January and once in July. */
const planFor = y => jsonGet('bucketlist.plans', {})[y] || null;
const planDone = plan => plan.ids.filter(id => items.find(i => i.id === id)?.done).length;
function savePlan(y, ids) { const all = jsonGet('bucketlist.plans', {}); all[y] = { ids, at: Date.now() }; jsonSet('bucketlist.plans', all); }
const ritualDlg = $('#ritualDlg');
let ritual = null; // { year, picks:Set }
function ritualPhase() { const m = new Date().getMonth(); return m === 11 ? 'wrapped' : m >= 6 ? 'midyear' : 'plan'; }
function updateYearPill() {
  const y = new Date().getFullYear(), ph = ritualPhase(), pill = document.querySelector('.hero .wrapped-pill:not(.idea-pill)');
  if (!pill) return;
  const plan = planFor(y);
  pill.toggleAttribute('data-open-wrapped', ph === 'wrapped');
  pill.toggleAttribute('data-g', ph !== 'wrapped');
  if (ph !== 'wrapped') pill.dataset.g = 'ritual';
  $('#wrPillLabel').textContent = ph === 'wrapped' ? `Your ${y}, wrapped` : ph === 'midyear' ? `Your ${y} so far${plan ? ` · ${planDone(plan)}/${plan.ids.length}` : ''}` : plan ? `Your ${y} plan · ${planDone(plan)}/${plan.ids.length}` : `Plan your ${y}`;
}
function openRitual() {
  const y = new Date().getFullYear(), plan = planFor(y);
  ritual = { year: y, picks: new Set(plan?.ids || []), step: plan && ritualPhase() === 'midyear' ? 'review' : 'pick' };
  renderRitual();
  ritualDlg.showModal();
}
function renderRitual() {
  const { year, picks, step } = ritual;
  const plan = planFor(year);
  if (step === 'review') {
    const its = plan.ids.map(id => items.find(i => i.id === id)).filter(Boolean), done = its.filter(i => i.done);
    const next = its.filter(i => !i.done).map(i => [i, seasonOf(i)]).find(([, s]) => s);
    $('#ritualBody').innerHTML = `
      <div class="eyebrow gold-eye">${new Date().getMonth() >= 6 ? `Halfway through ${year}` : `Your ${year} plan`}</div>
      <h2>${done.length} of ${its.length} done.${done.length * 2 >= its.length ? ' You\'re on track.' : ' Plenty of year left.'}</h2>
      <div class="plan-strip">${its.map(i => `<i class="${i.done ? '' : 'todo'}" style="${coverOf(i) ? `background-image:${cssUrl(coverOf(i))}` : `background:${toneBg(TYPES[i.type] || TYPES.other)}`}" title="${esc(i.title)}">${i.done ? '<b>✓</b>' : ''}</i>`).join('')}</div>
      ${next ? `<p class="hint-line">${esc(next[0].title)}: best ${monthRanges([...next[1].peak, ...next[1].good]).join(', ')}.</p>` : ''}
      <div class="form-actions"><button type="button" class="btn" data-rt="edit">Change the plan</button><button type="button" class="btn solid" data-rt="close">Done</button></div>`;
    return;
  }
  const open = items.filter(i => !i.done).sort((a, b) => (picks.has(b.id) - picks.has(a.id)) || b.createdAt - a.createdAt);
  $('#ritualBody').innerHTML = `
    <div class="ritual-year">${year}</div>
    <h2>What will this year be about?</h2>
    <p class="hint-line">Pick the goals you're going for. They become this year's plan, and you can turn any of them into a focus.</p>
    ${open.length ? `<div class="plan-pick">${open.map(i => `<button type="button" class="plan-opt ${picks.has(i.id) ? 'on' : ''}" data-rt-pick="${i.id}">
        <i style="${coverOf(i) ? `background-image:${cssUrl(coverOf(i))}` : `background:${toneBg(TYPES[i.type] || TYPES.other)}`}"></i><span>${esc(i.title)}</span><em>${picks.has(i.id) ? '✓' : ''}</em></button>`).join('')}</div>`
      : `<p class="hint-line">Add a few goals to your list first, then come back to plan the year.</p>`}
    <div class="form-actions"><button type="button" class="btn" data-rt="later">Later</button><button type="button" class="btn solid" data-rt="save" ${picks.size ? '' : 'disabled'}>${picks.size ? `Plan ${picks.size} goal${picks.size === 1 ? '' : 's'}` : 'Pick a few'}</button></div>`;
}
ritualDlg.addEventListener('click', e => {
  const p = e.target.closest('[data-rt-pick]');
  if (p) { ritual.picks.has(p.dataset.rtPick) ? ritual.picks.delete(p.dataset.rtPick) : ritual.picks.add(p.dataset.rtPick); return renderRitual(); }
  const a = e.target.closest('[data-rt]')?.dataset.rt;
  if (a === 'later' || a === 'close') return ritualDlg.close();
  if (a === 'edit') { ritual.step = 'pick'; return renderRitual(); }
  if (a === 'save') { savePlan(ritual.year, [...ritual.picks]); ritualDlg.close(); updateYearPill(); renderFocusArea(); toast(`Your ${ritual.year} is planned`); }
});
// Opens by itself once in January and once in July (and never on top of something else)
function maybeAutoRitual() {
  const y = new Date().getFullYear(), m = new Date().getMonth();
  const key = m === 0 ? `${y}-jan` : m === 6 ? `${y}-jul` : null;
  if (!key || !items.some(i => !i.done)) return;
  const seen = jsonGet('bucketlist.ritualSeen', []);
  if (seen.includes(key) || document.querySelector('dialog[open]')) return;
  if (m === 6 && !planFor(y)) return;
  jsonSet('bucketlist.ritualSeen', [...seen, key]);
  openRitual();
}

/* ---------- Stamps ----------
   Earned once, kept forever. Big ones are posted to friends; small ones stay in your passport. */
const yearOf = i => memDate(i).getFullYear();
const doneItems = () => items.filter(i => i.done);
const visitedIds = () => Object.keys(visits).filter(id => WORLD?.byId[id]);
const continents = () => new Set(visitedIds().map(id => WORLD.byId[id].continent));
function yearsInARow() {
  const ys = [...new Set(doneItems().map(yearOf))].sort((a, b) => b - a);
  let best = 0, run = 0, prev = null;
  for (const y of ys) { run = prev === y + 1 ? run + 1 : 1; best = Math.max(best, run); prev = y; }
  return best;
}
const STAMPS = [
  { id: 'first', group: 'Firsts', icon: '✓', label: 'Off the list', line: 'Your first goal completed. The first of many.', test: () => doneItems().length >= 1 },
  { id: 'c5', group: 'Travel', icon: '5', label: 'Countries', line: 'Five countries scratched off.', test: () => visitedIds().length >= 5 },
  { id: 'c10', group: 'Travel', icon: '10', label: 'Countries', line: 'Double digits.', big: true, test: () => visitedIds().length >= 10 },
  { id: 'c25', group: 'Travel', icon: '25', label: 'Countries', line: 'A quarter of a hundred countries.', big: true, test: () => visitedIds().length >= 25 },
  { id: 'c50', group: 'Travel', icon: '50', label: 'Countries', line: 'A quarter of the world.', big: true, test: () => visitedIds().length >= 50 },
  { id: 'k3', group: 'Travel', icon: '3', label: 'Continents', line: 'Three continents and counting.', big: true, test: () => continents().size >= 3 },
  { id: 'k6', group: 'Travel', icon: '6', label: 'Continents', line: 'Every inhabited continent. Rare company.', big: true, test: () => continents().size >= 6 },
  { id: 'newyear', group: 'Travel', icon: '✦', label: 'New country this year', line: 'Somewhere new, this year.', yearly: true, test: y => Object.entries(visits).some(([, v]) => (v.date || '').startsWith(String(y))) },
  { id: 'g10', group: 'Goals', icon: '10', label: 'Goals done', line: 'Ten promises kept.', test: () => doneItems().length >= 10 },
  { id: 'g25', group: 'Goals', icon: '25', label: 'Goals done', line: 'Twenty-five off the list.', big: true, test: () => doneItems().length >= 25 },
  { id: 'g50', group: 'Goals', icon: '50', label: 'Goals done', line: 'Fifty. That\'s a life well spent.', big: true, test: () => doneItems().length >= 50 },
  { id: 'g100', group: 'Goals', icon: '100', label: 'Goals done', line: 'One hundred.', big: true, test: () => doneItems().length >= 100 },
  { id: 'allround', group: 'Goals', icon: '◐', label: 'All-rounder', line: 'A trip, an adventure, a meal, a show and a skill. All done.', test: () => ['trip', 'activity', 'food', 'culture', 'learning'].every(t => doneItems().some(i => i.type === t)) },
  { id: 'inseason', group: 'Goals', icon: '☀', label: 'Perfect timing', line: 'Done right in its best season.', test: () => doneItems().some(i => { const s = seasonOf(i); return s?.topical && s.peak.includes(memDate(i).getMonth() + 1); }) },
  { id: 'longgame', group: 'Goals', icon: '∞', label: 'The long game', line: 'On the list for over two years, and finally done.', test: () => doneItems().some(i => i.doneAt && i.doneAt - i.createdAt > 730 * DAYMS) },
  { id: 'distance', group: 'Goals', icon: '↗', label: 'Went the distance', line: 'A progress goal, all the way to its target.', test: () => doneItems().some(i => i.progress) },
  { id: 'plan', group: 'Rhythm', icon: '✶', label: 'Kept the plan', line: 'Every goal in a yearly plan, done.', big: true, test: () => Object.values(jsonGet('bucketlist.plans', {})).some(p => p.ids.length >= 3 && planDone(p) === p.ids.length) },
  { id: 'years3', group: 'Rhythm', icon: '3', label: 'Years in a row', line: 'Something off the list three years running.', big: true, test: () => yearsInARow() >= 3 },
  { id: 'champion', group: 'Friends', icon: '🏆', label: 'Champion', line: 'You won a challenge.', big: true, test: () => typeof myWins === 'function' && myWins() >= 1 },
  { id: 'inspire', group: 'Friends', icon: '❋', label: 'Inspiration', line: 'Three friends added one of your goals to their list.', test: () => typeof inspiredCount === 'function' && inspiredCount() >= 3 },
];
const stampKey = (s, y) => s.yearly ? `${s.id}-${y}` : s.id;
const earned = () => jsonGet('bucketlist.stamps', {});
// Check after anything that could earn one; new stamps get their moment one at a time
let stampQueue = [];
function checkStamps({ silent = false } = {}) {
  if (!WORLD) return;
  const got = earned(), y = new Date().getFullYear(), fresh = [];
  for (const s of STAMPS) {
    const k = stampKey(s, y);
    if (got[k] || !s.test(y)) continue;
    got[k] = Date.now(); fresh.push(s);
  }
  if (!fresh.length) return;
  jsonSet('bucketlist.stamps', got);
  if (silent) return;
  // Calm by design: one full-screen moment at a time, at most every 6 hours, for the most notable stamp.
  // Everything else lands quietly in the passport.
  const top = fresh.find(s => s.big) || fresh[0];
  const last = +localStorage.getItem('bucketlist.stampMoment') || 0;
  if (stampQueue.length) { if (top.big || !stampQueue[0].big) stampQueue = [top]; }
  else if (Date.now() - last > (top.big ? 2 * 60e3 : 6 * 3600e3)) stampQueue = [top]; // big ones: at most every 2 min; small: every 6 h
  fresh.filter(s => s.big).forEach(s => typeof postStamp === 'function' && postStamp(s));
  setTimeout(showNextStamp, 700);
}
function showNextStamp() {
  if (!stampQueue.length || document.querySelector('dialog[open]') || detail?.kind === 'story') return setTimeout(() => stampQueue.length && showNextStamp(), 1500);
  const s = stampQueue.shift();
  localStorage.setItem('bucketlist.stampMoment', Date.now());
  $('#stampBody').innerHTML = `
    <div class="eyebrow gold-eye">New stamp</div>
    <div class="big-stamp ${s.big ? '' : 'small'}"><span><b>${s.icon}</b><small>${esc(s.label)}</small><small class="when">${MONTHS[new Date().getMonth()].slice(0, 3)} ${new Date().getFullYear()}</small></span></div>
    <h2>${esc(s.line)}</h2>
    <div class="stamp-btns"><button class="btn solid" data-g="passport">See your passport</button><button class="link-quiet" data-g="close-stamp">Nice</button></div>`;
  $('#stampDlg').showModal();
}
function stampHtml(s, at, n) {
  const r = [-8, 5, -3, 7, -6, 4, -2, 6][n % 8];
  return `<div class="stamp ${at ? '' : 'off'} ${s.group === 'Travel' ? '' : 'sq'}" style="--r:${at ? r : 0}deg" title="${esc(s.line)}"><span><b>${s.icon}</b><small>${esc(s.label)}</small></span></div>`;
}
function openPassport() {
  const got = earned(), y = new Date().getFullYear();
  const list = STAMPS.map(s => ({ s, at: s.yearly ? Object.keys(got).filter(k => k.startsWith(s.id + '-')).sort().map(k => got[k]).pop() : got[s.id] }));
  // Show what's earned, plus the next one in each ladder (not every locked stamp)
  const shown = list.filter(({ s, at }, k) => at || !list.slice(0, k).some(o => o.s.group === s.group && o.s.label === s.label && !o.at));
  const n = list.filter(x => x.at).length;
  const me = typeof ME !== 'undefined' && ME ? api.profile(ME) : null;
  $('#passportBody').innerHTML = `
    <div class="pp-head">${me ? avatar(ME, 44) : '<span class="av" style="--s:44px;--c:#c8a96a">✦</span>'}<div><h2>${esc(me?.name || 'Your passport')}</h2>
      <small>${visitedIds().length} countries · ${continents().size} continents · ${doneItems().length} goals done</small></div></div>
    <div class="eyebrow gold-eye">Passport · ${n} of ${STAMPS.length} stamps</div>
    ${['Firsts', 'Travel', 'Goals', 'Rhythm', 'Friends'].map(g => {
      const ss = shown.filter(x => x.s.group === g);
      return ss.length ? `<div class="pp-group"><span class="eyebrow">${g}</span><div class="stamps">${ss.map(({ s, at }, k) => stampHtml(s, at, k)).join('')}</div></div>` : '';
    }).join('')}
    <p class="hint-line">Faded stamps are the next ones to earn.</p>
    ${me ? `<div class="pp-share"><span>Goal titles visible to friends<small>${me.shareList === false ? 'Hidden. Friends can\'t see what\'s on your list.' : 'Only titles, only to people in your challenges.'}</small></span>
      <button class="btn small" data-share-list="${me.shareList === false ? 'on' : 'off'}">${me.shareList === false ? 'Show' : 'Hide'}</button></div>` : ''}`;
  $('#passportDlg').showModal();
}

/* ---------- Near you ----------
   Opt-in. Location is read only while the app is open (background needs the native app),
   at most once a day, and the sheet appears once per country per month. */
const nearState = () => jsonGet('bucketlist.near', { on: false, home: null, shown: {}, lastCheck: 0 });
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
function countryAt(lat, lng) {
  if (!WORLD) return null;
  if (!mapBuilt) buildMap();
  const [x, y] = project(lng, lat), pt = new DOMPoint(x, y);
  for (const el of document.querySelectorAll('#countriesG path')) if (el.isPointInFill(pt)) return el.dataset.id;
  return null;
}
const here = () => new Promise((ok, no) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => ok(p.coords), no, { maximumAge: 30 * 60e3, timeout: 15000, enableHighAccuracy: false }) : no(new Error('No location')));
async function findNear({ manual = false } = {}) {
  await loadWorld();
  let pos;
  try { pos = await here(); } catch { if (manual) toast('Location is off. Allow it in Settings to see goals near you.'); return; }
  const st = nearState(), cid = countryAt(pos.latitude, pos.longitude);
  st.lastCheck = Date.now();
  if (!st.on && manual) st.on = true;
  if (!st.home && cid) st.home = cid; // the first place we see you is home
  jsonSet('bucketlist.near', st);
  computeEntryCountries();
  const open = items.filter(i => !i.done);
  const close = open.filter(i => i.lat != null).map(i => ({ i, d: km(pos.latitude, pos.longitude, i.lat, i.lng) })).filter(x => x.d < 200);
  const inCountry = cid ? open.filter(i => entryCountries.get(i.id) === cid && !close.some(x => x.i === i)).map(i => ({ i, d: null })) : [];
  const list = [...close.sort((a, b) => a.d - b.d), ...inCountry];
  if (!manual) {
    const recently = st.shown[cid] && Date.now() - st.shown[cid] < 30 * DAYMS;
    if (!list.length || !cid || cid === st.home || recently) return;
    st.shown[cid] = Date.now(); jsonSet('bucketlist.near', st);
  }
  showNear(cid, list);
}
function showNear(cid, list) {
  const c = cid && WORLD.byId[cid];
  $('#nearBody').innerHTML = `
    <div class="eyebrow">Near you${c ? ` · ${esc(c.name)} ${flagOf(c.iso2)}` : ''}</div>
    <h2>${list.length ? `${list.length} goal${list.length === 1 ? '' : 's'} within reach` : 'Nothing on your list here, yet'}</h2>
    ${list.map(({ i, d }) => {
      const s = seasonOf(i), m = new Date().getMonth() + 1;
      const when = s ? (s.peak.includes(m) ? 'in season now' : inWindow(s, m) ? 'a good time' : `best ${monthRanges([...s.peak, ...s.good])[0]}`) : '';
      return `<button class="entry-row" data-act="view" data-id="${i.id}"><i style="${coverOf(i) ? `background-image:${cssUrl(coverOf(i))}` : `background:${toneBg(TYPES[i.type] || TYPES.other)}`}"></i>
        <span><b>${esc(i.title)}</b><small>${[d != null ? `${d < 10 ? d.toFixed(1) : Math.round(d)} km` : esc(i.place || c?.name || ''), when].filter(Boolean).join(' · ')}</small></span></button>`;
    }).join('')}
    ${c ? `<button class="discover-cta" data-g="discover" data-c="${cid}"><span><b>Discover ${esc(c.name)}</b><small>Places, sights and food to add</small></span><span>→</span></button>` : ''}
    <p class="hint-line near-note">Checks your rough location only while the app is open. ${nearState().on ? '<button class="link-quiet" data-g="near-off">Turn off</button>' : ''}</p>`;
  if (!$('#nearDlg').open) $('#nearDlg').showModal();
}
async function maybeNear() {
  const st = nearState();
  if (!st.on || Date.now() - st.lastCheck < 6 * 3600e3) return;
  if (navigator.permissions) { try { if ((await navigator.permissions.query({ name: 'geolocation' })).state !== 'granted') return; } catch { /* Safari: ask quietly below */ } }
  findNear();
}

/* ---------- Wiring ---------- */
document.addEventListener('click', e => {
  const g = e.target.closest('[data-g]');
  if (!g) return;
  const a = g.dataset.g, it = g.dataset.id && items.find(i => i.id === g.dataset.id);
  if (a === 'checkin' && it) { e.stopPropagation(); return openCheckin(it); }
  if (a === 'open' && it) return openEntry(it);
  if (a === 'focus' && it) return openFocus(it);
  if (a === 'undo' && it) { it.progress.log.pop(); save(); refresh(); return toast('Last check-in removed'); }
  if (a === 'ritual') return openRitual();
  if (a === 'passport') { $('#stampDlg').close(); return openPassport(); }
  if (a === 'close-stamp') return $('#stampDlg').close();
  if (a === 'near') return findNear({ manual: true });
  if (a === 'near-off') { const st = nearState(); st.on = false; jsonSet('bucketlist.near', st); $('#nearDlg').close(); return toast('Near you is off'); }
  if (a === 'discover') { $('#nearDlg').close(); return openDiscover(g.dataset.c); }
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('.focus-row')) e.target.click(); });
$('#stampDlg').addEventListener('close', () => setTimeout(showNextStamp, 400));

// Called once everything is loaded
function initGoals() {
  updateYearPill();
  renderFocusArea();
  checkStamps({ silent: !localStorage.getItem('bucketlist.stamps') }); // existing achievements land quietly the first time
  setTimeout(() => { maybeAutoRitual(); maybeNear(); }, 1200);
}
