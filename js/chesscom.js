// Chess.com public API (https://www.chess.com/news/view/published-data-api). No key needed, CORS-enabled.

const API = 'https://api.chess.com/pub/player';
const LOSS = new Set(['checkmated', 'timeout', 'resigned', 'lose', 'abandoned', 'kingofthehill', 'threecheck', 'bughousepartnerlose']);

export function resultFor(code) {
  if (code === 'win') return 'win';
  return LOSS.has(code) ? 'loss' : 'draw';
}

// "https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3-e5" -> "Sicilian Defense Najdorf Variation"
export function openingFromEcoUrl(url) {
  if (!url) return '';
  // Chess.com appends the move sequence: "-6.Be3" or "...5.Bd3"; cut at the first one.
  const slug = decodeURIComponent(String(url).split('/openings/')[1] || '').split(/[?#]/)[0].replace(/\.{3}.*$/, '');
  const words = [];
  for (const w of slug.split('-')) {
    if (/^\d/.test(w) || /^\.\.\./.test(w)) break;
    if (w) words.push(w);
  }
  return words.join(' ');
}

export function normalizeGame(g, username) {
  const me = username.toLowerCase();
  const color = g.white.username.toLowerCase() === me ? 'w' : 'b';
  const mine = color === 'w' ? g.white : g.black;
  const theirs = color === 'w' ? g.black : g.white;
  return {
    id: g.url || g.uuid,
    url: g.url,
    pgn: g.pgn,
    timeClass: g.time_class,
    timeControl: g.time_control,
    rated: g.rated,
    end: (g.end_time || 0) * 1000,
    color,
    result: resultFor(mine.result),
    me: { name: mine.username, rating: mine.rating },
    opp: { name: theirs.username, rating: theirs.rating },
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    opening: openingFromEcoUrl(g.eco),
  };
}

async function getJSON(url) {
  const res = await fetch(url);
  if (res.status === 404) throw new Error('User not found on Chess.com');
  if (res.status === 429) throw new Error('Chess.com is rate-limiting requests, try again in a minute');
  if (!res.ok) throw Object.assign(new Error('Chess.com returned HTTP {v}'), { params: { v: res.status } });
  return res.json();
}

// Newest games first, walking monthly archives backwards until `max` games or `maxMonths` months.
export async function fetchRecentGames(username, { max = 60, maxMonths = 6 } = {}) {
  const user = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,25}$/.test(user)) throw new Error('Enter a valid Chess.com username');
  const { archives = [] } = await getJSON(`${API}/${encodeURIComponent(user)}/games/archives`);
  const games = [];
  for (const url of archives.slice(-maxMonths).reverse()) {
    const { games: month = [] } = await getJSON(url);
    for (const g of month.reverse()) {
      if (g.rules === 'chess' && g.pgn) games.push(normalizeGame(g, user));
      if (games.length >= max) return games;
    }
  }
  return games;
}
