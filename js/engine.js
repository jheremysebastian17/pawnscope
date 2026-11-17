// Thin UCI wrapper around Stockfish running in a Web Worker.
import { toWhitePov } from './analysis.js';

const ENGINE_URL = 'vendor/stockfish/stockfish-18-lite-single.js';

export class Engine {
  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.handler = null;
    this.worker.onmessage = (e) => this.handler?.(String(e.data));
    this.ready = this.#init();
  }

  #send(cmd) { this.worker.postMessage(cmd); }

  #waitFor(token) {
    return new Promise((resolve) => {
      this.handler = (line) => { if (line.startsWith(token)) resolve(); };
    });
  }

  async #init() {
    const ok = this.#waitFor('uciok');
    this.#send('uci');
    await ok;
    this.#send('setoption name MultiPV value 2');
    this.#send('setoption name Hash value 32');
    const ready = this.#waitFor('readyok');
    this.#send('isready');
    await ready;
  }

  // Resolves { score, best, pv, second } with scores from White's point of view.
  async analyze(fen, depth) {
    await this.ready;
    const stm = fen.split(' ')[1];
    const lines = {};
    return new Promise((resolve) => {
      this.handler = (line) => {
        if (line.startsWith('info') && line.includes(' pv ')) {
          const mpv = Number(/ multipv (\d+)/.exec(line)?.[1] || 1);
          const cp = / score cp (-?\d+)/.exec(line);
          const mate = / score mate (-?\d+)/.exec(line);
          const pv = line.split(' pv ')[1].trim().split(/\s+/);
          // Lower/upper bound lines are not final evaluations.
          if (/ (lowerbound|upperbound)/.test(line)) return;
          lines[mpv] = { score: mate ? { mate: Number(mate[1]) } : { cp: Number(cp?.[1] || 0) }, pv };
        } else if (line.startsWith('bestmove')) {
          const best = line.split(' ')[1];
          const main = lines[1] || { score: { cp: 0 }, pv: [best] };
          resolve({
            score: toWhitePov(main.score, stm),
            best: best === '(none)' ? null : best,
            pv: main.pv,
            second: lines[2] ? toWhitePov(lines[2].score, stm) : null,
          });
        }
      };
      this.#send(`position fen ${fen}`);
      this.#send(`go depth ${depth}`);
    });
  }

  // Clears the hash between games; positions of the same game share it, which speeds analysis up.
  async newGame() { await this.ready; this.#send('ucinewgame'); }

  terminate() { this.worker.terminate(); this.handler = null; }
}
