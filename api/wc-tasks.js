// /api/wc-tasks — server-side Trello fetcher for samdavis-trackers WC dashboard
//
// Hits Trello API with credentials from env vars (never exposed to client),
// returns shaped JSON for the dashboard at samdavis-trackers.live/wc/.
//
// Env vars required (Vercel): TRELLO_API_KEY · TRELLO_TOKEN
// CORS: open (data is non-sensitive WC retreat planning)
// Cache: 30s edge cache to respect Trello rate limits

const BOARDS = [
  { id: '6a11187937ac4eaa28525387', name: 'Crossing', label: '🏔️ Crossing', cls: 'crossing', retreatDate: '2026-09-03', pl: 'Sam' },
  { id: '6a111942c5c07cfdf419ec3b', name: 'Oct',      label: '🍂 Oct',      cls: 'oct',      retreatDate: '2026-10-02', pl: 'Lockie' },
  { id: '6a11196b97b532308482e32e', name: 'Nov',      label: '🌧️ Nov',     cls: 'nov',      retreatDate: '2026-10-30', pl: 'Kieran' },
];

const PEOPLE = ['Sam', 'Lockie', 'Kieran'];
const HORIZONS = ['Overdue', 'This Week', 'Next 4 Weeks', 'Later'];

export default async function handler(req, res) {
  // CORS — open since data is non-sensitive
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const KEY = process.env.TRELLO_API_KEY;
  const TOKEN = process.env.TRELLO_TOKEN;
  if (!KEY || !TOKEN) {
    return res.status(500).json({ error: 'Missing TRELLO_API_KEY or TRELLO_TOKEN env var' });
  }

  const T = (path) => `https://api.trello.com/1${path}${path.includes('?') ? '&' : '?'}key=${KEY}&token=${TOKEN}`;

  async function fetchBoard(board) {
    const [lists, labels, cards, members] = await Promise.all([
      fetch(T(`/boards/${board.id}/lists?fields=name,closed`)).then(r => r.json()),
      fetch(T(`/boards/${board.id}/labels?fields=name,color&limit=50`)).then(r => r.json()),
      fetch(T(`/boards/${board.id}/cards?fields=name,due,dueComplete,idList,idLabels,idMembers,shortLink,closed&limit=200`)).then(r => r.json()),
      fetch(T(`/boards/${board.id}/members?fields=fullName,id`)).then(r => r.json()),
    ]);
    const listById = Object.fromEntries(lists.map(l => [l.id, l.name]));
    const labelById = Object.fromEntries(labels.map(l => [l.id, l.name]));
    const memberById = Object.fromEntries(members.map(m => [m.id, m.fullName.split(' ')[0]]));
    return cards.filter(c => !c.closed).map(c => {
      const listName = listById[c.idList] || '';
      const labelNames = c.idLabels.map(id => labelById[id]).filter(Boolean);
      const memberNames = c.idMembers.map(id => memberById[id]).filter(Boolean);
      const owners = labelNames.filter(n => PEOPLE.includes(n) || n === 'All');
      let horizon = HORIZONS.find(h => listName.includes(h));
      if (listName.includes('Done')) horizon = 'Done';
      if (listName.includes('Blocked')) horizon = 'Blocked';
      return {
        id: c.id, name: c.name, due: c.due, dueComplete: c.dueComplete,
        board: board.name, boardLabel: board.label, boardCls: board.cls,
        listName, horizon: horizon || 'Later',
        owners, memberNames, isTentative: labelNames.includes('Tentative'),
        url: `https://trello.com/c/${c.shortLink}`,
      };
    });
  }

  try {
    const all = await Promise.all(BOARDS.map(fetchBoard));
    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      boards: BOARDS,
      cards: all.flat(),
    });
  } catch (e) {
    console.error('wc-tasks fetch error:', e);
    return res.status(500).json({ error: e.message });
  }
}
