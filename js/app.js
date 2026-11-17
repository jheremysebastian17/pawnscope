import { parseGame, terminalScore, classifyGame, summarize, winPercent, formatScore, uciLineToSan, CLASSES } from './analysis.js';
import { commentMove } from './commentary.js';
import { fetchRecentGames, openingFromEcoUrl } from './chesscom.js';
import { Engine } from './engine.js';
import { renderBoard, META } from './board.js';
import { renderGraph, plyFromEvent } from './graph.js';
import { LANGS, t, setLang, getLang, fmtNum, fmtDate } from './i18n.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const errText = (err) => t(err.message, err.params);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ---------- Theme ----------
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
const syncThemeMeta = () => { document.querySelector('meta[name="theme-color"]').content = currentTheme() === 'dark' ? '#11151c' : '#f4f5f8'; };
$('theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('pawnscope-theme', next);
  syncThemeMeta();
});
syncThemeMeta();

// ---------- Language ----------
$('lang-select').innerHTML = Object.entries(LANGS).map(([c, l]) => `<option value="${c}">${l}</option>`).join('');
function applyLang(lang) {
  setLang(lang);
  document.documentElement.lang = getLang();
  $('lang-select').value = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  renderGames();
  if (review) renderReview();
}
$('lang-select').addEventListener('change', (e) => { store.set('pawnscope-lang', e.target.value); applyLang(e.target.value); });

// ---------- Games list ----------
let games = [];
let filters = { time: 'all', result: 'all' };

$('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = $('username').value.trim();
  $('games-error').textContent = '';
  $('load-btn').disabled = true;
  $('load-btn').textContent = t('Loading games…');
  try {
    games = await fetchRecentGames(user);
    store.set('pawnscope-user', user);
    $('games-area').hidden = false;
    renderGames();
  } catch (err) {
    $('games-error').textContent = err instanceof TypeError ? t('Could not reach Chess.com') : errText(err);
  } finally {
    $('load-btn').disabled = false;
    $('load-btn').textContent = t('Load games');
  }
});

for (const [id, key] of [['f-time', 'time'], ['f-result', 'result']]) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    filters[key] = b.dataset.v;
    $(id).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    renderGames();
  });
}

const RESULT_LABEL = { win: 'Win', loss: 'Loss', draw: 'Draw' };
function renderGames() {
  if (!games.length && $('games-area').hidden) return;
  const list = games.filter((g) => (filters.time === 'all' || g.timeClass === filters.time) && (filters.result === 'all' || g.result === filters.result));
  $('games-count').textContent = t('{n} games', { n: fmtNum(list.length) });
  $('game-list').innerHTML = list.length ? list.map((g) => {
    const cached = cacheGet(g.id, Number($('depth').value));
    return `<li class="game ${g.result}">
      <span class="stripe"></span>
      <div class="game-main">
        <div class="game-players"><span class="dot ${g.color}"></span>${esc(g.me.name)} <span class="rating">(${esc(g.me.rating)})</span> vs ${esc(g.opp.name)} <span class="rating">(${esc(g.opp.rating)})</span></div>
        <div class="game-meta"><span>${esc(fmtDate(g.end))}</span><span>${esc(t(g.timeClass[0].toUpperCase() + g.timeClass.slice(1)))}</span>${g.opening ? `<span>${esc(g.opening)}</span>` : ''}</div>
      </div>
      <div class="game-side">
        <span class="res ${g.result}">${esc(t(RESULT_LABEL[g.result]))}</span>
        ${cached ? `<span class="done">✓ ${esc(t('Reviewed'))}</span>` : ''}
        <button type="button" data-review="${esc(g.id)}">${esc(t('Review'))}</button>
      </div>
    </li>`;
  }).join('') : `<li class="panel">${esc(t('No games match these filters.'))}</li>`;
}
$('game-list').addEventListener('click', (e) => {
  const id = e.target.closest('[data-review]')?.dataset.review;
  const g = games.find((x) => x.id === id);
  if (g) openReview({ pgn: g.pgn, id: g.id, url: g.url, flip: g.color === 'b', opening: g.opening });
});

$('pgn-btn').addEventListener('click', () => {
  const pgn = $('pgn-input').value.trim();
  if (!pgn) { $('games-error').textContent = t('Paste a PGN first'); return; }
  openReview({ pgn, id: `pgn:${hash(pgn)}`, url: null, flip: false, opening: '' });
});

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// ---------- Analysis cache (per game + depth, newest 40 kept) ----------
const CACHE_INDEX = 'pawnscope-cache-index';
const cacheKey = (id, depth) => `pawnscope-a:${depth}:${id}`;
function cacheGet(id, depth) {
  try { return JSON.parse(store.get(cacheKey(id, depth))); } catch { return null; }
}
function cachePut(id, depth, evals) {
  const key = cacheKey(id, depth);
  let index = [];
  try { index = JSON.parse(store.get(CACHE_INDEX)) || []; } catch { /* corrupted index: start over */ }
  index = [key, ...index.filter((k) => k !== key)];
  for (const old of index.splice(40)) store.del(old);
  // If storage is full, drop the oldest entries until the new one fits.
  while (!store.set(key, JSON.stringify(evals)) && index.length > 1) store.del(index.pop());
  store.set(CACHE_INDEX, JSON.stringify(index));
}

// ---------- Review ----------
let review = null; // { game, meta, evals, classified, ply, flip, done }
let engine = null;
let runId = 0;

function openReview(meta) {
  let game;
  try { game = parseGame(meta.pgn); } catch { $('games-error').textContent = t('Invalid PGN'); return; }
  if (!game.moves.length) { $('games-error').textContent = t('Invalid PGN'); return; }
  $('games-error').textContent = '';
  const opening = meta.opening || openingFromEcoUrl(game.headers.ECOUrl) || game.headers.Opening || '';
  review = { game, meta: { ...meta, opening }, evals: new Array(game.fens.length).fill(null), classified: [], ply: 0, flip: meta.flip, done: false };
  $('view-games').hidden = true;
  $('view-review').hidden = false;
  window.scrollTo(0, 0);
  history.pushState({ review: true }, '');
  renderReview();
  analyze();
}

function closeReview() {
  runId++;
  engine?.terminate(); // stop any search in progress; a fresh worker is created next time
  engine = null;
  review = null;
  $('view-review').hidden = true;
  $('view-games').hidden = false;
  renderGames();
}
$('back-btn').addEventListener('click', () => history.back());
addEventListener('popstate', () => { if (review) closeReview(); });

async function analyze() {
  const id = ++runId;
  const r = review;
  const depth = Number($('depth').value);
  const cached = cacheGet(r.meta.id, depth);
  if (cached && cached.length === r.evals.length) {
    r.evals = cached;
    finish(r);
    return;
  }
  r.done = false;
  setProgress(0, t('Loading engine…'));
  try {
    engine ??= new Engine();
    await engine.newGame();
    for (let k = 0; k < r.game.fens.length; k++) {
      if (id !== runId) return;
      const fen = r.game.fens[k];
      const term = terminalScore(fen);
      r.evals[k] = term ? { score: term, best: null, pv: [], second: null } : await engine.analyze(fen, depth);
      if (id !== runId) return;
      r.classified = classifyGame(r.game, r.evals);
      setProgress((k + 1) / r.game.fens.length, t('Analyzing… {p}%', { p: Math.round(((k + 1) / r.game.fens.length) * 100) }));
      renderReview();
    }
    cachePut(r.meta.id, depth, r.evals.map((e) => ({ ...e, pv: e.pv.slice(0, 6) })));
    finish(r);
  } catch (err) {
    setProgress(0, t('Engine error: {v}', { v: err.message }));
  }
}

function finish(r) {
  r.classified = classifyGame(r.game, r.evals);
  r.done = true;
  setProgress(1, t('Analysis complete'));
  renderReview();
}

function setProgress(frac, text) {
  $('progress-bar').style.width = `${Math.round(frac * 100)}%`;
  $('progress-text').textContent = text;
}

$('depth').addEventListener('change', () => {
  if (!review) return;
  runId++;
  engine?.terminate();
  engine = null;
  review.evals = new Array(review.game.fens.length).fill(null);
  review.classified = [];
  renderReview();
  analyze();
});

function go(ply) {
  if (!review) return;
  review.ply = Math.max(0, Math.min(review.game.moves.length, ply));
  renderReview();
}
$('nav-first').addEventListener('click', () => go(0));
$('nav-prev').addEventListener('click', () => go(review.ply - 1));
$('nav-next').addEventListener('click', () => go(review.ply + 1));
$('nav-last').addEventListener('click', () => go(review.game.moves.length));
$('nav-flip').addEventListener('click', () => { review.flip = !review.flip; renderReview(); });
$('show-best').addEventListener('change', () => renderReview());
$('moves').addEventListener('click', (e) => { const p = e.target.closest('[data-ply]')?.dataset.ply; if (p) go(Number(p)); });
$('graph').addEventListener('click', (e) => go(plyFromEvent($('graph'), e, review.game.fens.length)));
addEventListener('keydown', (e) => {
  if (!review || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const map = { ArrowLeft: review.ply - 1, ArrowRight: review.ply + 1, Home: 0, End: review.game.moves.length };
  if (e.key in map) { e.preventDefault(); go(map[e.key]); }
});

const playerName = (side) => {
  const h = review.game.headers;
  const name = side === 'w' ? h.White : h.Black;
  const elo = side === 'w' ? h.WhiteElo : h.BlackElo;
  return `${name || t(side === 'w' ? 'White' : 'Black')}${elo ? ` (${elo})` : ''}`;
};

function renderReview() {
  const r = review;
  if (!r) return;
  const { game, evals, classified, ply } = r;
  const move = ply > 0 ? game.moves[ply - 1] : null;
  const info = ply > 0 ? classified[ply - 1] : null;
  const summary = summarize(game, classified);

  // Header and player tags (bottom = side the board is oriented for).
  $('review-title').textContent = `${playerName('w')} – ${playerName('b')}${r.meta.opening ? ` · ${r.meta.opening}` : ''}`;
  $('open-link').hidden = !r.meta.url;
  if (r.meta.url) $('open-link').href = r.meta.url;
  const tag = (side) => `<span>${side === 'w' ? '♔' : '♚'} ${esc(playerName(side))}</span>${summary[side].n && r.done ? `<span class="acc">${fmtNum(summary[side].accuracy, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%</span>` : ''}`;
  $('tag-top').innerHTML = tag(r.flip ? 'w' : 'b');
  $('tag-bottom').innerHTML = tag(r.flip ? 'b' : 'w');

  // Board with the played move, its class badge, and the engine's best move.
  renderBoard($('board'), {
    fen: game.fens[ply], flip: r.flip, move, cls: info?.cls,
    bestUci: ply > 0 ? evals[ply - 1]?.best : null, showBest: $('show-best').checked,
  });

  // Eval bar.
  const score = evals[ply]?.score;
  const wWin = score ? winPercent(score) : 50;
  $('evalbar-fill').style.height = `${wWin}%`;
  $('evalbar').classList.toggle('flip', r.flip);
  $('evalbar').classList.toggle('black-better', wWin < 50);
  $('evalbar-label').textContent = score ? formatScore(score).replace(/^\+/, '') : '…';

  // Analyst.
  const pill = $('analyst-cls');
  if (info) { pill.textContent = `${META[info.cls].sym} ${t(`cls.${info.cls}`)}`; pill.style.background = META[info.cls].color; } else pill.textContent = '';
  if (ply === 0) {
    $('analyst-text').innerHTML = `<p>${esc(t('intro'))}</p>${r.meta.opening ? `<p>${esc(t('cm.opening', { name: r.meta.opening }))}</p>` : ''}`;
    $('engine-line').textContent = '';
  } else if (!info) {
    $('analyst-text').innerHTML = `<p>${esc(t('Waiting for the engine…'))}</p>`;
    $('engine-line').textContent = '';
  } else {
    const lines = commentMove({ m: move, info, e0: evals[ply - 1], e1: evals[ply], ply: ply - 1, opening: r.meta.opening });
    $('analyst-text').innerHTML = lines.map((l) => `<p>${esc(t(l.key, l.params))}</p>`).join('');
    const e0 = evals[ply - 1];
    const showLine = !info.isBest && e0?.pv?.length;
    $('engine-line').textContent = showLine ? `${t('Engine line')}: ${uciLineToSan(move.fenBefore, e0.pv, 6).join(' ')} (${formatScore(e0.score)})` : '';
  }

  // Move list.
  let html = '';
  game.moves.forEach((m, i) => {
    if (m.color === 'w' || i === 0) html += `<li class="num">${Math.floor(i / 2) + 1}.</li>`;
    if (i === 0 && m.color === 'b') html += '<li></li>';
    const c = classified[i]?.cls;
    const sym = c ? `<span class="sym" style="color:${META[c].color}">${META[c].sym}</span>` : '<span class="sym"></span>';
    html += `<li><button type="button" data-ply="${i + 1}" class="${ply === i + 1 ? 'active' : ''}">${esc(m.san)}${sym}</button></li>`;
  });
  $('moves').innerHTML = html;
  // Scroll only the move list (scrollIntoView would also scroll the page and hide the board on phones).
  const list = $('moves'), active = list.querySelector('.active');
  if (active) {
    const top = active.offsetTop;
    if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - active.offsetHeight) list.scrollTop = top - list.clientHeight / 2;
  }

  // Graph.
  const wins = evals.map((e) => (e ? winPercent(e.score) : null));
  const known = [];
  for (const w of wins) { if (w === null) break; known.push(w); }
  renderGraph($('graph'), { wins: known, classes: classified.map((c) => c.cls), current: Math.min(ply, Math.max(0, known.length - 1)) });

  // Summary table.
  const cell = (side, k) => `<span class="n">${summary[side].counts[k]}</span>`;
  const acc = (side) => (summary[side].n ? fmtNum(summary[side].accuracy, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '–');
  $('summary').innerHTML = `<div class="summary">
    <span></span><span class="h">${esc(playerName('w'))}</span><span class="h">${esc(playerName('b'))}</span>
    <span class="lbl">${esc(t('Accuracy'))}</span><span class="acc">${acc('w')}</span><span class="acc">${acc('b')}</span>
    ${CLASSES.map((k) => `<span class="lbl"><span class="ico" style="background:${META[k].color}">${META[k].sym}</span>${esc(t(`cls.${k}`))}</span>${cell('w', k)}${cell('b', k)}`).join('')}
  </div>`;
}

// ---------- Boot ----------
const browserLang = (navigator.language || 'en').slice(0, 2);
$('username').value = store.get('pawnscope-user') || '';
applyLang(store.get('pawnscope-lang') || (LANGS[browserLang] ? browserLang : 'en'));
