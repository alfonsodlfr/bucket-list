/* ===================================================================
   Wrapped: an end-of-year story, 9:16, exportable as images or video.
   Slides are drawn on a 1080×1920 canvas (the same renderer is used
   for playback and export). Data comes from your list, visits and
   the (mock) social layer; a sample year fills in when yours is thin.
   =================================================================== */

const WR_W = 1080, WR_H = 1920;
const WR_YEAR = new Date().getFullYear();
const SLIDE_MS = 5600, INTRO_MS = 1500;

/* ---------- Sample year (used when your own year has fewer than 3 completions) ---------- */
function sampleYear(year) {
  const d = (m, day) => new Date(year, m - 1, day, 12).getTime();
  const P = n => `img/${n}.jpg`;
  const S_ = (title, type, place, lat, lng, img, created, done, extra = {}) => ({ id: 's-' + title, title, type, place, lat, lng, image: P(img), createdAt: created, doneAt: done, ...extra });
  return [
    S_('Cherry blossoms in Kyoto', 'trip', 'Kyoto, Japan', 35.01, 135.77, 'cherry-blossoms-in-kyoto', d(1, 3) - 400 * DAY, d(4, 2), { reactions: { '✨': 6, '🥹': 3, '🌍': 2 } }),
    S_('Omakase in Ginza', 'food', 'Tokyo, Japan', 35.67, 139.76, 'omakase-in-ginza', d(1, 10), d(4, 5), { reactions: { '🔥': 4, '✨': 2 } }),
    S_('Take a pottery class', 'learning', 'Lisbon, Portugal', 38.72, -9.14, 'a-season-at-the-potter-s-wheel', d(1, 5), d(3, 8), { reactions: { '👏': 3 } }),
    S_('Hand-rolled pasta in Bologna', 'food', 'Bologna, Italy', 44.49, 11.34, 'hand-rolled-pasta-in-bologna', d(2, 1), d(5, 2), { reactions: { '🔥': 3, '👏': 2 } }),
    S_('Flamenco in Seville', 'culture', 'Seville, Spain', 37.39, -5.98, 'flamenco-in-seville', d(1, 20), d(5, 24)),
    S_('Run a half marathon', 'personal', 'Valencia, Spain', 39.47, -0.38, 'run-a-half-marathon', d(1, 2) - 700 * DAY, d(6, 14), { reactions: { '👏': 7, '🔥': 5, '🥹': 2 }, hard: true }),
    S_('Via ferrata in the Dolomites', 'activity', 'Cortina d\'Ampezzo, Italy', 46.54, 12.14, 'via-ferrata-in-the-dolomites', d(3, 1), d(6, 21), { reactions: { '🏔️': 5, '🔥': 2 }, hard: true }),
    S_('Trek Torres del Paine', 'activity', 'Patagonia, Chile', -50.94, -73.41, 'trek-torres-del-paine', d(1, 2) - 300 * DAY, d(7, 12), { reactions: { '🏔️': 8, '✨': 5, '🌍': 4, '🥹': 3 }, hard: true }),
    S_('Sunrise at Petra', 'culture', 'Petra, Jordan', 30.33, 35.44, 'sunrise-at-petra', d(2, 10), d(8, 3), { reactions: { '✨': 6, '🌍': 3 } }),
    S_('Balloon over Cappadocia', 'trip', 'Cappadocia, Turkey', 38.64, 34.83, 'balloon-over-cappadocia', d(3, 3), d(8, 9), { reactions: { '✨': 4, '🥹': 4 } }),
    S_('Watch the big waves at Nazaré', 'activity', 'Nazaré, Portugal', 39.6, -9.07, 'watch-the-big-waves-at-nazar', d(4, 4), d(9, 6)),
    S_('The markets of Oaxaca', 'food', 'Oaxaca, Mexico', 17.07, -96.73, 'the-markets-of-oaxaca', d(5, 1), d(9, 13), { reactions: { '🔥': 3 } }),
    S_('An evening at La Scala', 'culture', 'Milan, Italy', 45.47, 9.19, 'an-evening-at-la-scala', d(5, 5), d(9, 20)),
    S_('The Venice Biennale', 'culture', 'Venice, Italy', 45.43, 12.34, 'the-venice-biennale', d(5, 9), d(9, 27)),
    S_('Chase the northern lights', 'trip', 'Kiruna, Sweden', 67.86, 20.23, 'chase-the-northern-lights', d(1, 2) - 500 * DAY, d(10, 4), { reactions: { '✨': 9, '🥹': 5, '🌍': 3, '🔥': 2 } }),
    S_('Write a short book', 'personal', '', null, null, 'write-a-short-book', d(1, 1) - 900 * DAY, d(10, 11), { reactions: { '👏': 6, '🥹': 4 } }),
  ];
}

/* ---------- Aggregation (the backend will run the same logic in SQL) ---------- */
async function wrappedData(year, useSample) {
  await loadWorld();
  if (!mapBuilt) buildMap(); // country lookup by coordinates uses the map's shapes
  const inYear = t => t && new Date(t).getFullYear() === year;

  // Your completions this year
  const mine = items.filter(i => i.done && inYear(memDate(i).getTime())).map(i => {
    const act = S.activities.find(a => a.entryId === i.id);
    const reactions = {};
    if (act) for (const r of api.reactionsOf(act.id)) reactions[r.emoji] = (reactions[r.emoji] || 0) + 1;
    return { id: i.id, title: i.title, type: i.type, place: i.place, lat: i.lat, lng: i.lng, image: coverOf(i), createdAt: i.createdAt, doneAt: memDate(i).getTime(), reactions };
  });
  const sampleAvailable = mine.length < 3;
  const sample = useSample ?? sampleAvailable;
  const done = (sample ? sampleYear(year) : mine).sort((a, b) => a.doneAt - b.doneAt);

  // Categories
  const byType = {};
  for (const e of done) byType[e.type] = (byType[e.type] || 0) + 1;
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  // Weekly streak (consecutive weeks with at least one completion)
  const jan1 = new Date(year, 0, 1).getTime();
  const weeks = new Set(done.map(e => Math.floor((e.doneAt - jan1) / (7 * DAY))));
  let best = 0, bestEnd = -1, run = 0;
  for (let w = 0; w < 53; w++) { run = weeks.has(w) ? run + 1 : 0; if (run > best) { best = run; bestEnd = w; } }

  // Places
  const countries = new Set();
  const pins = [];
  for (const e of done) {
    const cid = countryForEntry(e);
    if (cid) countries.add(cid);
    if (e.lat != null) pins.push(project(e.lng, e.lat));
    else if (cid) pins.push([WORLD.byId[cid].lx, WORLD.byId[cid].ly]);
  }
  if (!sample) for (const [cid, v] of Object.entries(visits)) if ((v.date || '').startsWith(String(year)) || inYear(v.at)) countries.add(cid);
  const countryNames = new Set(WORLD.countries.flatMap(namesFor));
  const cities = new Set(done.map(e => (e.place || '').split(/,|→/)[0].trim()).filter(c => c && !countryNames.has(c.toLowerCase())));

  // Challenges (mock social layer)
  const myChallenges = S.challenges.filter(c => api.membersOf(c.id).includes(ME) && (inYear(c.endsAt) || inYear(c.startsAt)));
  const ended = myChallenges.filter(c => api.status(c) === 'ended');
  const won = ended.filter(c => api.leaderboard(c.id)[0]?.userId === ME);
  const myComps = S.completions.filter(c => c.userId === ME && inYear(c.completedAt) && c.status !== 'rejected');
  const points = myComps.reduce((s, c) => s + POINTS[S.items.find(i => i.id === c.itemId)?.difficulty || 'easy'], 0);
  const ranks = myChallenges.map(c => ({ title: c.title, rank: api.leaderboard(c.id).findIndex(r => r.userId === ME) + 1, ended: api.status(c) === 'ended' }));

  // Community: most reactions, and most distinct people / emoji (engagement)
  const scored = done.map(e => ({ ...e, total: Object.values(e.reactions || {}).reduce((a, b) => a + b, 0), kinds: Object.keys(e.reactions || {}).length }))
    .filter(e => e.total > 0);
  if (!sample) for (const c of myComps) {
    const a = S.activities.find(x => x.completionId === c.id);
    if (!a) continue;
    const rs = api.reactionsOf(a.id), reactions = {};
    rs.forEach(r => reactions[r.emoji] = (reactions[r.emoji] || 0) + 1);
    if (rs.length) scored.push({ title: a.title, image: a.photo, place: '', total: rs.length, kinds: Object.keys(reactions).length, reactions, people: new Set(rs.map(r => r.userId)).size });
  }
  const mostLoved = [...scored].sort((a, b) => b.total - a.total)[0] || null;
  const mostEngaged = [...scored].sort((a, b) => (b.kinds * 10 + b.total) - (a.kinds * 10 + a.total))[0] || null;

  // Ultimate quest: hardest (hard challenge goal or marked hard), else the longest time from listing to done
  const quests = [
    ...done.map(e => ({ title: e.title, image: e.image, place: e.place, days: Math.max(1, Math.round((e.doneAt - e.createdAt) / DAY)), hard: !!e.hard, at: e.doneAt })),
    ...myComps.map(c => {
      const it = S.items.find(i => i.id === c.itemId), ch = api.challengeSync(c.challengeId);
      return { title: it.title, image: c.proof, place: ch.title, days: Math.max(1, Math.round((c.completedAt - ch.startsAt) / DAY)), hard: it.difficulty === 'hard', points: POINTS[it.difficulty], at: c.completedAt };
    }),
  ];
  const quest = quests.sort((a, b) => (b.hard - a.hard) || (b.days - a.days))[0] || null;

  const persona = personaFor(done, byType, countries.size);
  return {
    year, sample, sampleAvailable, done, total: done.length,
    openCount: items.filter(i => !i.done).length,
    types, weeks, streak: best, streakEnd: bestEnd, activeWeeks: weeks.size,
    countries: [...countries], cities: [...cities], pins,
    challenges: myChallenges.length, won: won.length, points, ranks,
    mostLoved, mostEngaged: mostEngaged && mostEngaged !== mostLoved ? mostEngaged : null,
    quest, persona,
  };
}

const PERSONAS = [
  { id: 'sunset', name: 'The Sunset Collector', line: 'You chase golden hours, auroras and first light.', test: (d) => d.filter(e => /sunrise|sunset|aurora|northern lights|stars|golden/i.test(e.title)).length >= 2, colors: ['#3b1d2e', '#c8774a', '#f2c46d'], icon: '🌅' },
  { id: 'globe', name: 'The Globetrotter', line: 'Passport tired, heart full.', test: (d, t, c) => (t.trip || 0) / d.length >= 0.3 && c >= 4, colors: ['#11253a', '#2f6f8f', '#c8a96a'], icon: '🧭' },
  { id: 'extreme', name: 'The Extreme Explorer', line: 'If it has a summit, a swell or a drop, you were there.', test: (d, t) => (t.activity || 0) / d.length >= 0.28, colors: ['#10231c', '#3f7d5c', '#d9c08a'], icon: '🏔️' },
  { id: 'foodie', name: 'The Foodie', line: 'You travel stomach-first, and it shows.', test: (d, t) => (t.food || 0) / d.length >= 0.3, colors: ['#2e1508', '#b5652e', '#f0c27a'], icon: '🍜' },
  { id: 'culture', name: 'The Culture Collector', line: 'Stages, museums and old stones: your natural habitat.', test: (d, t) => (t.culture || 0) / d.length >= 0.3, colors: ['#1c1530', '#6a4f9c', '#d6b98a'], icon: '🎭' },
  { id: 'learner', name: 'The Lifelong Learner', line: 'Every year, a new skill in your hands.', test: (d, t) => (t.learning || 0) / d.length >= 0.25, colors: ['#121a2e', '#3c5a9a', '#c8a96a'], icon: '📚' },
  { id: 'quiet', name: 'The Quiet Achiever', line: 'Big personal wins, no fanfare needed.', test: (d, t) => (t.personal || 0) / d.length >= 0.3, colors: ['#1a1c14', '#6b7a45', '#d9c08a'], icon: '🌱' },
  { id: 'dreamer', name: 'The Dreamer in Motion', line: 'A little of everything, always moving.', test: () => true, colors: ['#1a1512', '#7a6a4e', '#ede4d6'], icon: '✨' },
];
const personaFor = (done, byType, nCountries) => done.length ? PERSONAS.find(p => p.test(done, byType, nCountries)) : PERSONAS.at(-1);

/* ---------- Drawing helpers ---------- */
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => ease((t - a) / (b - a));
function wash(ctx, c1, c2, c3) {
  ctx.fillStyle = '#0c0b0a'; ctx.fillRect(0, 0, WR_W, WR_H);
  const blob = (x, y, r, col, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col + Math.round(a * 255).toString(16).padStart(2, '0')); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WR_W, WR_H);
  };
  blob(180, 320, 900, c1, .9); blob(980, 1500, 1000, c2, .55); blob(540, 980, 700, c3, .12);
}
function T(ctx, s, x, y, { size = 40, weight = 400, color = '#ede4d6', align = 'left', spacing = 0, alpha = 1, upper = false } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px Inter`; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.letterSpacing = spacing + 'px';
  ctx.fillText(upper ? s.toUpperCase() : s, x, y);
  ctx.restore();
}
function header(ctx, D, t) {
  T(ctx, `THE LIST · ${D.year} WRAPPED`, 90, 280, { size: 24, weight: 500, color: '#c8a96a', spacing: 7, alpha: seg(t, 0, .3) });
}
function photo(ctx, img, cx, cy, w, h, deg, a = 1, r = 26) {
  if (!img) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20, r + 8); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.clip();
  drawCover(ctx, img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
function lines(ctx, text, maxW, size, weight) { ctx.font = `${weight} ${size}px Inter`; return wrap(ctx, text, maxW); }
const nfmt = n => n.toLocaleString();

/* ---------- Slides ---------- */
const SLIDES = [
  { id: 'intro', draw(ctx, t, D) {
    wash(ctx, '#3a2c18', '#2a1a2e', '#c8a96a');
    const a = seg(t, 0, .6);
    T(ctx, String(D.year), WR_W / 2, 900 + (1 - a) * 60, { size: 330, weight: 200, align: 'center', spacing: -14, alpha: a });
    T(ctx, 'Wrapped', WR_W / 2, 1050, { size: 110, weight: 300, color: '#c8a96a', align: 'center', spacing: -3, alpha: seg(t, .25, .75) });
    T(ctx, 'A year of things you said you would do.', WR_W / 2, 1170, { size: 36, weight: 300, align: 'center', alpha: seg(t, .45, 1) });
  } },
  { id: 'total', draw(ctx, t, D, A) {
    wash(ctx, '#1d2a2a', '#3a2c18', '#c8a96a');
    header(ctx, D, t);
    T(ctx, 'You completed', 90, 520, { size: 52, weight: 300, alpha: seg(t, 0, .3) });
    T(ctx, nfmt(Math.round(D.total * ease(t / .7))), 70, 900, { size: 420, weight: 200, spacing: -20, color: '#fff' });
    T(ctx, D.total === 1 ? 'goal this year' : 'goals this year', 90, 1000, { size: 56, weight: 400, color: '#c8a96a', alpha: seg(t, .3, .6) });
    if (D.openCount) T(ctx, `${D.openCount} still waiting on the list.`, 90, 1070, { size: 34, weight: 300, color: '#9a9184', alpha: seg(t, .4, .7) });
    const thumbs = D.done.map(e => A.get(e.image)).filter(Boolean).slice(-5);
    thumbs.forEach((img, n) => {
      const k = seg(t, .35 + n * .08, .75 + n * .08);
      photo(ctx, img, 190 + n * 175, 1380 + (1 - k) * 80, 200, 250, (n % 2 ? 5 : -5), k, 18);
    });
  } },
  { id: 'types', draw(ctx, t, D) {
    wash(ctx, '#2e2433', '#14222a', '#c8a96a');
    header(ctx, D, t);
    T(ctx, 'Your year,', 90, 520, { size: 72, weight: 200, alpha: seg(t, 0, .3) });
    T(ctx, 'by kind of dream', 90, 610, { size: 72, weight: 200, color: '#c8a96a', alpha: seg(t, .1, .4) });
    const top = D.types.slice(0, 5), max = top[0]?.[1] || 1;
    top.forEach(([type, n], i) => {
      const y = 800 + i * 165, k = seg(t, .2 + i * .1, .7 + i * .1);
      T(ctx, (TYPES[type] || TYPES.other).plural, 90, y, { size: 44, weight: i ? 300 : 500, alpha: k });
      T(ctx, String(n), WR_W - 90, y, { size: 44, weight: 300, align: 'right', alpha: k, color: i ? '#ede4d6' : '#c8a96a' });
      ctx.fillStyle = 'rgba(237,228,214,.12)'; ctx.beginPath(); ctx.roundRect(90, y + 30, WR_W - 180, 18, 9); ctx.fill();
      ctx.fillStyle = i ? 'rgba(237,228,214,.7)' : '#c8a96a'; ctx.beginPath(); ctx.roundRect(90, y + 30, Math.max(18, (WR_W - 180) * n / max * k), 18, 9); ctx.fill();
    });
    if (!top.length) T(ctx, 'Nothing completed yet.', 90, 820, { size: 40, weight: 300, color: '#9a9184' });
  } },
  { id: 'streak', draw(ctx, t, D) {
    wash(ctx, '#3a2316', '#152030', '#f0c27a');
    header(ctx, D, t);
    T(ctx, 'Longest streak', 90, 520, { size: 52, weight: 300, alpha: seg(t, 0, .3) });
    T(ctx, String(Math.round(D.streak * ease(t / .6))), 70, 860, { size: 380, weight: 200, spacing: -16, color: '#fff' });
    T(ctx, D.streak === 1 ? 'week in a row' : 'weeks in a row', 90, 960, { size: 56, color: '#c8a96a', alpha: seg(t, .3, .6) });
    T(ctx, `with at least one goal done · ${D.activeWeeks} active weeks`, 90, 1030, { size: 32, weight: 300, color: '#9a9184', alpha: seg(t, .4, .7) });
    // 53 week dots
    const cols = 9, s = 92, x0 = 120, y0 = 1180;
    for (let w = 0; w < 53; w++) {
      const k = seg(t, .3 + w * .008, .6 + w * .008);
      const x = x0 + (w % cols) * s, y = y0 + Math.floor(w / cols) * s;
      const inRun = w > D.streakEnd - D.streak && w <= D.streakEnd;
      ctx.globalAlpha = k;
      ctx.fillStyle = inRun ? '#f0c27a' : D.weeks.has(w) ? 'rgba(237,228,214,.75)' : 'rgba(237,228,214,.1)';
      ctx.beginPath(); ctx.arc(x, y, inRun ? 22 : 16, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  } },
  { id: 'travel', draw(ctx, t, D) {
    wash(ctx, '#11253a', '#2f2a1a', '#2f6f8f');
    header(ctx, D, t);
    T(ctx, 'You went places', 90, 520, { size: 52, weight: 300, alpha: seg(t, 0, .3) });
    T(ctx, String(Math.round(D.countries.length * ease(t / .6))), 70, 840, { size: 340, weight: 200, spacing: -14, color: '#fff' });
    T(ctx, D.countries.length === 1 ? 'country' : 'countries', 90, 935, { size: 56, color: '#c8a96a', alpha: seg(t, .3, .6) });
    T(ctx, String(D.cities.length), 620, 840, { size: 200, weight: 200, spacing: -8, alpha: seg(t, .3, .6) });
    T(ctx, D.cities.length === 1 ? 'city' : 'cities', 625, 935, { size: 56, color: '#c8a96a', alpha: seg(t, .35, .65) });
    const flags = D.countries.map(id => flagOf(WORLD.byId[id]?.iso2)).filter(Boolean).slice(0, 15);
    flags.forEach((f, n) => {
      const k = seg(t, .4 + n * .04, .7 + n * .04);
      T(ctx, f, 120 + (n % 5) * 190, 1180 + Math.floor(n / 5) * 190 + (1 - k) * 40, { size: 120, alpha: k });
    });
    const names = D.countries.slice(0, 6).map(id => WORLD.byId[id]?.name).filter(Boolean).join(' · ');
    T(ctx, names, 90, 1660, { size: 28, weight: 300, color: '#9a9184', alpha: seg(t, .7, 1) });
  } },
  { id: 'map', draw(ctx, t, D) {
    wash(ctx, '#16120c', '#11202a', '#c8a96a');
    header(ctx, D, t);
    T(ctx, 'Your dream map', 90, 520, { size: 72, weight: 200, alpha: seg(t, 0, .3) });
    T(ctx, `${D.total} goals across ${D.countries.length} ${D.countries.length === 1 ? 'country' : 'countries'}`, 90, 590, { size: 34, weight: 300, color: '#c8a96a', alpha: seg(t, .1, .4) });
    // The map is cropped to the inhabited band and scaled up to fill the width
    const s = (WR_W + 300) / MAP_W, ox = -150, oy = 760;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
    ctx.lineWidth = .6 / s; ctx.strokeStyle = '#0c0b0a';
    const set = new Set(D.countries);
    for (const c of WORLD.countries) {
      const p = new Path2D(c.d);
      ctx.fillStyle = set.has(c.id) ? `rgba(221,201,163,${.25 + .75 * seg(t, .2, .6)})` : '#2b2721';
      ctx.fill(p); ctx.stroke(p);
    }
    D.pins.forEach(([x, y], n) => {
      const k = seg(t, .35 + n * .03, .6 + n * .03);
      if (!k) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 18 * k);
      g.addColorStop(0, 'rgba(240,194,122,.85)'); g.addColorStop(1, 'rgba(240,194,122,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 18 * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(x, y - (1 - k) * 20, 3.4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
    // Where it happened, latest first
    const spots = [...D.done].reverse().filter(e => e.place).slice(0, 5);
    spots.forEach((e, n) => {
      const y = 1460 + n * 62, k = seg(t, .55 + n * .07, .85 + n * .07);
      ctx.globalAlpha = k; ctx.fillStyle = '#f0c27a'; ctx.beginPath(); ctx.arc(102, y - 12, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      T(ctx, e.place, 128, y, { size: 32, weight: 400, alpha: k });
      T(ctx, new Date(e.doneAt).toLocaleDateString('en', { month: 'short' }).toUpperCase(), WR_W - 90, y, { size: 24, weight: 500, color: '#9a9184', align: 'right', spacing: 4, alpha: k });
    });
  } },
  { id: 'challenges', draw(ctx, t, D) {
    wash(ctx, '#2a1e0c', '#1c1530', '#f0c27a');
    header(ctx, D, t);
    T(ctx, 'Challenge mode', 90, 520, { size: 52, weight: 300, alpha: seg(t, 0, .3) });
    T(ctx, String(Math.round(D.won * ease(t / .5))), 70, 840, { size: 340, weight: 200, spacing: -14, color: '#fff' });
    T(ctx, D.won === 1 ? 'challenge won' : 'challenges won', 90, 935, { size: 56, color: '#c8a96a', alpha: seg(t, .25, .55) });
    T(ctx, `${nfmt(Math.round(D.points * ease((t - .2) / .6)))} points from photo-proven goals`, 90, 1010, { size: 34, weight: 300, color: '#9a9184', alpha: seg(t, .3, .6) });
    D.ranks.slice(0, 4).forEach((r, n) => {
      const y = 1180 + n * 130, k = seg(t, .4 + n * .1, .75 + n * .1);
      ctx.globalAlpha = k;
      ctx.fillStyle = 'rgba(237,228,214,.06)'; ctx.beginPath(); ctx.roundRect(90, y - 70, WR_W - 180, 104, 20); ctx.fill();
      ctx.globalAlpha = 1;
      T(ctx, r.rank === 1 ? (r.ended ? '🏆' : '🥇') : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`, 130, y, { size: 46, alpha: k });
      T(ctx, r.title, 220, y, { size: 38, weight: 400, alpha: k });
      T(ctx, r.ended ? 'final' : 'live', WR_W - 130, y, { size: 26, weight: 500, color: '#c8a96a', align: 'right', spacing: 4, upper: true, alpha: k });
    });
  } },
  { id: 'community', skip: D => !D.mostLoved, draw(ctx, t, D, A) {
    wash(ctx, '#3a1d2e', '#14222a', '#c8774a');
    header(ctx, D, t);
    const m = D.mostLoved;
    T(ctx, 'Your most loved moment', 90, 520, { size: 52, weight: 300, alpha: seg(t, 0, .3) });
    const k = seg(t, .1, .6);
    photo(ctx, A.get(m.image), 540, 930 + (1 - k) * 60, 600, 640, -3, k);
    const lns = lines(ctx, m.title, WR_W - 180, 64, 400).slice(0, 2);
    lns.forEach((l, i) => T(ctx, l, 90, 1400 + i * 74, { size: 64, weight: 400, color: '#fff', alpha: seg(t, .4, .7) }));
    const row = Object.entries(m.reactions || {}).sort((a, b) => b[1] - a[1]);
    let x = 90;
    row.forEach(([e, n], i) => {
      const kk = seg(t, .5 + i * .07, .8 + i * .07);
      ctx.globalAlpha = kk; ctx.fillStyle = 'rgba(237,228,214,.12)';
      ctx.beginPath(); ctx.roundRect(x, 1500 + lns.length * 74 - 74, 170, 86, 43); ctx.fill(); ctx.globalAlpha = 1;
      T(ctx, `${e} ${n}`, x + 85, 1556 + lns.length * 74 - 74, { size: 42, align: 'center', alpha: kk });
      x += 186;
    });
    if (D.mostEngaged) T(ctx, `Biggest buzz: “${D.mostEngaged.title}” · ${Object.keys(D.mostEngaged.reactions).length} kinds of reaction`, 90, 1700, { size: 28, weight: 300, color: '#9a9184', alpha: seg(t, .7, 1) });
  } },
  { id: 'quest', skip: D => !D.quest, draw(ctx, t, D, A) {
    wash(ctx, '#10231c', '#2e1508', '#3f7d5c');
    header(ctx, D, t);
    const q = D.quest;
    T(ctx, 'The ultimate quest', 90, 520, { size: 72, weight: 200, alpha: seg(t, 0, .3) });
    const k = seg(t, .1, .55);
    photo(ctx, A.get(q.image), 760, 860 + (1 - k) * 50, 420, 520, 4, k);
    T(ctx, String(Math.round(q.days * ease((t - .2) / .5))), 80, 960, { size: 240, weight: 200, spacing: -10, color: '#fff', alpha: seg(t, .15, .35) });
    T(ctx, q.days === 1 ? 'day' : 'days', 90, 1040, { size: 52, color: '#c8a96a', alpha: seg(t, .3, .55) });
    T(ctx, 'from list to done', 90, 1095, { size: 32, weight: 300, color: '#9a9184', alpha: seg(t, .35, .6) });
    const lns = lines(ctx, q.title, WR_W - 180, 76, 400).slice(0, 3);
    lns.forEach((l, i) => T(ctx, l, 90, 1300 + i * 88, { size: 76, weight: 400, color: '#fff', alpha: seg(t, .45, .75) }));
    const pill = q.hard ? `HARD${q.points ? ` · ${q.points} PTS` : ''}` : 'LONGEST WAIT';
    ctx.font = '500 28px Inter'; ctx.letterSpacing = '5px';
    const pw = ctx.measureText(pill).width + 60; ctx.letterSpacing = '0px';
    const py = 1300 + lns.length * 88 + 10;
    ctx.globalAlpha = seg(t, .6, .85); ctx.fillStyle = '#c8a96a'; ctx.beginPath(); ctx.roundRect(90, py, pw, 62, 31); ctx.fill(); ctx.globalAlpha = 1;
    T(ctx, pill, 120, py + 42, { size: 28, weight: 500, color: '#14110f', spacing: 5, alpha: seg(t, .6, .85) });
  } },
  { id: 'persona', draw(ctx, t, D) {
    const p = D.persona;
    wash(ctx, p.colors[0], p.colors[1], p.colors[2]);
    header(ctx, D, t);
    T(ctx, 'Your bucket list persona', 90, 520, { size: 44, weight: 300, alpha: seg(t, 0, .3) });
    const k = seg(t, .15, .55);
    ctx.save(); ctx.globalAlpha = k; ctx.translate(540, 870); ctx.scale(.7 + .3 * k, .7 + .3 * k);
    T(ctx, p.icon, 0, 90, { size: 260, align: 'center' }); ctx.restore();
    const lns = lines(ctx, p.name, WR_W - 160, 120, 300);
    lns.forEach((l, i) => T(ctx, l, WR_W / 2, 1220 + i * 132, { size: 120, weight: 300, color: '#fff', align: 'center', spacing: -4, alpha: seg(t, .35 + i * .1, .7 + i * .1) }));
    T(ctx, p.line, WR_W / 2, 1260 + lns.length * 132, { size: 38, weight: 300, align: 'center', alpha: seg(t, .6, .9) });
  } },
  { id: 'summary', draw(ctx, t, D, A) {
    wash(ctx, '#2a2216', '#16120c', '#c8a96a');
    T(ctx, `${D.year}`, 90, 330, { size: 120, weight: 200, spacing: -4, alpha: seg(t, 0, .3) });
    T(ctx, 'WRAPPED', 92, 390, { size: 30, weight: 500, color: '#c8a96a', spacing: 9, alpha: seg(t, .05, .35) });
    const cover = A.get(D.mostLoved?.image || D.quest?.image || D.done.at(-1)?.image);
    if (cover) photo(ctx, cover, 790, 330, 300, 360, 5, seg(t, .1, .4), 20);
    const cells = [
      [D.total, 'goals completed'], [D.countries.length, 'countries'],
      [D.streak, 'week streak'], [D.won, 'challenges won'],
      [D.points, 'challenge points'], [(TYPES[D.types[0]?.[0]] || TYPES.other).plural, 'top category'],
    ];
    cells.forEach(([v, l], i) => {
      const x = 90 + (i % 2) * 460, y = 720 + Math.floor(i / 2) * 270, k = seg(t, .2 + i * .07, .55 + i * .07);
      ctx.globalAlpha = k; ctx.fillStyle = 'rgba(237,228,214,.15)'; ctx.fillRect(x, y - 150, 400, 1); ctx.globalAlpha = 1;
      T(ctx, typeof v === 'number' ? nfmt(v) : v, x, y, { size: typeof v === 'number' ? 120 : 76, weight: 200, color: '#fff', spacing: -4, alpha: k });
      T(ctx, l, x, y + 54, { size: 30, weight: 400, color: '#c8a96a', alpha: k });
    });
    T(ctx, D.persona.icon + '  ' + D.persona.name, 90, 1560, { size: 48, weight: 400, color: '#fff', alpha: seg(t, .6, .9) });
    T(ctx, 'One more year off the list.', 90, 1640, { size: 32, weight: 300, color: '#9a9184', alpha: seg(t, .7, 1) });
  } },
];

/* ---------- Player ---------- */
let WR = null; // { D, slides, A, i, t0, paused, raf }
async function loadAssets(D) {
  const srcs = [...new Set([...D.done.map(e => e.image), D.mostLoved?.image, D.quest?.image].filter(Boolean))];
  const A = new Map();
  await Promise.all(srcs.map(async s => { const img = await loadImg(s); if (img) A.set(s, img); }));
  return A;
}
async function openWrapped(useSample) {
  const el = $('#wrapped');
  el.hidden = false; document.body.classList.add('wr-open');
  $('#wrLoading').hidden = false;
  await Promise.all(['200', '300', '400', '500'].map(w => document.fonts.load(`${w} 40px Inter`)));
  const D = await wrappedData(WR_YEAR, useSample);
  const A = await loadAssets(D);
  $('#wrLoading').hidden = true;
  const slides = SLIDES.filter(s => !s.skip?.(D));
  cancelAnimationFrame(WR?.raf);
  WR = { D, A, slides, i: 0, t0: performance.now(), paused: false, pausedAt: 0 };
  $('#wrBars').innerHTML = slides.map(() => '<i><b></b></i>').join('');
  const chip = $('#wrSample');
  chip.hidden = !D.sampleAvailable;
  chip.textContent = D.sample ? 'Sample year · show mine' : 'My year · show sample';
  loop();
}
function closeWrapped() {
  cancelAnimationFrame(WR?.raf);
  $('#wrapped').hidden = true; document.body.classList.remove('wr-open');
}
function go(i) {
  if (!WR) return;
  WR.i = Math.max(0, Math.min(WR.slides.length - 1, i));
  WR.t0 = performance.now(); WR.pausedAt = 0;
}
function loop() {
  const ctx = $('#wrCanvas').getContext('2d');
  const tick = now => {
    if (!WR || !$('#wrBars') || $('#wrapped').hidden) return; // stop when closed
    const el = WR.paused ? WR.pausedAt : now - WR.t0;
    const s = WR.slides[WR.i];
    s.draw(ctx, el / INTRO_MS, WR.D, WR.A);
    [...$('#wrBars').children].forEach((bar, n) => { bar.firstChild.style.width = (n < WR.i ? 100 : n > WR.i ? 0 : Math.min(100, el / SLIDE_MS * 100)) + '%'; });
    if (!WR.paused && el >= SLIDE_MS && WR.i < WR.slides.length - 1) go(WR.i + 1);
    WR.raf = requestAnimationFrame(tick);
  };
  WR.raf = requestAnimationFrame(tick);
}
function togglePause(force) {
  if (!WR) return;
  const p = force ?? !WR.paused;
  if (p && !WR.paused) { WR.paused = true; WR.pausedAt = performance.now() - WR.t0; }
  else if (!p && WR.paused) { WR.paused = false; WR.t0 = performance.now() - WR.pausedAt; }
  $('[data-wr="pause"]').textContent = WR.paused ? '▶' : '❚❚';
}

/* ---------- Export ---------- */
function renderSlide(i, scale = 1) {
  const cv = document.createElement('canvas');
  cv.width = WR_W * scale; cv.height = WR_H * scale;
  const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
  WR.slides[i].draw(ctx, 1, WR.D, WR.A);
  return cv;
}
const toBlob = (cv, type = 'image/jpeg', q = .92) => new Promise(r => cv.toBlob(r, type, q));
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function shareOrDownload(files) {
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) { download(f, f.name); await new Promise(r => setTimeout(r, 350)); }
  toast(files.length > 1 ? `${files.length} files saved` : 'Saved');
}
async function exportImages() {
  const files = [];
  for (let i = 0; i < WR.slides.length; i++) {
    $('#wrProgress').textContent = `Rendering slide ${i + 1} of ${WR.slides.length}…`;
    files.push(new File([await toBlob(renderSlide(i))], `wrapped-${WR.D.year}-${String(i + 1).padStart(2, '0')}-${WR.slides[i].id}.jpg`, { type: 'image/jpeg' }));
  }
  await shareOrDownload(files);
}
async function exportVideo() {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = types.find(t => window.MediaRecorder?.isTypeSupported?.(t));
  if (!mime) { toast('Video export is not supported in this browser'); return; }
  const scale = 720 / WR_W;
  const cv = document.createElement('canvas'); cv.width = 720; cv.height = 1280;
  const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
  const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6e6 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => { rec.onstop = r; });
  const per = 3400;
  rec.start();
  await new Promise(resolve => {
    const t0 = performance.now();
    const frame = now => {
      const el = now - t0, i = Math.floor(el / per);
      if (i >= WR.slides.length) return resolve();
      WR.slides[i].draw(ctx, (el - i * per) / INTRO_MS, WR.D, WR.A);
      $('#wrProgress').textContent = `Recording ${Math.min(100, Math.round(el / (per * WR.slides.length) * 100))}%`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  rec.stop(); await done;
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  await shareOrDownload([new File([new Blob(chunks, { type: mime.split(';')[0] })], `wrapped-${WR.D.year}.${ext}`, { type: mime.split(';')[0] })]);
}

$('#wrapped').addEventListener('click', async e => {
  const a = e.target.closest('[data-wr]')?.dataset.wr;
  if (!a || !WR) return;
  if (a === 'next') { WR.i === WR.slides.length - 1 ? togglePause(true) : go(WR.i + 1); }
  else if (a === 'prev') go(WR.i - 1);
  else if (a === 'pause') togglePause();
  else if (a === 'close') closeWrapped();
  else if (a === 'sample') { openWrapped(!WR.D.sample); }
  else if (a === 'share') {
    togglePause(true);
    const i = WR.i;
    openShareWith({ title: `${WR.D.year} Wrapped`, desc: 'This slide as a 1080 × 1920 story.', filename: `wrapped-${WR.D.year}-${WR.slides[i].id}`, compose: async () => renderSlide(i) });
  }
  else if (a === 'export') { togglePause(true); $('#wrExport').hidden = false; $('#wrProgress').textContent = ''; }
  else if (a === 'export-close') $('#wrExport').hidden = true;
  else if (a === 'export-images' || a === 'export-video') {
    const btns = document.querySelectorAll('#wrExport button'); btns.forEach(b => b.disabled = true);
    try { await (a === 'export-images' ? exportImages() : exportVideo()); }
    finally { btns.forEach(b => b.disabled = false); $('#wrProgress').textContent = ''; $('#wrExport').hidden = true; }
  }
});
// Hold to pause (like stories), arrow keys, Escape
const stage = $('#wrStage');
let holdTimer = null;
stage.addEventListener('pointerdown', e => { if (e.target.closest('.wr-tap')) holdTimer = setTimeout(() => togglePause(true), 220); });
stage.addEventListener('pointerup', e => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } });
document.addEventListener('keydown', e => {
  if ($('#wrapped').hidden || document.querySelector('dialog[open]')) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(WR.i + 1); }
  if (e.key === 'ArrowLeft') go(WR.i - 1);
  if (e.key === 'Escape') closeWrapped();
});
document.addEventListener('click', e => { if (e.target.closest('[data-open-wrapped]')) openWrapped(); });
