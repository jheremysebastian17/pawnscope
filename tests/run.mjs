// Run with: node tests/run.mjs
import assert from 'node:assert/strict';
import { winPercent, moveAccuracy, toWhitePov, isSacrifice, parseGame, terminalScore, classifyGame, summarize, formatScore, uciLineToSan, materialBalance } from '../js/analysis.js';
import { commentMove } from '../js/commentary.js';
import { resultFor, openingFromEcoUrl, normalizeGame } from '../js/chesscom.js';
import { Chess } from '../vendor/chess.js';
import { CLASSES } from '../js/analysis.js';
import { t, setLang, _dictsForTests } from '../js/i18n.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('Win percent and accuracy model', () => {
  assert.equal(winPercent({ cp: 0 }), 50);
  assert.ok(winPercent({ cp: 300 }) > 75 && winPercent({ cp: 300 }) < 80);
  assert.equal(winPercent({ cp: 5000 }), winPercent({ cp: 1000 }));
  assert.equal(winPercent({ mate: 3 }), 100);
  assert.equal(winPercent({ mate: -2 }), 0);
  assert.equal(winPercent({ mate: 0, loser: 'w' }), 0);
  assert.ok(Math.abs(moveAccuracy(0) - 100) < 0.01);
  assert.ok(moveAccuracy(30) < 30);
  assert.equal(moveAccuracy(500), 0);
  assert.deepEqual(toWhitePov({ cp: 120 }, 'b'), { cp: -120 });
  assert.deepEqual(toWhitePov({ mate: 2 }, 'b'), { mate: -2 });
});

test('Score formatting', () => {
  assert.equal(formatScore({ cp: 134 }), '+1.3');
  assert.equal(formatScore({ cp: -50 }), '-0.5');
  assert.equal(formatScore({ mate: 3 }), 'M3');
  assert.equal(formatScore({ mate: -1 }), '-M1');
  assert.equal(formatScore({ mate: 0, loser: 'b' }), '1-0');
});

test('PGN parsing and terminal positions', () => {
  const g = parseGame('[Event "t"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  assert.equal(g.moves.length, 4);
  assert.equal(g.fens.length, 5);
  assert.equal(g.moves[3].san, 'Qh4#');
  assert.equal(g.moves[3].uci, 'd8h4');
  assert.equal(g.moves[0].legalCount, 20);
  assert.deepEqual(terminalScore(g.fens[4]), { mate: 0, loser: 'w' });
  assert.equal(terminalScore(g.fens[1]), null);
  assert.deepEqual(uciLineToSan(START, ['e2e4', 'e7e5', 'g1f3']), ['e4', 'e5', 'Nf3']);
});

test('Sacrifice detection', () => {
  // Bxh7+ in a Greek-gift setup: bishop is taken by the king and not recovered in the first 2 plies.
  const fen = 'r1bq1rk1/pppn1ppp/4pn2/3p4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1';
  assert.equal(isSacrifice(fen, 'd3h7', ['f6h7', 'f3g5']), true);
  // A normal developing move is not a sacrifice.
  assert.equal(isSacrifice(START, 'g1f3', ['g8f6', 'b1c3']), false);
  // An even trade is not a sacrifice.
  const trade = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  assert.equal(isSacrifice(trade, 'e4d5', ['d8d5', 'b1c3']), false);
  assert.equal(materialBalance(new Chess(START), 'w'), 0);
  // Knight left en prise (c6 pawn can take it, nothing recaptures) counts even if the PV declines it.
  const offer = 'rnbqkbnr/pp1ppppp/2p5/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 2';
  assert.equal(isSacrifice(offer, 'c3d5', ['g8f6', 'd5f6']), true);
  // Knight to a safe square is not.
  assert.equal(isSacrifice(offer, 'c3e4', ['d7d5']), false);
  // Defended piece attacked only by a more valuable piece: no material is offered.
  const safe = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  assert.equal(isSacrifice(safe, 'b8c6', ['f1b5']), false);
});

// Helper: builds evals from White-POV cp values (one per position).
const evalsFrom = (cps, bests = []) => cps.map((cp, i) => ({ score: typeof cp === 'object' ? cp : { cp }, best: bests[i] ?? null, pv: [], second: null }));

test('Move classification thresholds', () => {
  const g = parseGame('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  const evals = evalsFrom([20, 30, 45, 0, 40, 40, { mate: 1 }, { mate: 0, loser: 'b' }], ['e2e4', 'c7c5', 'd2d4', 'b8c6', 'f1c4', 'g7g6', 'h5f7']);
  const c = classifyGame(g, evals);
  assert.equal(c[0].cls, 'best');                 // e4 = engine best
  assert.equal(c[1].cls, 'excellent');            // tiny loss
  assert.equal(c[5].cls, 'blunder');              // Nf6?? allows mate
  assert.equal(c[6].cls, 'best');                 // Qxf7# = best, mate
  const s = summarize(g, c);
  assert.equal(s.b.counts.blunder, 1);
  assert.ok(s.w.accuracy > s.b.accuracy);
});

test('Great, miss and forced moves', () => {
  // Only legal move -> forced.
  // Rook checks on the a-file and the bishop covers b8, so Kb7 is Black's only legal move.
  const forcedGame = parseGame('[SetUp "1"]\n[FEN "k7/8/8/4B3/8/8/8/R6K b - - 0 1"]\n\n1... Kb7 *');
  assert.equal(forcedGame.moves[0].legalCount, 1);
  const fe = [{ score: { cp: 900 }, best: 'a8b7', pv: [], second: null }, { score: { cp: 900 }, best: null, pv: [], second: null }];
  assert.equal(classifyGame(forcedGame, fe)[0].cls, 'forced');
  const g = parseGame('1. e4 e5 2. Nf3 Nc6');
  // Move 2 (e5) is best and the 2nd line is far worse -> great.
  const evals = [
    { score: { cp: 20 }, best: 'e2e4', pv: [], second: null },
    { score: { cp: 20 }, best: 'e7e5', pv: [], second: { cp: 400 } },
    { score: { cp: 20 }, best: 'g1f3', pv: [], second: null },
    { score: { cp: 20 }, best: 'b8c6', pv: [], second: null },
    { score: { cp: 20 }, best: null, pv: [], second: null },
  ];
  assert.equal(classifyGame(g, evals)[1].cls, 'great');
  // Opponent blunders (Black drops to -500 for White... i.e. White gets +500), then White misses it.
  const evals2 = [
    { score: { cp: 0 }, best: 'e2e4', pv: [], second: null },
    { score: { cp: 0 }, best: 'c7c5', pv: [], second: null },
    { score: { cp: 500 }, best: 'd2d4', pv: [], second: null },
    { score: { cp: 0 }, best: 'b8c6', pv: [], second: null },
    { score: { cp: 0 }, best: null, pv: [], second: null },
  ];
  const c2 = classifyGame(g, evals2);
  assert.equal(c2[1].cls, 'blunder');
  assert.equal(c2[2].cls, 'miss');
});

test('Analyst commentary', () => {
  const g = parseGame('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  const evals = evalsFrom([20, 30, 45, 0, 40, 40, { mate: 1 }, { mate: 0, loser: 'b' }], ['e2e4', 'c7c5', 'd2d4', 'b8c6', 'f1c4', 'g7g6', 'h5f7']);
  evals[6].best = 'h5f7';
  const c = classifyGame(g, evals);
  const at = (i) => commentMove({ m: g.moves[i], info: c[i], e0: evals[i], e1: evals[i + 1], ply: i, opening: 'Italian Game' });
  const first = at(0).map((l) => l.key);
  assert.deepEqual(first.slice(0, 2), ['cm.opening', 'cm.best']);
  const blunder = at(5);
  assert.equal(blunder[0].key, 'cm.blunder.best');
  assert.equal(blunder[0].params.best, 'g6');
  assert.ok(blunder.some((l) => l.key === 'cm.allowsMate' && l.params.n === 1 && l.params.reply === 'Qxf7#'));
  assert.deepEqual(at(6).map((l) => l.key), ['cm.checkmate']);
  // Capturing a piece is described.
  const g2 = parseGame('1. e4 d5 2. exd5');
  const ev2 = evalsFrom([20, 20, 20, 20], ['e2e4', 'd7d5', 'e4d5']);
  const c2 = classifyGame(g2, ev2);
  const cm = commentMove({ m: g2.moves[2], info: c2[2], e0: ev2[2], e1: ev2[3], ply: 2, opening: '' });
  assert.ok(cm.some((l) => l.key === 'cm.capture' && l.params.piece.t === 'piece.p'));
});

test('Chess.com helpers', () => {
  assert.equal(resultFor('win'), 'win');
  assert.equal(resultFor('timeout'), 'loss');
  assert.equal(resultFor('repetition'), 'draw');
  assert.equal(openingFromEcoUrl('https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3-e5'), 'Sicilian Defense Najdorf Variation');
  assert.equal(openingFromEcoUrl('https://www.chess.com/openings/Kings-Pawn-Opening'), 'Kings Pawn Opening');
  assert.equal(openingFromEcoUrl(undefined), '');
  assert.equal(openingFromEcoUrl('https://www.chess.com/openings/Queens-Gambit-Declined...5.Bd3-Nbd7'), 'Queens Gambit Declined');
  const n = normalizeGame({
    url: 'https://www.chess.com/game/live/1', pgn: '1. e4', time_class: 'blitz', time_control: '180', rated: true, end_time: 1700000000,
    white: { username: 'Opp', rating: 1200, result: 'win' }, black: { username: 'Me', rating: 1150, result: 'resigned' },
    eco: 'https://www.chess.com/openings/French-Defense-2.d4',
  }, 'me');
  assert.equal(n.color, 'b');
  assert.equal(n.result, 'loss');
  assert.equal(n.opp.name, 'Opp');
  assert.equal(n.opening, 'French Defense');
  assert.equal(n.end, 1700000000000);
});

test('Translations are complete', () => {
  const { en, ...others } = _dictsForTests;
  const ref = Object.keys(others.es).sort();
  for (const [code, d] of Object.entries(others)) assert.deepEqual(Object.keys(d).sort(), ref, `${code} keys differ from es`);
  for (const k of Object.keys(en)) assert.ok(k in others.es, `en key "${k}" missing in es`);
  // Every analyst sentence, class and piece key exists in English.
  const keys = ['cm.opening', 'cm.checkmate', 'cm.castle', 'cm.promote', 'cm.capture', 'cm.check', 'cm.missedMate', 'cm.mateComing', 'cm.allowsMate', 'cm.hangs', 'cm.reply',
    ...CLASSES.flatMap((c) => [`cls.${c}`, `cm.${c}`]), ...['good', 'inaccuracy', 'mistake', 'miss', 'blunder'].map((c) => `cm.${c}.best`),
    ...'pnbrqk'.split('').map((p) => `piece.${p}`), ...'nbrq'.split('').map((p) => `name.${p}`)];
  for (const k of keys) assert.ok(k in en, `missing English text for ${k}`);
});

test('Translator nests piece names', () => {
  setLang('es');
  assert.equal(t('cm.hangs', { reply: 'Bxf7', piece: { t: 'piece.r' } }), 'El rival puede jugar Bxf7 y ganar una torre.');
  setLang('de');
  assert.equal(t('cm.capture', { piece: { t: 'piece.q' } }), 'Er schlägt die Dame.');
  setLang('en');
  assert.equal(t('cls.blunder'), 'Blunder');
});

console.log(`\n${passed} tests passed`);
