<div align="center">

# ♟️ PawnScope

**Review your Chess.com games with Stockfish — every move classified, explained and drawn on the board, entirely in your browser.**

[![Live demo](https://img.shields.io/badge/Live%20demo-22A35A?style=for-the-badge&logo=githubpages&logoColor=white)](https://jheremysebastian17.github.io/pawnscope/)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=for-the-badge)

</div>

## Features

- **Import from Chess.com** — enter a username to load the latest games (public API, no login), filter by time control and result. You can also paste any PGN.
- **Stockfish 18 in the browser** — every position is analysed locally in a Web Worker (WebAssembly). Depth 10 / 14 / 18.
- **Move classification** — Brilliant `!!`, Great `!`, Best `★`, Excellent, Good, Inaccuracy `?!`, Mistake `?`, Miss, Blunder `??` and Forced, based on the change in win probability.
- **Analyst** — explains each move in plain language: what it does, the better alternative, pieces left hanging, missed or allowed mates, and the engine line.
- **Board annotations** — arrow for the played move in its classification colour, a badge with its symbol, and a green arrow for the engine's best move.
- **Accuracy & summary** — per-player accuracy and count of each move type, evaluation bar and clickable evaluation graph.
- **5 languages** (ES, EN, CA, FR, DE), **light/dark theme**, **responsive** layout, keyboard navigation (← → Home End).
- Analyses are cached in your browser, so reopening a game is instant.

## How the classification works

Each engine score is converted to a win probability (Lichess model). The drop in win probability caused by a move decides its class:

| Win % lost | Class |
|---|---|
| engine's move | Best |
| < 2 | Excellent |
| < 5 | Good |
| < 10 | Inaccuracy |
| < 20 | Mistake |
| ≥ 20 | Blunder |

Special cases: **Brilliant** = a near-best move that sacrifices material (still ≥ 2 points down after the opponent's best reply); **Great** = the best move when the second-best line is much worse; **Miss** = failing to punish the opponent's mistake; **Forced** = the only legal move. Move accuracy uses the Lichess formula.

## Run locally

No build step. Serve the folder with any static server (the `.wasm` file must be served as `application/wasm`):

```bash
npx serve .
```

## Tests

```bash
node tests/run.mjs
```

## Project structure

```
index.html            UI
css/style.css         Theme and responsive layout
js/app.js             Views, rendering, caching
js/analysis.js        Win %, accuracy, move classification (pure)
js/commentary.js      Rule-based analyst (pure)
js/engine.js          Stockfish UCI wrapper (Web Worker)
js/chesscom.js        Chess.com public API client
js/board.js           SVG board, arrows and badges
js/graph.js           Evaluation graph
js/i18n.js            Translations
vendor/               Stockfish 18 lite (WASM), chess.js
tests/run.mjs         Unit tests (Node.js)
```

## Credits & licenses

- [Stockfish](https://stockfishchess.org/) via [stockfish.js](https://github.com/nmrugg/stockfish.js) — GPLv3 (`vendor/stockfish/COPYING.txt`).
- [chess.js](https://github.com/jhlywa/chess.js) — BSD-2-Clause (`vendor/chess.js.LICENSE`).
- Piece set *cburnett* by Colin M.L. Burnett — GPLv2+.
- Game data from the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api). PawnScope is not affiliated with Chess.com.

Because it bundles Stockfish, PawnScope is released under the **GNU GPL v3**. © Jheremy Sánchez
