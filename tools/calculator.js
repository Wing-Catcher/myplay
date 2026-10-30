// Calculator — a small recursive-descent expression evaluator.
(function () {
  const root = document.getElementById("calc");
  if (!root) return;

  const output = document.getElementById("calc-output");
  const historyEl = document.getElementById("calc-history");
  const view = document.getElementById("view-calculator");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function bumpOutput() {
    if (reduceMotion.matches) return;
    output.classList.remove("calc-bump");
    void output.offsetWidth;
    output.classList.add("calc-bump");
  }

  let expr = "";
  let lastEquation = "";
  let justEvaluated = false;

  function formatExpr(value) {
    return value.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
  }

  function currentNumber() {
    const match = expr.match(/(\d+\.?\d*|\.\d*)$/);
    return match ? match[0] : "";
  }

  function formatResult(number) {
    if (!Number.isFinite(number)) return "Error";
    const rounded = Math.round(number * 1e10) / 1e10;
    return String(rounded);
  }

  function tokenize(source) {
    const tokens = [];
    let i = 0;

    while (i < source.length) {
      const char = source[i];

      if (char === " ") {
        i += 1;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        let number = "";
        while (i < source.length && /[0-9.]/.test(source[i])) {
          number += source[i];
          i += 1;
        }
        if (number === "." || (number.match(/\./g) || []).length > 1) {
          throw new Error("Invalid number");
        }
        tokens.push({ type: "num", value: parseFloat(number) });
      } else if ("+-*/".includes(char)) {
        tokens.push({ type: "op", value: char });
        i += 1;
      } else {
        throw new Error("Invalid character");
      }
    }

    return tokens;
  }

  function evaluate(source) {
    const tokens = tokenize(source);
    let pos = 0;

    const peek = () => tokens[pos];

    function parseUnary() {
      const token = peek();
      if (!token) throw new Error("Unexpected end");

      if (token.type === "op" && (token.value === "-" || token.value === "+")) {
        pos += 1;
        const value = parseUnary();
        return token.value === "-" ? -value : value;
      }

      if (token.type === "num") {
        pos += 1;
        return token.value;
      }

      throw new Error("Unexpected token");
    }

    function parseTerm() {
      let value = parseUnary();
      while (
        peek() &&
        peek().type === "op" &&
        (peek().value === "*" || peek().value === "/")
      ) {
        const op = tokens[pos].value;
        pos += 1;
        const rhs = parseUnary();
        value = op === "*" ? value * rhs : value / rhs;
      }
      return value;
    }

    function parseExpression() {
      let value = parseTerm();
      while (
        peek() &&
        peek().type === "op" &&
        (peek().value === "+" || peek().value === "-")
      ) {
        const op = tokens[pos].value;
        pos += 1;
        const rhs = parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      }
      return value;
    }

    const value = parseExpression();
    if (pos !== tokens.length) throw new Error("Trailing input");
    return value;
  }

  function render() {
    output.textContent = expr === "" ? "0" : formatExpr(expr);

    if (justEvaluated) {
      historyEl.textContent = lastEquation;
      return;
    }

    const hasOperator = /[+\-*/]/.test(expr.replace(/^-/, ""));
    const endsWithOperator = /[+\-*/]$/.test(expr);

    if (hasOperator && !endsWithOperator) {
      try {
        historyEl.textContent = "= " + formatResult(evaluate(expr));
        return;
      } catch (error) {
        // Fall through to the hint below while the user is mid-expression.
      }
    }

    historyEl.textContent = lastEquation || "Ready when you are";
  }

  function appendNumber(char) {
    if (justEvaluated) {
      expr = "";
      justEvaluated = false;
    }

    if (char === ".") {
      const number = currentNumber();
      if (number.includes(".")) return;
      if (number === "") expr += "0";
    } else {
      const number = currentNumber();
      if (number === "0") expr = expr.slice(0, -1);
    }

    expr += char;
    render();
  }

  function appendOperator(op) {
    if (expr === "Error") return;
    justEvaluated = false;

    if (expr === "") {
      if (op === "-") {
        expr = "-";
        render();
      }
      return;
    }

    if (expr === "-") return;

    if (/[+\-*/]$/.test(expr)) {
      expr = expr.slice(0, -1) + op;
    } else {
      if (expr.endsWith(".")) expr = expr.slice(0, -1);
      expr += op;
    }

    render();
  }

  function backspace() {
    if (justEvaluated) {
      clear();
      return;
    }
    expr = expr.slice(0, -1);
    render();
  }

  function clear() {
    expr = "";
    lastEquation = "";
    justEvaluated = false;
    render();
  }

  function toggleSign() {
    if (expr === "Error") return;
    justEvaluated = false;

    const match = expr.match(/(\d*\.?\d+)$/);
    if (!match) {
      if (expr === "") expr = "-";
      render();
      return;
    }

    const start = expr.length - match[0].length;
    const before = expr[start - 1];

    if (before === "-" && (start === 1 || "+-*/".includes(expr[start - 2]))) {
      expr = expr.slice(0, start - 1) + expr.slice(start);
    } else {
      expr = expr.slice(0, start) + "-" + expr.slice(start);
    }

    render();
  }

  function equals() {
    if (expr === "" || expr === "Error") return;

    try {
      const value = evaluate(expr);
      const result = formatResult(value);

      if (result === "Error") {
        lastEquation = "That one doesn't compute";
        expr = "Error";
      } else {
        lastEquation = formatExpr(expr) + " =";
        expr = result;
      }

      justEvaluated = true;
    } catch (error) {
      lastEquation = "That expression didn't work";
      expr = "";
      justEvaluated = false;
    }

    render();
    bumpOutput();
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const { num, op, action } = button.dataset;

    if (num !== undefined) appendNumber(num);
    else if (op !== undefined) appendOperator(op);
    else if (action === "clear") clear();
    else if (action === "backspace") backspace();
    else if (action === "sign") toggleSign();
    else if (action === "equals") equals();
  });

  function isActive() {
    return view && !view.hidden;
  }

  document.addEventListener("keydown", (event) => {
    if (!isActive()) return;
    if (event.target.closest?.("input, select, textarea")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (/^[0-9.]$/.test(event.key)) {
      event.preventDefault();
      appendNumber(event.key);
    } else if ("+-*/".includes(event.key)) {
      event.preventDefault();
      appendOperator(event.key);
    } else if (event.key === "x" || event.key === "X") {
      event.preventDefault();
      appendOperator("*");
    } else if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      equals();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      backspace();
    } else if (event.key === "Escape") {
      clear();
    }
  });

  window.Tools = window.Tools || {};
  window.Tools.calculator = {
    enter() {
      render();
    },
    leave() {},
  };
})();
