/* ===================================================================
   Social: friends, live challenges with photo proof, activity feed.

   Everything goes through `api`, a mock that mirrors the planned
   database tables (profiles, challenges, challenge_members,
   challenge_items, challenge_completions, completion_votes,
   activities, reactions). Calls are async and changes are pushed
   through `api.on(...)`, the same shape a realtime backend gives,
   so the UI won't change when the mock is swapped for a database.
   =================================================================== */

const SKEY = 'bucketlist.social.v1';
const ME = 'me';
const POINTS = { easy: 10, medium: 25, hard: 50 };
const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const EMOJIS = ['✨', '🔥', '🌍', '🏔️', '👏', '🥹'];
const DAY = 864e5;
const uid = () => crypto.randomUUID();

/* ---------- Seed data (mock friends, challenges, feed) ---------- */
function seedSocial() {
  const now = Date.now(), y = new Date().getFullYear();
  const d = (m, day) => new Date(y, m - 1, day, 12).getTime();
  const profiles = [
    { id: ME, name: 'You', color: '#c8a96a' },
    { id: 'lena', name: 'Lena Hoffmann', color: '#7a9e9f' },
    { id: 'marco', name: 'Marco Rossi', color: '#b5736a' },
    { id: 'aiko', name: 'Aiko Tanaka', color: '#8f84b8' },
    { id: 'sam', name: 'Sam Okafor', color: '#6f9a6a' },
  ];
  const ch = (id, title, startsAt, endsAt, createdBy, members, list) => ({
    challenge: { id, title, startsAt, endsAt, createdBy },
    members: members.map(userId => ({ challengeId: id, userId })),
    items: list.map(([title, difficulty, i]) => ({ id: `${id}-i${i}`, challengeId: id, title, difficulty })),
  });
  const summer = ch('summer', 'Summer of Yes', d(6, 1), d(8, 31), ME, [ME, 'lena', 'marco', 'aiko'], [
    ['Swim in a glacier lake', 'hard', 1], ['Watch a sunrise from a summit', 'medium', 2], ['Cook a dish from a new country', 'easy', 3],
    ['Sleep under the stars', 'medium', 4], ['Try a sport you have never done', 'medium', 5], ['Visit a new country', 'hard', 6],
  ]);
  const autumn = ch('autumn', 'Autumn Sprint', d(10, 1), d(11, 30), 'lena', [ME, 'lena', 'aiko', 'sam'], [
    ['Hike above 2,000 m', 'hard', 1], ['See a live orchestra', 'easy', 2], ['Eat at a market you have never visited', 'easy', 3],
    ['Learn 50 words in a new language', 'medium', 4], ['Take a night train', 'medium', 5], ['Finish a 10k run', 'medium', 6],
    ['Swim in the sea after October 15', 'hard', 7], ['Visit a museum you keep postponing', 'easy', 8],
  ]);
  const duel = ch('duel', 'Marco vs. You: 2026', d(1, 1), d(12, 31), 'marco', [ME, 'marco'], [
    ['Run a half marathon', 'hard', 1], ['Visit 3 new countries', 'hard', 2], ['Read 12 books', 'medium', 3],
    ['Take a pottery class', 'easy', 4], ['See the northern lights', 'hard', 5], ['Learn to make fresh pasta', 'easy', 6],
  ]);
  const P = n => `img/${n}.jpg`;
  const comp = (challengeId, i, userId, photo, at) => ({ id: uid(), itemId: `${challengeId}-i${i}`, challengeId, userId, proof: P(photo), completedAt: at, status: 'counted' });
  const completions = [
    comp('summer', 1, ME, 'trek-torres-del-paine', d(7, 12)), comp('summer', 2, ME, 'via-ferrata-in-the-dolomites', d(6, 21)),
    comp('summer', 6, ME, 'sunrise-at-petra', d(8, 3)), comp('summer', 3, 'lena', 'hand-rolled-pasta-in-bologna', d(6, 14)),
    comp('summer', 4, 'lena', 'chase-the-northern-lights', d(7, 30)), comp('summer', 5, 'marco', 'learn-to-sail-alone', d(7, 2)),
    comp('summer', 2, 'aiko', 'balloon-over-cappadocia', d(8, 10)), comp('summer', 3, 'aiko', 'omakase-in-ginza', d(6, 28)),
    comp('autumn', 2, ME, 'an-evening-at-la-scala', d(10, 9)), comp('autumn', 3, ME, 'the-markets-of-oaxaca', d(10, 18)),
    comp('autumn', 1, 'lena', 'via-ferrata-in-the-dolomites', d(10, 5)), comp('autumn', 5, 'lena', 'route-66-end-to-end', d(10, 22)),
    comp('autumn', 8, 'aiko', 'the-venice-biennale', d(10, 12)), comp('autumn', 6, 'sam', 'run-a-half-marathon', d(10, 26)),
    comp('autumn', 3, 'sam', 'omakase-in-ginza', d(11, 1)),
    comp('duel', 4, ME, 'a-season-at-the-potter-s-wheel', d(3, 8)), comp('duel', 6, ME, 'hand-rolled-pasta-in-bologna', d(5, 2)),
    comp('duel', 1, 'marco', 'run-a-half-marathon', d(4, 14)), comp('duel', 3, 'marco', 'write-a-short-book', d(9, 1)),
  ];
  const act = (actorId, title, photo, place, type, at, extra = {}) => ({ id: uid(), actorId, kind: 'entry_completed', title, photo: P(photo), place, type, createdAt: at, ...extra });
  const activities = [
    act('sam', 'Finish a 10k run', 'run-a-half-marathon', 'Lagos, Nigeria', 'personal', now - 3 * 3600e3, { challengeId: 'autumn', points: 25 }),
    act('aiko', 'Visit the Venice Biennale', 'the-venice-biennale', 'Venice, Italy', 'culture', now - 26 * 3600e3, { challengeId: 'autumn', points: 10, caption: 'Three pavilions in, completely overwhelmed (in a good way).' }),
    act('lena', 'Take a night train across the Alps', 'route-66-end-to-end', 'Munich → Rome', 'trip', now - 2.4 * DAY, { challengeId: 'autumn', points: 25 }),
    act('marco', 'Sail the Amalfi Coast', 'sail-the-amalfi-coast', 'Amalfi, Italy', 'trip', now - 4 * DAY, { caption: 'Ten years on the list. Worth every one of them.' }),
    act('lena', 'Hike above 2,000 m', 'via-ferrata-in-the-dolomites', 'Cortina d\'Ampezzo, Italy', 'activity', now - 6 * DAY, { challengeId: 'autumn', points: 50 }),
    act('aiko', 'Chase the northern lights', 'chase-the-northern-lights', 'Kiruna, Sweden', 'trip', now - 9 * DAY, { caption: 'Minus 28 and I forgot I had hands.' }),
  ];
  const reactions = [];
  const r = (a, userId, emoji) => reactions.push({ activityId: activities[a].id, userId, emoji, createdAt: now - DAY });
  r(0, 'lena', '🔥'); r(0, 'aiko', '👏'); r(1, 'lena', '✨'); r(1, 'sam', '🥹'); r(1, 'marco', '✨');
  r(2, 'aiko', '🌍'); r(2, 'sam', '🔥'); r(3, 'lena', '🥹'); r(3, 'aiko', '✨'); r(3, 'sam', '🌍');
  r(4, 'sam', '🏔️'); r(4, 'aiko', '🏔️'); r(4, 'marco', '🔥'); r(5, 'lena', '✨'); r(5, 'marco', '🥹'); r(5, 'sam', '✨');
  return {
    profiles,
    challenges: [summer, autumn, duel].map(c => c.challenge),
    members: [summer, autumn, duel].flatMap(c => c.members),
    items: [summer, autumn, duel].flatMap(c => c.items),
    completions, votes: [], activities, reactions,
  };
}

let S = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || seedSocial(); } catch { return seedSocial(); } })();
const persist = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch { toast('Storage is full: some social changes were not saved'); } };
persist();

/* ---------- Mock API (async, event-driven) ---------- */
const bus = new EventTarget();
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
const latency = () => new Promise(r => setTimeout(r, 120 + Math.random() * 180));

const api = {
  on(type, fn) { const h = e => fn(e.detail); bus.addEventListener(type, h); return () => bus.removeEventListener(type, h); },
  profile: id => S.profiles.find(p => p.id === id) || { id, name: 'Unknown', color: '#555' },
  friends: () => S.profiles.filter(p => p.id !== ME),

  // challenges ------------------------------------------------------
  challengeSync: id => S.challenges.find(c => c.id === id),
  membersOf: id => S.members.filter(m => m.challengeId === id).map(m => m.userId),
  itemsOf: id => S.items.filter(i => i.challengeId === id),
  completionsOf: id => S.completions.filter(c => c.challengeId === id),
  leaderboard(id) {
    const rows = api.membersOf(id).map(userId => ({ userId, points: 0, items: 0, lastAt: 0 }));
    for (const c of api.completionsOf(id)) {
      if (c.status === 'rejected') continue;
      const row = rows.find(r => r.userId === c.userId), item = S.items.find(i => i.id === c.itemId);
      if (!row || !item) continue;
      row.points += POINTS[item.difficulty]; row.items++; row.lastAt = Math.max(row.lastAt, c.completedAt);
    }
    // ties: whoever got there first ranks higher
    return rows.sort((a, b) => b.points - a.points || (a.lastAt || Infinity) - (b.lastAt || Infinity));
  },
  status(c, now = Date.now()) { return now < c.startsAt ? 'upcoming' : now > c.endsAt ? 'ended' : 'active'; },
  async challenges() {
    await latency();
    return S.challenges.filter(c => api.membersOf(c.id).includes(ME)).sort((a, b) => b.endsAt - a.endsAt);
  },
  async createChallenge({ title, startsAt, endsAt, memberIds, items: list }) {
    await latency();
    const id = uid();
    S.challenges.push({ id, title, startsAt, endsAt, createdBy: ME });
    [ME, ...memberIds].forEach(userId => S.members.push({ challengeId: id, userId }));
    list.forEach(it => S.items.push({ id: uid(), challengeId: id, title: it.title, difficulty: it.difficulty, entryId: it.entryId || null }));
    persist(); emit('challenges', { id });
    return id;
  },
  async addItem(challengeId, { title, difficulty }) {
    await latency();
    S.items.push({ id: uid(), challengeId, title, difficulty });
    persist(); emit('completion:' + challengeId, { kind: 'item-added' });
  },
  // Completing requires a proof photo. Checks: not already done, challenge running, photo not reused,
  // and the photo's capture time (file timestamp in this mock; EXIF on the backend) inside the window.
  async completeItem(itemId, { photo, hash, takenAt }, userId = ME) {
    await latency();
    const item = S.items.find(i => i.id === itemId);
    const c = item && api.challengeSync(item.challengeId);
    if (!item || !c) throw new Error('This item no longer exists.');
    if (!photo) throw new Error('A photo proof is required.');
    if (api.status(c) !== 'active') throw new Error('This challenge is not running.');
    if (S.completions.some(x => x.itemId === itemId && x.userId === userId)) throw new Error('Already completed.');
    if (hash && S.completions.some(x => x.hash === hash)) throw new Error('This photo has already been used as proof.');
    const flagged = takenAt && (takenAt < c.startsAt || takenAt > Date.now() + 60e3);
    const completion = { id: uid(), itemId, challengeId: c.id, userId, proof: photo, hash, takenAt, completedAt: Date.now(), status: 'counted', flag: flagged ? 'Photo taken before the challenge started' : null };
    S.completions.push(completion);
    const actId = uid();
    S.activities.push({ id: actId, actorId: userId, kind: 'challenge_item', title: item.title, photo, type: item.difficulty === 'hard' ? 'activity' : 'personal', place: '', createdAt: completion.completedAt, challengeId: c.id, points: POINTS[item.difficulty], completionId: completion.id });
    persist();
    emit('completion:' + c.id, { completion, item });
    emit('completion', { completion, item });
    emit('feed', { kind: 'new', activityId: actId });
    return completion;
  },
  async vote(completionId, verdict) {
    await latency();
    S.votes = S.votes.filter(v => !(v.completionId === completionId && v.voterId === ME));
    S.votes.push({ completionId, voterId: ME, verdict });
    const comp = S.completions.find(c => c.id === completionId);
    const others = api.membersOf(comp.challengeId).filter(u => u !== comp.userId).length;
    const disputes = S.votes.filter(v => v.completionId === completionId && v.verdict === 'dispute').length;
    comp.status = disputes > others / 2 ? 'rejected' : disputes ? 'disputed' : 'counted';
    persist(); emit('completion:' + comp.challengeId, { completion: comp }); emit('completion', { completion: comp });
  },
  myVote: completionId => S.votes.find(v => v.completionId === completionId && v.voterId === ME)?.verdict || null,

  // feed ------------------------------------------------------------
  async feed() {
    await latency();
    return [...S.activities].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
  },
  reactionsOf: id => S.reactions.filter(r => r.activityId === id),
  async react(activityId, emoji, userId = ME) {
    const had = S.reactions.findIndex(r => r.activityId === activityId && r.userId === userId && r.emoji === emoji);
    if (had >= 0) S.reactions.splice(had, 1); else S.reactions.push({ activityId, userId, emoji, createdAt: Date.now() });
    persist(); emit('feed', { kind: 'reaction', activityId, userId, emoji, added: had < 0 });
  },
  // Your own completions publish automatically (mirrors a database trigger on entries.completed_at)
  publishEntry(entry) {
    if (S.activities.some(a => a.entryId === entry.id)) return;
    S.activities.push({ id: uid(), actorId: ME, kind: 'entry_completed', entryId: entry.id, title: entry.title, place: entry.place, type: entry.type, createdAt: Date.now() });
    persist(); emit('feed', { kind: 'new' });
  },
  unpublishEntry(entryId) {
    const a = S.activities.find(x => x.entryId === entryId);
    if (!a) return;
    S.activities = S.activities.filter(x => x !== a);
    S.reactions = S.reactions.filter(r => r.activityId !== a.id);
    persist(); emit('feed', { kind: 'removed' });
  },
};

// Your posts read their photo and caption live from the entry, so a story written later shows up in the feed
function activityView(a) {
  if (a.actorId !== ME || !a.entryId) return a;
  const e = items.find(i => i.id === a.entryId);
  return e ? { ...a, title: e.title, place: e.place, type: e.type, photo: coverOf(e), caption: e.memory?.highlight || '' } : a;
}

/* ---------- Simulated friends (stand-in for other people's devices) ---------- */
const FRIEND_POSTS = [
  ['lena', 'Swim in a cenote', 'night-dive-with-manta-rays', 'Tulum, Mexico', 'activity'],
  ['marco', 'Eat at a ramen counter at 2 am', 'omakase-in-ginza', 'Tokyo, Japan', 'food'],
  ['aiko', 'Walk the Philosopher\'s Path in bloom', 'cherry-blossoms-in-kyoto', 'Kyoto, Japan', 'trip'],
  ['sam', 'Watch flamenco in a tablao', 'flamenco-in-seville', 'Seville, Spain', 'culture'],
  ['lena', 'See Petra at sunrise', 'sunrise-at-petra', 'Petra, Jordan', 'culture'],
  ['marco', 'Plant a tree', 'plant-a-tree-that-outlives-me', 'Umbria, Italy', 'personal'],
];
function simTick() {
  if (document.hidden) return;
  const r = Math.random();
  const now = Date.now();
  const active = S.challenges.filter(c => api.status(c, now) === 'active');
  if (r < 0.5 && active.length) {
    // A friend completes something in a running challenge
    const c = active[Math.floor(Math.random() * active.length)];
    const friends = api.membersOf(c.id).filter(u => u !== ME);
    const open = api.itemsOf(c.id).flatMap(i => friends.filter(u => !S.completions.some(x => x.itemId === i.id && x.userId === u)).map(u => [i, u]));
    if (!open.length) return;
    const [item, userId] = open[Math.floor(Math.random() * open.length)];
    const pool = IDEAS.map(i => i.image);
    api.completeItem(item.id, { photo: pool[Math.floor(Math.random() * pool.length)], takenAt: now - 3600e3 }, userId).then(() => {
      toast(`${api.profile(userId).name.split(' ')[0]} +${POINTS[item.difficulty]} · ${item.title}`);
    }).catch(() => {});
  } else if (r < 0.8) {
    // A friend reacts to one of your posts (or someone else's)
    const mine = S.activities.filter(a => a.actorId === ME);
    const pool = mine.length && Math.random() < 0.7 ? mine : S.activities;
    const a = pool[Math.floor(Math.random() * pool.length)];
    const friend = api.friends().filter(f => f.id !== a.actorId)[Math.floor(Math.random() * 3)];
    if (!a || !friend) return;
    const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    if (S.reactions.some(x => x.activityId === a.id && x.userId === friend.id && x.emoji === emoji)) return;
    api.react(a.id, emoji, friend.id);
    if (a.actorId === ME) toast(`${friend.name.split(' ')[0]} reacted ${emoji} to “${activityView(a).title}”`);
  } else {
    // A friend posts a new accomplishment
    const used = new Set(S.activities.map(a => a.title));
    const next = FRIEND_POSTS.find(p => !used.has(p[1]));
    if (!next) return;
    const [actorId, title, photo, place, type] = next;
    S.activities.push({ id: uid(), actorId, kind: 'entry_completed', title, photo: `img/${photo}.jpg`, place, type, createdAt: Date.now() });
    persist(); emit('feed', { kind: 'new' });
  }
}
let simTimer = null;
function scheduleSim() { clearTimeout(simTimer); simTimer = setTimeout(() => { simTick(); scheduleSim(); }, 20000 + Math.random() * 25000); }
scheduleSim();

/* ---------- Shared UI bits ---------- */
const initials = n => n === 'You' ? 'You' : n.split(' ').map(w => w[0]).join('').slice(0, 2);
const avatar = (id, size = 32) => {
  const p = api.profile(id);
  return `<span class="av" style="--s:${size}px;--c:${p.color}" title="${esc(p.name)}">${esc(initials(p.name))}</span>`;
};
const firstName = id => id === ME ? 'You' : api.profile(id).name.split(' ')[0];
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
const fmtShort = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
function daysLeft(c) {
  const st = api.status(c);
  if (st === 'ended') return 'Ended';
  if (st === 'upcoming') return `Starts ${fmtShort(c.startsAt)}`;
  const d = Math.ceil((c.endsAt - Date.now()) / DAY);
  return d <= 1 ? 'Last day' : `${d} days left`;
}
const progressOf = c => Math.min(1, Math.max(0, (Date.now() - c.startsAt) / (c.endsAt - c.startsAt)));
function lightboxSrc(src, html = '') {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<figure class="lb-fig"><img src="${esc(src)}" alt="">${html}</figure>`;
  lb.onclick = e => { if (!e.target.closest('button')) lb.remove(); };
  document.body.appendChild(lb);
  return lb;
}

/* ---------- Friends view (Feed | Challenges) ---------- */
let friendsTab = 'feed';
let feedCache = [];
function renderFriendsShell() {
  document.querySelectorAll('[data-ftab]').forEach(b => b.classList.toggle('active', b.dataset.ftab === friendsTab));
  $('#feedPane').hidden = friendsTab !== 'feed';
  $('#challengesPane').hidden = friendsTab !== 'challenges';
  $('#friendRoster').innerHTML = api.friends().map(f => `<span class="roster-p">${avatar(f.id, 34)}<small>${esc(f.name.split(' ')[0])}</small></span>`).join('');
  if (friendsTab === 'feed') renderFeed(); else renderChallenges();
}
async function renderFeed(highlightNew = false) {
  const before = new Set(feedCache.map(a => a.id));
  feedCache = await api.feed();
  if (currentView !== 'friends' || friendsTab !== 'feed') return;
  $('#feed').innerHTML = feedCache.length ? feedCache.map(a => post(activityView(a), highlightNew && !before.has(a.id))).join('')
    : `<div class="empty"><h2>Quiet for now</h2><p>Complete something from your list and it will appear here for your friends.</p></div>`;
}
function post(a, isNew) {
  const p = api.profile(a.actorId);
  const reacts = api.reactionsOf(a.id);
  const counts = EMOJIS.map(e => [e, reacts.filter(r => r.emoji === e).length, reacts.some(r => r.emoji === e && r.userId === ME)]);
  const ch = a.challengeId && api.challengeSync(a.challengeId);
  const t = TYPES[a.type] || TYPES.other;
  const verb = a.kind === 'challenge_item' ? 'completed a challenge item' : 'completed';
  return `<article class="post ${isNew ? 'is-new' : ''}" data-post="${a.id}">
    <header class="post-head">${avatar(a.actorId, 38)}
      <div><b>${esc(a.actorId === ME ? 'You' : p.name)}</b> <span>${verb}</span><small>${ago(a.createdAt)}${a.place ? ' · ' + esc(a.place) : ''}</small></div>
      ${ch ? `<button class="post-ch" data-open-ch="${ch.id}">+${a.points} · ${esc(ch.title)}</button>` : ''}
    </header>
    <div class="post-photo ${a.photo ? '' : 'no-photo'}" style="background:${a.photo ? `${cssUrl(a.photo)} center/cover` : toneBg(t)}" ${a.photo ? `data-zoom-photo="${esc(a.photo)}"` : ''}>
      <div class="post-title"><span class="tag">${t.label}</span><h3>${esc(a.title)}</h3></div>
    </div>
    ${a.caption ? `<p class="post-cap">${esc(a.caption)}</p>` : ''}
    <div class="reacts">${counts.map(([e, n, mine]) => `<button class="react ${mine ? 'mine' : ''} ${n ? 'has' : ''}" data-react="${e}" data-act-id="${a.id}"><span>${e}</span>${n ? `<b>${n}</b>` : ''}</button>`).join('')}</div>
  </article>`;
}

async function renderChallenges() {
  const list = await api.challenges();
  if (currentView !== 'friends' || friendsTab !== 'challenges') return;
  const groups = [['active', 'Running'], ['upcoming', 'Starting soon'], ['ended', 'Finished']];
  $('#challengeList').innerHTML = list.length ? groups.map(([st, label]) => {
    const g = list.filter(c => api.status(c) === st);
    return g.length ? `<div class="strip-head"><h3>${label}</h3><span class="eyebrow">${g.length}</span></div><div class="ch-cards">${g.map(chCard).join('')}</div>` : '';
  }).join('') : `<div class="empty"><h2>No challenges yet</h2><p>Pick a few goals, a timeframe and some friends.</p><button class="btn solid" data-new-ch>New challenge</button></div>`;
}
function chCard(c) {
  const lb = api.leaderboard(c.id);
  const myRank = lb.findIndex(r => r.userId === ME) + 1;
  const me = lb.find(r => r.userId === ME);
  const members = api.membersOf(c.id);
  const st = api.status(c);
  const leader = lb[0];
  return `<button class="ch-card ${st}" data-open-ch="${c.id}">
    <div class="ch-top"><span class="eyebrow">${members.length === 2 ? '1-on-1' : `Group · ${members.length}`}</span><span class="ch-when">${daysLeft(c)}</span></div>
    <h3>${esc(c.title)}</h3>
    <div class="ch-bar"><i style="width:${progressOf(c) * 100}%"></i></div>
    <div class="ch-foot">
      <span class="stack">${members.slice(0, 5).map(u => avatar(u, 26)).join('')}</span>
      <span class="ch-rank">${st === 'ended' ? (myRank === 1 ? '🏆 You won' : `${esc(firstName(leader.userId))} won`) : `#${myRank} · ${me?.points || 0} pts`}</span>
    </div>
  </button>`;
}

/* ---------- Challenge page (live leaderboard) ---------- */
let chUnsub = null;
let lastBoard = {};
function openChallenge(id) {
  const c = api.challengeSync(id);
  if (!c) return;
  chUnsub?.();
  chUnsub = api.on('completion:' + id, ev => {
    if (detail?.kind !== 'challenge' || detail.id !== id) return;
    renderChallengePage(c, ev?.completion?.id);
  });
  lastBoard = {};
  renderChallengePage(c);
  enterDetail('challenge', id);
}
function renderChallengePage(c, freshCompletionId) {
  const st = api.status(c);
  const members = api.membersOf(c.id);
  const lb = api.leaderboard(c.id);
  const its = api.itemsOf(c.id);
  const comps = api.completionsOf(c.id);
  const total = its.reduce((s, i) => s + POINTS[i.difficulty], 0);

  // Remember row positions for a smooth re-order (FLIP)
  const prevRects = {};
  document.querySelectorAll('.lb-row').forEach(r => { prevRects[r.dataset.user] = r.getBoundingClientRect().top; });

  $('#storyContent').innerHTML = `
    <header class="ch-hero">
      <div class="inner">
        <div class="eyebrow">${members.length === 2 ? '1-on-1 challenge' : 'Group challenge'} · ${fmtShort(c.startsAt)} – ${fmtShort(c.endsAt)}</div>
        <h2>${esc(c.title)}</h2>
        <div class="ch-meta"><span class="${st === 'active' ? 'live' : ''}">${st === 'active' ? 'Live' : st === 'ended' ? 'Finished' : 'Upcoming'}</span><span>${daysLeft(c)}</span><span>${its.length} goals · ${total} pts up for grabs</span></div>
        <div class="ch-bar big"><i style="width:${progressOf(c) * 100}%"></i></div>
      </div>
    </header>
    <section class="ch-body">
      <div class="board">
        <div class="board-head"><h3>Leaderboard</h3>${st === 'active' ? '<span class="live-dot">Live</span>' : ''}</div>
        ${lb.map((r, n) => {
          const delta = lastBoard[r.userId] != null && r.points > lastBoard[r.userId] ? r.points - lastBoard[r.userId] : 0;
          return `<div class="lb-row ${r.userId === ME ? 'me' : ''} ${delta ? 'bump' : ''}" data-user="${r.userId}">
            <span class="lb-rank">${st === 'ended' && n === 0 ? '🏆' : n + 1}</span>
            ${avatar(r.userId, 36)}
            <span class="lb-name"><b>${esc(r.userId === ME ? 'You' : api.profile(r.userId).name)}</b><small>${r.items} of ${its.length} goals</small></span>
            ${delta ? `<span class="lb-delta">+${delta}</span>` : ''}
            <span class="lb-pts" data-from="${lastBoard[r.userId] ?? r.points}" data-to="${r.points}">${lastBoard[r.userId] ?? r.points}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="goals">
        <div class="board-head"><h3>Goals</h3>${st === 'active' ? `<button class="link-quiet" data-ch-add="${c.id}">+ Add goal</button>` : ''}</div>
        ${its.map(i => {
          const done = comps.filter(x => x.itemId === i.id);
          const mine = done.find(x => x.userId === ME);
          return `<div class="goal ${mine ? 'done' : ''}">
            <span class="diff ${i.difficulty}">${DIFF_LABEL[i.difficulty]}<b>${POINTS[i.difficulty]}</b></span>
            <span class="goal-t">${esc(i.title)}</span>
            <span class="proofs">${done.map(x => `<button class="proof ${x.status} ${x.id === freshCompletionId ? 'fresh' : ''}" data-proof="${x.id}" style="background-image:${cssUrl(x.proof)}" title="${esc(firstName(x.userId))}">${avatar(x.userId, 18)}</button>`).join('')}</span>
            ${mine ? `<span class="goal-ok">✓</span>` : st === 'active' ? `<button class="btn solid small" data-complete-item="${i.id}">Complete</button>` : ''}
          </div>`;
        }).join('')}
      </div>
    </section>`;

  // FLIP: slide rows from where they were to where they are now
  document.querySelectorAll('.lb-row').forEach(r => {
    const was = prevRects[r.dataset.user];
    if (was == null) return;
    const dy = was - r.getBoundingClientRect().top;
    if (!dy) return;
    r.style.transform = `translateY(${dy}px)`; r.style.transition = 'none';
    requestAnimationFrame(() => { r.style.transition = 'transform .7s var(--ease)'; r.style.transform = ''; });
  });
  // Count points up
  document.querySelectorAll('.lb-pts').forEach(el => {
    const from = +el.dataset.from, to = +el.dataset.to;
    if (from === to) return;
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  lastBoard = Object.fromEntries(lb.map(r => [r.userId, r.points]));
}

/* ---------- Photo proof sheet ---------- */
const proofDlg = $('#proofDlg');
let proofState = null;
async function sha256(dataUrl) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function openProof(itemId) {
  const item = S.items.find(i => i.id === itemId);
  proofState = { itemId, photo: null, hash: null, takenAt: null };
  $('#proofItem').textContent = item.title;
  $('#proofPts').textContent = `${DIFF_LABEL[item.difficulty]} · ${POINTS[item.difficulty]} pts`;
  $('#proofDrop').classList.remove('has-img'); $('#proofDrop').style.backgroundImage = '';
  $('#proofDrop span').textContent = 'Take or choose a photo';
  $('#proofMsg').textContent = ''; $('#proofMsg').className = 'proof-msg';
  $('#proofSubmit').disabled = true;
  $('#proofFile').value = '';
  proofDlg.showModal();
}
$('#proofFile').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  $('#proofDrop span').textContent = 'Preparing…';
  const photo = await compressImage(f, 1100, 0.8);
  proofState.photo = photo;
  proofState.hash = await sha256(photo);
  proofState.takenAt = f.lastModified || Date.now();
  const d = $('#proofDrop');
  d.classList.add('has-img'); d.style.backgroundImage = `url("${photo}")`;
  d.querySelector('span').textContent = 'Retake';
  const c = api.challengeSync(S.items.find(i => i.id === proofState.itemId).challengeId);
  const msg = $('#proofMsg');
  if (proofState.takenAt < c.startsAt) { msg.textContent = 'This photo looks older than the challenge. It will be flagged for your friends.'; msg.className = 'proof-msg warn'; }
  else { msg.textContent = 'Looks good. Your friends will see this photo.'; msg.className = 'proof-msg ok'; }
  $('#proofSubmit').disabled = false;
};
$('#proofCancel').onclick = () => proofDlg.close();
$('#proofForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!proofState?.photo) return;
  const btn = $('#proofSubmit');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const item = S.items.find(i => i.id === proofState.itemId);
    await api.completeItem(proofState.itemId, proofState);
    proofDlg.close();
    toast(`+${POINTS[item.difficulty]} points`);
  } catch (err) {
    $('#proofMsg').textContent = err.message; $('#proofMsg').className = 'proof-msg warn';
  } finally { btn.textContent = 'Submit proof'; btn.disabled = !proofState?.photo; }
});

function openProofViewer(completionId) {
  const comp = S.completions.find(c => c.id === completionId);
  const item = S.items.find(i => i.id === comp.itemId);
  const mine = comp.userId === ME;
  const vote = api.myVote(comp.id);
  const lb = lightboxSrc(comp.proof, `<figcaption class="lb-cap">
      <div>${avatar(comp.userId, 30)}<span><b>${esc(firstName(comp.userId))}</b> · ${esc(item.title)}<small>${ago(comp.completedAt)} · ${POINTS[item.difficulty]} pts${comp.status === 'rejected' ? ' · rejected' : comp.status === 'disputed' ? ' · disputed' : ''}</small></span></div>
      ${comp.flag ? `<p class="flag">⚠ ${esc(comp.flag)}</p>` : ''}
      ${mine ? '' : `<div class="vote"><button class="${vote === 'legit' ? 'on' : ''}" data-vote="legit">Looks legit</button><button class="${vote === 'dispute' ? 'on' : ''}" data-vote="dispute">Dispute</button></div>`}
    </figcaption>`);
  lb.addEventListener('click', async e => {
    const v = e.target.closest('[data-vote]');
    if (!v) return;
    await api.vote(comp.id, v.dataset.vote);
    lb.remove();
    toast(v.dataset.vote === 'legit' ? 'Thanks for verifying' : 'Disputed. A majority of members removes the points.');
  });
}

/* ---------- New challenge sheet ---------- */
const chDlg = $('#chDlg');
let chDraft = null;
function timeframe(kind) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const day = (yy, mm, dd) => new Date(yy, mm, dd).toISOString().slice(0, 10);
  if (kind === 'month') return [day(y, m, n.getDate()), day(y, m + 1, 0)];
  if (kind === 'summer') return n.getMonth() > 7 ? [day(y + 1, 5, 1), day(y + 1, 7, 31)] : [day(y, Math.max(5, m), Math.max(1, m > 5 ? n.getDate() : 1)), day(y, 7, 31)];
  if (kind === 'year') return [day(y, m, n.getDate()), day(y, 11, 31)];
  if (kind === 'next') return [day(y + 1, 0, 1), day(y + 1, 11, 31)];
  return null;
}
function openNewChallenge() {
  const [s, e] = timeframe('month');
  chDraft = { title: '', when: 'month', start: s, end: e, friends: new Set(), items: [{ title: '', difficulty: 'medium' }] };
  renderChForm();
  chDlg.showModal();
}
function renderChForm() {
  const open = items.filter(i => !i.done);
  $('#chForm').innerHTML = `
    <h2>New challenge</h2>
    <label class="full">Name<input name="title" required maxlength="60" placeholder="Summer of Yes" value="${esc(chDraft.title)}"></label>
    <div class="full field">Timeframe
      <div class="chips chips-wrap">${[['month', 'Rest of this month'], ['summer', 'Summer'], ['year', 'Rest of the year'], ['next', 'Next year'], ['custom', 'Custom']].map(([k, l]) => `<button type="button" class="chip ${chDraft.when === k ? 'active' : ''}" data-when="${k}">${l}</button>`).join('')}</div>
      <div class="row dates"><input type="date" name="start" value="${chDraft.start}" ${chDraft.when === 'custom' ? '' : 'readonly'}><span>→</span><input type="date" name="end" value="${chDraft.end}" ${chDraft.when === 'custom' ? '' : 'readonly'}></div>
    </div>
    <div class="full field">With <span class="hint-line">${chDraft.friends.size === 1 ? '1-on-1 challenge' : chDraft.friends.size > 1 ? `Group of ${chDraft.friends.size + 1}` : 'Pick one friend for a 1-on-1, or several for a group'}</span>
      <div class="pick-friends">${api.friends().map(f => `<button type="button" class="pf ${chDraft.friends.has(f.id) ? 'on' : ''}" data-friend="${f.id}">${avatar(f.id, 44)}<small>${esc(f.name.split(' ')[0])}</small></button>`).join('')}</div>
    </div>
    <div class="full field">Goals <span class="hint-line">Easy 10 · Medium 25 · Hard 50 points</span>
      <div class="ch-items">${chDraft.items.map((it, n) => `
        <div class="ch-item-row">
          <input data-it-title="${n}" value="${esc(it.title)}" placeholder="e.g. Sleep under the stars" maxlength="80">
          <div class="diff-pick">${['easy', 'medium', 'hard'].map(d => `<button type="button" class="diff ${d} ${it.difficulty === d ? 'on' : ''}" data-it-diff="${n}" data-d="${d}">${DIFF_LABEL[d]}</button>`).join('')}</div>
          <button type="button" class="rm" data-it-rm="${n}" aria-label="Remove">×</button>
        </div>`).join('')}
      </div>
      <div class="ch-item-add">
        <button type="button" class="link-quiet" data-it-add>+ Add goal</button>
        ${open.length ? `<select id="fromList"><option value="">+ From my list…</option>${open.map(i => `<option value="${i.id}">${esc(i.title)}</option>`).join('')}</select>` : ''}
      </div>
    </div>
    <p class="proof-msg warn full" id="chErr"></p>
    <div class="form-actions"><button type="button" class="btn" data-ch-cancel>Cancel</button><button class="btn solid">Start challenge</button></div>`;
}
chDlg.addEventListener('input', e => {
  if (e.target.name === 'title') chDraft.title = e.target.value;
  if (e.target.name === 'start') chDraft.start = e.target.value;
  if (e.target.name === 'end') chDraft.end = e.target.value;
  if (e.target.dataset.itTitle != null) chDraft.items[+e.target.dataset.itTitle].title = e.target.value;
});
chDlg.addEventListener('change', e => {
  if (e.target.id !== 'fromList' || !e.target.value) return;
  const it = items.find(i => i.id === e.target.value);
  chDraft.items = chDraft.items.filter(x => x.title.trim());
  chDraft.items.push({ title: it.title, difficulty: it.type === 'trip' ? 'hard' : 'medium', entryId: it.id });
  renderChForm();
});
chDlg.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.when) {
    chDraft.when = b.dataset.when;
    const tf = timeframe(b.dataset.when);
    if (tf) [chDraft.start, chDraft.end] = tf;
    renderChForm();
  } else if (b.dataset.friend) {
    chDraft.friends.has(b.dataset.friend) ? chDraft.friends.delete(b.dataset.friend) : chDraft.friends.add(b.dataset.friend);
    renderChForm();
  } else if (b.dataset.itDiff != null) { chDraft.items[+b.dataset.itDiff].difficulty = b.dataset.d; renderChForm(); }
  else if (b.dataset.itRm != null) { chDraft.items.splice(+b.dataset.itRm, 1); if (!chDraft.items.length) chDraft.items.push({ title: '', difficulty: 'medium' }); renderChForm(); }
  else if (b.hasAttribute('data-it-add')) { chDraft.items.push({ title: '', difficulty: 'medium' }); renderChForm(); $(`[data-it-title="${chDraft.items.length - 1}"]`).focus(); }
  else if (b.hasAttribute('data-ch-cancel')) chDlg.close();
});
$('#chForm').addEventListener('submit', async e => {
  e.preventDefault();
  const goals = chDraft.items.filter(i => i.title.trim());
  const start = new Date(chDraft.start + 'T00:00:00').getTime(), end = new Date(chDraft.end + 'T23:59:59').getTime();
  const err = !chDraft.title.trim() ? 'Give it a name.' : !chDraft.friends.size ? 'Pick at least one friend.' : !goals.length ? 'Add at least one goal.' : !(end > start) ? 'The end date must be after the start.' : '';
  if (err) { $('#chErr').textContent = err; return; }
  const id = await api.createChallenge({ title: chDraft.title.trim(), startsAt: start, endsAt: end, memberIds: [...chDraft.friends], items: goals });
  chDlg.close();
  toast('Challenge started');
  openChallenge(id);
});

/* ---------- Wire up ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  const ftab = t.closest('[data-ftab]');
  if (ftab) { friendsTab = ftab.dataset.ftab; renderFriendsShell(); return; }
  if (t.closest('[data-new-ch]')) return openNewChallenge();
  const och = t.closest('[data-open-ch]');
  if (och) return openChallenge(och.dataset.openCh);
  const ci = t.closest('[data-complete-item]');
  if (ci) return openProof(ci.dataset.completeItem);
  const pr = t.closest('[data-proof]');
  if (pr) return openProofViewer(pr.dataset.proof);
  const add = t.closest('[data-ch-add]');
  if (add) {
    const title = prompt('New goal');
    if (title?.trim()) {
      const d = (prompt('Difficulty: easy, medium or hard', 'medium') || 'medium').toLowerCase();
      api.addItem(add.dataset.chAdd, { title: title.trim(), difficulty: POINTS[d] ? d : 'medium' });
    }
    return;
  }
  const rb = t.closest('[data-react]');
  if (rb) {
    rb.classList.add('pop');
    api.react(rb.dataset.actId, rb.dataset.react);
    return;
  }
  const ph = t.closest('[data-zoom-photo]');
  if (ph) lightboxSrc(ph.dataset.zoomPhoto);
});

// Live updates: re-render whatever is on screen
api.on('feed', ev => {
  if (currentView === 'friends' && friendsTab === 'feed' && !detail) {
    if (ev.kind === 'reaction') {
      // Update just that post's reaction bar
      const el = document.querySelector(`[data-post="${ev.activityId}"]`);
      const a = S.activities.find(x => x.id === ev.activityId);
      if (el && a) {
        const fresh = document.createElement('div');
        fresh.innerHTML = post(activityView(a), false);
        el.querySelector('.reacts').replaceWith(fresh.querySelector('.reacts'));
        if (ev.userId !== ME && ev.added) el.querySelector(`[data-react="${ev.emoji}"]`)?.classList.add('pop');
      }
    } else renderFeed(true);
  }
  updateFriendsBadge();
});
// Any challenge change refreshes the challenge list when it's on screen
const refreshChallengeList = () => { if (currentView === 'friends' && friendsTab === 'challenges' && !detail) renderChallenges(); };
api.on('challenges', refreshChallengeList);
api.on('completion', refreshChallengeList);
function updateFriendsBadge() {
  const unseen = S.activities.filter(a => a.actorId !== ME && a.createdAt > (+localStorage.getItem('bucketlist.feedSeen') || 0)).length;
  document.querySelectorAll('[data-tab="friends"]').forEach(b => b.classList.toggle('has-new', unseen > 0 && currentView !== 'friends'));
}
updateFriendsBadge();

// Called by the main app
function onEntryCompleted(it) { api.publishEntry(it); }
function onEntryReopened(it) { api.unpublishEntry(it.id); }
function renderFriends() {
  localStorage.setItem('bucketlist.feedSeen', Date.now());
  updateFriendsBadge();
  renderFriendsShell();
}
