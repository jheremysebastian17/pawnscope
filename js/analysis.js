// Turns engine evaluations into win chances, accuracy and move classifications.
// Pure functions (no DOM, no engine), so they are unit-tested in Node.
import { Chess } from '../vendor/chess.js';

export const CLASSES = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'];

// Scores are always from White's point of view: { cp } or { mate } (mate > 0: White mates).
// A finished game is { mate: 0, loser: 'w' | 'b' }.
export function toWhitePov(score, sideToMove) {
  if (!score) return null;
  const s = sideToMove === 'w' ? 1 : -1;
  return 'mate' in score ? { mate: score.mate * s } : { cp: score.cp * s };
}

// Lichess win-probability model (cp -> % chance for White).
export function winPercent(score) {
  if (!score) return 50;
  if ('mate' in score) {
    if (score.mate === 0) return score.loser === 'w' ? 0 : 100;
    return score.mate > 0 ? 100 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

const forSide = (win, color) => (color === 'w' ? win : 100 - win);

// Lichess per-move accuracy from the drop in win chance.
export function moveAccuracy(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export function materialBalance(chess, color) {
  let sum = 0;
  for (const row of chess.board()) for (const sq of row) if (sq) sum += (sq.color === color ? 1 : -1) * VALUES[sq.type];
  return sum;
}

const uciMove = (chess, uci) => {
  try { return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return null; }
};

// A sacrifice: after the opponent's best reply and our best follow-up, we are still >= 2 points down
// compared with before the move. Uses the engine PV of the position after the move.
export function isSacrifice(fenBefore, uci, pvAfter = []) {
  const c = new Chess(fenBefore);
  const color = c.turn();
  const before = materialBalance(c, color);
  if (!uciMove(c, uci)) return false;
  for (const m of pvAfter.slice(0, 2)) if (!uciMove(c, m)) break;
  return before - materialBalance(c, color) >= 2;
}

// Builds the position list for a PGN. Returns { headers, moves: [{san, uci, color, fenBefore, fenAfter, legalCount}], fens }.
export function parseGame(pgn) {
  const c = new Chess();
  c.loadPgn(pgn);
  const headers = c.getHeaders();
  const history = c.history({ verbose: true });
  const replay = new Chess(headers.FEN && headers.SetUp === '1' ? headers.FEN : undefined);
  const fens = [replay.fen()];
  const moves = history.map((m) => {
    const legalCount = replay.moves().length;
    replay.move(m.san);
    fens.push(replay.fen());
    return { san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to, color: m.color, captured: m.captured, piece: m.piece, promotion: m.promotion, fenBefore: m.before, fenAfter: m.after, legalCount };
  });
  return { headers, moves, fens };
}

// Evaluation of a finished position (no engine needed), or null if the game goes on.
export function terminalScore(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { mate: 0, loser: c.turn() };
  if (c.isDraw() || c.isStalemate()) return { cp: 0 };
  return null;
}

// evals[k] = { score (White POV), best (uci), pv: [uci], second (White POV score of 2nd line) } for fens[k].
export function classifyGame(game, evals) {
  const out = [];
  for (let i = 0; i < game.moves.length; i++) {
    const m = game.moves[i];
    const e0 = evals[i], e1 = evals[i + 1];
    if (!e0 || !e1) break; // analysis still in progress: classify the finished prefix only
    const before = forSide(winPercent(e0.score), m.color);
    const after = forSide(winPercent(e1.score), m.color);
    const loss = Math.max(0, before - after);
    const isBest = m.uci === e0.best;
    const prev = out[i - 1]?.cls;
    let cls;
    if (m.legalCount === 1) cls = 'forced';
    else if (loss <= 2 && before < 95 && after >= 30 && isSacrifice(m.fenBefore, m.uci, e1.pv)) cls = 'brilliant';
    // "Great" = the only move that holds: the 2nd-best line is much worse.
    else if (isBest && e0.second && before - forSide(winPercent(e0.second), m.color) >= 15 && before < 97) cls = 'great';
    else if (isBest || loss < 0.5) cls = 'best';
    else if (loss < 2) cls = 'excellent';
    else if (loss < 5) cls = 'good';
    // A "miss" is failing to punish the opponent's error while we were better.
    else if (loss >= 10 && (prev === 'mistake' || prev === 'blunder') && before >= 60) cls = 'miss';
    else if (loss < 10) cls = 'inaccuracy';
    else if (loss < 20) cls = 'mistake';
    else cls = 'blunder';
    out.push({ cls, loss, before, after, accuracy: moveAccuracy(loss), isBest });
  }
  return out;
}

// shortcut: plain mean of move accuracies; Lichess uses a volatility-weighted mean, upgrade if numbers need to match it.
export function summarize(game, classified) {
  const sides = { w: { accuracy: 0, n: 0, counts: {} }, b: { accuracy: 0, n: 0, counts: {} } };
  for (const s of Object.values(sides)) for (const k of CLASSES) s.counts[k] = 0;
  game.moves.forEach((m, i) => {
    if (!classified[i]) return;
    const s = sides[m.color];
    s.counts[classified[i].cls]++;
    s.accuracy += classified[i].accuracy;
    s.n++;
  });
  for (const s of Object.values(sides)) s.accuracy = s.n ? s.accuracy / s.n : 0;
  return sides;
}

export function formatScore(score) {
  if (!score) return '0.0';
  if ('mate' in score) {
    if (score.mate === 0) return score.loser === 'w' ? '0-1' : '1-0';
    return `${score.mate > 0 ? '' : '-'}M${Math.abs(score.mate)}`;
  }
  const v = score.cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

// Converts UCI moves to SAN from a position (for showing engine lines).
export function uciLineToSan(fen, ucis, max = 6) {
  const c = new Chess(fen);
  const out = [];
  for (const u of ucis.slice(0, max)) {
    const m = uciMove(c, u);
    if (!m) break;
    out.push(m.san);
  }
  return out;
}
