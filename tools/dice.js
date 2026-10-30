// Dice roller — animates a handful of dice, then reports the total.
(function () {
  const countInput = document.getElementById("dice-count");
  const sidesSelect = document.getElementById("dice-sides");
  const rollButton = document.getElementById("dice-roll");
  const resultsEl = document.getElementById("dice-results");
  const totalEl = document.getElementById("dice-total");
  const historyEl = document.getElementById("dice-history");
  const view = document.getElementById("view-dice");

  if (!countInput || !rollButton) return;

  let spinning = null;
  let hasRolled = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roll() {
    if (spinning) return;

    const count = clamp(parseInt(countInput.value, 10) || 1, 1, 10);
    const sides = parseInt(sidesSelect.value, 10) || 6;
    countInput.value = count;

    resultsEl.innerHTML = "";
    totalEl.innerHTML = "Total <strong>—</strong>";
    rollButton.disabled = true;
    hasRolled = true;

    const dice = [];
    for (let i = 0; i < count; i += 1) {
      const die = document.createElement("div");
      die.className = "die rolling";
      die.textContent = "?";
      resultsEl.appendChild(die);
      dice.push(die);
    }

    const finalValues = Array.from(
      { length: count },
      () => 1 + Math.floor(Math.random() * sides)
    );

    let ticks = 0;

    spinning = setInterval(() => {
      dice.forEach((die) => {
        die.textContent = String(1 + Math.floor(Math.random() * sides));
      });

      ticks += 1;

      if (ticks < 9) return;

      clearInterval(spinning);
      spinning = null;

      dice.forEach((die, index) => {
        const delay = index * 35;
        die.textContent = String(finalValues[index]);
        die.classList.remove("rolling");
        die.style.animationDelay = delay + "ms";
        die.classList.add("pop");
        setTimeout(() => {
          die.classList.remove("pop");
          die.style.animationDelay = "";
        }, 300 + delay);
      });

      const total = finalValues.reduce((sum, value) => sum + value, 0);
      totalEl.innerHTML = "Total <strong>" + total + "</strong>";
      totalEl.classList.remove("total-pop");
      void totalEl.offsetWidth;
      totalEl.classList.add("total-pop");
      addHistory(count, sides, finalValues, total);
      rollButton.disabled = false;
    }, 65);
  }

  function addHistory(count, sides, values, total) {
    const empty = historyEl.querySelector(".empty");
    if (empty) empty.remove();

    const item = document.createElement("li");
    item.textContent =
      count + "d" + sides + " · " + values.join(" + ") + " = " + total;
    historyEl.prepend(item);

    while (historyEl.children.length > 6) {
      historyEl.lastElementChild.remove();
    }
  }

  rollButton.addEventListener("click", roll);

  countInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      roll();
    }
  });

  window.Tools = window.Tools || {};
  window.Tools.dice = {
    enter() {
      if (!hasRolled) roll();
    },
    leave() {
      if (spinning) {
        clearInterval(spinning);
        spinning = null;
        rollButton.disabled = false;
        hasRolled = false;
      }
    },
  };
})();
