/* ===================================================================
   Challenge of the day: one small, positive push out of your comfort
   zone. Everyone gets the same one on the same day; the order is a
   fixed shuffle, so it only repeats after every challenge has had a day.
   Done days are kept in localStorage (bucketlist.daily).
   =================================================================== */
const DAILY = [
  // Kindness
  ['Give someone a genuine compliment', 'Kindness', 'Something specific, not just “nice shirt”.'],
  ['Send a thank-you message to someone who helped you', 'Kindness', 'Even if it was years ago.'],
  ['Pay for a stranger’s coffee', 'Kindness', 'Or leave a bigger tip than usual.'],
  ['Write a handwritten note and leave it for someone', 'Kindness', 'On a desk, a fridge, a windscreen.'],
  ['Ask someone how they really are, and listen', 'Kindness', 'No advice, no phone.'],
  ['Tell a friend what you admire about them', 'Kindness', 'Out loud or in a message.'],
  ['Donate something you no longer use', 'Kindness', 'Clothes, books, a lamp: one bag is enough.'],
  ['Leave a glowing review for a small local business', 'Kindness', 'Name the person who served you.'],
  ['Hold a door, carry a bag, give up a seat', 'Kindness', 'Look for one chance today.'],
  ['Cook or bake something for a neighbour', 'Kindness', 'It doesn’t have to be fancy.'],
  ['Thank someone whose work usually goes unnoticed', 'Kindness', 'The cleaner, the driver, the night shift.'],
  ['Forgive someone, even if just in your head', 'Kindness', 'Let one old grudge go.'],
  ['Introduce two people who should know each other', 'Kindness', 'One message, two names.'],
  ['Pick up five pieces of litter', 'Kindness', 'On your walk, at the beach, in the park.'],
  // Connection
  ['Call a friend instead of texting', 'Connection', 'Ten minutes, voice only.'],
  ['Call a grandparent or an older relative', 'Connection', 'Ask them about a place they loved.'],
  ['Have lunch without your phone on the table', 'Connection', 'Notice who and what is around you.'],
  ['Strike up a conversation with a stranger', 'Connection', 'A shop assistant, a neighbour, someone in a queue.'],
  ['Reconnect with someone you’ve lost touch with', 'Connection', '“I was just thinking of you.”'],
  ['Plan a get-together for this month', 'Connection', 'Pick a date and send the invite today.'],
  ['Ask someone for their story', 'Connection', 'How did they end up where they are?'],
  ['Learn the name of a neighbour', 'Connection', 'And use it next time.'],
  ['Share a meal with someone new', 'Connection', 'A colleague, a classmate, a friend of a friend.'],
  ['Send a voice note to someone far away', 'Connection', 'Tell them about your day.'],
  ['Say yes to an invitation you’d usually decline', 'Connection', 'Go for at least an hour.'],
  ['Tell someone you love them', 'Connection', 'Family counts. Friends count.'],
  ['Ask for help with something', 'Connection', 'It lets people feel useful.'],
  // Body
  ['Go for a 30-minute walk', 'Body', 'No podcast. Just walk.'],
  ['Complete a hike', 'Body', 'Any trail, any length, as long as it climbs.'],
  ['Take the stairs all day', 'Body', 'Every lift you skip counts.'],
  ['Do 50 squats, spread over the day', 'Body', 'Ten at a time is fine.'],
  ['Stretch for 15 minutes', 'Body', 'Hips, back, shoulders.'],
  ['Go for a run, even a short one', 'Body', 'Two kilometres is a run.'],
  ['Drink two litres of water', 'Body', 'Keep a bottle in sight.'],
  ['Cook a meal from scratch', 'Body', 'Nothing from a packet.'],
  ['Eat five different vegetables today', 'Body', 'Count them.'],
  ['Go to bed an hour earlier', 'Body', 'Screens off before you get in.'],
  ['Try a class you’ve never done', 'Body', 'Yoga, climbing, boxing, dance.'],
  ['Cycle somewhere instead of driving', 'Body', 'Or walk it.'],
  ['Hold a plank for as long as you can', 'Body', 'Then try to beat it tonight.'],
  ['Take a cold shower', 'Body', 'Thirty seconds at the end counts.'],
  ['Skip sugar for the day', 'Body', 'Read the labels.'],
  ['Dance to three songs', 'Body', 'Alone in the kitchen is perfect.'],
  ['Swim somewhere', 'Body', 'A pool, a lake, the sea.'],
  // Outdoors
  ['Watch the sunrise', 'Outdoors', 'Set the alarm, bring something warm.'],
  ['Watch the sunset somewhere new', 'Outdoors', 'A rooftop, a hill, a bridge.'],
  ['Spend an hour in a park', 'Outdoors', 'No plan, no phone.'],
  ['Walk a route you’ve never taken', 'Outdoors', 'Turn left where you’d go right.'],
  ['Eat a meal outside', 'Outdoors', 'Breakfast on a step counts.'],
  ['Find a tree and learn its name', 'Outdoors', 'There’s an app for that, or ask someone.'],
  ['Go stargazing', 'Outdoors', 'Find one constellation.'],
  ['Visit a viewpoint in your city', 'Outdoors', 'Climb up and look at where you live.'],
  ['Touch the sea, a river or a lake', 'Outdoors', 'Feet in the water.'],
  ['Take a walk in the rain', 'Outdoors', 'On purpose.'],
  ['Explore a neighbourhood you’ve never walked', 'Outdoors', 'Get a coffee there.'],
  ['Picnic somewhere green', 'Outdoors', 'Bring a blanket and someone.'],
  // Mind
  ['Read for an hour', 'Mind', 'One sitting, one book.'],
  ['Meditate for ten minutes', 'Mind', 'Sit, breathe, start again when you drift.'],
  ['Write down three things you’re grateful for', 'Mind', 'Be specific.'],
  ['Spend two hours without your phone', 'Mind', 'Put it in another room.'],
  ['Journal for ten minutes', 'Mind', 'Start with “Today I noticed…”.'],
  ['Delete one app that wastes your time', 'Mind', 'You can always reinstall it.'],
  ['Unfollow ten accounts that don’t make you feel good', 'Mind', 'Make your feed lighter.'],
  ['Do one thing you’ve been putting off', 'Mind', 'The email, the call, the form.'],
  ['Tidy one drawer, shelf or corner', 'Mind', 'Small spaces, big relief.'],
  ['Write a letter to your future self', 'Mind', 'Open it in a year.'],
  ['Go one day without complaining', 'Mind', 'Catch yourself and rephrase.'],
  ['Sit in silence for 15 minutes', 'Mind', 'No music, no screen.'],
  ['Plan your ideal day, then do one part of it', 'Mind', 'Even a small one.'],
  ['Write down a fear and one step to face it', 'Mind', 'Then take the step this week.'],
  ['Single-task for the whole morning', 'Mind', 'One thing at a time.'],
  // Learning
  ['Learn ten words in a new language', 'Learning', 'Say them out loud.'],
  ['Watch a documentary on a topic you know nothing about', 'Learning', 'Pick the strangest one.'],
  ['Learn to cook a dish from another country', 'Learning', 'Start with one you’ve eaten on a trip.'],
  ['Learn a song on an instrument, or try one', 'Learning', 'Four chords are enough.'],
  ['Read a long article from start to finish', 'Learning', 'No skimming.'],
  ['Learn a card trick or a magic trick', 'Learning', 'Then show someone.'],
  ['Visit a museum or gallery', 'Learning', 'Spend time with just three pieces.'],
  ['Learn basic first aid', 'Learning', 'Watch a CPR video; it could matter.'],
  ['Teach someone something you know', 'Learning', 'Explaining it teaches you too.'],
  ['Learn the history of your street or town', 'Learning', 'Who lived there before?'],
  ['Listen to a podcast in another language', 'Learning', 'Even if you only catch some words.'],
  ['Memorise a short poem', 'Learning', 'Recite it before bed.'],
  ['Learn to tie a new knot', 'Learning', 'The bowline is a good start.'],
  // Creativity
  ['Take ten photos of ordinary things', 'Creativity', 'Make them look beautiful.'],
  ['Draw something you can see', 'Creativity', 'Ten minutes, any skill level.'],
  ['Write a short poem or a six-word story', 'Creativity', 'Then keep it somewhere.'],
  ['Make a playlist for someone', 'Creativity', 'Ten songs that remind you of them.'],
  ['Cook without a recipe', 'Creativity', 'Trust your nose.'],
  ['Rearrange a room', 'Creativity', 'Move one big thing.'],
  ['Build something with your hands', 'Creativity', 'A shelf, a kite, a paper plane.'],
  ['Write the first page of a story', 'Creativity', 'Start in the middle of something.'],
  ['Make a short video of your day', 'Creativity', 'One second of every hour.'],
  ['Sing out loud', 'Creativity', 'In the shower counts.'],
  ['Plant something', 'Creativity', 'A seed, a herb, a cutting.'],
  // Courage
  ['Say yes to something that scares you a little', 'Courage', 'Small fear, real yes.'],
  ['Speak up in a meeting or a group', 'Courage', 'One idea, out loud.'],
  ['Eat alone in a restaurant', 'Courage', 'No phone. Enjoy it.'],
  ['Ask for what you want', 'Courage', 'A raise, a favour, a table by the window.'],
  ['Try a food you’ve always avoided', 'Courage', 'One proper bite.'],
  ['Go to the cinema alone', 'Courage', 'Pick a film you’d never choose.'],
  ['Post something you made', 'Courage', 'A photo, a drawing, a few words.'],
  ['Give honest, kind feedback', 'Courage', 'Something you’ve been holding back.'],
  ['Say no to something you don’t want to do', 'Courage', 'Politely, without a long excuse.'],
  ['Admit a mistake to someone', 'Courage', 'Own it, simply.'],
  ['Sign up for something you’ve been curious about', 'Courage', 'A course, a race, a club.'],
  ['Ask a question you think is silly', 'Courage', 'Others are wondering too.'],
  ['Go somewhere you’ve never been, alone', 'Courage', 'A café, a market, a town nearby.'],
  // Calm
  ['Take a bath or a long shower, no screens', 'Calm', 'Candles optional.'],
  ['Have a slow breakfast', 'Calm', 'Sit down. Taste it.'],
  ['Breathe: four seconds in, six out, for five minutes', 'Calm', 'Slower than feels natural.'],
  ['Spend an evening without screens', 'Calm', 'Books, board games, conversation.'],
  ['Take a nap without guilt', 'Calm', 'Twenty minutes.'],
  ['Make tea and drink it doing nothing else', 'Calm', 'Watch the steam.'],
  ['Go to a library and stay an hour', 'Calm', 'Read whatever catches your eye.'],
  ['Listen to a whole album, start to finish', 'Calm', 'Lie down. Eyes closed.'],
  ['Clear your inbox, or just today’s', 'Calm', 'Archive is your friend.'],
  ['Put your phone on grayscale for the day', 'Calm', 'Notice how often you reach for it.'],
];
const DAILY_KEY = 'bucketlist.daily';
// A fixed shuffle (seeded), so the order is the same for everyone and nothing repeats for 120 days
const DAILY_ORDER = (() => {
  const idx = DAILY.map((_, i) => i);
  let seed = 20261120;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
})();
const localDayNo = (t = Date.now()) => { const d = new Date(t); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5); };
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dailyToday = () => DAILY[DAILY_ORDER[localDayNo() % DAILY.length]];
const dailyDone = () => { try { return JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch { return {}; } };
const dailyOn = () => localStorage.getItem('bucketlist.dailyOff') !== '1';
function renderDaily() {
  const el = $('#dailyCard');
  if (!el) return;
  if (!dailyOn()) { el.hidden = true; return; }
  const [title, cat, hint] = dailyToday(), done = dailyDone(), isDone = !!done[todayKey()], n = Object.keys(done).length;
  el.hidden = false;
  el.classList.toggle('done', isDone);
  el.innerHTML = `
    <div class="dc-top"><span class="eyebrow gold-eye">Challenge of the day · ${esc(cat)}</span>${n ? `<span class="dc-count">${n} done</span>` : ''}</div>
    <h3>${esc(title)}</h3>
    <p>${isDone ? 'Done. A new one tomorrow.' : esc(hint)}</p>
    <button class="btn ${isDone ? '' : 'solid'} small" data-daily="${isDone ? 'undo' : 'done'}">${isDone ? '✓ Done today' : 'I did it'}</button>`;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-daily]')?.dataset.daily;
  if (!a) return;
  const done = dailyDone(), k = todayKey();
  if (a === 'done') { done[k] = DAILY_ORDER[localDayNo() % DAILY.length]; toast('Nice one. See you tomorrow'); }
  else delete done[k];
  localStorage.setItem(DAILY_KEY, JSON.stringify(done));
  renderDaily();
});
// A new day while the app stays open
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderDaily(); });
