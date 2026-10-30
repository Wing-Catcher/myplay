// Minesweeper — first-click-safe board with flags, timer, and three sizes.
(function () {
  const boardEl = document.getElementById("ms-board");
  if (!boardEl) return;

  const minesEl = document.getElementById("ms-mines");
  const timeEl = document.getElementById("ms-time");
  const faceEl = document.getElementById("ms-face");
  const difficultyEl = document.getElementById("ms-difficulty");
  const flagModeButton = document.getElementById("ms-flag-mode");
  const hintEl = document.getElementById("ms-hint");
  const view = document.getElementById("view-minesweeper");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function bumpFace() {
    if (reduceMotion.matches) return;
    if (faceEl._motionTimer) clearTimeout(faceEl._motionTimer);
    faceEl.classList.remove("face-pop");
    void faceEl.offsetWidth;
    faceEl.classList.add("face-pop");
    faceEl._motionTimer = setTimeout(() => {
      faceEl.classList.remove("face-pop");
      faceEl._motionTimer = null;
    }, 320);
  }

  function shakeBoard() {
    if (reduceMotion.matches) return;
    if (boardEl._motionTimer) clearTimeout(boardEl._motionTimer);
    boardEl.classList.remove("is-shaking");
    void boardEl.offsetWidth;
    boardEl.classList.add("is-shaking");
    boardEl._motionTimer = setTimeout(() => {
      boardEl.classList.remove("is-shaking");
      boardEl._motionTimer = null;
    }, 420);
  }

  const DIFFICULTIES = {
    easy: { cols: 9, rows: 9, mines: 10 },
    medium: { cols: 12, rows: 12, mines: 24 },
    hard: { cols: 16, rows: 16, mines: 40 },
  };

  let config = DIFFICULTIES.easy;
  let cells = [];
  let cellEls = [];
  let firstClick = true;
  let started = false;
  let over = false;
  let flags = 0;
  let revealed = 0;
  let seconds = 0;
  let timer = null;
  let flagMode = false;

  function neighbors(index) {
    const x = index % config.cols;
    const y = Math.floor(index / config.cols);
    const result = [];

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < config.cols && ny >= 0 && ny < config.rows) {
          result.push(ny * config.cols + nx);
        }
      }
    }

    return result;
  }

  function updateMineCounter() {
    minesEl.textContent = String(config.mines - flags);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      seconds += 1;
      timeEl.textContent = String(seconds);
    }, 1000);
  }

  function resumeTimer() {
    if (started && !over && !timer) {
      timer = setInterval(() => {
        seconds += 1;
        timeEl.textContent = String(seconds);
      }, 1000);
    }
  }

  function newGame() {
    config = DIFFICULTIES[difficultyEl.value] || DIFFICULTIES.easy;
    stopTimer();

    firstClick = true;
    started = false;
    over = false;
    flags = 0;
    revealed = 0;
    seconds = 0;
    timeEl.textContent = "0";
    faceEl.textContent = "🙂";
    boardEl.classList.remove("is-shaking");
    bumpFace();
    hintEl.textContent = "Left-click to reveal · Right-click to flag";

    cells = Array.from({ length: config.cols * config.rows }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      count: 0,
    }));

    boardEl.style.setProperty("--cols", config.cols);
    boardEl.innerHTML = "";
    cellEls = cells.map((cell, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ms-cell";
      button.dataset.index = String(index);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", "Hidden square");
      boardEl.appendChild(button);
      return button;
    });

    updateMineCounter();
    setFlagMode(false);
  }

  function placeMines(safeIndex) {
    const safe = new Set([safeIndex, ...neighbors(safeIndex)]);
    const available = [];

    for (let i = 0; i < cells.length; i += 1) {
      if (!safe.has(i)) available.push(i);
    }

    for (let i = available.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }

    const mineCount = Math.min(config.mines, available.length);
    for (let i = 0; i < mineCount; i += 1) {
      cells[available[i]].mine = true;
    }

    cells.forEach((cell, index) => {
      if (cell.mine) return;
      cell.count = neighbors(index).filter((n) => cells[n].mine).length;
    });
  }

  function paintCell(index) {
    const cell = cells[index];
    const el = cellEls[index];

    if (cell.revealed) {
      el.classList.add("revealed");
      if (cell.mine) {
        el.classList.add("mine");
        el.textContent = "💣";
      } else if (cell.count > 0) {
        el.textContent = String(cell.count);
        el.classList.add("n" + cell.count);
      } else {
        el.textContent = "";
      }
    } else if (cell.flagged) {
      el.classList.add("flagged");
      el.textContent = "🚩";
    } else {
      el.classList.remove("flagged");
      el.textContent = "";
    }
  }

  function reveal(index) {
    const cell = cells[index];
    if (over || cell.revealed || cell.flagged) return;

    if (firstClick) {
      placeMines(index);
      firstClick = false;
      started = true;
      startTimer();
    }

    if (cell.mine) {
      lose(index);
      return;
    }

    const stack = [index];
    const startRevealed = revealed;

    while (stack.length) {
      const current = stack.pop();
      const target = cells[current];
      if (target.revealed || target.flagged) continue;

      target.revealed = true;
      revealed += 1;

      const step = revealed - startRevealed - 1;
      cellEls[current].style.setProperty(
        "--reveal-delay",
        Math.min(step, 20) * 8 + "ms"
      );

      paintCell(current);

      if (target.count === 0) {
        neighbors(current).forEach((neighbor) => {
          if (!cells[neighbor].revealed && !cells[neighbor].flagged) {
            stack.push(neighbor);
          }
        });
      }
    }

    checkWin();
  }

  function toggleFlag(index) {
    const cell = cells[index];
    if (over || cell.revealed) return;

    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    paintCell(index);
    updateMineCounter();
  }

  function checkWin() {
    if (revealed !== cells.length - config.mines) return;

    over = true;
    stopTimer();
    faceEl.textContent = "😎";
    bumpFace();

    cells.forEach((cell, index) => {
      if (cell.mine && !cell.flagged) {
        cell.flagged = true;
        flags += 1;
        paintCell(index);
      }
    });

    updateMineCounter();
    hintEl.textContent =
      "Cleared in " + seconds + "s! Press the face to play again.";
  }

  function lose(clickedIndex) {
    over = true;
    stopTimer();
    faceEl.textContent = "😵";
    bumpFace();
    shakeBoard();

    cells.forEach((cell, index) => {
      if (cell.mine) {
        cell.revealed = true;
        paintCell(index);
      } else if (cell.flagged) {
        cell.revealed = true;
        cellEls[index].classList.add("revealed");
        cellEls[index].textContent = "❌";
      }
    });

    cellEls[clickedIndex].classList.add("mine");
    hintEl.textContent = "Boom. Press the face to try again.";
  }

  function setFlagMode(value) {
    flagMode = value;
    flagModeButton.classList.toggle("active", flagMode);
    flagModeButton.setAttribute("aria-pressed", String(flagMode));
    flagModeButton.textContent = "Flag mode: " + (flagMode ? "on" : "off");
    boardEl.style.cursor = flagMode ? "copy" : "default";
  }

  boardEl.addEventListener("click", (event) => {
    const el = event.target.closest(".ms-cell");
    if (!el) return;

    const index = Number(el.dataset.index);
    if (flagMode) toggleFlag(index);
    else reveal(index);
  });

  boardEl.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const el = event.target.closest(".ms-cell");
    if (!el) return;
    toggleFlag(Number(el.dataset.index));
  });

  faceEl.addEventListener("click", newGame);
  difficultyEl.addEventListener("change", newGame);

  flagModeButton.addEventListener("click", () => {
    setFlagMode(!flagMode);
    hintEl.textContent = flagMode
      ? "Flag mode on — tap a square to place a flag."
      : "Left-click to reveal · Right-click to flag";
  });

  window.Tools = window.Tools || {};
  window.Tools.minesweeper = {
    enter() {
      if (!cells.length) newGame();
      else resumeTimer();
    },
    leave() {
      stopTimer();
    },
  };
})();
