// Rule-based "analyst": turns engine facts about a move into translatable sentences.
// Returns [{ key, params }]; params of the form { t: key } are translated by the caller.
import { Chess } from '../vendor/chess.js';
import { uciLineToSan } from './analysis.js';

const pieceKey = (p) => ({ t: `piece.${p}` });

function replyInfo(fenAfter, uci) {
  if (!uci) return null;
  const c = new Chess(fenAfter);
  try {
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { san: m.san, captured: m.captured, mate: c.isCheckmate() };
  } catch { return null; }
}

// m: parsed move, info: classifyGame entry, e0/e1: evals before/after, ply: index, opening: name or ''.
export function commentMove({ m, info, e0, e1, ply, opening }) {
  const lines = [];
  const bestSan = e0.best && e0.best !== m.uci ? uciLineToSan(m.fenBefore, [e0.best])[0] : null;
  const p = { san: m.san, best: bestSan || '' };

  if (ply === 0 && opening) lines.push({ key: 'cm.opening', params: { name: opening } });

  if (m.san.endsWith('#')) {
    lines.push({ key: 'cm.checkmate', params: p });
    return lines;
  }

  const cls = info.cls;
  if (cls === 'good' && bestSan) lines.push({ key: 'cm.good.best', params: p });
  else if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(cls) && bestSan) lines.push({ key: `cm.${cls}.best`, params: p });
  else lines.push({ key: `cm.${cls}`, params: p });

  // What the move does on the board.
  if (m.san.startsWith('O-O')) lines.push({ key: 'cm.castle', params: {} });
  // Promotion uses the bare piece name; captures use the name with its article ("una torre", "eine Dame").
  else if (m.promotion) lines.push({ key: 'cm.promote', params: { piece: { t: `name.${m.promotion}` } } });
  else if (m.captured) lines.push({ key: 'cm.capture', params: { piece: pieceKey(m.captured) } });
  if (m.san.includes('+')) lines.push({ key: 'cm.check', params: {} });

  // Mate facts (scores are White POV; positive mate = White mates).
  const sign = m.color === 'w' ? 1 : -1;
  const mateBefore = e0.score && 'mate' in e0.score ? e0.score.mate * sign : null;
  const mateAfter = e1.score && 'mate' in e1.score && e1.score.mate !== 0 ? e1.score.mate * sign : null;
  if (mateBefore > 0 && !(mateAfter > 0)) lines.push({ key: 'cm.missedMate', params: { n: mateBefore, best: bestSan || '' } });
  else if (mateAfter > 0) lines.push({ key: 'cm.mateComing', params: { n: mateAfter } });

  // What the opponent can do now, explained only for bad moves.
  if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(cls)) {
    const reply = replyInfo(m.fenAfter, e1.best);
    if (mateAfter < 0) lines.push({ key: 'cm.allowsMate', params: { n: -mateAfter, reply: reply?.san || '' } });
    else if (reply?.captured && reply.captured !== 'p') lines.push({ key: 'cm.hangs', params: { reply: reply.san, piece: pieceKey(reply.captured) } });
    else if (reply) lines.push({ key: 'cm.reply', params: { reply: reply.san } });
  }
  return lines;
}
