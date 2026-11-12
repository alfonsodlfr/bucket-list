/* ===================================================================
   World map: scratch-off countries, bucket-list overlay, Discover,
   and a shareable map card. Loaded after the main script and shares
   its globals (items, save, esc, cssUrl, toast, TYPES, …).
   =================================================================== */

const VKEY = 'bucketlist.visits.v1';
let visits = (() => { try { return JSON.parse(localStorage.getItem(VKEY)) || {}; } catch { return {}; } })();
const saveVisits = () => localStorage.setItem(VKEY, JSON.stringify(visits));

let WORLD = null;
let worldLoad = null;
const loadWorld = () => worldLoad ||= fetch('countries.json').then(r => r.json()).then(d => {
  WORLD = d;
  WORLD.byId = Object.fromEntries(d.countries.map(c => [c.id, c]));
  return d;
});

const MAP_W = 1000, MAP_H = 440;
const UN_COUNTRIES = 195;
let mapFilter = 'all';
let vb = { x: 0, y: 0, w: MAP_W, h: MAP_H };
let entryCountries = new Map();   // item.id -> country id
let drawerId = null;

const flagOf = iso2 => iso2 && /^[A-Z]{2}$/.test(iso2)
  ? String.fromCodePoint(...[...iso2].map(ch => 127397 + ch.charCodeAt(0))) : '';
const monthLabel = ym => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : String(y);
};

/* ---------- Which country does a bucket-list entry belong to? ---------- */
const ALIASES = {
  USA: ['united states', 'usa', 'u.s.a', 'america', 'hawaii', 'alaska'],
  GBR: ['united kingdom', 'uk', 'england', 'scotland', 'wales', 'britain', 'london'],
  CZE: ['czech republic'], KOR: ['south korea'], PRK: ['north korea'],
  ARE: ['uae', 'dubai', 'abu dhabi'], RUS: ['russia'], NLD: ['holland', 'netherlands'],
  COD: ['dr congo', 'democratic republic of the congo'], CIV: ["cote d'ivoire", 'ivory coast'],
  BIH: ['bosnia'], MKD: ['macedonia'], TUR: ['turkey', 'türkiye'], MMR: ['burma'],
};
function namesFor(c) {
  return [c.name, c.wiki, ...(ALIASES[c.id] || [])].filter(Boolean).map(n => n.toLowerCase());
}
function project(lon, lat) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const l = lon * Math.PI / 180, t = Math.asin(M * Math.sin(lat * Math.PI / 180));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = 2 * Math.sqrt(3) * l * Math.cos(t) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [(x + WORLD.xmax) * WORLD.scale, (WORLD.ymax - y) * WORLD.scale];
}
function countryForEntry(i) {
  const text = (i.place || '').toLowerCase();
  if (text) {
    let best = null, bestLen = 0;
    for (const c of WORLD.countries) for (const n of namesFor(c)) {
      const re = new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
      if (n.length > bestLen && re.test(text)) { best = c.id; bestLen = n.length; }
    }
    if (best) return best;
  }
  if (i.lat != null && i.lng != null) {
    const [x, y] = project(i.lng, i.lat);
    const pt = new DOMPoint(x, y);
    for (const el of document.querySelectorAll('#countriesG path')) if (el.isPointInFill(pt)) return el.dataset.id;
  }
  return null;
}
function computeEntryCountries() {
  entryCountries = new Map();
  for (const i of items) { const c = countryForEntry(i); if (c) entryCountries.set(i.id, c); }
  for (const [cid, v] of Object.entries(visits)) for (const eid of v.entries || []) if (!entryCountries.has(eid)) entryCountries.set(eid, cid);
}
const listCountries = () => new Set(items.filter(i => !i.done && entryCountries.has(i.id)).map(i => entryCountries.get(i.id)));
const entriesIn = id => items.filter(i => entryCountries.get(i.id) === id);
// Completed entries the user linked to a visited country (skipping any that were since deleted)
const linkedEntries = id => (visits[id]?.entries || []).map(eid => items.find(i => i.id === eid)).filter(Boolean);
// The visit's own photo, else the cover of its first linked story
const visitPhotoOf = id => visits[id]?.photo || linkedEntries(id).map(coverOf).find(Boolean) || null;

/* ---------- Map rendering ---------- */
let mapBuilt = false;
function buildMap() {
  const g = $('#countriesG');
  g.innerHTML = WORLD.countries.map(c => `<path d="${c.d}" data-id="${c.id}"></path>`).join('');
  $('#countryNames').innerHTML = WORLD.countries.map(c => `<option value="${esc(c.name)}">`).join('');
  mapBuilt = true;
}
async function renderMap() {
  await loadWorld();
  if (!mapBuilt) buildMap();
  if (!vbReady && $('#worldSvg').clientWidth) { resetVB(); vbReady = true; }
  computeEntryCountries();
  const onList = listCountries();
  const visitedIds = Object.keys(visits).filter(id => WORLD.byId[id]);

  for (const el of document.querySelectorAll('#countriesG path')) {
    const id = el.dataset.id, v = visits[id], l = onList.has(id);
    // Flat, calm fills; photos live in the country panel, not on the map
    el.setAttribute('class', [v ? 'visited' : 'foil', l ? 'listed' : ''].join(' '));
    const dim = (mapFilter === 'visited' && !v) || (mapFilter === 'list' && !l);
    el.classList.toggle('dim', dim);
    el.classList.toggle('selected', id === drawerId);
  }
  // Pins for bucket-list countries
  $('#pinsG').innerHTML = [...onList].map(id => {
    const c = WORLD.byId[id];
    const hidden = mapFilter === 'visited' && !visits[id];
    return hidden ? '' : `<g class="pin" transform="translate(${c.lx} ${c.ly})"><circle class="ring" r="6"/><circle r="2.6"/></g>`;
  }).join('');

  const conts = new Set(visitedIds.map(id => WORLD.byId[id].continent));
  $('#mapCount').textContent = visitedIds.length;
  $('#mapNoun').textContent = visitedIds.length === 1 ? 'country' : 'countries';
  $('#mapSub').textContent = `${Math.round(visitedIds.length / UN_COUNTRIES * 100)}% of the world · ${conts.size} of 6 continents · ${onList.size} on your list`;
  document.querySelectorAll('[data-mapfilter]').forEach(b => b.classList.toggle('active', b.dataset.mapfilter === mapFilter));
  renderMapStrip(visitedIds, onList);
  if (drawerId) renderDrawer();
}

function renderMapStrip(visitedIds, onList) {
  const vis = visitedIds.map(id => ({ id, ...visits[id] })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.at - a.at);
  const list = [...onList].filter(id => !visits[id]).sort((a, b) => WORLD.byId[a].name.localeCompare(WORLD.byId[b].name));
  const tile = (id, sub, photo) => {
    const c = WORLD.byId[id];
    return `<button class="ctile ${photo ? '' : 'foil-tile'}" data-country="${id}" style="${photo ? `background-image:${cssUrl(photo)}` : ''}">
      <span class="flag">${flagOf(c.iso2)}</span><span class="nm">${esc(c.name)}</span><span class="sub">${sub}</span></button>`;
  };
  const showVis = mapFilter !== 'list', showList = mapFilter !== 'visited';
  $('#mapStrip').innerHTML =
    (showVis ? `<div class="strip-head"><h3>Scratched</h3><span class="eyebrow">${vis.length}</span></div>
      <div class="ctiles">${vis.length ? vis.map(v => tile(v.id, monthLabel(v.date) || 'Visited', visitPhotoOf(v.id))).join('') : `<p class="muted-note">Click any country on the map to scratch it off.</p>`}</div>` : '') +
    (showList ? `<div class="strip-head"><h3>On my list</h3><span class="eyebrow">${list.length}</span></div>
      <div class="ctiles">${list.length ? list.map(id => tile(id, `${entriesIn(id).filter(i => !i.done).length} on the list`, entriesIn(id).map(entryCover).find(Boolean))).join('') : `<p class="muted-note">Countries from your open entries appear here.</p>`}</div>` : '');
}

/* ---------- Zoom & pan ---------- */
function applyVB() { $('#worldSvg').setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }
// The visible window follows the element's shape: wide on desktop, tall on phones (then you pan sideways)
const aspect = () => { const el = $('#worldSvg'); return el.clientWidth && el.clientHeight ? el.clientHeight / el.clientWidth : MAP_H / MAP_W; };
const maxVW = () => Math.min(MAP_W, MAP_H / aspect());
function clampVB() {
  const a = aspect();
  vb.w = Math.min(maxVW(), Math.max(70, vb.w)); vb.h = vb.w * a;
  vb.x = Math.min(MAP_W - vb.w, Math.max(0, vb.x)); vb.y = Math.min(MAP_H - vb.h, Math.max(0, vb.y));
}
function resetVB() {
  const w = maxVW();
  vb = { x: w < MAP_W ? 520 - w / 2 : 0, y: 0, w, h: 0 }; // on narrow screens start centred on Europe/Africa
  clampVB(); applyVB();
}
let vbReady = false;
window.addEventListener('resize', () => { if (!$('#mapView').hidden) { clampVB(); applyVB(); } });
function zoomAt(f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) {
  const nw = Math.min(maxVW(), Math.max(70, vb.w * f));
  vb.x = cx - (cx - vb.x) * nw / vb.w; vb.y = cy - (cy - vb.y) * nw / vb.w; vb.w = nw;
  clampVB(); applyVB();
}
function zoomTo(id) {
  const el = $(`#countriesG [data-id="${id}"]`);
  if (!el) return;
  const b = el.getBBox();
  if (b.width > 600) return; // countries spanning the antimeridian: keep the world view
  const a = aspect();
  const w = Math.max(160, Math.max(b.width, b.height / a) * 2.4);
  vb = { x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - w * a / 2, w, h: 0 };
  clampVB(); applyVB();
}
function svgPoint(e) {
  const svg = $('#worldSvg'), pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
let drag = null;
function initMapInteractions() {
  const svg = $('#worldSvg'), tip = $('#mapTip');
  svg.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return; // normal scrolling keeps scrolling the page; pinch / ⌘-scroll zooms
    e.preventDefault();
    const p = svgPoint(e);
    zoomAt(Math.exp(e.deltaY * 0.01), p.x, p.y);
  }, { passive: false });
  // Drag to pan; two fingers to pinch-zoom
  const pts = new Map();
  let pinch = null;
  svg.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag && (drag.moved = true); }
  });
  window.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = svgPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      zoomAt(pinch / d, mid.x, mid.y); pinch = d;
      return;
    }
    if (drag) {
      const k = vb.w / svg.clientWidth, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) { vb.x -= dx * k; vb.y -= dy * k; clampVB(); applyVB(); }
      drag.x = e.clientX; drag.y = e.clientY;
    }
  });
  const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) setTimeout(() => { drag = null; }, 0); };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  svg.addEventListener('click', e => {
    if (drag?.moved) return;
    const p = e.target.closest('path[data-id]');
    if (p) openDrawer(p.dataset.id); else closeDrawer();
  });
  svg.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return; // no hover tooltips on touch; tapping opens the panel
    const p = e.target.closest('path[data-id]');
    if (!p) return tip.classList.remove('on');
    const c = WORLD.byId[p.dataset.id], v = visits[c.id], n = entriesIn(c.id).filter(i => !i.done).length;
    tip.innerHTML = `<span>${flagOf(c.iso2)} ${esc(c.name)}</span><small>${v ? 'Scratched' + (v.date ? ' · ' + monthLabel(v.date) : '') : n ? `${n} on your list` : 'Not yet'}</small>`;
    tip.classList.add('on');
  });
  svg.addEventListener('pointermove', e => {
    const r = $('#mapFrame').getBoundingClientRect();
    tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
  });
  svg.addEventListener('pointerleave', () => tip.classList.remove('on'));

  document.querySelector('.map-zoom').addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]')?.dataset.zoom;
    if (z === 'in') zoomAt(0.65); else if (z === 'out') zoomAt(1.55); else if (z === 'reset') resetVB();
  });
  $('#mapSearch').addEventListener('change', e => {
    const q = e.target.value.trim().toLowerCase();
    const c = WORLD.countries.find(c => c.name.toLowerCase() === q) || WORLD.countries.find(c => namesFor(c).some(n => n.startsWith(q)));
    if (c) { openDrawer(c.id); zoomTo(c.id); e.target.value = ''; e.target.blur(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawerId && !document.querySelector('dialog[open]')) closeDrawer(); });
}

/* ---------- Country drawer ---------- */
function openDrawer(id) {
  drawerId = id;
  scratchState = null;
  renderDrawer();
  $('#drawer').classList.add('open');
  document.querySelectorAll('#countriesG path').forEach(p => p.classList.toggle('selected', p.dataset.id === id));
}
function closeDrawer() {
  drawerId = null;
  $('#drawer').classList.remove('open');
  document.querySelectorAll('#countriesG path.selected').forEach(p => p.classList.remove('selected'));
}
let scratchState = null;   // null | 'scratching' | 'form'
let visitPhoto = null;
let visitLinks = new Set();   // entry ids being linked in the visit form

function renderDrawer() {
  const c = WORLD.byId[drawerId];
  if (!c) return;
  const v = visits[c.id];
  const entries = entriesIn(c.id);
  const linkedIds = new Set(v?.entries || []);
  const open = entries.filter(i => !i.done), done = entries.filter(i => i.done && !linkedIds.has(i.id));

  let main;
  if (scratchState === 'scratching') {
    main = `<div class="scratch-wrap">
        <canvas id="scratchBase" width="760" height="520"></canvas>
        <canvas id="scratchTop" width="760" height="520"></canvas>
      </div>
      <p class="scratch-hint">Scratch the foil to mark ${esc(c.name)} as visited</p>`;
  } else if (scratchState === 'form' || (v && scratchState === 'edit')) {
    visitPhoto = scratchState === 'edit' ? v?.photo || null : visitPhoto;
    main = `<form class="visit-form" id="visitForm">
        <label>When<input type="month" name="date" value="${esc(v?.date || '')}"></label>
        <div class="field">Photograph
          <div class="drop small ${visitPhoto ? 'has-img' : ''}" id="visitDrop" style="${visitPhoto ? `background-image:${cssUrl(visitPhoto)}` : ''}">
            <span>${visitPhoto ? 'Change photograph' : 'Choose a photograph'}</span><input type="file" accept="image/*" id="visitFile">
          </div>
        </div>
        <label>A few words<textarea name="comment" rows="4" maxlength="600" placeholder="What stayed with you?">${esc(v?.comment || '')}</textarea></label>
        <div class="field">Completed here <span class="hint-line">Link the completed entries from this trip.</span>
          ${linkPicker(c)}
        </div>
        <div class="form-actions"><button type="button" class="btn" data-dact="cancel-visit">Cancel</button><button class="btn solid">Save</button></div>
      </form>`;
  } else if (v) {
    const photo = visitPhotoOf(c.id);
    const linked = linkedEntries(c.id);
    main = `${photo ? `<div class="visit-photo" style="background-image:${cssUrl(photo)}"></div>` : ''}
      <div class="visit-meta"><span class="seal">✓ Scratched</span>${v.date ? `<span>${monthLabel(v.date)}</span>` : ''}</div>
      ${v.comment ? `<blockquote class="visit-comment">${esc(v.comment)}</blockquote>` : ''}
      ${linked.length ? `<div class="linked"><div class="eyebrow">Completed here</div>${linked.map(i => `
        <button class="entry-row" data-act="story" data-id="${i.id}">
          <i style="${coverOf(i) ? `background-image:${cssUrl(coverOf(i))}` : `background:${toneBg(TYPES[i.type] || TYPES.other)}`}"></i>
          <span><b>${esc(i.title)}</b><small>${hasStory(i) ? 'Story' : 'Write story'}</small></span></button>`).join('')}</div>` : ''}
      <div class="drawer-actions">
        <button class="btn" data-dact="edit-visit">Edit</button>
        <button class="btn" data-dact="share-country">Share</button>
        <button class="link-quiet" data-dact="unvisit">Unscratch</button>
      </div>`;
  } else {
    main = `<button class="scratch-cta" data-dact="start-scratch">
        <span class="foil-swatch"></span>
        <span><b>I've been here</b><small>Scratch it off your map</small></span>
      </button>`;
  }

  const row = i => `<button class="entry-row" data-act="view" data-id="${i.id}">
      <i style="${entryCover(i) ? `background-image:${cssUrl(entryCover(i))}` : `background:${toneBg(TYPES[i.type] || TYPES.other)}`}"></i>
      <span><b>${esc(i.title)}</b><small>${i.done ? 'Completed' : (TYPES[i.type] || TYPES.other).label}</small></span></button>`;

  $('#drawerBody').innerHTML = `
    <div class="drawer-head">
      <span class="big-flag">${flagOf(c.iso2) || '◌'}</span>
      <div><div class="eyebrow">${esc(c.continent)}</div><h2>${esc(c.name)}</h2></div>
    </div>
    ${main}
    ${open.length || done.length ? `<div class="drawer-sec"><div class="eyebrow">On your list</div>${[...open, ...done].map(row).join('')}</div>` : ''}
    <div class="drawer-sec">
      <button class="discover-cta" data-dact="discover"><span><b>Discover ${esc(c.name)}</b><small>Places, sights, things to do and food</small></span><span>→</span></button>
      <button class="link-quiet" data-dact="add-entry">+ Add an entry in ${esc(c.name)}</button>
    </div>`;

  if (scratchState === 'scratching') mountScratch(c);
  if ($('#visitForm')) mountVisitForm(c);
}

$('#drawer').addEventListener('click', e => {
  if (e.target.closest('.drawer-x')) return closeDrawer();
  const a = e.target.closest('[data-dact]')?.dataset.dact;
  if (!a) return;
  const c = WORLD.byId[drawerId];
  if (a === 'start-scratch') {
    scratchState = 'scratching'; visitPhoto = null;
    visitLinks = new Set(entriesIn(c.id).filter(i => i.done).map(i => i.id)); // pre-select completed entries from this country
    renderDrawer();
  }
  else if (a === 'edit-visit') { scratchState = 'edit'; visitLinks = new Set(visits[c.id]?.entries || []); renderDrawer(); }
  else if (a === 'cancel-visit') { scratchState = null; renderDrawer(); }
  else if (a === 'unvisit' && confirm(`Unscratch ${c.name}?`)) { delete visits[c.id]; saveVisits(); scratchState = null; renderMap(); }
  else if (a === 'discover') openDiscover(c.id);
  else if (a === 'share-country') openCountryShare(c.id);
  else if (a === 'add-entry') { openForm(); form.place.value = c.name; form.type.value = 'trip'; }
});

/* Scratch-off canvas: silhouette underneath, foil on top */
function mountScratch(c) {
  const base = $('#scratchBase'), top = $('#scratchTop');
  const W = base.width, H = base.height;
  const bctx = base.getContext('2d'), tctx = top.getContext('2d');
  const el = $(`#countriesG [data-id="${c.id}"]`);
  let b = el.getBBox();
  if (b.width > 600) b = { x: 0, y: 0, width: MAP_W, height: MAP_H };
  const s = Math.min((W - 120) / b.width, (H - 120) / b.height);
  const ox = (W - b.width * s) / 2 - b.x * s, oy = (H - b.height * s) / 2 - b.y * s;
  const path = new Path2D(c.d);

  // Underneath: cream silhouette on dark, a little glow
  bctx.fillStyle = '#151311'; bctx.fillRect(0, 0, W, H);
  bctx.save(); bctx.translate(ox, oy); bctx.scale(s, s);
  bctx.shadowColor = 'rgba(200,169,106,.45)'; bctx.shadowBlur = 40;
  bctx.fillStyle = '#ede4d6'; bctx.fill(path);
  bctx.restore();

  // Foil
  const g = tctx.createLinearGradient(0, 0, W, H);
  [['#3b3329', 0], ['#7a6a4e', .35], ['#c8b48a', .5], ['#6e5f45', .62], ['#2e2821', 1]].forEach(([col, at]) => g.addColorStop(at, col));
  tctx.fillStyle = g; tctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { // fine grain
    tctx.fillStyle = `rgba(255,255,255,${Math.random() * .07})`;
    tctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  }
  tctx.save(); tctx.translate(ox, oy); tctx.scale(s, s);
  tctx.strokeStyle = 'rgba(20,17,15,.35)'; tctx.lineWidth = 2 / s; tctx.stroke(path);
  tctx.restore();
  tctx.font = '500 22px Inter'; tctx.fillStyle = 'rgba(20,17,15,.55)'; tctx.textAlign = 'center';
  tctx.letterSpacing = '8px'; tctx.fillText('SCRATCH', W / 2, H - 34); tctx.letterSpacing = '0px';

  tctx.globalCompositeOperation = 'destination-out';
  tctx.lineCap = tctx.lineJoin = 'round';
  tctx.lineWidth = 64;
  let last = null, done = false, strokes = 0;
  const pos = e => { const r = top.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const cleared = () => {
    const d = tctx.getImageData(0, 0, W, H).data;
    let clear = 0, n = 0;
    for (let y = 4; y < H; y += 12) for (let x = 4; x < W; x += 12) { n++; if (d[(y * W + x) * 4 + 3] < 40) clear++; }
    return clear / n;
  };
  top.addEventListener('pointerdown', e => { last = pos(e); top.setPointerCapture(e.pointerId); });
  top.addEventListener('pointermove', e => {
    if (!last || done) return;
    const p = pos(e);
    tctx.beginPath(); tctx.moveTo(...last); tctx.lineTo(...p); tctx.stroke();
    last = p;
    if (++strokes % 12 === 0 && cleared() > 0.42) finish();
  });
  top.addEventListener('pointerup', () => { last = null; if (!done && cleared() > 0.42) finish(); });
  function finish() {
    done = true;
    top.classList.add('gone');
    setTimeout(() => { scratchState = 'form'; renderDrawer(); }, 650);
  }
}

// Checklist of completed entries: ones from this country first, then the rest
function linkPicker(c) {
  const done = items.filter(i => i.done);
  if (!done.length) return `<p class="hint-line" style="margin:0">Completed entries will appear here.</p>`;
  const here = new Set(entriesIn(c.id).map(i => i.id));
  const takenElsewhere = id => Object.entries(visits).find(([cid, v]) => cid !== c.id && (v.entries || []).includes(id))?.[0];
  const sorted = [...done].sort((a, b) => (here.has(b.id) - here.has(a.id)) || (b.doneAt || 0) - (a.doneAt || 0));
  return `<div class="link-list">${sorted.map(i => {
    const other = takenElsewhere(i.id);
    const cover = coverOf(i);
    return `<label class="link-row">
      <input type="checkbox" value="${i.id}" ${visitLinks.has(i.id) ? 'checked' : ''}>
      <i style="${cover ? `background-image:${cssUrl(cover)}` : `background:${toneBg(TYPES[i.type] || TYPES.other)}`}"></i>
      <span><b>${esc(i.title)}</b><small>${here.has(i.id) ? `In ${esc(c.name)}` : other ? `Also linked to ${esc(WORLD.byId[other].name)}` : fmtDate(memDate(i))}</small></span>
      <em class="tick"></em>
    </label>`;
  }).join('')}</div>`;
}

function mountVisitForm(c) {
  $('#visitForm').addEventListener('change', e => {
    if (e.target.matches('.link-row input')) e.target.checked ? visitLinks.add(e.target.value) : visitLinks.delete(e.target.value);
  });
  $('#visitFile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    visitPhoto = await compressImage(f, 1100, 0.78);
    const d = $('#visitDrop');
    d.classList.add('has-img'); d.style.backgroundImage = `url("${visitPhoto}")`;
    d.querySelector('span').textContent = 'Change photograph';
  };
  $('#visitForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const prev = visits[c.id];
    const isNew = !prev;
    visits[c.id] = { date: f.date.value, comment: f.comment.value.trim(), photo: visitPhoto, entries: [...visitLinks].filter(id => items.some(i => i.id === id)), at: prev?.at || Date.now() };
    try { saveVisits(); } catch {
      if (prev) visits[c.id] = prev; else delete visits[c.id];
      return alert('Browser storage is full. Try a smaller photograph.');
    }
    scratchState = null;
    renderMap().then(() => {
      if (isNew) {
        const p = $(`#countriesG [data-id="${c.id}"]`);
        p?.classList.add('just-scratched');
        setTimeout(() => p?.classList.remove('just-scratched'), 1600);
      }
    });
    toast(isNew ? `${c.name} scratched off` : 'Saved');
  });
}

/* ---------- Discover (Wikipedia + Wikivoyage) ---------- */
const discoverCache = {};
const wv = params => fetch('https://en.wikivoyage.org/w/api.php?' + new URLSearchParams({ ...params, format: 'json', formatversion: 2, origin: '*', redirects: 1 }))
  .then(r => r.json());
const clean = s => s.replace(/\[\d+\]|\[edit\]/g, '').replace(/\s+/g, ' ').trim();
const firstSentences = (s, n = 2) => (clean(s).match(/[^.!?]+[.!?]+/g) || [clean(s)]).slice(0, n).join(' ').trim();
// Ask Wikimedia for a specific thumbnail width (their thumb URLs end in /NNNpx-File.jpg)
const sized = (u, w) => u.replace(/\/\d+px-([^/]+)$/, `/${w}px-$1`).replace(/\/\d+px-([^/?]+)\?/, `/${w}px-$1?`);
function imgSrc(img) {
  const set = (img.getAttribute('srcset') || '').split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
  const u = set[set.length - 1] || img.getAttribute('src') || '';
  return u.startsWith('//') ? 'https:' + u : u;
}
function parseSection(html, kind) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Keep listing coordinates (so added places land on the map), then drop map-marker numbers and hidden bits
  doc.querySelectorAll('.vcard').forEach(v => {
    const lat = v.querySelector('.latitude')?.textContent, lon = v.querySelector('.longitude')?.textContent;
    if (lat && lon) { v.dataset.lat = lat; v.dataset.lon = lon; }
  });
  doc.querySelectorAll('style, .mw-editsection, sup.reference, .hatnote, .mw-kartographer-container, table, .listing-coordinates, .mw-kartographer-maplink, .noprint').forEach(n => n.remove());
  const root = doc.querySelector('.mw-parser-output') || doc.body;
  const figures = [...root.querySelectorAll('figure')].map(f => {
    const img = f.querySelector('img');
    return img && { src: sized(imgSrc(img), 640), caption: clean(f.querySelector('figcaption')?.textContent || '') };
  }).filter(f => f && f.src && f.caption && !/map|locator/i.test(f.src));
  if (kind === 'list') {
    const out = [];
    for (const li of root.querySelectorAll('li')) {
      if (li.closest('figure')) continue;
      const nameEl = li.querySelector('.listing-name') || li.querySelector('b, a');
      const name = clean(nameEl?.textContent || '');
      if (!name || name.length > 60 || /^\d+$/.test(name)) continue;
      const full = clean(li.textContent);
      const desc = full.slice(full.indexOf(name) + name.length).replace(/^[\s—–:,-]+/, '');
      const v = li.querySelector('.vcard');
      out.push({ name, text: firstSentences(desc, 1), lat: v?.dataset.lat ? +v.dataset.lat : null, lng: v?.dataset.lon ? +v.dataset.lon : null });
    }
    return { items: out.slice(0, 9), figures };
  }
  // See / Do / Eat: subsections (h3) become items; first paragraph is the blurb; figure inside becomes its picture
  const items = [];
  let cur = null, intro = '';
  for (const el of root.children) {
    const h = el.matches('.mw-heading3, .mw-heading4') ? el : el.matches('h3, h4') ? el : null;
    if (h) { cur = { name: clean(h.textContent), text: '', img: null }; items.push(cur); continue; }
    if (el.matches('p') && clean(el.textContent)) {
      if (cur && !cur.text) cur.text = firstSentences(el.textContent, 2);
      else if (!cur && !intro) intro = firstSentences(el.textContent, 3);
    }
    if (cur && !cur.img) { const img = el.querySelector?.('figure img'); if (img) cur.img = imgSrc(img); }
  }
  // Listings (common on smaller country pages)
  for (const l of root.querySelectorAll('.vcard')) {
    const name = clean(l.querySelector('.listing-name, .fn')?.textContent || '');
    if (name && !items.some(i => i.name === name)) items.push({ name, text: firstSentences(l.querySelector('.listing-content')?.textContent || '', 1), img: null });
  }
  return { intro, items: items.filter(i => i.name && i.text).slice(0, 8), figures };
}
async function fetchDiscover(c) {
  if (discoverCache[c.id]) return discoverCache[c.id];
  const [secs, summary] = await Promise.all([
    wv({ action: 'parse', page: c.wiki, prop: 'sections' }),
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(c.wiki.replace(/ /g, '_'))}`).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  if (!secs.parse) throw new Error('No travel guide found');
  const title = secs.parse.title;
  const find = re => secs.parse.sections.find(s => s.toclevel === 1 && re.test(s.line))?.index;
  const want = { cities: [/^Cities$/i, 'list'], places: [/^Other destinations$/i, 'list'], see: [/^See$/i, 'rich'], do: [/^Do$/i, 'rich'], eat: [/^Eat$/i, 'rich'] };
  const parts = await Promise.all(Object.entries(want).map(async ([k, [re, kind]]) => {
    const idx = find(re);
    if (!idx) return [k, null];
    const r = await wv({ action: 'parse', page: title, section: idx, prop: 'text' });
    return [k, r.parse ? parseSection(r.parse.text, kind) : null];
  }));
  const data = Object.fromEntries(parts);
  const heroFig = [data.see, data.do, data.eat].flatMap(s => s?.figures || [])[0];
  const wpImg = summary?.originalimage?.source;
  data.hero = heroFig?.src ? sized(heroFig.src, 1280) : (wpImg && !/flag|locator|map|coat_of_arms/i.test(wpImg) ? wpImg : null);
  data.summary = summary?.extract ? firstSentences(summary.extract, 3) : '';
  data.title = title;
  return (discoverCache[c.id] = data);
}

function openDiscover(id) {
  const c = WORLD?.byId[id];
  if (!c) return;
  closeDrawer();
  const data = discoverCache[id];
  renderDiscover(c, data);
  enterDetail('discover', id);
  if (!data) fetchDiscover(c).then(d => { if (detail?.kind === 'discover' && detail.id === id) renderDiscover(c, d); })
    .catch(() => { if (detail?.id === id) renderDiscover(c, { error: true }); });
}

const addedFromDiscover = new Set();
function renderDiscover(c, d) {
  const v = visits[c.id];
  const t = TYPES.trip;
  const heroBg = d?.hero ? `${cssUrl(d.hero)},${toneBg(t)}` : toneBg(t);
  const sec = (key, label, type, sub) => {
    const s = d?.[key];
    if (!s || (!s.items.length && !s.figures.length)) return '';
    const figs = s.figures.slice(0, 4);
    return `<section class="disc-sec">
      <div class="sights-head"><h3>${label}</h3><span class="eyebrow">${sub}</span></div>
      ${figs.length ? `<div class="sights-grid compact">${figs.map((f, n) => `
        <figure class="sight" style="--i:${n};margin:0"><div class="bg" style="background-image:${cssUrl(f.src)}" data-zoom-src="${esc(f.src)}"></div>
          <figcaption class="cap"><h4>${esc(f.caption.length > 90 ? f.caption.slice(0, 88) + '…' : f.caption)}</h4></figcaption></figure>`).join('')}</div>` : ''}
      ${s.items.length ? `<div class="disc-items">${s.items.map(it => {
        const key2 = `${c.id}|${it.name}`;
        const added = addedFromDiscover.has(key2) || items.some(i => i.title === it.name);
        return `<article class="disc-item">
          ${it.img ? `<i style="background-image:${cssUrl(it.img)}"></i>` : ''}
          <div><h4>${esc(it.name)}</h4>${it.text ? `<p>${esc(it.text)}</p>` : ''}</div>
          <button class="add-pill ${added ? 'added' : ''}" data-disc-add="${esc(it.name)}" data-kind="${type}" data-text="${esc(it.text || '')}" data-img="${esc(it.img || '')}" data-city="${key === 'cities' || key === 'places' ? 1 : ''}" data-lat="${it.lat ?? ''}" data-lng="${it.lng ?? ''}">${added ? '✓ Added' : '+ Add'}</button>
        </article>`;
      }).join('')}</div>` : ''}
    </section>`;
  };
  $('#storyContent').innerHTML = `
    <header class="story-hero" style="background-image:${heroBg}">
      <div class="inner">
        <div class="eyebrow">Discover · ${esc(c.continent)}${v ? ' · Scratched' : ''}</div>
        <h2>${flagOf(c.iso2)} ${esc(c.name)}</h2>
      </div>
    </header>
    <div class="entry-body">
      ${d?.summary ? `<p class="lead">${esc(d.summary)}</p>` : ''}
      ${!d ? `<p class="lead loading">Gathering places, sights and food…</p>` : ''}
      ${d?.error ? `<p class="lead">Couldn't load a travel guide for ${esc(c.name)} right now.</p>` : ''}
      <div class="entry-actions">
        <button class="btn solid" data-disc-trip="1">Add a trip to ${esc(c.name)}</button>
        <button class="btn" data-disc-map="1">See on my map</button>
        ${d?.title ? `<a class="btn" href="https://en.wikivoyage.org/wiki/${encodeURIComponent(d.title.replace(/ /g, '_'))}" target="_blank" rel="noopener">Wikivoyage ↗</a>` : ''}
      </div>
    </div>
    ${d && !d.error ? [
      sec('cities', 'Where to go', 'trip', 'Cities'),
      sec('places', 'Beyond the cities', 'trip', 'Other destinations'),
      sec('see', 'See', 'culture', 'Sights'),
      sec('do', 'Do', 'activity', 'Experiences'),
      sec('eat', 'Eat', 'food', 'Food'),
    ].join('') + `<p class="credit">Travel content from Wikivoyage and Wikipedia, CC BY-SA.</p>` : ''}
    <div style="height:80px"></div>`;
}
$('#detailView').addEventListener('click', e => {
  if (detail?.kind !== 'discover') return;
  const c = WORLD.byId[detail.id];
  const add = e.target.closest('[data-disc-add]');
  if (add && !add.classList.contains('added')) {
    const name = add.dataset.discAdd;
    items.push(makeItem({
      title: add.dataset.city ? `Visit ${name}` : name,
      description: add.dataset.text, type: add.dataset.kind,
      place: add.dataset.city ? `${name}, ${c.name}` : c.name,
      image: add.dataset.img || null,
      lat: add.dataset.lat ? +add.dataset.lat : null, lng: add.dataset.lng ? +add.dataset.lng : null,
    }));
    save();
    addedFromDiscover.add(`${c.id}|${name}`);
    add.classList.add('added'); add.textContent = '✓ Added';
    toast('Added to your list');
  }
  if (e.target.closest('[data-disc-trip]')) {
    items.push(makeItem({ title: `Travel through ${c.name}`, description: discoverCache[c.id]?.summary || '', type: 'trip', place: c.name, image: discoverCache[c.id]?.hero || null }));
    save(); toast(`Trip to ${c.name} added`);
  }
  if (e.target.closest('[data-disc-map]')) {
    setView('map');
    renderMap().then(() => { openDrawer(c.id); zoomTo(c.id); });
  }
});

/* ---------- Shareable cards ---------- */
async function composeMapCard() {
  await loadWorld();
  await Promise.all(['200', '400', '500'].map(w => document.fonts.load(`${w} 40px Inter`)));
  const ids = Object.keys(visits).filter(id => WORLD.byId[id]);
  const photos = ids.sort((a, b) => visits[b].at - visits[a].at).map(visitPhotoOf).filter(Boolean).slice(0, 3);
  const imgs = (await Promise.all(photos.map(loadImg))).filter(Boolean);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0c0b0a'; ctx.fillRect(0, 0, W, H);
  // soft gold glow
  const glow = ctx.createRadialGradient(W / 2, 1400, 50, W / 2, 1400, 900);
  glow.addColorStop(0, 'rgba(200,169,106,.16)'); glow.addColorStop(1, 'rgba(200,169,106,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const print = (img, cx, cy, w, h, deg) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20, 30); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 22); ctx.clip();
    drawCover(ctx, img, -w / 2, -h / 2, w, h); ctx.restore();
  };
  const layouts = [[], [[540, 600, 520, 620, -3]], [[380, 620, 420, 520, -6], [700, 560, 420, 520, 5]],
    [[300, 640, 360, 450, -7], [780, 580, 360, 450, 6], [540, 640, 400, 500, -1]]];
  layouts[imgs.length].forEach((l, n) => print(imgs[n], ...l));

  // Big number
  const numY = imgs.length ? 1150 : 900;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ede4d6';
  ctx.font = '200 260px Inter'; ctx.letterSpacing = '-10px';
  ctx.fillText(String(ids.length), W / 2, numY);
  ctx.letterSpacing = '0px';
  ctx.font = '500 40px Inter'; ctx.fillStyle = '#fff';
  ctx.fillText(ids.length === 1 ? 'country scratched off' : 'countries scratched off', W / 2, numY + 70);
  const conts = new Set(ids.map(id => WORLD.byId[id].continent)).size;
  ctx.font = '400 28px Inter'; ctx.fillStyle = '#c8a96a';
  ctx.letterSpacing = '5px';
  ctx.fillText(`${Math.round(ids.length / UN_COUNTRIES * 100)}% OF THE WORLD  ·  ${conts} ${conts === 1 ? 'CONTINENT' : 'CONTINENTS'}`, W / 2, numY + 128);
  ctx.letterSpacing = '0px'; ctx.textAlign = 'left';

  // Map
  const mx = 40, my = numY + 190, ms = (W - 80) / MAP_W;
  ctx.save(); ctx.translate(mx, my); ctx.scale(ms, ms);
  ctx.lineWidth = .5 / ms;
  for (const c of WORLD.countries) {
    const p = new Path2D(c.d);
    ctx.fillStyle = visits[c.id] ? '#c8a96a' : '#2b2620';
    ctx.fill(p);
    ctx.strokeStyle = '#0c0b0a'; ctx.stroke(p);
  }
  ctx.restore();
  return cv;
}
async function composeCountryCard(id) {
  await loadWorld();
  const c = WORLD.byId[id], v = visits[id];
  // Reuse the story-card renderer with a synthetic entry
  return composeStory({
    id: 'country-' + id, pill: '✓  Been here', doneAt: v.at, createdAt: v.at, title: `${flagOf(c.iso2)} ${c.name}`.trim(), place: c.continent, image: visitPhotoOf(id),
    memory: { date: v.date ? v.date + '-15' : null, highlight: v.comment || '', photos: visitPhotoOf(id) ? [visitPhotoOf(id)] : [] },
  }, v.comment ? 'quote' : 'minimal');
}
function openMapShare() {
  openShareWith({ title: 'My map', desc: 'A 1080 × 1920 story of every country you\'ve scratched off, with your latest photos.', filename: 'the-list-world-map', compose: () => composeMapCard() });
}
function openCountryShare(id) {
  const c = WORLD.byId[id];
  openShareWith({ title: c.name, desc: 'A 1080 × 1920 story with your photo and note from this country.', filename: `the-list-${c.name}`, compose: () => composeCountryCard(id) });
}

/* ---------- Wire up ---------- */
document.addEventListener('click', e => {
  if (e.target.closest('.entry-row')) closeDrawer();
  const f = e.target.closest('[data-mapfilter]');
  if (f) { mapFilter = f.dataset.mapfilter; renderMap(); }
  const t = e.target.closest('[data-country]');
  if (t) { openDrawer(t.dataset.country); zoomTo(t.dataset.country); window.scrollTo({ top: $('#mapFrame').offsetTop - 90, behavior: 'smooth' }); }
  if (e.target.closest('[data-act="share-map"]')) openMapShare();
});
initMapInteractions();

