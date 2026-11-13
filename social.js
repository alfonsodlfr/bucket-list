/* ===================================================================
   Social: friends, live challenges with photo proof, activity feed.

   Shared through Supabase (see supabase/schema.sql). Your bucket list
   stays on your phone; challenges, goals, photo proofs, votes, the feed
   and reactions are shared with the people in your challenges.

   `S` is a local cache with the same shape the UI (and Wrapped) read
   synchronously. `sync()` refills it from the database, and realtime
   changes trigger a sync, then the usual events through `api.on(...)`.
   =================================================================== */

const SUPABASE_URL = 'https://iocnvwefmlqbgotekhhp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qqVElf-BIE6ShN2qrz0meQ_DKsTFlIW'; // publishable: safe in the app, access is enforced by row level security
const POINTS = { easy: 10, medium: 25, hard: 50 };
const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const EMOJIS = ['✨', '🔥', '🌍', '🏔️', '👏', '🥹'];
const COLORS = ['#7a9e9f', '#b5736a', '#8f84b8', '#6f9a6a', '#c8a96a', '#a0784f', '#6a87b5', '#b56a94'];
const DAY = 864e5;
const uid = () => crypto.randomUUID();
localStorage.removeItem('bucketlist.social.v1'); // the old demo friends

const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bucketlist.auth', detectSessionInUrl: false },
});
let ME = null;        // your user id once signed in
let socialReady = false;
const emptyS = () => ({ profiles: [], challenges: [], members: [], items: [], completions: [], votes: [], activities: [], reactions: [], wishes: [] });
let S = emptyS();

/* ---------- Events ---------- */
const bus = new EventTarget();
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

/* ---------- Database <-> cache ---------- */
const ms = v => (v ? Date.parse(v) : null);
const iso = t => new Date(t).toISOString();
const MAP = {
  profiles: r => ({ id: r.id, name: r.name, color: r.color, shareList: r.share_list }),
  wishes: r => ({ userId: r.user_id, entryId: r.entry_id, title: r.title, type: r.type, place: r.place, sourceActivity: r.source_activity }),
  challenges: r => ({ id: r.id, title: r.title, startsAt: ms(r.starts_at), endsAt: ms(r.ends_at), createdBy: r.created_by, inviteCode: r.invite_code }),
  members: r => ({ challengeId: r.challenge_id, userId: r.user_id }),
  items: r => ({ id: r.id, challengeId: r.challenge_id, title: r.title, difficulty: r.difficulty }),
  completions: r => ({ id: r.id, itemId: r.item_id, challengeId: r.challenge_id, userId: r.user_id, proof: r.proof_url, hash: r.hash, takenAt: ms(r.taken_at), completedAt: ms(r.completed_at), status: r.status, flag: r.flag }),
  votes: r => ({ completionId: r.completion_id, voterId: r.voter_id, verdict: r.verdict }),
  activities: r => ({ id: r.id, actorId: r.actor_id, kind: r.kind, title: r.title, photo: r.photo, place: r.place || '', type: r.type, caption: r.caption || '', entryId: r.entry_id, challengeId: r.challenge_id, completionId: r.completion_id, points: r.points, createdAt: ms(r.created_at) }),
  reactions: r => ({ activityId: r.activity_id, userId: r.user_id, emoji: r.emoji, createdAt: ms(r.created_at) }),
};
const TABLE = { profiles: 'profiles', challenges: 'challenges', members: 'challenge_members', items: 'challenge_items', completions: 'challenge_completions', votes: 'completion_votes', activities: 'activities', reactions: 'reactions', wishes: 'wishes' };
function friendlyError(e) {
  const m = e?.message || String(e);
  if (e?.code === '23505' && /hash/.test(m)) return 'This photo has already been used as proof.';
  if (e?.code === '23505') return 'Already completed.';
  if (e?.code === '42501' || /row-level security/i.test(m)) return 'That isn\'t allowed (has the challenge ended?).';
  if (/fetch|network/i.test(m)) return 'You seem to be offline. Try again when you\'re connected.';
  return m;
}
const must = ({ data, error }) => { if (error) throw error; return data; };

let syncing = null, syncAgain = false, firstSync = true;
async function sync() {
  if (!ME) return;
  if (syncing) { syncAgain = true; return syncing; }
  syncing = (async () => {
    const before = S;
    const rows = await Promise.all(Object.entries(TABLE).map(([k, t]) => {
      let q = sb.from(t).select('*');
      if (k === 'activities') q = q.order('created_at', { ascending: false }).limit(200);
      return q.then(must).then(r => [k, r.map(MAP[k])]);
    }));
    S = Object.fromEntries(rows);
    socialReady = true;
    announceNews(before);
    emit('challenges', {}); emit('feed', { kind: 'sync' }); emit('completion', {});
    S.challenges.forEach(c => emit('completion:' + c.id, {}));
    if (firstSync) { firstSync = false; syncWishesSoon(); if (/^#challenge\//.test(location.hash) && typeof route === 'function') route(); }
    if (typeof refresh === 'function' && currentView === 'list' && !detail) render(); // friends' goals and challenge banners on My list
  })().catch(e => console.warn('sync failed', e)).finally(() => { syncing = null; if (syncAgain) { syncAgain = false; sync(); } });
  return syncing;
}
// A short note when friends do something while you're in the app
function announceNews(before) {
  if (firstSync) return;
  const seenC = new Set(before.completions.map(c => c.id));
  S.completions.filter(c => !seenC.has(c.id) && c.userId !== ME).forEach(c => {
    const item = S.items.find(i => i.id === c.itemId);
    if (item) toast(`${firstName(c.userId)} +${POINTS[item.difficulty]} · ${item.title}`);
  });
  const key = r => r.activityId + r.userId + r.emoji;
  const seenR = new Set(before.reactions.map(key));
  S.reactions.filter(r => !seenR.has(key(r)) && r.userId !== ME).forEach(r => {
    const a = S.activities.find(x => x.id === r.activityId);
    if (a?.actorId === ME) toast(`${firstName(r.userId)} reacted ${r.emoji} to “${activityView(a).title}”`);
  });
}
let syncTimer = null;
const syncSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 350); };
let channel = null;
function listen() {
  channel?.unsubscribe();
  channel = sb.channel('the-list');
  Object.values(TABLE).forEach(table => channel.on('postgres_changes', { event: '*', schema: 'public', table }, syncSoon));
  channel.subscribe();
}
// Coming back to the app: catch up on anything missed while it was asleep
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ME) sync(); });

async function startSocial() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderSocialChrome();
  const me = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (!me.data) return renderSocialChrome(); // signed in but never finished the profile
  ME = session.user.id;
  renderSocialChrome();
  listen();
  await sync();
}
const signedIn = () => !!ME;

/* ---------- Profile: a name is all it takes ---------- */
const profileDlg = $('#profileDlg');
let profileWait = null;
// Resolves once you have a profile; opens the name sheet if needed. Rejects if you close it.
function requireProfile(why) {
  if (ME) return Promise.resolve();
  if (!sb) { toast('Sharing needs a connection. Try again online.'); return Promise.reject(new Error('offline')); }
  $('#profileWhy').textContent = why || 'Your friends will see this name next to your goals and photos.';
  $('#profileErr').textContent = '';
  profileDlg.showModal();
  return new Promise((resolve, reject) => { profileWait = { resolve, reject }; });
}
async function createProfile(name, shareList = true) {
  let { data: { session } } = await sb.auth.getSession();
  if (!session) session = must(await sb.auth.signInAnonymously()).session;
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  must(await sb.from('profiles').upsert({ id: session.user.id, name, color, share_list: shareList }));
  ME = session.user.id;
  renderSocialChrome();
  listen();
  await sync();
}
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#profileName').value.trim();
  if (!name) return;
  const btn = $('#profileGo'); btn.disabled = true; btn.textContent = 'One moment…';
  try {
    await createProfile(name, $('#profileShare').checked);
    const w = profileWait; profileWait = null;
    profileDlg.close();
    toast(`Welcome, ${name.split(' ')[0]}`);
    w?.resolve();
  } catch (err) {
    $('#profileErr').textContent = /anonymous/i.test(err.message) ? 'Sign-ups are switched off right now. Ask Alfonso to check the app settings.' : friendlyError(err);
  } finally { btn.disabled = false; btn.textContent = 'Continue'; }
});
profileDlg.addEventListener('close', () => { if (profileWait) { profileWait.reject(new Error('cancelled')); profileWait = null; } });
$('#profileCancel').onclick = () => profileDlg.close();

/* ---------- Invite links ---------- */
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const inviteUrl = c => `${appUrl()}#join/${c.inviteCode}`;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const inviteDlg = $('#inviteDlg');
let inviteFor = null;
function openInvite(c, justCreated = false) {
  inviteFor = c;
  $('#inviteEyebrow').textContent = justCreated ? 'Challenge created' : 'Invite friends';
  $('#inviteTitle').textContent = c.title;
  $('#inviteLink').value = inviteUrl(c);
  inviteDlg.showModal();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { const i = $('#inviteLink'); i.select(); return document.execCommand?.('copy'); }
}
$('#inviteShare').onclick = async () => {
  const url = inviteUrl(inviteFor), text = `Join my challenge “${inviteFor.title}” on The List`;
  if (navigator.share) { try { await navigator.share({ title: inviteFor.title, text, url }); } catch { /* cancelled */ } }
  else if (await copyText(url)) toast('Link copied');
};
$('#inviteCopy').onclick = async () => { if (await copyText(inviteUrl(inviteFor))) toast('Link copied'); };
$('#inviteDone').onclick = () => inviteDlg.close();

// Opening an invite link: #join/<code>. Picked up before the app routes, so it isn't treated as a page.
const joinDlg = $('#joinDlg');
let pendingJoin = (location.hash.match(/^#join\/([\w-]+)/) || [])[1] || null;
if (pendingJoin) history.replaceState({ app: false }, '', '#friends');
addEventListener('hashchange', () => {
  const code = (location.hash.match(/^#join\/([\w-]+)/) || [])[1];
  if (!code) return;
  history.replaceState({ app: true }, '', '#friends');
  setView('friends'); openJoin(code);
});
const codeFrom = text => (String(text).match(/#join\/([\w-]+)/) || String(text).trim().match(/^([\w-]{6,})$/) || [])[1] || null;
let joinCode = null, joinInfo = null;
async function openJoin(code) {
  joinCode = code; joinInfo = null;
  $('#joinBody').innerHTML = '<p class="join-loading">Opening invite…</p>';
  if (!joinDlg.open) joinDlg.showModal();
  try {
    joinInfo = must(await sb.rpc('get_invite', { code }));
  } catch (e) { joinInfo = null; $('#joinBody').innerHTML = `<div class="join-none"><h2>Can't open this invite</h2><p>${esc(friendlyError(e))}</p></div>`; return; }
  if (!joinInfo) { $('#joinBody').innerHTML = `<div class="join-none"><h2>Invite not found</h2><p>The link may be incomplete, or the challenge was deleted. Ask for a new link.</p></div>`; return; }
  renderJoin();
}
function renderJoin() {
  const j = joinInfo, ended = Date.parse(j.ends_at) < Date.now();
  const needsName = !ME;
  // On iPhone, links open in Safari, which keeps its data apart from the Home Screen app
  const iosBrowser = isIOS && !standalone();
  $('#joinBody').innerHTML = `
    <div class="eyebrow">${esc(j.creator)} invited you</div>
    <h2>${esc(j.title)}</h2>
    <p class="join-meta">${fmtShort(Date.parse(j.starts_at))} – ${fmtShort(Date.parse(j.ends_at))} · ${j.goals} goal${j.goals === 1 ? '' : 's'} · ${j.members} joined</p>
    ${j.joined ? `<button class="btn solid wide" data-join="open">Open challenge</button>`
      : ended ? `<p class="join-note">This challenge has ended.</p>`
      : `${iosBrowser ? `<div class="join-tip"><b>Using The List from your Home Screen?</b> Copy this link, open the app, and paste it under Friends → Join with a link. Joining here keeps the challenge in Safari only.
            <button class="link-quiet" data-join="copy">Copy link</button></div>` : ''}
         ${needsName ? `<label class="join-name">Your name<input id="joinName" maxlength="40" placeholder="So your friends know it's you" autocomplete="given-name"></label>` : ''}
         <p class="proof-msg warn" id="joinErr"></p>
         <button class="btn solid wide" data-join="go">Join challenge</button>`}`;
}
joinDlg.addEventListener('click', async e => {
  const a = e.target.closest('[data-join]')?.dataset.join;
  if (!a) return;
  if (a === 'copy') { if (await copyText(`${appUrl()}#join/${joinCode}`)) toast('Link copied'); return; }
  if (a === 'open') { joinDlg.close(); setView('friends'); return openChallenge(joinInfo.id); }
  const btn = e.target.closest('button'); btn.disabled = true; btn.textContent = 'Joining…';
  try {
    if (!ME) {
      const name = $('#joinName').value.trim();
      if (!name) { $('#joinErr').textContent = 'Add your name first.'; $('#joinName').focus(); return; }
      await createProfile(name);
    }
    const id = must(await sb.rpc('join_challenge', { code: joinCode }));
    await sync();
    joinDlg.close();
    setView('friends');
    openChallenge(id);
    toast(`You're in. Good luck!`);
  } catch (err) {
    $('#joinErr') && ($('#joinErr').textContent = /anonymous/i.test(err.message) ? 'Sign-ups are switched off right now.' : friendlyError(err));
  } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Join challenge'; } }
});
// "Join with a link" from inside the app (for links opened elsewhere)
const pasteDlg = $('#pasteDlg');
$('#pasteForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = codeFrom($('#pasteLink').value);
  if (!code) { $('#pasteErr').textContent = 'That doesn\'t look like an invite link.'; return; }
  pasteDlg.close(); openJoin(code);
});
$('#pasteCancel').onclick = () => pasteDlg.close();
function openPaste() {
  $('#pasteLink').value = ''; $('#pasteErr').textContent = '';
  pasteDlg.showModal();
}

/* ---------- Photos ---------- */
// Data URLs (photos taken in the app) are uploaded; built-in images and web URLs are shared as they are
const uploaded = new Map(); // same photo, same upload
async function sharedPhoto(src) {
  if (!src || !src.startsWith('data:')) return src || null;
  if (uploaded.has(src)) return uploaded.get(src);
  const blob = await (await fetch(src)).blob();
  const path = `${ME}/${uid()}.jpg`;
  must(await sb.storage.from('photos').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false }));
  const url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
  uploaded.set(src, url);
  return url;
}

/* ---------- API (same shape as before; the UI didn't change) ---------- */
const needMe = () => { if (!ME) throw new Error('Create your profile first.'); };
const api = {
  on(type, fn) { const h = e => fn(e.detail); bus.addEventListener(type, h); return () => bus.removeEventListener(type, h); },
  profile: id => S.profiles.find(p => p.id === id) || { id, name: id === ME ? 'You' : 'Someone', color: '#555' },
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
    return S.challenges.filter(c => api.membersOf(c.id).includes(ME)).sort((a, b) => b.endsAt - a.endsAt);
  },
  async createChallenge({ title, startsAt, endsAt, memberIds, items: list }) {
    needMe();
    const c = must(await sb.from('challenges').insert({ title, starts_at: iso(startsAt), ends_at: iso(endsAt) }).select().single());
    must(await sb.from('challenge_members').insert([ME, ...memberIds].map(user_id => ({ challenge_id: c.id, user_id }))));
    if (list.length) must(await sb.from('challenge_items').insert(list.map(it => ({ challenge_id: c.id, title: it.title.trim(), difficulty: it.difficulty }))));
    await sync();
    return c.id;
  },
  async addItem(challengeId, { title, difficulty }) {
    needMe();
    must(await sb.from('challenge_items').insert({ challenge_id: challengeId, title, difficulty }));
    await sync();
  },
  // Completing requires a proof photo. Checks: not already done, challenge running, photo not reused,
  // and the photo's capture time inside the window (flagged for friends otherwise).
  async completeItem(itemId, { photo, hash, takenAt }) {
    needMe();
    const item = S.items.find(i => i.id === itemId);
    const c = item && api.challengeSync(item.challengeId);
    if (!item || !c) throw new Error('This item no longer exists.');
    if (!photo) throw new Error('A photo proof is required.');
    if (api.status(c) !== 'active') throw new Error('This challenge is not running.');
    if (S.completions.some(x => x.itemId === itemId && x.userId === ME)) throw new Error('Already completed.');
    const flag = takenAt && (takenAt < c.startsAt || takenAt > Date.now() + 60e3) ? 'Photo taken before the challenge started' : null;
    try {
      const url = await sharedPhoto(photo);
      const comp = must(await sb.from('challenge_completions').insert({ challenge_id: c.id, item_id: itemId, proof_url: url, hash, taken_at: takenAt ? iso(takenAt) : null, flag }).select().single());
      must(await sb.from('activities').insert({ kind: 'challenge_item', title: item.title, photo: url, type: item.difficulty === 'hard' ? 'activity' : 'personal', challenge_id: c.id, completion_id: comp.id, points: POINTS[item.difficulty] }));
      await sync();
      return MAP.completions(comp);
    } catch (e) { throw new Error(friendlyError(e)); }
  },
  async vote(completionId, verdict) {
    needMe();
    must(await sb.from('completion_votes').upsert({ completion_id: completionId, voter_id: ME, verdict }, { onConflict: 'completion_id,voter_id' }));
    await sync();
  },
  myVote: completionId => S.votes.find(v => v.completionId === completionId && v.voterId === ME)?.verdict || null,

  // feed ------------------------------------------------------------
  async feed() { return [...S.activities].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60); },
  reactionsOf: id => S.reactions.filter(r => r.activityId === id),
  async react(activityId, emoji) {
    if (!ME) return requireProfile('Pick a name so your friends know who reacted.').catch(() => {});
    // Optimistic: show it now, then save
    const had = S.reactions.findIndex(r => r.activityId === activityId && r.userId === ME && r.emoji === emoji);
    if (had >= 0) S.reactions.splice(had, 1); else S.reactions.push({ activityId, userId: ME, emoji, createdAt: Date.now() });
    emit('feed', { kind: 'reaction', activityId, userId: ME, emoji, added: had < 0 });
    const q = had >= 0
      ? sb.from('reactions').delete().match({ activity_id: activityId, user_id: ME, emoji })
      : sb.from('reactions').insert({ activity_id: activityId, emoji });
    const { error } = await q;
    if (error) { toast(friendlyError(error)); sync(); }
  },
  // Your own completions show up in your friends' feeds (only if you're signed in)
  async publishEntry(entry) {
    if (!ME) return;
    try {
      const photo = await sharedPhoto(coverOf(entry));
      must(await sb.from('activities').upsert({ actor_id: ME, kind: 'entry_completed', entry_id: entry.id, title: entry.title, place: entry.place || null, type: entry.type, photo, caption: entry.memory?.highlight || null }, { onConflict: 'actor_id,entry_id' }));
      syncSoon();
    } catch (e) { console.warn('publish failed', e); }
  },
  async unpublishEntry(entryId) {
    if (!ME) return;
    await sb.from('activities').delete().match({ actor_id: ME, entry_id: entryId });
    syncSoon();
  },
};

/* ---------- Goal titles shared with friends ----------
   Your open goals are mirrored as titles only (no photos, no stories), visible to people
   you share a challenge with, unless you switch it off. Used for "Me too" and "friends with the same goal". */
const goalKey = t => [...new Set(keywords(t || ''))];
function sameGoal(a, b) {
  const x = goalKey(a), y = goalKey(b);
  if (!x.length || !y.length) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const shared = x.filter(w => y.includes(w)).length;
  return shared >= Math.min(2, x.length, y.length) && shared / Math.min(x.length, y.length) >= .6;
}
const haveGoal = title => items.some(i => sameGoal(i.title, title));
// Friends (not you) who have this goal on their list, optionally leaving someone out
const friendsWanting = (title, skip) => [...new Set(S.wishes.filter(w => w.userId !== ME && w.userId !== skip && sameGoal(w.title, title)).map(w => w.userId))];
const names = ids => ids.map(firstName).reduce((s, n, k, a) => k === 0 ? n : k === a.length - 1 ? `${s} and ${n}` : `${s}, ${n}`, '');
function alsoLine(a) {
  const ids = friendsWanting(a.title, a.actorId);
  return ids.length ? `<div class="also-line"><span class="stack">${ids.slice(0, 3).map(u => avatar(u, 16)).join('')}</span>${esc(names(ids.slice(0, 2)))}${ids.length > 2 ? ` +${ids.length - 2}` : ''} ${ids.length === 1 ? 'has' : 'have'} it on their list too</div>` : '';
}
function sameGoalPill(i) {
  const ids = friendsWanting(i.title);
  if (!ids.length) return '';
  return `<span class="card-pill"><span class="stack">${ids.slice(0, 2).map(u => avatar(u, 14)).join('')}</span>${ids.length === 1 ? `${esc(firstName(ids[0]))} too` : `+${ids.length} want this`}</span>`;
}
function sameGoalHtml(it) {
  if (it.done) return '';
  const ids = friendsWanting(it.title);
  if (!ids.length) return '';
  return `<div class="same-goal"><span class="stack">${ids.slice(0, 4).map(u => avatar(u, 30)).join('')}</span>
    <span>${esc(names(ids.slice(0, 3)))}${ids.length > 3 ? ` and ${ids.length - 3} more` : ''}<small>${ids.length === 1 ? 'also has this on their list' : 'also have this on their lists'}</small></span></div>`;
}
let wishTimer = null;
const syncWishesSoon = () => { clearTimeout(wishTimer); wishTimer = setTimeout(syncWishes, 1500); };
async function syncWishes() {
  if (!ME) return;
  const me = api.profile(ME);
  const mine = S.wishes.filter(w => w.userId === ME);
  const want = me.shareList === false ? [] : items.filter(i => !i.done);
  const wantIds = new Set(want.map(i => i.id));
  const gone = mine.filter(w => !wantIds.has(w.entryId)).map(w => w.entryId);
  const changed = want.filter(i => { const w = mine.find(x => x.entryId === i.id); return !w || w.title !== i.title || (w.place || '') !== (i.place || '') || w.type !== i.type; });
  try {
    if (gone.length) must(await sb.from('wishes').delete().eq('user_id', ME).in('entry_id', gone));
    if (changed.length) must(await sb.from('wishes').upsert(changed.map(i => ({ user_id: ME, entry_id: i.id, title: i.title, type: i.type, place: i.place || null, source_activity: i.metooFrom || null })), { onConflict: 'user_id,entry_id' }));
    if (gone.length || changed.length) syncSoon();
  } catch (e) { console.warn('wishes sync failed', e); }
}
// Every save of the list mirrors the titles (debounced)
const _saveList = save;
save = function () { _saveList(); syncWishesSoon(); };
async function setShareList(on) {
  if (!ME) return;
  must(await sb.from('profiles').update({ share_list: on }).eq('id', ME));
  await sync(); await syncWishes();
  toast(on ? 'Friends can see your goal titles' : 'Your goal titles are hidden from friends');
  if ($('#passportDlg').open) openPassport();
}
// "Me too": copy a friend's post onto your list. Nobody gets notified.
function meToo(activityId) {
  const a = S.activities.find(x => x.id === activityId);
  if (!a || haveGoal(a.title)) return;
  const it = makeItem({ title: a.title, type: a.type && TYPES[a.type] ? a.type : guessType(a.title, a.place), place: a.place || '', image: a.photo || null, imageCredit: a.photo && !a.photo.includes('/img/') && !a.photo.startsWith('img/') ? `Photo: ${api.profile(a.actorId).name}` : null });
  it.metooFrom = a.id;
  items.push(it); save();
  if (currentView === 'friends' && friendsTab === 'feed') renderFeed();
  toast('Added to your list');
}
// How many friends added one of your goals with "Me too"
const inspiredCount = () => new Set(S.wishes.filter(w => w.userId !== ME && w.sourceActivity && S.activities.some(a => a.id === w.sourceActivity && a.actorId === ME)).map(w => w.userId)).size;
const myWins = () => S.challenges.filter(c => api.status(c) === 'ended' && api.membersOf(c.id).length > 1 && api.leaderboard(c.id)[0]?.userId === ME).length;
// Big stamps appear in friends' feeds (once each)
async function postStamp(s) {
  if (!ME) return;
  const { error } = await sb.from('activities').upsert({ actor_id: ME, kind: 'stamp', entry_id: 'stamp:' + s.id, title: s.label, place: s.icon, caption: s.line, type: 'stamp' }, { onConflict: 'actor_id,entry_id', ignoreDuplicates: true });
  if (!error) syncSoon();
}

/* ---------- Challenge pressure ----------
   Only in a challenge's last 3 days, and only when the result can still change. */
function pressureFor(c) {
  if (api.status(c) !== 'active' || c.endsAt - Date.now() > 3 * DAY) return null;
  const members = api.membersOf(c.id);
  if (members.length < 2 || !members.includes(ME)) return null;
  const lb = api.leaderboard(c.id), rank = lb.findIndex(r => r.userId === ME) + 1, me = lb[rank - 1];
  const left = api.itemsOf(c.id).filter(i => !S.completions.some(x => x.itemId === i.id && x.userId === ME)).sort((a, b) => POINTS[b.difficulty] - POINTS[a.difficulty]);
  const days = Math.ceil((c.endsAt - Date.now()) / DAY);
  const when = days <= 1 ? (new Date(c.endsAt).toDateString() === new Date().toDateString() ? 'ends today' : 'ends tomorrow') : `${days} days left`;
  if (rank > 1) {
    const gap = lb[0].points - me.points, best = left[0];
    if (!best || left.reduce((s, i) => s + POINTS[i.difficulty], 0) < gap) return null; // can't catch up any more: stay quiet
    // The smallest goal that puts you ahead; failing that, one that levels it
    const bySize = [...left].sort((a, b) => POINTS[a.difficulty] - POINTS[b.difficulty]);
    const one = bySize.find(i => POINTS[i.difficulty] > gap) || bySize.find(i => POINTS[i.difficulty] === gap);
    return { c, when, title: `${c.title}: ${when}`, line: `You're ${rank === 2 ? '2nd' : rank === 3 ? '3rd' : rank + 'th'}, ${gap} points behind ${firstName(lb[0].userId)}.`,
      tip: one ? `“${one.title}” (+${POINTS[one.difficulty]}) would put you ${POINTS[one.difficulty] > gap ? 'ahead' : 'level'}.` : 'A couple of goals would close the gap.', item: one || best };
  }
  const second = lb[1], lead = me.points - second.points;
  const theirBest = Math.max(0, ...api.itemsOf(c.id).filter(i => !S.completions.some(x => x.itemId === i.id && x.userId === second.userId)).map(i => POINTS[i.difficulty]));
  if (lead > theirBest) return null;
  return { c, when, title: `${c.title}: ${when}`, line: `You lead by ${lead}. ${firstName(second.userId)} can still catch you.`, tip: left[0] ? `“${left[0].title}” (+${POINTS[left[0].difficulty]}) would make it safe.` : '', item: left[0] };
}
function challengeBanner() {
  if (!ME) return '';
  const p = S.challenges.map(pressureFor).filter(Boolean).sort((a, b) => a.c.endsAt - b.c.endsAt)[0];
  return p ? `<button class="ch-alert" data-open-ch="${p.c.id}"><span class="flag-ico">🏁</span><span><b>${esc(p.title)}</b><small>${esc(p.line)}</small></span><span class="mut">›</span></button>` : '';
}

// Your posts read their photo and caption live from the entry, so a story written later shows up in the feed
function activityView(a) {
  if (a.actorId !== ME || !a.entryId) return a;
  const e = items.find(i => i.id === a.entryId);
  return e ? { ...a, title: e.title, place: e.place, type: e.type, photo: coverOf(e), caption: e.memory?.highlight || '' } : a;
}

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
// Signed out: one card explaining how friends work, instead of an empty feed
const welcomeCard = () => `<div class="empty social-welcome">
    <h2>Challenge your friends</h2>
    <p>Start a challenge, send the link, and race each other through your goals, with photo proof and a live leaderboard. All it takes is a name.</p>
    <div class="btns-row"><button class="btn solid" data-new-ch>New challenge</button><button class="btn" data-join-link>Join with a link</button></div>
    <p class="hint-line">Your photos and stories stay on your phone. Friends in your challenges see your goal titles, so you can spot shared dreams.</p>
  </div>`;
function renderSocialChrome() {
  if (typeof currentView !== 'undefined' && currentView === 'friends' && !detail) renderFriendsShell();
}
function renderFriendsShell() {
  document.querySelectorAll('[data-ftab]').forEach(b => b.classList.toggle('active', b.dataset.ftab === friendsTab));
  $('#feedPane').hidden = friendsTab !== 'feed';
  $('#challengesPane').hidden = friendsTab !== 'challenges';
  const me = ME && api.profile(ME);
  $('#friendRoster').innerHTML = (me ? `<button class="roster-p" data-g="passport">${avatar(ME, 34)}<small>You</small></button>` : '') +
    api.friends().map(f => `<span class="roster-p">${avatar(f.id, 34)}<small>${esc(f.name.split(' ')[0])}</small></span>`).join('');
  if (!ME) { $('#feed').innerHTML = welcomeCard(); $('#challengeList').innerHTML = welcomeCard(); return; }
  if (friendsTab === 'feed') renderFeed(); else renderChallenges();
}
async function renderFeed(highlightNew = false) {
  const before = new Set(feedCache.map(a => a.id));
  feedCache = await api.feed();
  if (currentView !== 'friends' || friendsTab !== 'feed') return;
  if (!ME) return;
  $('#feed').innerHTML = feedCache.length ? feedCache.map(a => post(activityView(a), highlightNew && !before.has(a.id))).join('')
    : `<div class="empty"><h2>Quiet for now</h2><p>${api.friends().length ? 'Complete something from your list and it will appear here for your friends.' : 'Your friends\' completions show up here once they join one of your challenges.'}</p>${api.friends().length ? '' : '<div class="btns-row"><button class="btn solid" data-new-ch>New challenge</button><button class="btn" data-join-link>Join with a link</button></div>'}</div>`;
}
function post(a, isNew) {
  if (a.kind === 'stamp') return stampPost(a, isNew);
  const p = api.profile(a.actorId);
  const reacts = api.reactionsOf(a.id);
  const counts = EMOJIS.map(e => [e, reacts.filter(r => r.emoji === e).length, reacts.some(r => r.emoji === e && r.userId === ME)]);
  const ch = a.challengeId && api.challengeSync(a.challengeId);
  const t = TYPES[a.type] || TYPES.other;
  // Header stays two short lines: who · when, then where. What happened lives on the photo.
  return `<article class="post ${isNew ? 'is-new' : ''}" data-post="${a.id}">
    <header class="post-head">${avatar(a.actorId, 38)}
      <div class="post-who">
        <div class="post-line"><b>${esc(a.actorId === ME ? 'You' : p.name)}</b><span class="post-ago">${ago(a.createdAt)}</span></div>
        ${a.place ? `<small>${esc(a.place)}</small>` : ''}
      </div>
      ${a.actorId !== ME && ME ? (haveGoal(a.title) ? `<span class="metoo done">✓ On your list</span>` : `<button class="metoo" data-metoo="${a.id}">＋ Me too</button>`) : ''}
    </header>
    <div class="post-photo ${a.photo ? '' : 'no-photo'}" style="background:${a.photo ? `${cssUrl(a.photo)} center/cover` : toneBg(t)}" ${a.photo ? `data-zoom-photo="${esc(a.photo)}"` : ''}>
      ${ch ? `<button class="post-ch" data-open-ch="${ch.id}"><b>+${a.points}</b>${esc(ch.title)}</button>` : ''}
      <div class="post-title"><span class="tag">✓ Completed · ${t.label}</span><h3>${esc(a.title)}</h3></div>
    </div>
    ${a.caption ? `<p class="post-cap">${esc(a.caption)}</p>` : ''}
    <div class="reacts">${counts.map(([e, n, mine]) => `<button class="react ${mine ? 'mine' : ''} ${n ? 'has' : ''}" data-react="${e}" data-act-id="${a.id}"><span>${e}</span>${n ? `<b>${n}</b>` : ''}</button>`).join('')}
</div>
    ${alsoLine(a)}
  </article>`;
}
function reactsBar(a) {
  const reacts = api.reactionsOf(a.id);
  return `<div class="reacts">${EMOJIS.map(e => [e, reacts.filter(r => r.emoji === e).length, reacts.some(r => r.emoji === e && r.userId === ME)]).map(([e, n, mine]) => `<button class="react ${mine ? 'mine' : ''} ${n ? 'has' : ''}" data-react="${e}" data-act-id="${a.id}"><span>${e}</span>${n ? `<b>${n}</b>` : ''}</button>`).join('')}</div>`;
}
function stampPost(a, isNew) {
  const p = api.profile(a.actorId);
  return `<article class="post ${isNew ? 'is-new' : ''}" data-post="${a.id}">
    <header class="post-head">${avatar(a.actorId, 38)}
      <div class="post-who"><div class="post-line"><b>${esc(a.actorId === ME ? 'You' : p.name)}</b><span class="post-ago">${ago(a.createdAt)}</span></div><small>New stamp</small></div>
    </header>
    <div class="post-stamp"><div class="big-stamp"><span><b>${esc(a.place || '✦')}</b><small>${esc(a.title)}</small></span></div></div>
    ${a.caption ? `<p class="post-cap">${esc(a.caption)}</p>` : ''}
    ${reactsBar(a)}
  </article>`;
}

async function renderChallenges() {
  const list = await api.challenges();
  if (currentView !== 'friends' || friendsTab !== 'challenges' || !ME) return;
  const groups = [['active', 'Running'], ['upcoming', 'Starting soon'], ['ended', 'Finished']];
  $('#challengeList').innerHTML = list.length ? groups.map(([st, label]) => {
    const g = list.filter(c => api.status(c) === st);
    return g.length ? `<div class="strip-head"><h3>${label}</h3><span class="eyebrow">${g.length}</span></div><div class="ch-cards">${g.map(chCard).join('')}</div>` : '';
  }).join('') : `<div class="empty"><h2>No challenges yet</h2><p>Pick a few goals and a timeframe, then send the link to your friends.</p><div class="btns-row"><button class="btn solid" data-new-ch>New challenge</button><button class="btn" data-join-link>Join with a link</button></div></div>`;
}
function chCard(c) {
  const lb = api.leaderboard(c.id);
  const myRank = lb.findIndex(r => r.userId === ME) + 1;
  const me = lb.find(r => r.userId === ME);
  const members = api.membersOf(c.id);
  const st = api.status(c);
  const leader = lb[0];
  return `<button class="ch-card ${st}" data-open-ch="${c.id}">
    <div class="ch-top"><span class="eyebrow">${members.length === 1 ? 'Waiting for friends' : members.length === 2 ? '1-on-1' : `Group · ${members.length}`}</span><span class="ch-when">${daysLeft(c)}</span></div>
    <h3>${esc(c.title)}</h3>
    <div class="ch-bar"><i style="width:${progressOf(c) * 100}%"></i></div>
    <div class="ch-foot">
      <span class="stack">${members.slice(0, 5).map(u => avatar(u, 26)).join('')}</span>
      <span class="ch-rank">${st === 'ended' ? (myRank === 1 ? '🏆 You won' : `${esc(firstName(leader?.userId))} won`) : `#${myRank} · ${me?.points || 0} pts`}</span>
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
  const pressure = pressureFor(c);

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
        ${st !== 'ended' ? `<button class="btn solid ch-invite" data-invite="${c.id}">${members.length === 1 ? 'Invite friends to start racing' : 'Invite friends'}</button>` : ''}
      </div>
    </header>
    <section class="ch-body">
      <div class="board">
        <div class="board-head"><h3>Leaderboard</h3>${st === 'active' ? '<span class="live-dot">Live</span>' : ''}</div>
        ${members.length === 1 ? '<p class="hint-line board-solo">Just you so far. Friends appear here as soon as they open your link.</p>' : ''}
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
        ${pressure ? `<div class="ch-catchup">⏳ <b>${esc(pressure.when[0].toUpperCase() + pressure.when.slice(1))}.</b> ${esc(pressure.line)}<small>${esc(pressure.tip)}</small></div>` : ''}
        ${its.map(i => {
          const done = comps.filter(x => x.itemId === i.id);
          const mine = done.find(x => x.userId === ME);
          return `<div class="goal ${mine ? 'done' : ''} ${pressure?.item?.id === i.id ? 'fastest' : ''}">
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
    ${api.friends().length ? `<div class="full field">With <span class="hint-line">${chDraft.friends.size ? `Adding ${chDraft.friends.size} now. Anyone else can join with the link.` : 'Add friends from earlier challenges, or just send the link afterwards'}</span>
      <div class="pick-friends">${api.friends().map(f => `<button type="button" class="pf ${chDraft.friends.has(f.id) ? 'on' : ''}" data-friend="${f.id}">${avatar(f.id, 44)}<small>${esc(f.name.split(' ')[0])}</small></button>`).join('')}</div>
    </div>` : `<p class="full hint-line ch-link-note">You'll get a link to invite friends as soon as it's created.</p>`}
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
  const err = !chDraft.title.trim() ? 'Give it a name.' : !goals.length ? 'Add at least one goal.' : !(end > start) ? 'The end date must be after the start.' : '';
  if (err) { $('#chErr').textContent = err; return; }
  const btn = e.submitter || $('#chForm .btn.solid'); btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const id = await api.createChallenge({ title: chDraft.title.trim(), startsAt: start, endsAt: end, memberIds: [...chDraft.friends], items: goals });
    chDlg.close();
    setView('friends');
    openChallenge(id);
    openInvite(api.challengeSync(id), true);
  } catch (ex) { $('#chErr').textContent = friendlyError(ex); }
  finally { btn.disabled = false; btn.textContent = 'Start challenge'; }
});

/* ---------- Wire up ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  const ftab = t.closest('[data-ftab]');
  if (ftab) { friendsTab = ftab.dataset.ftab; renderFriendsShell(); return; }
  if (t.closest('[data-new-ch]')) return requireProfile('Pick a name for your challenges. Friends will see it on the leaderboard.').then(openNewChallenge, () => {});
  if (t.closest('[data-join-link]')) return openPaste();
  const mt = t.closest('[data-metoo]');
  if (mt) return meToo(mt.dataset.metoo);
  if (t.closest('[data-share-list]')) return setShareList(t.closest('[data-share-list]').dataset.shareList === 'on');
  const inv = t.closest('[data-invite]');
  if (inv) return openInvite(api.challengeSync(inv.dataset.invite));
  const och = t.closest('[data-open-ch]');
  if (och) return openChallenge(och.dataset.openCh);
  const ci = t.closest('[data-complete-item]');
  if (ci) return openProof(ci.dataset.completeItem);
  const pr = t.closest('[data-proof]');
  if (pr) return openProofViewer(pr.dataset.proof);
  const add = t.closest('[data-ch-add]');
  if (add) {
    if (!ME) return;
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
function onEntryUpdated(it) { if (it.done && S.activities.some(a => a.actorId === ME && a.entryId === it.id)) api.publishEntry(it); }
function onEntryReopened(it) { api.unpublishEntry(it.id); }
function renderFriends() {
  localStorage.setItem('bucketlist.feedSeen', Date.now());
  updateFriendsBadge();
  renderFriendsShell();
}

startSocial();
