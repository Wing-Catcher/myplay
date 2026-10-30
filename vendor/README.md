# Vendored libraries

These files are third-party dependencies checked into the project so the site
works without a package manager or CDN at runtime.

## chess.js 0.12.1

- File: `chess.js`
- License: BSD-2-Clause — see `chess.js.LICENSE.txt`
- Upstream: https://github.com/jhlywa/chess.js/tree/v0.12.1
- Used for move legality, SAN/FEN handling, check/checkmate, stalemate, and
  draw detection.

## Stockfish 19 (lite, single-threaded WASM build)

- Files: `stockfish/stockfish-19-lite-single.js` and
  `stockfish/stockfish-19-lite-single.wasm`
- License: GNU GPL v3 — see `stockfish/LICENSE.txt`
- Build/source: https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1
- Engine source: https://github.com/official-stockfish/Stockfish
- Used for the chess AI. It runs in a Web Worker via the UCI protocol.

The Stockfish worker must be served over HTTP. Opening `index.html` directly
from disk still supports the two-player chess mode, but browsers block the
engine worker on `file://`.
