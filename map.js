/* ===================================================================
   World map: visited countries, bucket-list overlay, Discover,
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
let entryCountries = new Map();   // item.id -> [country ids]
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
// The countries a goal is in: the ones picked in its form, else a guess from older entries' place text or pin
function countriesForEntry(i) {
  if (Array.isArray(i.countries)) return i.countries.filter(id => WORLD?.byId[id]);
  const c = guessCountry(i);
  return c ? [c] : [];
}
const countryForEntry = i => countriesForEntry(i)[0] || null;
function guessCountry(i) {
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
  for (const i of items) { const c = countriesForEntry(i); if (c.length) entryCountries.set(i.id, c); }
  for (const [cid, v] of Object.entries(visits)) for (const eid of v.entries || []) if (!entryCountries.has(eid)) entryCountries.set(eid, [cid]);
}
const inCountry = (i, id) => (entryCountries.get(i.id) || []).includes(id);
const listCountries = () => new Set(items.filter(i => !i.done).flatMap(i => entryCountries.get(i.id) || []));
const entriesIn = id => items.filter(i => inCountry(i, id));
// Completed entries the user linked to a visited country (skipping any that were since deleted)
const linkedEntries = id => [...new Set([...(visits[id]?.entries || []).map(eid => items.find(i => i.id === eid)), ...items.filter(i => i.done && inCountry(i, id))])].filter(Boolean);
// The visit's own photo, else the cover of its first linked story, else a photo of the country
const visitPhotoOf = id => visits[id]?.photo || linkedEntries(id).map(coverOf).find(Boolean) || countryPhoto(id);

/* ---------- Country photos ----------
   Each country's Wikivoyage banner (Wikidata P948): a hand-picked landscape for every country page.
   Looked up once for all countries, then the image URLs for the ones you've visited; both are cached. */
const CP_KEY = 'bucketlist.countryPhotos.v1';
let countryPhotos = (() => { try { return JSON.parse(localStorage.getItem(CP_KEY)) || { files: null, urls: {} }; } catch { return { files: null, urls: {} }; } })();
let cpLoading = null;
const countryPhoto = id => {
  const u = countryPhotos.urls[id];
  if (u === undefined && countryPhotos.files?.[id]) loadCountryPhotos([id]);
  return u ? u.src : null;
};
const countryPhotoCredit = id => countryPhotos.urls[id]?.credit || null;
async function loadCountryPhotos(ids) {
  if (cpLoading) return cpLoading;
  cpLoading = (async () => {
    if (!countryPhotos.files) {
      const q = 'SELECT ?iso ?b WHERE { ?c wdt:P298 ?iso; wdt:P948 ?b. }';
      const r = await (await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q))).json();
      countryPhotos.files = {};
      for (const x of r.results.bindings) countryPhotos.files[x.iso.value] ||= decodeURIComponent(x.b.value.split('/').pop());
    }
    const need = ids.filter(id => countryPhotos.files[id] && countryPhotos.urls[id] === undefined);
    for (let k = 0; k < need.length; k += 40) {
      const batch = need.slice(k, k + 40);
      const titles = batch.map(id => 'File:' + countryPhotos.files[id]);
      const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', formatversion: 2, origin: '*', prop: 'imageinfo', iiprop: 'url|extmetadata', iiextmetadatafilter: 'Artist|LicenseShortName', iiurlwidth: 2400, titles: titles.join('|') });
      const pages = (await (await fetch(url)).json()).query?.pages || [];
      const norm = t => t.replace(/_/g, ' ');
      for (const id of batch) {
        const p = pages.find(x => norm(x.title) === norm('File:' + countryPhotos.files[id]));
        const ii = p?.imageinfo?.[0];
        if (!ii) { countryPhotos.urls[id] = null; continue; }
        const artist = (ii.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 50);
        countryPhotos.urls[id] = { src: ii.thumburl, credit: `Photo: ${[artist || 'Unknown', ii.extmetadata?.LicenseShortName?.value].filter(Boolean).join(', ')} · Wikivoyage` };
      }
    }
    try { localStorage.setItem(CP_KEY, JSON.stringify(countryPhotos)); } catch { /* full: keep them for this session */ }
  })().catch(e => console.warn('country photos', e)).finally(() => { cpLoading = null; if (!$('#mapView').hidden) renderMap(); });
  return cpLoading;
}

/* ---------- Completed entries scratch their country off ---------- */
const ymOf = it => { const d = memDate(it); return datePrec(it) === 'year' ? String(d.getFullYear()) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
// Call whenever an entry is completed, reopened, edited or removed. Returns the id of a newly scratched country.
// Countries scratched this way (auto) are unscratched again when their last linked entry goes; ones you scratched yourself stay.
function syncVisitFor(it) {
  if (!WORLD) return null;
  const cids = it.done && items.includes(it) ? countriesForEntry(it) : [];
  let changed = false, scratched = null;
  for (const [id, v] of Object.entries(visits)) {
    if (cids.includes(id) || !(v.entries || []).includes(it.id)) continue;
    v.entries = v.entries.filter(e => e !== it.id); changed = true;
    if (v.auto && !v.entries.length) delete visits[id];
  }
  for (const cid of cids) {
    const v = visits[cid];
    if (!v) { visits[cid] = { date: ymOf(it), comment: '', photo: null, entries: [it.id], at: Date.now(), auto: true }; scratched ||= cid; changed = true; }
    else if (!(v.entries || []).includes(it.id)) { v.entries = [...(v.entries || []), it.id]; changed = true; }
  }
  if (changed) saveVisits();
  return scratched;
}
// Entries completed before this existed: link them once
function backfillVisits() {
  if (localStorage.getItem('bucketlist.visitsBackfill')) return;
  items.filter(i => i.done).forEach(syncVisitFor);
  localStorage.setItem('bucketlist.visitsBackfill', '1');
}

/* ---------- Map rendering ---------- */
let mapBuilt = false;
function buildMap() {
  const g = $('#countriesG');
  g.innerHTML = WORLD.countries.map(c => `<path d="${c.d}" data-id="${c.id}"></path>`).join('');
  mapBuilt = true;
}
async function renderMap() {
  await loadWorld();
  if (!mapBuilt) buildMap();
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
    return hidden ? '' : `<g class="pin" data-id="${id}"><circle class="ring" r="6"/><circle r="2.6"/></g>`;
  }).join('');

  const conts = new Set(visitedIds.map(id => WORLD.byId[id].continent));
  $('#mapCount').textContent = visitedIds.length;
  $('#mapNoun').textContent = visitedIds.length === 1 ? 'country' : 'countries';
  $('#mapSub').textContent = `${Math.round(visitedIds.length / UN_COUNTRIES * 100)}% of the world · ${conts.size} of 6 continents · ${onList.size} on your list`;
  document.querySelectorAll('[data-mapfilter]').forEach(b => b.classList.toggle('active', b.dataset.mapfilter === mapFilter));
  const missing = visitedIds.filter(id => countryPhotos.urls[id] === undefined && (!countryPhotos.files || countryPhotos.files[id]));
  if (missing.length && !cpLoading) loadCountryPhotos(missing);
  if ($('#mapSearch').options.length < 2) fillCountries();
  drawGlobe();
  renderMapStrip(visitedIds, onList);
  if (drawerId) renderDrawer();
  if (typeof checkStamps === 'function') checkStamps();
}

function renderMapStrip(visitedIds, onList) {
  const vis = visitedIds.map(id => ({ id, ...visits[id] })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.at - a.at);
  const list = [...onList].filter(id => !visits[id]).sort((a, b) => WORLD.byId[a].name.localeCompare(WORLD.byId[b].name));
  const tile = (id, sub, photo) => {
    const c = WORLD.byId[id];
    const pending = !photo && visits[id] && cpLoading;
    return `<button class="ctile ${photo ? '' : pending ? 'foil-tile loading' : 'foil-tile'}" data-country="${id}" style="${photo ? `background-image:${cssUrl(photo)}` : ''}">
      <span class="flag">${flagOf(c.iso2)}</span><span class="nm">${esc(c.name)}</span><span class="sub">${sub}</span></button>`;
  };
  const showVis = mapFilter !== 'list', showList = mapFilter !== 'visited';
  $('#mapStrip').innerHTML =
    (showVis ? `<div class="strip-head"><h3>Visited</h3><span class="eyebrow">${vis.length}</span></div>
      <div class="ctiles">${vis.length ? vis.map(v => tile(v.id, monthLabel(v.date) || 'Visited', visitPhotoOf(v.id))).join('') : `<p class="muted-note">Open the map and tap a country, or use Find a country.</p>`}</div>` : '') +
    (showList ? `<div class="strip-head"><h3>On my list</h3><span class="eyebrow">${list.length}</span></div>
      <div class="ctiles">${list.length ? list.map(id => tile(id, `${entriesIn(id).filter(i => !i.done).length} on the list`, entriesIn(id).map(entryCover).find(Boolean))).join('') : `<p class="muted-note">Countries from your open entries appear here.</p>`}</div>` : '');
}

/* ---------- Globe ----------
   Countries as longitude/latitude rings (globe.json, made once from countries.json), drawn with an orthographic
   projection into the same SVG paths, so styling, hover and taps work as before. Drag spins, pinch zooms. */
let GEO = null;
const loadGeo = () => GEO ? Promise.resolve(GEO) : fetch('globe.json').then(r => r.json()).then(d => (GEO = d));
const RAD = Math.PI / 180;
const G = { lon: 15, lat: 22, k: 1, R: 440, spin: true };
let globeOpen = false;
function proj(lon, lat) {
  const l = (lon - G.lon) * RAD, p = lat * RAD, p0 = G.lat * RAD;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  let x = Math.cos(p) * Math.sin(l), y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
  if (cosc < 0) { const n = Math.hypot(x, y) || 1; x /= n; y /= n; } // the far side folds onto the rim
  const r = G.R * G.k;
  return [500 + x * r, 500 - y * r, cosc >= 0];
}
function ringD(ring) {
  let d = '', seen = false;
  for (let k = 0; k < ring.length; k += 2) {
    const [x, y, vis] = proj(ring[k], ring[k + 1]);
    seen ||= vis;
    d += (k ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  return seen ? d + 'Z' : '';
}
let graticule = null;
function drawGlobe() {
  if (!GEO || !globeOpen) return;
  const r = G.R * G.k;
  $('#globeSea').setAttribute('r', r); $('#globeRim').setAttribute('r', r);
  for (const el of document.querySelectorAll('#countriesG path')) el.setAttribute('d', (GEO[el.dataset.id]?.r || []).map(ringD).join(''));
  // Meridians and parallels every 30°, only the near side
  graticule ||= [...[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180].map(lon => Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5])),
    ...[-60, -30, 0, 30, 60].map(lat => Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]))];
  $('#gratG').setAttribute('d', graticule.map(line => { let d = '', pen = false; for (const [lo, la] of line) { const [x, y, v] = proj(lo, la); d += v ? (pen ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1) : ''; pen = v; } return d; }).join(''));
  for (const pin of document.querySelectorAll('#pinsG .pin')) {
    const c = GEO[pin.dataset.id]?.c; if (!c) continue;
    const [x, y, v] = proj(c[0], c[1]);
    pin.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); pin.style.display = v ? '' : 'none';
  }
}
let globeRaf = null, lastT = 0;
function globeLoop(t) {
  globeRaf = null;
  if (!globeOpen || $('#mapView').hidden) return;
  if (G.spin && !drawerId) { G.lon -= Math.min(50, t - (lastT || t)) * 0.004; drawGlobe(); } // a slow turn until you touch it
  lastT = t;
  if (G.spin) globeRaf = requestAnimationFrame(globeLoop);
}
const kickGlobe = () => { if (!globeRaf) { lastT = 0; globeRaf = requestAnimationFrame(globeLoop); } };
async function setGlobeOpen(on) {
  globeOpen = on;
  document.body.classList.toggle('globe-open', on);
  $('#showMap').setAttribute('aria-expanded', on);
  $('#showMap span').textContent = on ? 'Hide map' : 'Show map';
  if (on) { await loadGeo(); drawGlobe(); kickGlobe(); }
}
function zoomAt(f) { G.k = Math.min(8, Math.max(1, G.k / f)); drawGlobe(); }
function resetVB() { G.k = 1; drawGlobe(); }
// Turn the globe to a country (and closer in for small ones)
function zoomTo(id) {
  const c = GEO?.[id]?.c; if (!c || !globeOpen) return;
  G.spin = false;
  const from = { lon: G.lon, lat: G.lat, k: G.k };
  let dl = ((c[0] - from.lon + 540) % 360) - 180;
  const toK = Math.max(1, Math.min(3, WORLD.byId[id] ? 2.2 : 1)), t0 = performance.now();
  const step = t => {
    const e = Math.min(1, (t - t0) / 800), s = 1 - Math.pow(1 - e, 3);
    G.lon = from.lon + dl * s; G.lat = from.lat + (Math.max(-60, Math.min(60, c[1])) - from.lat) * s; G.k = from.k + (toK - from.k) * s;
    drawGlobe();
    if (e < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const pxPerUnit = () => { const s = $('#worldSvg'); return Math.min(s.clientWidth, s.clientHeight) / 1000 || 0.4; };
let drag = null;
let fillCountries = () => {};
function initMapInteractions() {
  const svg = $('#worldSvg'), tip = $('#mapTip');
  $('#showMap').addEventListener('click', () => setGlobeOpen(!globeOpen));
  svg.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return; // normal scrolling keeps scrolling the page; pinch / ⌘-scroll zooms
    e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.01));
  }, { passive: false });
  const pts = new Map();
  let pinch = null;
  svg.addEventListener('pointerdown', e => {
    G.spin = false;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag && (drag.moved = true); }
  });
  window.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(pinch / d); pinch = d; return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        const deg = 1 / (G.R * G.k * pxPerUnit()) / RAD;
        G.lon -= dx * deg; G.lat = Math.max(-80, Math.min(80, G.lat + dy * deg));
        drawGlobe();
      }
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
    if (e.pointerType === 'touch') return;
    const p = e.target.closest('path[data-id]');
    if (!p) return tip.classList.remove('on');
    const c = WORLD.byId[p.dataset.id], v = visits[c.id], n = entriesIn(c.id).filter(i => !i.done).length;
    tip.innerHTML = `<span>${flagOf(c.iso2)} ${esc(c.name)}</span><small>${v ? 'Visited' + (v.date ? ' · ' + monthLabel(v.date) : '') : n ? `${n} on your list` : 'Not yet'}</small>`;
    tip.classList.add('on');
  });
  svg.addEventListener('pointermove', e => {
    const r = $('#mapFrame').getBoundingClientRect();
    tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
  });
  svg.addEventListener('pointerleave', () => tip.classList.remove('on'));
  document.querySelector('#mapFrame').addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]')?.dataset.zoom;
    if (z === 'in') zoomAt(0.65); else if (z === 'out') zoomAt(1.55); else if (z === 'reset') resetVB();
    else if (z === 'full' || z === 'exit') { document.body.classList.toggle('map-full', z === 'full'); requestAnimationFrame(drawGlobe); }
  });
  // Find a country: a native dropdown (the iPhone shows its picker wheel), every country A–Z, visited ones marked
  const sel = $('#mapSearch');
  fillCountries = () => {
    if (!WORLD) return;
    sel.innerHTML = '<option value="">Find a country…</option>' + [...WORLD.countries].sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `<option value="${c.id}">${flagOf(c.iso2) ? flagOf(c.iso2) + ' ' : ''}${esc(c.name)}${visits[c.id] ? '  ✓' : ''}</option>`).join('');
  };
  fillCountries();
  sel.addEventListener('focus', fillCountries); // refresh the ✓ marks
  sel.addEventListener('change', () => { const id = sel.value; if (!id) return; sel.value = ''; sel.blur(); openDrawer(id); zoomTo(id); });
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
let scratchState = null;   // null | 'ask' (just marked visited: add a memory or skip) | 'edit'
let visitPhoto = null;
let visitLinks = new Set();   // entry ids being linked in the visit form

function renderDrawer() {
  const c = WORLD.byId[drawerId];
  if (!c) return;
  const v = visits[c.id];
  const entries = entriesIn(c.id);
  const linkedIds = new Set(v?.entries || []);
  const open = entries.filter(i => !i.done), done = v ? [] : entries.filter(i => i.done && !linkedIds.has(i.id)); // visited: completed ones are under "Completed here"

  let main;
  if (v && scratchState === 'ask') {
    main = `<div class="visit-ask">
        <div class="seal">✓ Visited</div>
        <h3>Add a memory of ${esc(c.name)}?</h3>
        <p class="hint-line">When you went, a photo, a few words. You can always add it later.</p>
        <div class="visit-ask-btns"><button class="btn solid" data-dact="edit-visit">Add a memory</button><button class="btn" data-dact="cancel-visit">Skip</button></div>
      </div>`;
  } else if (v && scratchState === 'edit') {
    visitPhoto = v?.photo || null;
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
    const own = visits[c.id]?.photo || linkedEntries(c.id).map(coverOf).find(Boolean);
    main = `${photo ? `<div class="visit-photo" style="background-image:${cssUrl(photo)}"></div>${!own && countryPhotoCredit(c.id) ? `<p class="photo-credit">${esc(countryPhotoCredit(c.id))}</p>` : ''}` : ''}
      <div class="visit-meta"><span class="seal">✓ Visited</span>${v.date ? `<span>${monthLabel(v.date)}</span>` : ''}</div>
      ${v.comment ? `<blockquote class="visit-comment">${esc(v.comment)}</blockquote>` : ''}
      ${linked.length ? `<div class="linked"><div class="eyebrow">Completed here</div>${linked.map(i => `
        <button class="entry-row" data-act="view" data-id="${i.id}">
          <i style="${coverOf(i) ? `background-image:${cssUrl(coverOf(i))}` : `background:${toneBg(TYPES[i.type] || TYPES.other)}`}"></i>
          <span><b>${esc(i.title)}</b><small>${hasStory(i) ? 'Memory' : 'Write memory'}</small></span></button>`).join('')}</div>` : ''}
      <div class="drawer-actions">
        <button class="btn" data-dact="edit-visit">${v.date || v.comment || v.photo ? 'Edit memory' : 'Add a memory'}</button>
        <button class="btn" data-dact="share-country">Share</button>
        <button class="link-quiet" data-dact="unvisit">Not visited</button>
      </div>`;
  } else {
    main = `<button class="btn solid wide been-here" data-dact="mark-visited">✓  I've been here</button>`;
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

  if ($('#visitForm')) mountVisitForm(c);
}

$('#drawer').addEventListener('click', e => {
  if (e.target.closest('.drawer-x')) return closeDrawer();
  const a = e.target.closest('[data-dact]')?.dataset.dact;
  if (!a) return;
  const c = WORLD.byId[drawerId];
  if (a === 'mark-visited') {
    // That's it: visited. Completed goals from here are linked; then offer to add a memory, or skip
    visits[c.id] = { date: '', comment: '', photo: null, entries: entriesIn(c.id).filter(i => i.done).map(i => i.id), at: Date.now() };
    saveVisits();
    scratchState = 'ask';
    renderMap().then(() => { const p = $(`#countriesG [data-id="${c.id}"]`); p?.classList.add('just-scratched'); setTimeout(() => p?.classList.remove('just-scratched'), 1600); });
    toast(`${c.name} marked as visited`);
  }
  else if (a === 'edit-visit') { scratchState = 'edit'; visitLinks = new Set(visits[c.id]?.entries || []); renderDrawer(); }
  else if (a === 'cancel-visit') { scratchState = null; renderDrawer(); }
  else if (a === 'unvisit') uiConfirm({ eyebrow: 'Not visited', title: `Remove ${c.name} from your visited countries?`, body: 'Its date, photo and note are removed from your map. Your entries stay.', ok: 'Remove', danger: true }).then(ok => { if (!ok) return; delete visits[c.id]; saveVisits(); scratchState = null; renderMap(); });
  else if (a === 'discover') openDiscover(c.id);
  else if (a === 'share-country') openCountryShare(c.id);
  else if (a === 'add-entry') { openForm(); setFormCountries([c.id]); form.type.value = 'trip'; }
});

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
      <span><b>${esc(i.title)}</b><small>${here.has(i.id) ? `In ${esc(c.name)}` : other ? `Also linked to ${esc(WORLD.byId[other].name)}` : fmtWhen(i)}</small></span>
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
      return uiNotice('Storage is full', 'Try a smaller photograph.');
    }
    scratchState = null;
    renderMap().then(() => {
      if (isNew) {
        const p = $(`#countriesG [data-id="${c.id}"]`);
        p?.classList.add('just-scratched');
        setTimeout(() => p?.classList.remove('just-scratched'), 1600);
      }
    });
    toast(isNew ? `${c.name} marked as visited` : 'Memory saved');
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
        <div class="eyebrow">Discover · ${esc(c.continent)}${v ? ' · Visited' : ''}</div>
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
  ctx.fillText(ids.length === 1 ? 'country visited' : 'countries visited', W / 2, numY + 70);
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
async function composeCountryCard(id, style) {
  await loadWorld();
  const c = WORLD.byId[id], v = visits[id];
  // Reuse the story-card renderer with a synthetic entry
  return composeStory({
    id: 'country-' + id, pill: '✓  Been here', doneAt: v.at, createdAt: v.at, title: `${flagOf(c.iso2)} ${c.name}`.trim(), place: c.continent, image: visitPhotoOf(id),
    memory: { date: v.date ? v.date + '-15' : null, highlight: v.comment || '', photos: visitPhotoOf(id) ? [visitPhotoOf(id)] : [] },
  }, style || (v.comment ? 'quote' : 'minimal'));
}
function openMapShare() {
  openShareWith({ title: 'My map', desc: 'A 1080 × 1920 story of every country you\'ve visited, with your latest photos.', filename: 'the-list-world-map', compose: () => composeMapCard() });
}
function openCountryShare(id) {
  const c = WORLD.byId[id];
  const styles = [...(visits[id]?.comment ? ['quote'] : []), 'minimal', 'polaroid', 'cover', 'ticket'];
  openShareWith({ title: c.name, desc: 'A 1080 × 1920 story with your photo and note from this country. Tap the preview for another look.', filename: `the-list-${c.name}`, compose: style => composeCountryCard(id, style), styles });
}

/* ---------- Wire up ---------- */
document.addEventListener('click', e => {
  if (e.target.closest('.entry-row')) closeDrawer();
  const f = e.target.closest('[data-mapfilter]');
  if (f) { mapFilter = f.dataset.mapfilter; renderMap(); }
  const t = e.target.closest('[data-country]');
  if (t) { openDrawer(t.dataset.country); zoomTo(t.dataset.country); if (globeOpen) window.scrollTo({ top: $('#mapFrame').offsetTop - 90, behavior: 'smooth' }); }
  if (e.target.closest('[data-act="share-map"]')) openMapShare();
});
initMapInteractions();

