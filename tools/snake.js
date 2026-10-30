// Snake — a small canvas game with keyboard, touch, and pause support.
(function () {
  const canvas = document.getElementById("snake-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("snake-score");
  const bestEl = document.getElementById("snake-best");
  const statusEl = document.getElementById("snake-status");
  const overlayEl = document.getElementById("snake-overlay");
  const startButton = document.getElementById("snake-start");
  const pauseButton = document.getElementById("snake-pause");
  const wrapInput = document.getElementById("snake-wrap");
  const speedInput = document.getElementById("snake-speed");
  const speedLabel = document.getElementById("snake-speed-label");
  const speedNote = document.getElementById("snake-speed-note");
  const ruleNote = document.getElementById("snake-rule-note");
  const dpad = document.getElementById("snake-dpad");
  const view = document.getElementById("view-snake");
  const canvasWrap = canvas.closest(".snake-canvas-wrap");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function bump(element, className, duration) {
    if (!element || reduceMotion.matches) return;
    if (element._motionTimer) clearTimeout(element._motionTimer);
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element._motionTimer = setTimeout(() => {
      element.classList.remove(className);
      element._motionTimer = null;
    }, duration);
  }

  const COLS = 21;
  const ROWS = 21;
  const CELL = canvas.width / COLS;
  const BEST_KEY = "simple-snake-best";
  const WRAP_KEY = "simple-snake-wrap";
  const SPEED_KEY = "simple-snake-speed";

  let snake = [];
  let direction = { x: 1, y: 0 };
  let nextDirection = { x: 1, y: 0 };
  let food = null;
  let score = 0;
  let timer = null;
  let state = "idle"; // idle | playing | paused | over | won
  let best = loadBest();
  let wrapWalls = loadWrap();
  let speedLevel = loadSpeed();

  bestEl.textContent = String(best);

  function loadBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch (error) {
      // Storage can be unavailable (private mode, file://); the game still works.
    }
  }

  function loadWrap() {
    try {
      return localStorage.getItem(WRAP_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function saveWrap() {
    try {
      localStorage.setItem(WRAP_KEY, wrapWalls ? "1" : "0");
    } catch (error) {
      // The toggle still works for this visit.
    }
  }

  function loadSpeed() {
    try {
      const stored = parseInt(localStorage.getItem(SPEED_KEY), 10);
      if (Number.isFinite(stored)) return Math.max(1, Math.min(10, stored));
    } catch (error) {
      // Fall through to the default.
    }
    return 5;
  }

  function saveSpeed() {
    try {
      localStorage.setItem(SPEED_KEY, String(speedLevel));
    } catch (error) {
      // The slider still works for this visit.
    }
  }

  function speedForLevel(value) {
    return Math.round(220 * Math.pow(62 / 220, (value - 1) / 9));
  }

  function updateSpeedUI() {
    const interval = speedForLevel(speedLevel);
    speedInput.value = String(speedLevel);
    speedLabel.textContent = String(speedLevel);
    speedNote.textContent = "Level " + speedLevel + " · " + interval + " ms per step";
  }

  function updateRuleNote() {
    wrapInput.checked = wrapWalls;
    ruleNote.textContent = wrapWalls
      ? "Walls wrap around — slip out one edge and back in the other. Space pauses."
      : "Hitting a wall or your own tail ends the run. Space pauses.";
  }

  wrapInput.checked = wrapWalls;
  updateSpeedUI();
  updateRuleNote();

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawBoard() {
    ctx.fillStyle = "#fbfaf8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#eeeae3";
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.stroke();
    }
    for (let i = 1; i < ROWS; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }

    if (food) {
      const cx = (food.x + 0.5) * CELL;
      const cy = (food.y + 0.5) * CELL;
      ctx.fillStyle = "#d9534f";
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.32, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.beginPath();
      ctx.arc(cx - CELL * 0.1, cy - CELL * 0.1, CELL * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    snake.forEach((segment, index) => {
      const isHead = index === 0;
      ctx.fillStyle = isHead ? "#2f6f4f" : index % 2 === 0 ? "#4c8f6c" : "#559a76";
      roundedRect(
        segment.x * CELL + 1.5,
        segment.y * CELL + 1.5,
        CELL - 3,
        CELL - 3,
        6
      );
      ctx.fill();
    });

    if (snake.length) {
      const head = snake[0];
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      const eyeY = head.y * CELL + CELL * 0.38;
      const eyeOffsetX = direction.y !== 0 ? CELL * 0.3 : CELL * 0.2;
      const eyeOffsetY = direction.x !== 0 ? CELL * 0.3 : CELL * 0.2;
      ctx.beginPath();
      ctx.arc(head.x * CELL + CELL / 2 - eyeOffsetX, eyeY, CELL * 0.07, 0, Math.PI * 2);
      ctx.arc(head.x * CELL + CELL / 2 + eyeOffsetX, eyeY + eyeOffsetY * 0.2, CELL * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!snake.some((segment) => segment.x === x && segment.y === y)) {
          free.push({ x, y });
        }
      }
    }

    if (!free.length) {
      food = null;
      return false;
    }

    food = free[Math.floor(Math.random() * free.length)];
    return true;
  }

  function reset() {
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    scoreEl.textContent = "0";
    placeFood();
    drawBoard();
  }

  function stopTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleTick() {
    stopTimer();
    if (state !== "playing") return;

    timer = setTimeout(() => {
      timer = null;
      if (state !== "playing") return;
      tick();
      if (state === "playing") scheduleTick();
    }, speedForLevel(speedLevel));
  }

  function showOverlay(html) {
    overlayEl.innerHTML = '<div class="overlay-inner">' + html + "</div>";
    overlayEl.hidden = false;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
    overlayEl.innerHTML = "";
  }

  function showStartOverlay() {
    showOverlay(
      "<h3>Ready?</h3><p>Eat the red dots. " +
        (wrapWalls
          ? "The edges wrap around — don't bite your tail."
          : "Don't hit the walls or your tail.") +
        "</p>" +
        '<button class="btn btn-primary" type="button" data-snake-action="start">Start</button>'
    );
  }

  function showPauseOverlay() {
    showOverlay(
      "<h3>Paused</h3><p>Take your time.</p>" +
        '<button class="btn btn-primary" type="button" data-snake-action="resume">Resume</button>'
    );
  }

  function start() {
    stopTimer();
    reset();
    state = "playing";
    statusEl.textContent = "Playing";
    startButton.textContent = "Restart";
    pauseButton.disabled = false;
    pauseButton.textContent = "Pause";
    hideOverlay();
    scheduleTick();
  }

  function endGame(won) {
    stopTimer();
    state = won ? "won" : "over";
    statusEl.textContent = won ? "You win!" : "Game over";
    if (!won) bump(canvasWrap, "is-shaking", 400);
    pauseButton.disabled = true;
    startButton.textContent = "Play again";

    showOverlay(
      "<h3>" +
        (won ? "Perfect run!" : "Game over") +
        "</h3><p>Score " +
        score +
        (won ? " — you filled the board." : " · Best " + best) +
        "</p>" +
        '<button class="btn btn-primary" type="button" data-snake-action="start">Play again</button>'
    );
  }

  function tick() {
    if (state !== "playing") return;

    direction = nextDirection;

    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y,
    };

    if (wrapWalls) {
      head.x = ((head.x % COLS) + COLS) % COLS;
      head.y = ((head.y % ROWS) + ROWS) % ROWS;
    } else if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
      endGame(false);
      return;
    }

    const willEat = food && head.x === food.x && head.y === food.y;
    const body = willEat ? snake : snake.slice(0, -1);

    if (body.some((segment) => segment.x === head.x && segment.y === head.y)) {
      endGame(false);
      return;
    }

    snake.unshift(head);

    if (willEat) {
      score += 1;
      scoreEl.textContent = String(score);
      bump(scoreEl, "score-bump", 320);

      if (score > best) {
        best = score;
        bestEl.textContent = String(best);
        saveBest();
      }

      if (!placeFood()) {
        drawBoard();
        endGame(true);
        return;
      }
    } else {
      snake.pop();
    }

    drawBoard();
  }

  function pause() {
    if (state !== "playing") return;
    stopTimer();
    state = "paused";
    statusEl.textContent = "Paused";
    pauseButton.textContent = "Resume";
    showPauseOverlay();
  }

  function resume() {
    if (state !== "paused") return;
    state = "playing";
    statusEl.textContent = "Playing";
    pauseButton.textContent = "Pause";
    hideOverlay();
    scheduleTick();
  }

  function togglePause() {
    if (state === "playing") pause();
    else if (state === "paused") resume();
  }

  function setDirection(next) {
    if (next.x === -direction.x && next.y === -direction.y) return;
    nextDirection = next;
  }

  function handleDirection(next) {
    if (state === "paused") resume();
    if (state === "idle" || state === "over" || state === "won") start();
    if (state === "playing") setDirection(next);
  }

  startButton.addEventListener("click", start);
  pauseButton.addEventListener("click", togglePause);

  wrapInput.addEventListener("change", () => {
    wrapWalls = wrapInput.checked;
    saveWrap();
    updateRuleNote();
    if (state === "idle") showStartOverlay();
  });

  speedInput.addEventListener("input", () => {
    const value = parseInt(speedInput.value, 10);
    speedLevel = Number.isFinite(value)
      ? Math.max(1, Math.min(10, value))
      : 5;
    updateSpeedUI();
    saveSpeed();
    if (state === "playing") scheduleTick();
  });

  overlayEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-snake-action]");
    if (!button) return;

    if (button.dataset.snakeAction === "start") start();
    else if (button.dataset.snakeAction === "resume") resume();
  });

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  dpad.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dir]");
    if (!button) return;
    handleDirection(DIRECTIONS[button.dataset.dir]);
  });

  const KEY_DIRECTIONS = {
    arrowup: DIRECTIONS.up,
    arrowdown: DIRECTIONS.down,
    arrowleft: DIRECTIONS.left,
    arrowright: DIRECTIONS.right,
    w: DIRECTIONS.up,
    s: DIRECTIONS.down,
    a: DIRECTIONS.left,
    d: DIRECTIONS.right,
  };

  document.addEventListener("keydown", (event) => {
    if (!view || view.hidden) return;
    if (event.target.closest?.("input, select, textarea")) return;

    if (event.key === " ") {
      event.preventDefault();
      if (state === "playing" || state === "paused") togglePause();
      else start();
      return;
    }

    const next = KEY_DIRECTIONS[event.key.toLowerCase()];
    if (!next) return;

    event.preventDefault();
    handleDirection(next);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  window.Tools = window.Tools || {};
  window.Tools.snake = {
    enter() {
      if (state === "idle") {
        reset();
        showStartOverlay();
      }
    },
    leave() {
      pause();
    },
  };
})();
