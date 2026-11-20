/* ===================================================================
   Settings: your profile (name, @username) and preferences.
   Opened from the gear at the top-right of My list.
   =================================================================== */
const settingsDlg = $('#settingsDlg');
function openSettings() { renderSettings(); settingsDlg.showModal(); }
function renderSettings() {
  const me = typeof ME !== 'undefined' && ME ? api.profile(ME) : null;
  const liked = likedTypes();
  const handles = document.body.classList.contains('handles-on');
  const notif = !('Notification' in window) ? 'Not available in this browser' : Notification.permission === 'granted' ? 'On' : Notification.permission === 'denied' ? 'Blocked in your phone’s settings' : 'Not allowed yet';
  $('#settingsBody').innerHTML = `
    <h2>Settings</h2>
    <section class="st-sec">
      <div class="eyebrow">Profile</div>
      ${me ? `<div class="st-me">
          <span class="st-av" style="background:${esc(me.color || '#555')}">${esc((me.name || '?').slice(0, 1).toUpperCase())}</span>
          <span class="st-who"><b>${esc(me.name)}</b>${handles && me.username ? `<small>@${esc(me.username)}</small>` : ''}</span>
        </div>
        <form class="st-name" id="stNameForm"><input name="name" maxlength="40" value="${esc(me.name)}" aria-label="Your name"><button class="btn small">Save</button></form>
        ${handles && me.username ? `<form class="st-handle" id="stHandleForm"><input name="handle" maxlength="24" value="${esc(me.username)}" aria-label="Your username" autocapitalize="none" autocorrect="off" spellcheck="false"><button class="btn small">Change</button></form>
          <p class="hint-line" id="stHandleErr" style="margin:0">Friends find you by it. Letters, numbers, dots and underscores.</p>
          <button class="link-quiet" data-st="share-handle">Share your @username</button>` : ''}`
      : `<p class="hint-line">You don’t have a profile yet. It’s just a name${handles ? ' and an @username' : ''}, so friends can find you.</p>
         <button class="btn solid" data-st="create-profile">Create my profile</button>`}
    </section>
    <section class="st-sec">
      <div class="eyebrow">What you’re into</div>
      <p class="hint-line">Shapes ideas in Explore and Recommended on the map.</p>
      <div class="st-chips">${Object.entries(TYPES).filter(([k]) => k !== 'other').map(([k, t]) => `<button type="button" class="chip ${!liked || liked.has(k) ? 'active' : ''}" data-st-type="${k}">${t.label}</button>`).join('')}</div>
    </section>
    <section class="st-sec">
      <div class="eyebrow">Preferences</div>
      <label class="switch"><input type="checkbox" data-st="daily" ${dailyOn() ? 'checked' : ''}><span class="track"></span><span class="sw-text"><b>Challenge of the day</b><small>A small push out of your comfort zone, on My list</small></span></label>
      <div class="st-row"><span>Layout of My list</span><div class="seg"><button type="button" data-st-layout="grid" class="${layout === 'grid' ? 'on' : ''}">Grid</button><button type="button" data-st-layout="rails" class="${layout === 'rails' ? 'on' : ''}">Rails</button></div></div>
      ${me ? `<label class="switch"><input type="checkbox" data-st="share-list" ${me.shareList !== false ? 'checked' : ''}><span class="track"></span><span class="sw-text"><b>Friends can see my goals</b><small>Only titles, so you can find goals you share</small></span></label>` : ''}
      <div class="st-row"><span>Notifications</span><small>${notif}</small></div>
    </section>
    <p class="st-foot">The List · your list lives on this phone; shared things live with your friends.</p>`;
}
settingsDlg.addEventListener('click', e => {
  const t = e.target.closest('[data-st-type]');
  if (t) {
    t.classList.toggle('active');
    const on = [...settingsDlg.querySelectorAll('[data-st-type].active')].map(b => b.dataset.stType);
    savePrefs(on.length ? on : Object.keys(TYPES));
    if (typeof regenerateIdeas === 'function') regenerateIdeas();
    return;
  }
  const l = e.target.closest('[data-st-layout]');
  if (l) { layout = l.dataset.stLayout; localStorage.setItem('bucketlist.layout', layout); render(); return renderSettings(); }
  const a = e.target.closest('button[data-st]')?.dataset.st;
  if (a === 'create-profile') { settingsDlg.close(); requireProfile('Your name is how friends see you.').then(() => openSettings()).catch(() => {}); }
  if (a === 'share-handle') shareHandle();
});
settingsDlg.addEventListener('change', e => {
  const a = e.target.dataset.st;
  if (a === 'daily') { localStorage.setItem('bucketlist.dailyOff', e.target.checked ? '0' : '1'); renderDaily(); }
  if (a === 'share-list') setShareList(e.target.checked);
});
settingsDlg.addEventListener('submit', async e => {
  if (e.target.id === 'stHandleForm') {
    e.preventDefault();
    const h = e.target.handle.value.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9._]{3,24}$/.test(h)) { $('#stHandleErr').textContent = '3–24 letters, numbers, dots or underscores.'; return; }
    try { await changeUsername(h); toast(`You’re @${h} now`); renderSettings(); }
    catch (err) { $('#stHandleErr').textContent = /taken/.test(err.message) ? `@${h} is taken. Try another.` : 'Couldn’t save. Try again online.'; }
    return;
  }
  if (e.target.id !== 'stNameForm') return;
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name) return;
  try { await renameProfile(name); toast('Name saved'); renderSettings(); } catch { toast('Couldn’t save. Try again online.'); }
});
document.addEventListener('click', e => { if (e.target.closest('[data-open-settings]')) openSettings(); });
