// Sends the due weekly-goal reminders as Web Push notifications.
// Run by .github/workflows/reminders.yml. Secrets: CRON_KEY (matches private.secrets 'cron'), VAPID_PRIVATE.
import webpush from 'web-push';

const SB = 'https://iocnvwefmlqbgotekhhp.supabase.co';
const KEY = 'sb_publishable_qqVElf-BIE6ShN2qrz0meQ_DKsTFlIW';
const VAPID_PUBLIC = 'BKLKFz3AAHsj4HF6aDzg8VIbcR61rNsKv1eUMeiKinDadDXW4-65K7v6VRDhgorxJGcqWfhZe5m2effdu8-YPw0';
const SITE = 'https://alfonsodlfr.github.io/bucket-list/';

webpush.setVapidDetails('mailto:alfonsodlfr@users.noreply.github.com', VAPID_PUBLIC, process.env.VAPID_PRIVATE);
const rpc = async (fn, body) => {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ key: process.env.CRON_KEY, ...body }) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};

let due;
try { due = await rpc('take_due_reminders', {}); }
catch (e) { if (/PGRST202/.test(e.message)) { console.log('Reminders not set up in the database yet'); process.exit(0); } throw e; }
console.log(`${due.length} reminder(s) due`);
for (const d of due) {
  const left = d.times - d.count;
  const body = d.count
    ? `${d.count} of ${d.times} so far this week. ${left} more to go — still time.`
    : `None logged yet this week. ${d.times} to go — still time.`;
  try {
    await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
      JSON.stringify({ title: d.title, body, tag: `habit-${d.entry_id}`, url: `${SITE}#entry/${d.entry_id}` }), { TTL: 6 * 3600 });
  } catch (e) {
    console.warn('push failed', e.statusCode);
    if (e.statusCode === 404 || e.statusCode === 410) await rpc('drop_push_sub', { gone: d.endpoint }); // the device unsubscribed
  }
}
