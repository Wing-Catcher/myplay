// Chess — local two-player games plus Stockfish 19 running in a Web Worker.
(function () {
  const boardEl = document.getElementById("chess-board");
  if (!boardEl) return;

  const boardWrap = boardEl.closest(".chess-board-wrap");

  if (typeof Chess === "undefined") {
    console.error("chess.js failed to load.");
    return;
  }

  const view = document.getElementById("view-chess");
  const turnEl = document.getElementById("chess-turn");
  const engineStateEl = document.getElementById("chess-engine-state");
  const engineAlertEl = document.getElementById("chess-engine-alert");
  const promotionEl = document.getElementById("chess-promotion");
  const promotionOptionsEl = document.getElementById("chess-promotion-options");
  const newButton = document.getElementById("chess-new");
  const undoButton = document.getElementById("chess-undo");
  const flipButton = document.getElementById("chess-flip");
  const modeButtons = document.querySelectorAll("[data-mode]");
  const aiSettings = document.getElementById("chess-ai-settings");
  const localSettings = document.getElementById("chess-local-settings");
  const sideButtons = document.querySelectorAll("[data-side]");
  const sideNote = document.getElementById("chess-side-note");
  const levelInput = document.getElementById("chess-level");
  const levelLabel = document.getElementById("chess-level-label");
  const levelHint = document.getElementById("chess-level-hint");
  const autoflipInput = document.getElementById("chess-autoflip");
  const capturedWhiteEl = document.getElementById("chess-captured-white");
  const capturedBlackEl = document.getElementById("chess-captured-black");
  const historyEl = document.getElementById("chess-history");
  const historyPositionEl = document.getElementById("chess-history-position");
  const historyFirstButton = document.getElementById("chess-hist-first");
  const historyPrevButton = document.getElementById("chess-hist-prev");
  const historyNextButton = document.getElementById("chess-hist-next");
  const historyLiveButton = document.getElementById("chess-hist-live");
  const delayInput = document.getElementById("chess-reply-delay");
  const delayLabel = document.getElementById("chess-reply-delay-label");
  const hintButton = document.getElementById("chess-hint");
  const hintTextEl = document.getElementById("chess-hint-text");
  const dialogEl = document.getElementById("chess-dialog");
  const dialogTitle = document.getElementById("chess-dialog-title");
  const dialogText = document.getElementById("chess-dialog-text");
  const dialogConfirm = document.getElementById("chess-dialog-confirm");
  const dialogCancel = document.getElementById("chess-dialog-cancel");

  const WORKER_URL = "vendor/stockfish/stockfish-19-lite-single.js";
  const SEARCH_TIMEOUT = 12000;
  const ENGINE_LOAD_TIMEOUT = 20000;
  const DEFAULT_REPLY_DELAY = 500;
  const REPLY_DELAY_KEY = "simple-chess-reply-delay";
  const HINT_MOVETIME = 700;
  const HINT_DEPTH = 14;

  const LEVELS = [
    { name: "Beginner", skill: 0, depth: 1, movetime: 150 },
    { name: "Novice", skill: 2, depth: 2, movetime: 200 },
    { name: "Casual", skill: 4, depth: 3, movetime: 300 },
    { name: "Improver", skill: 7, depth: 5, movetime: 400 },
    { name: "Club player", skill: 9, depth: 7, movetime: 600 },
    { name: "Intermediate", skill: 11, depth: 9, movetime: 800 },
    { name: "Advanced", skill: 13, depth: 11, movetime: 1000 },
    { name: "Strong", skill: 16, depth: 13, movetime: 1400 },
    { name: "Expert", skill: 18, depth: 16, movetime: 1800 },
    { name: "Maximum", skill: 20, depth: 18, movetime: 2500 },
  ];

  const GLYPHS = {
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟",
  };

  const PIECE_NAMES = {
    k: "king",
    q: "queen",
    r: "rook",
    b: "bishop",
    n: "knight",
    p: "pawn",
  };

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  let game = new Chess();
  let mode = "ai";
  let sideChoice = "w";
  let humanColor = "w";
  let level = 5;
  let autoFlip = true;
  let orientation = "w";
  let replyDelay = loadReplyDelay();

  let selected = null;
  let legalMoves = [];
  let promotionOpen = false;
  let pendingPromotion = null;

  let worker = null;
  let engineReady = false;
  let engineLoading = false;
  let engineError = false;
  let thinking = false;
  let searchTimer = null;
  let loadTimer = null;
  let searchPurpose = null;
  let pendingReply = false;
  let replyTimer = null;
  let aiStartsWhenReady = false;
  let hintWanted = false;
  let ignoreNextBestMove = false;

  let reviewPly = null;
  let reviewGame = null;
  let reviewLastMove = null;
  let hintMove = null;
  let hintLayer = null;
  let hintLine = null;
  let hintHalo = null;

  let dialogAction = null;
  let initialized = false;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionTimers = new WeakMap();
  let lastStatusText = "";
  let lastWhiteCaptured = 0;
  let lastBlackCaptured = 0;
  let suppressCaptureAnimation = false;

  function sideName(color) {
    return color === "w" ? "White" : "Black";
  }

  function otherColor(color) {
    return color === "w" ? "b" : "w";
  }

  function currentLevel() {
    return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level - 1))];
  }

  function loadReplyDelay() {
    try {
      const stored = parseInt(localStorage.getItem(REPLY_DELAY_KEY), 10);
      if (Number.isFinite(stored)) {
        return Math.max(0, Math.min(2000, Math.round(stored / 100) * 100));
      }
    } catch (error) {
      // Storage can be unavailable; fall back to the default.
    }
    return DEFAULT_REPLY_DELAY;
  }

  function saveReplyDelay() {
    try {
      localStorage.setItem(REPLY_DELAY_KEY, String(replyDelay));
    } catch (error) {
      // The setting still works for this visit.
    }
  }

  function formatDelay(ms) {
    return ms === 0 ? "Off" : (ms / 1000).toFixed(1).replace(/\.0$/, "") + "s";
  }

  function displayGame() {
    return reviewGame || game;
  }

  function resolveHumanColor() {
    if (sideChoice === "random") {
      return Math.random() < 0.5 ? "w" : "b";
    }
    return sideChoice;
  }

  function findKing(color, position) {
    const board = (position || displayGame()).board();
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (piece && piece.type === "k" && piece.color === color) {
          return "abcdefgh"[col] + (8 - row);
        }
      }
    }
    return null;
  }

  function canHumanMove() {
    if (reviewPly !== null || thinking) return false;
    if (game.game_over()) return false;
    if (mode === "local") return true;
    return game.turn() === humanColor;
  }

  function canUndo() {
    if (reviewPly !== null) return false;
    const history = game.history({ verbose: true });
    if (mode === "local") return history.length > 0;
    return history.some((move) => move.color === humanColor);
  }

  function canHint() {
    if (
      reviewPly !== null ||
      thinking ||
      pendingReply ||
      hintWanted ||
      promotionOpen
    ) {
      return false;
    }
    if (game.game_over()) return false;
    if (mode === "ai" && game.turn() !== humanColor) return false;
    return true;
  }

  function hasGameInProgress() {
    return game.history().length > 0 && !game.game_over();
  }

  // ---------- Motion ----------

  function replayClass(element, className, duration) {
    if (!element || reduceMotion.matches) return;

    const existing = motionTimers.get(element);
    if (existing) clearTimeout(existing);

    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);

    motionTimers.set(
      element,
      setTimeout(() => {
        element.classList.remove(className);
        motionTimers.delete(element);
      }, duration)
    );
  }

  function settleBoard() {
    replayClass(boardEl, "board-enter", 800);
  }

  function sweepBoard() {
    replayClass(boardWrap, "is-flipping", 460);
  }

  function animatePiece(from, to, reverse) {
    // Forward: the piece already sits on `to` and is translated back from `from`.
    // Reverse: the piece already sits on `from` and is translated in from `to`.
    const targetSquare = reverse ? from : to;
    const originSquare = reverse ? to : from;
    const targetEl = boardEl.querySelector('[data-square="' + targetSquare + '"]');
    const originEl = boardEl.querySelector('[data-square="' + originSquare + '"]');
    const pieceEl = targetEl ? targetEl.querySelector(".chess-piece") : null;

    if (!originEl || !targetEl || !pieceEl || !pieceEl.animate) return;

    const originRect = originEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const dx = originRect.left - targetRect.left;
    const dy = originRect.top - targetRect.top;

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    pieceEl.animate(
      [
        { transform: "translate(" + dx + "px, " + dy + "px) scale(0.96)" },
        { transform: "translate(0, 0) scale(1)" },
      ],
      {
        duration: 210,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }
    );
  }

  function captureBurst(square) {
    const squareEl = boardEl.querySelector('[data-square="' + square + '"]');
    if (!squareEl) return;

    const ring = document.createElement("span");
    ring.className = "capture-burst";
    ring.setAttribute("aria-hidden", "true");
    squareEl.appendChild(ring);
    setTimeout(() => ring.remove(), 420);
  }

  function restorePop(square) {
    const squareEl = boardEl.querySelector('[data-square="' + square + '"]');
    const pieceEl = squareEl ? squareEl.querySelector(".chess-piece") : null;
    if (!pieceEl || !pieceEl.animate) return;

    pieceEl.animate(
      [
        { opacity: 0, transform: "scale(0.55)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      {
        duration: 240,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }
    );
  }

  function pulseBoard(direction) {
    replayClass(
      boardWrap,
      direction === "back" ? "is-rewinding" : "is-jumping",
      480
    );
  }

  function animateMove(move, options) {
    if (!move || reduceMotion.matches) return;

    const reverse = Boolean(options && options.reverse);
    boardEl.classList.remove("board-enter");

    const flags = move.flags || "";
    const rank = move.from[1];

    animatePiece(move.from, move.to, reverse);

    // Castling moves the rook as well as the king.
    if (flags.includes("k")) animatePiece("h" + rank, "f" + rank, reverse);
    if (flags.includes("q")) animatePiece("a" + rank, "d" + rank, reverse);

    if (move.captured) {
      const captureSquare = flags.includes("e")
        ? move.to[0] + rank
        : move.to;
      if (reverse) restorePop(captureSquare);
      else captureBurst(captureSquare);
    }
  }

  function animateJump(moves, fromPly, targetPly) {
    if (reduceMotion.matches) return;

    const delta = targetPly - fromPly;
    if (!delta) return;

    if (delta === 1) {
      animateMove(moves[fromPly]);
    } else if (delta === -1) {
      animateMove(moves[targetPly], { reverse: true });
    } else if (delta > 1) {
      animateMove(moves[targetPly - 1]);
      pulseBoard("forward");
    } else {
      pulseBoard("back");
    }
  }

  // ---------- Hint arrow ----------

  const SVG_NS = "http://www.w3.org/2000/svg";

  function ensureHintLayer() {
    if (hintLayer) return hintLayer;

    hintLayer = document.createElementNS(SVG_NS, "svg");
    hintLayer.setAttribute("class", "chess-hint-layer");
    hintLayer.setAttribute("aria-hidden", "true");

    const defs = document.createElementNS(SVG_NS, "defs");
    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "chess-hint-head");
    marker.setAttribute("viewBox", "0 0 4 4");
    marker.setAttribute("markerWidth", "3.4");
    marker.setAttribute("markerHeight", "3.4");
    marker.setAttribute("refX", "2.8");
    marker.setAttribute("refY", "2");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");

    const head = document.createElementNS(SVG_NS, "path");
    head.setAttribute("d", "M0,0 L4,2 L0,4 Z");
    head.setAttribute("fill", "#c2410c");
    marker.appendChild(head);
    defs.appendChild(marker);
    hintLayer.appendChild(defs);

    hintHalo = document.createElementNS(SVG_NS, "line");
    hintHalo.setAttribute("class", "chess-hint-halo");

    hintLine = document.createElementNS(SVG_NS, "line");
    hintLine.setAttribute("class", "chess-hint-arrow");
    hintLine.setAttribute("pathLength", "1");
    hintLine.setAttribute("marker-end", "url(#chess-hint-head)");

    hintLayer.append(hintHalo, hintLine);
    boardWrap.appendChild(hintLayer);
    return hintLayer;
  }

  function hideHintArrow() {
    if (hintLayer) hintLayer.classList.remove("visible");
  }

  function clearHint() {
    hintMove = null;
    hintWanted = false;
    hideHintArrow();
    if (hintTextEl) {
      hintTextEl.textContent = "";
      hintTextEl.classList.remove("hint-in");
    }
  }

  function showHintText(text) {
    if (!hintTextEl) return;
    hintTextEl.textContent = text;
    if (text) replayClass(hintTextEl, "hint-in", 320);
  }

  function renderHintArrow() {
    if (!hintMove || reviewPly !== null || game.game_over()) {
      hideHintArrow();
      return;
    }

    const fromEl = boardEl.querySelector('[data-square="' + hintMove.from + '"]');
    const toEl = boardEl.querySelector('[data-square="' + hintMove.to + '"]');
    if (!fromEl || !toEl) {
      hideHintArrow();
      return;
    }

    const boardRect = boardEl.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    if (boardRect.width < 1) return;

    const layer = ensureHintLayer();
    layer.setAttribute("viewBox", "0 0 " + boardRect.width + " " + boardRect.height);

    const x1 = fromRect.left - boardRect.left + fromRect.width / 2;
    const y1 = fromRect.top - boardRect.top + fromRect.height / 2;
    const x2 = toRect.left - boardRect.left + toRect.width / 2;
    const y2 = toRect.top - boardRect.top + toRect.height / 2;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 1) {
      hideHintArrow();
      return;
    }

    const ux = dx / length;
    const uy = dy / length;
    const cell = fromRect.width;
    const startX = x1 + ux * cell * 0.24;
    const startY = y1 + uy * cell * 0.24;
    const endX = x2 - ux * cell * 0.3;
    const endY = y2 - uy * cell * 0.3;
    const strokeWidth = Math.max(3.5, boardRect.width * 0.012);

    [hintHalo, hintLine].forEach((line) => {
      line.setAttribute("x1", String(startX));
      line.setAttribute("y1", String(startY));
      line.setAttribute("x2", String(endX));
      line.setAttribute("y2", String(endY));
    });

    hintLine.setAttribute("stroke-width", String(strokeWidth));
    hintHalo.setAttribute("stroke-width", String(strokeWidth + 5));

    hintLine.style.animation = "none";
    void hintLine.getBoundingClientRect();
    hintLine.style.animation = "";

    layer.classList.add("visible");
  }

  // ---------- Rendering ----------

  function renderBoard() {
    const files =
      orientation === "w"
        ? ["a", "b", "c", "d", "e", "f", "g", "h"]
        : ["h", "g", "f", "e", "d", "c", "b", "a"];
    const ranks =
      orientation === "w"
        ? [8, 7, 6, 5, 4, 3, 2, 1]
        : [1, 2, 3, 4, 5, 6, 7, 8];

    const position = displayGame();
    const liveHistory = position.history({ verbose: true });
    const lastMove =
      reviewPly !== null ? reviewLastMove : liveHistory[liveHistory.length - 1];
    const targets = new Set(legalMoves.map((move) => move.to));
    const captures = new Set(
      legalMoves
        .filter((move) => move.flags.includes("c") || move.flags.includes("e"))
        .map((move) => move.to)
    );
    const checkSquare = position.in_check()
      ? findKing(position.turn(), position)
      : null;

    const fragment = document.createDocumentFragment();

    ranks.forEach((rank, rowIndex) => {
      files.forEach((file, colIndex) => {
        const square = file + rank;
        const piece = position.get(square);
        const fileIndex = file.charCodeAt(0) - 97;
        const isDark = (fileIndex + rank) % 2 === 1;

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "chess-square" + (isDark ? " dark" : "");
        cell.dataset.square = square;
        cell.setAttribute("role", "gridcell");

        if (selected === square) cell.classList.add("selected");
        if (lastMove && (lastMove.from === square || lastMove.to === square)) {
          cell.classList.add("last-move");
        }
        if (checkSquare === square) cell.classList.add("in-check");
        if (targets.has(square)) {
          cell.classList.add(captures.has(square) ? "legal-capture" : "legal");
        }

        let label = square;
        if (piece) {
          label += ", " + sideName(piece.color).toLowerCase() + " " + PIECE_NAMES[piece.type];
          const glyph = document.createElement("span");
          glyph.className = "chess-piece " + piece.color;
          glyph.textContent = GLYPHS[piece.type];
          glyph.setAttribute("aria-hidden", "true");
          glyph.style.setProperty("--i", String(rowIndex + colIndex));
          cell.appendChild(glyph);
        } else {
          label += ", empty";
        }
        if (targets.has(square)) label += ", legal move";
        if (selected === square) label += ", selected";
        cell.setAttribute("aria-label", label);

        if (rowIndex === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "chess-coord file";
          fileLabel.textContent = file;
          cell.appendChild(fileLabel);
        }
        if (colIndex === 0) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "chess-coord rank";
          rankLabel.textContent = String(rank);
          cell.appendChild(rankLabel);
        }

        fragment.appendChild(cell);
      });
    });

    boardEl.replaceChildren(fragment);
    boardEl.classList.toggle("locked", !canHumanMove());
  }

  function renderStatus() {
    const position = displayGame();
    let text;

    if (position.in_checkmate()) {
      text = sideName(otherColor(position.turn())) + " wins by checkmate";
    } else if (position.in_stalemate()) {
      text = "Draw by stalemate";
    } else if (position.insufficient_material()) {
      text = "Draw — insufficient material";
    } else if (position.in_threefold_repetition()) {
      text = "Draw by threefold repetition";
    } else if (position.in_draw()) {
      text = "Draw by the 50-move rule";
    } else {
      text =
        sideName(position.turn()) +
        " to move" +
        (position.in_check() ? " — check" : "");
    }

    const displayText = reviewPly !== null ? "Reviewing — " + text : text;
    turnEl.textContent = displayText;
    if (lastStatusText && displayText !== lastStatusText) {
      replayClass(turnEl, "status-change", 320);
    }
    lastStatusText = displayText;
    turnEl.classList.toggle("check", position.in_check());
    turnEl.classList.toggle("reviewing", reviewPly !== null);
  }

  function makeHistoryMove(move, index, currentPly, isLatest) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "san";
    button.dataset.ply = String(index + 1);
    button.textContent = move.san;

    if (index + 1 === currentPly) {
      button.classList.add("current");
      button.setAttribute("aria-current", "true");
    }
    if (reviewPly !== null && index + 1 > reviewPly) {
      button.classList.add("future");
    }
    if (isLatest) {
      button.classList.add("latest");
    }

    button.setAttribute(
      "aria-label",
      "Show position after move " + (index + 1) + ", " + move.san
    );

    return button;
  }

  function renderHistory() {
    const history = game.history({ verbose: true });
    const currentPly = reviewPly === null ? history.length : reviewPly;

    if (historyPositionEl) {
      if (!history.length || currentPly === 0) {
        historyPositionEl.textContent = "Starting position";
      } else if (reviewPly === null) {
        historyPositionEl.textContent =
          "Live · Move " + history.length + " of " + history.length;
      } else {
        historyPositionEl.textContent =
          "Move " + currentPly + " of " + history.length;
      }
    }

    if (historyFirstButton) {
      historyFirstButton.disabled = currentPly === 0;
      historyPrevButton.disabled = currentPly === 0;
      historyNextButton.disabled = reviewPly === null;
      historyLiveButton.disabled = reviewPly === null;
    }

    if (!history.length) {
      historyEl.innerHTML = '<li class="empty">No moves yet.</li>';
      return;
    }

    historyEl.replaceChildren();
    let currentButton = null;

    for (let index = 0; index < history.length; index += 2) {
      const row = document.createElement("li");
      row.className = "chess-history-row";

      const number = document.createElement("span");
      number.className = "num";
      number.textContent = index / 2 + 1 + ".";

      const whiteMove = makeHistoryMove(
        history[index],
        index,
        currentPly,
        reviewPly === null && index === history.length - 1
      );
      if (index + 1 === currentPly) currentButton = whiteMove;

      if (history[index + 1]) {
        const blackMove = makeHistoryMove(
          history[index + 1],
          index + 1,
          currentPly,
          reviewPly === null && index + 1 === history.length - 1
        );
        if (index + 2 === currentPly) currentButton = blackMove;
        row.append(number, whiteMove, blackMove);
      } else {
        const empty = document.createElement("span");
        empty.className = "san-empty";
        row.append(number, whiteMove, empty);
      }

      historyEl.appendChild(row);
    }

    if (reviewPly === null) {
      historyEl.scrollTop = historyEl.scrollHeight;
    } else if (currentButton) {
      historyEl.scrollTop = Math.max(
        0,
        currentButton.offsetTop - historyEl.clientHeight / 2
      );
    }
  }

  function fillCaptured(container, pieces, color, animateLast) {
    container.replaceChildren();

    if (!pieces.length) {
      const empty = document.createElement("span");
      empty.className = "captured-empty";
      empty.textContent = "—";
      container.appendChild(empty);
      return;
    }

    pieces.forEach((type, index) => {
      const glyph = document.createElement("span");
      glyph.className = "chess-piece " + color;
      glyph.textContent = GLYPHS[type];
      glyph.setAttribute("aria-hidden", "true");
      if (animateLast && index === pieces.length - 1) {
        glyph.classList.add("captured-new");
      }
      container.appendChild(glyph);
    });
  }

  function materialScore(pieces) {
    return pieces.reduce((total, type) => total + (PIECE_VALUES[type] || 0), 0);
  }

  function renderCaptured() {
    const history = displayGame().history({ verbose: true });
    const whiteTook = [];
    const blackTook = [];

    history.forEach((move) => {
      if (!move.captured) return;
      if (move.color === "w") whiteTook.push(move.captured);
      else blackTook.push(move.captured);
    });

    const animating = reviewPly === null && !suppressCaptureAnimation;
    const whiteGrew = animating && whiteTook.length > lastWhiteCaptured;
    const blackGrew = animating && blackTook.length > lastBlackCaptured;
    lastWhiteCaptured = whiteTook.length;
    lastBlackCaptured = blackTook.length;
    suppressCaptureAnimation = false;

    fillCaptured(capturedWhiteEl, whiteTook, "b", whiteGrew);
    fillCaptured(capturedBlackEl, blackTook, "w", blackGrew);

    const advantage = materialScore(whiteTook) - materialScore(blackTook);
    if (advantage !== 0) {
      const badge = document.createElement("span");
      badge.className = "material-score";
      badge.textContent = "+" + Math.abs(advantage);
      (advantage > 0 ? capturedWhiteEl : capturedBlackEl).appendChild(badge);
    }
  }

  function updateModeUI() {
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    aiSettings.hidden = mode !== "ai";
    localSettings.hidden = mode !== "local";

    sideButtons.forEach((button) => {
      const active = button.dataset.side === sideChoice;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    levelInput.value = String(level);
    levelLabel.textContent = String(level);
    levelHint.textContent = currentLevel().name;
    autoflipInput.checked = autoFlip;
    delayInput.value = String(replyDelay);
    delayLabel.textContent = formatDelay(replyDelay);

    if (mode === "ai") {
      sideNote.textContent =
        sideChoice === "random"
          ? "Random — you are " + sideName(humanColor) + " this game."
          : "You are " + sideName(humanColor) + ".";
    }
  }

  function updateEngineState() {
    engineStateEl.classList.remove("busy");

    if (reviewPly !== null) {
      engineStateEl.textContent = "Reviewing history";
      return;
    }

    if (mode === "local") {
      if (thinking) {
        engineStateEl.textContent =
          searchPurpose === "hint" ? "Finding a hint…" : "Stockfish is thinking…";
        engineStateEl.classList.add("busy");
      } else if (engineLoading || hintWanted) {
        engineStateEl.textContent = "Loading Stockfish…";
        engineStateEl.classList.add("busy");
      } else if (engineError) {
        engineStateEl.textContent = "Stockfish unavailable";
      } else {
        engineStateEl.textContent = "Local game";
      }
      return;
    }

    if (game.game_over()) {
      engineStateEl.textContent = "Game over";
      return;
    }

    if (engineError) {
      engineStateEl.textContent = "Stockfish unavailable";
      return;
    }

    if (pendingReply) {
      engineStateEl.textContent = "Stockfish is thinking…";
      engineStateEl.classList.add("busy");
      return;
    }

    if (thinking) {
      engineStateEl.textContent =
        searchPurpose === "hint" ? "Finding a hint…" : "Stockfish is thinking…";
      engineStateEl.classList.add("busy");
      return;
    }

    if (engineLoading) {
      engineStateEl.textContent = "Loading Stockfish…";
      engineStateEl.classList.add("busy");
      return;
    }

    if (engineReady) {
      engineStateEl.textContent = "Stockfish ready";
      return;
    }

    engineStateEl.textContent = "Stockfish loads when you play";
  }

  function updateControls() {
    undoButton.disabled = !canUndo();
    hintButton.disabled = !canHint();
    boardEl.classList.toggle("locked", !canHumanMove());
  }

  function renderAll() {
    updateModeUI();
    renderBoard();
    renderStatus();
    renderHistory();
    renderCaptured();
    updateEngineState();
    updateControls();
  }

  // ---------- Engine ----------

  function engineHelpHtml() {
    return (
      "Stockfish could not start. AI mode needs the site served over HTTP — " +
      "run <code>python3 -m http.server 8000</code> in the project folder, then open " +
      "<code>http://localhost:8000</code>. Two-player mode still works."
    );
  }

  function showEngineAlert(html) {
    engineAlertEl.innerHTML = html;
    engineAlertEl.hidden = false;
  }

  function clearEngineAlert() {
    engineAlertEl.hidden = true;
    engineAlertEl.innerHTML = "";
  }

  function cancelReply() {
    if (replyTimer) {
      clearTimeout(replyTimer);
      replyTimer = null;
    }
    pendingReply = false;
    aiStartsWhenReady = false;
  }

  function stopActiveSearch() {
    if (!thinking) return;

    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    if (worker) {
      worker.postMessage("stop");
      ignoreNextBestMove = true;
    }
    thinking = false;
    searchPurpose = null;
  }

  function cancelPendingAI() {
    cancelReply();
    if (searchPurpose === "ai") stopActiveSearch();
    updateEngineState();
    updateControls();
  }

  function cancelPendingHint() {
    hintWanted = false;
    if (searchPurpose === "hint") stopActiveSearch();
    clearHint();
    updateEngineState();
    updateControls();
  }

  function terminateWorker() {
    cancelReply();
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    if (loadTimer) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      worker = null;
    }
    engineReady = false;
    engineLoading = false;
    thinking = false;
    searchPurpose = null;
    hintWanted = false;
    ignoreNextBestMove = false;
  }

  function destroyEngine() {
    terminateWorker();
    engineError = false;
    clearHint();
    clearEngineAlert();
    updateEngineState();
    updateControls();
  }

  function failEngine() {
    terminateWorker();
    clearHint();
    engineError = true;
    showEngineAlert(engineHelpHtml());
    updateEngineState();
    updateControls();
  }

  function handleEngineLine(line) {
    const text = String(line).trim();
    if (!text) return;

    if (text === "uciok") {
      if (worker) worker.postMessage("isready");
      return;
    }

    if (text === "readyok") {
      if (!engineLoading) return;
      if (loadTimer) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
      engineLoading = false;
      engineReady = true;
      engineError = false;
      clearEngineAlert();
      updateEngineState();
      updateControls();

      if (hintWanted) {
        hintWanted = false;
        startSearch("hint");
        return;
      }
      if (aiStartsWhenReady) {
        aiStartsWhenReady = false;
        startSearch("ai");
        return;
      }
      maybeAIMove();
      return;
    }

    if (text.startsWith("bestmove")) {
      handleBestMove(text);
    }
  }

  function ensureEngine() {
    if (worker || engineLoading) return;

    const loadingForHint = hintWanted || mode === "local";

    if (location.protocol === "file:") {
      hintWanted = false;
      cancelReply();
      engineError = true;
      showEngineAlert(engineHelpHtml());
      if (loadingForHint) {
        showHintText("Hints need the site served over HTTP — see the note below.");
      }
      updateEngineState();
      updateControls();
      return;
    }

    engineError = false;
    engineLoading = true;
    engineReady = false;
    clearEngineAlert();
    updateEngineState();

    try {
      worker = new Worker(WORKER_URL);
    } catch (error) {
      worker = null;
      failEngine();
      return;
    }

    worker.onmessage = (event) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      data.split(/\r?\n/).forEach(handleEngineLine);
    };

    worker.onerror = () => failEngine();

    loadTimer = setTimeout(() => {
      loadTimer = null;
      if (!engineLoading) return;
      failEngine();
    }, ENGINE_LOAD_TIMEOUT);

    worker.postMessage("uci");
  }

  function startSearch(purpose) {
    if (!worker || !engineReady || thinking) return;

    if (purpose === "hint") {
      if (reviewPly !== null || game.game_over()) return;
      if (mode === "ai" && game.turn() !== humanColor) return;
    } else if (
      mode !== "ai" ||
      reviewPly !== null ||
      game.game_over() ||
      game.turn() === humanColor
    ) {
      return;
    }

    const config =
      purpose === "hint"
        ? { skill: 20, depth: HINT_DEPTH, movetime: HINT_MOVETIME }
        : currentLevel();

    searchPurpose = purpose;
    thinking = true;
    pendingReply = false;
    aiStartsWhenReady = false;
    engineError = false;
    updateEngineState();
    updateControls();

    worker.postMessage("setoption name Skill Level value " + config.skill);
    worker.postMessage("position fen " + game.fen());
    worker.postMessage(
      "go depth " + config.depth + " movetime " + config.movetime
    );

    searchTimer = setTimeout(() => {
      searchTimer = null;
      if (!thinking) return;

      if (searchPurpose === "hint") {
        terminateWorker();
        showHintText("Hint search timed out — try again.");
        updateEngineState();
        updateControls();
        return;
      }

      terminateWorker();
      showEngineAlert(
        "Stockfish took too long to move. The engine has been reset — start a new game or choose a lower level."
      );
      updateEngineState();
      updateControls();
    }, SEARCH_TIMEOUT);
  }

  function handleHintResult(uci) {
    if (!uci || uci === "(none)") {
      showHintText("No hint available.");
      return;
    }

    const parser = new Chess(game.fen());
    let move = null;

    try {
      move = parser.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] ? uci[4].toLowerCase() : undefined,
      });
    } catch (error) {
      move = null;
    }

    if (!move) {
      showHintText("No hint available.");
      return;
    }

    hintMove = { from: move.from, to: move.to };
    renderHintArrow();
    showHintText("Hint: " + move.san);
  }

  function handleBestMove(line) {
    if (ignoreNextBestMove) {
      ignoreNextBestMove = false;
      return;
    }
    if (!thinking || !searchPurpose) return;

    const purpose = searchPurpose;

    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }

    thinking = false;
    searchPurpose = null;

    const parts = line.split(/\s+/);
    const uci = parts[1];

    if (purpose === "hint") {
      handleHintResult(uci);
      updateEngineState();
      updateControls();
      return;
    }

    if (!uci || uci === "(none)") {
      updateEngineState();
      updateControls();
      return;
    }

    const move = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
    };
    if (uci[4]) move.promotion = uci[4].toLowerCase();

    let applied = null;
    try {
      applied = game.move(move);
    } catch (error) {
      applied = null;
    }

    if (!applied) {
      const fallback = game.moves({ verbose: true });
      if (fallback.length) {
        applied = game.move(fallback[Math.floor(Math.random() * fallback.length)]);
      }
    }

    selected = null;
    legalMoves = [];
    renderAll();
    animateMove(applied);
  }

  function maybeAIMove() {
    if (mode !== "ai" || reviewPly !== null || game.game_over() || thinking) {
      return;
    }

    if (game.turn() === humanColor) {
      if (pendingReply) cancelReply();
      updateEngineState();
      updateControls();
      return;
    }

    if (pendingReply || searchPurpose) return;
    if (engineError) {
      updateEngineState();
      updateControls();
      return;
    }

    pendingReply = true;
    if (!engineReady && !worker && !engineLoading) ensureEngine();
    updateEngineState();
    updateControls();

    replyTimer = setTimeout(() => {
      replyTimer = null;
      pendingReply = false;
      aiStartsWhenReady = false;

      if (
        mode !== "ai" ||
        reviewPly !== null ||
        game.game_over() ||
        game.turn() === humanColor
      ) {
        updateEngineState();
        updateControls();
        return;
      }

      if (engineReady) {
        startSearch("ai");
        return;
      }

      if (engineError) {
        updateEngineState();
        updateControls();
        return;
      }

      aiStartsWhenReady = true;
      ensureEngine();
      updateEngineState();
      updateControls();
    }, replyDelay);
  }

  function requestHint() {
    if (!canHint()) return;

    clearHint();

    if (engineReady) {
      startSearch("hint");
      return;
    }

    hintWanted = true;
    showHintText("Loading Stockfish…");
    updateEngineState();
    updateControls();

    if (!worker && !engineLoading) ensureEngine();
  }

  function jumpToPly(ply) {
    const moves = game.history({ verbose: true });
    const target = Math.max(0, Math.min(moves.length, ply));
    const fromPly = reviewPly === null ? moves.length : reviewPly;

    cancelPendingAI();
    cancelPendingHint();
    hidePromotion();
    selected = null;
    legalMoves = [];

    if (target === moves.length) {
      suppressCaptureAnimation = reviewPly !== null;
      reviewPly = null;
      reviewGame = null;
      reviewLastMove = null;
      if (mode === "local" && autoFlip) orientation = game.turn();
      renderAll();
      animateJump(moves, fromPly, target);

      if (mode === "ai" && !game.game_over()) {
        ensureEngine();
        maybeAIMove();
      }
      return;
    }

    const replay = new Chess();
    for (let index = 0; index < target; index += 1) {
      replay.move({
        from: moves[index].from,
        to: moves[index].to,
        promotion: moves[index].promotion,
      });
    }

    reviewPly = target;
    reviewGame = replay;
    reviewLastMove = target > 0 ? moves[target - 1] : null;
    renderAll();
    animateJump(moves, fromPly, target);
  }

  function goFirst() {
    jumpToPly(0);
  }

  function goPrevious() {
    const total = game.history().length;
    if (!total) return;
    jumpToPly(reviewPly === null ? total - 1 : reviewPly - 1);
  }

  function goNext() {
    if (reviewPly === null) return;
    jumpToPly(reviewPly + 1);
  }

  function goLive() {
    jumpToPly(game.history().length);
  }

  // ---------- Game flow ----------

  function hidePromotion() {
    promotionOpen = false;
    pendingPromotion = null;
    promotionEl.hidden = true;
    promotionOptionsEl.replaceChildren();
  }

  function openPromotion(from, to) {
    promotionOpen = true;
    pendingPromotion = { from, to };

    const color = game.turn();
    promotionOptionsEl.replaceChildren();

    ["q", "r", "b", "n"].forEach((type) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chess-promotion-btn";
      button.dataset.promotion = type;
      button.setAttribute("aria-label", "Promote to " + PIECE_NAMES[type]);

      const glyph = document.createElement("span");
      glyph.className = "chess-piece " + color;
      glyph.textContent = GLYPHS[type];
      glyph.setAttribute("aria-hidden", "true");
      button.appendChild(glyph);

      button.addEventListener("click", () => choosePromotion(type));
      promotionOptionsEl.appendChild(button);
    });

    promotionEl.hidden = false;
    const first = promotionOptionsEl.querySelector("button");
    if (first) first.focus();
  }

  function choosePromotion(type) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    hidePromotion();

    if (!makeMove({ from, to, promotion: type })) {
      selected = null;
      legalMoves = [];
      renderAll();
    }
  }

  function makeMove(move) {
    if (reviewPly !== null) return false;

    let applied = null;
    try {
      applied = game.move(move);
    } catch (error) {
      applied = null;
    }

    if (!applied) return false;

    clearHint();
    selected = null;
    legalMoves = [];
    hidePromotion();

    let flipped = false;
    if (mode === "local" && autoFlip && !game.game_over()) {
      orientation = game.turn();
      flipped = true;
    }

    renderAll();
    animateMove(applied);
    if (flipped) sweepBoard();

    if (mode === "ai" && !game.game_over()) {
      maybeAIMove();
    }

    return true;
  }

  function selectSquare(square) {
    boardEl.classList.remove("board-enter");
    selected = square;
    legalMoves = game.moves({ square, verbose: true });
    renderBoard();
  }

  function handleSquare(square) {
    if (promotionOpen || !canHumanMove()) return;

    boardEl.classList.remove("board-enter");
    const piece = game.get(square);

    if (selected) {
      const matching = legalMoves.filter((move) => move.to === square);

      if (matching.length) {
        if (matching.some((move) => move.flags.includes("p"))) {
          openPromotion(selected, square);
          return;
        }
        makeMove({ from: selected, to: square });
        return;
      }

      if (piece && piece.color === game.turn()) {
        selectSquare(square);
        return;
      }

      selected = null;
      legalMoves = [];
      renderBoard();
      return;
    }

    if (piece && piece.color === game.turn()) {
      selectSquare(square);
    }
  }

  function newGame() {
    destroyEngine();
    game = new Chess();

    selected = null;
    legalMoves = [];
    hidePromotion();
    reviewPly = null;
    reviewGame = null;
    reviewLastMove = null;

    humanColor = mode === "ai" ? resolveHumanColor() : "w";
    orientation = mode === "ai" ? humanColor : "w";

    renderAll();
    settleBoard();

    if (mode === "ai") {
      ensureEngine();
      maybeAIMove();
    }
  }

  function undo() {
    if (!canUndo()) return;

    cancelPendingAI();
    cancelPendingHint();
    reviewPly = null;
    reviewGame = null;
    reviewLastMove = null;

    const removed = [];

    if (mode === "ai") {
      const history = game.history({ verbose: true });
      let lastHuman = -1;

      for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].color === humanColor) {
          lastHuman = index;
          break;
        }
      }

      if (lastHuman < 0) return;
      removed.push(...history.slice(lastHuman));
      while (game.history().length > lastHuman) game.undo();
    } else {
      const history = game.history({ verbose: true });
      if (!history.length) return;
      removed.push(history[history.length - 1]);
      game.undo();
    }

    selected = null;
    legalMoves = [];
    hidePromotion();
    boardEl.classList.remove("board-enter");

    let flipped = false;
    if (mode === "local" && autoFlip) {
      orientation = game.turn();
      flipped = true;
    }

    renderAll();
    removed.forEach((move) => animateMove(move, { reverse: true }));

    if (flipped) {
      sweepBoard();
    } else if (removed.length) {
      pulseBoard("back");
    }

    if (mode === "ai" && !game.game_over()) {
      ensureEngine();
    }
  }

  function openDialog(title, text, action) {
    dialogTitle.textContent = title;
    dialogText.textContent = text;
    dialogAction = action;
    dialogEl.hidden = false;
    dialogCancel.focus();
  }

  function closeDialog(confirmed) {
    if (dialogEl.hidden) return;

    dialogEl.hidden = true;
    const action = dialogAction;
    dialogAction = null;

    if (confirmed && action) action();
  }

  function setMode(next) {
    if (next === mode) return;

    const apply = () => {
      mode = next;
      newGame();
    };

    if (hasGameInProgress()) {
      openDialog(
        "Start a new game?",
        "Switching to " + (next === "ai" ? "Stockfish" : "two-player") +
          " mode starts a new game.",
        apply
      );
    } else {
      apply();
    }
  }

  function setSide(next) {
    if (next === sideChoice) return;

    const apply = () => {
      sideChoice = next;
      newGame();
    };

    if (hasGameInProgress()) {
      openDialog(
        "Start a new game?",
        "Switching to " +
          (next === "random" ? "a random side" : sideName(next)) +
          " starts a new game.",
        apply
      );
    } else {
      apply();
    }
  }

  // ---------- Events ----------

  boardEl.addEventListener("click", (event) => {
    const squareEl = event.target.closest("[data-square]");
    if (!squareEl) return;
    handleSquare(squareEl.dataset.square);
  });

  newButton.addEventListener("click", newGame);
  undoButton.addEventListener("click", undo);
  hintButton.addEventListener("click", requestHint);

  delayInput.addEventListener("input", () => {
    const value = parseInt(delayInput.value, 10);
    replyDelay = Number.isFinite(value)
      ? Math.max(0, Math.min(2000, Math.round(value / 100) * 100))
      : DEFAULT_REPLY_DELAY;
    delayLabel.textContent = formatDelay(replyDelay);
    saveReplyDelay();
  });

  historyEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ply]");
    if (!button) return;
    jumpToPly(parseInt(button.dataset.ply, 10) || 0);
  });

  historyFirstButton.addEventListener("click", goFirst);
  historyPrevButton.addEventListener("click", goPrevious);
  historyNextButton.addEventListener("click", goNext);
  historyLiveButton.addEventListener("click", goLive);

  flipButton.addEventListener("click", () => {
    boardEl.classList.remove("board-enter");
    orientation = otherColor(orientation);
    renderBoard();
    renderHintArrow();
    sweepBoard();
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  sideButtons.forEach((button) => {
    button.addEventListener("click", () => setSide(button.dataset.side));
  });

  levelInput.addEventListener("input", () => {
    level = Math.max(1, Math.min(10, parseInt(levelInput.value, 10) || 1));
    levelLabel.textContent = String(level);
    levelHint.textContent = currentLevel().name;
  });

  autoflipInput.addEventListener("change", () => {
    autoFlip = autoflipInput.checked;
    if (mode === "local" && autoFlip) {
      boardEl.classList.remove("board-enter");
      orientation = game.turn();
      renderBoard();
      renderHintArrow();
      sweepBoard();
    }
  });

  dialogConfirm.addEventListener("click", () => closeDialog(true));
  dialogCancel.addEventListener("click", () => closeDialog(false));

  dialogEl.addEventListener("click", (event) => {
    if (event.target === dialogEl) closeDialog(false);
  });

  document.addEventListener("keydown", (event) => {
    if (!view || view.hidden) return;

    if (event.key === "Escape") {
      if (!dialogEl.hidden) {
        event.preventDefault();
        closeDialog(false);
        return;
      }

      if (promotionOpen) {
        event.preventDefault();
        hidePromotion();
      }
      return;
    }

    if (
      reviewPly === null ||
      !dialogEl.hidden ||
      promotionOpen ||
      event.target.closest?.("input, select, textarea")
    ) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrevious();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    } else if (event.key === "Home") {
      event.preventDefault();
      goFirst();
    } else if (event.key === "End") {
      event.preventDefault();
      goLive();
    }
  });

  window.addEventListener("resize", () => {
    if (hintMove) renderHintArrow();
  });

  window.Tools = window.Tools || {};
  window.Tools.chess = {
    enter() {
      if (!initialized) {
        initialized = true;
        newGame();
        return;
      }

      renderAll();

      if (mode === "ai" && reviewPly === null && !game.game_over()) {
        ensureEngine();
        maybeAIMove();
      }
    },
    leave() {
      closeDialog(false);
      hidePromotion();
      destroyEngine();
    },
  };
})();
