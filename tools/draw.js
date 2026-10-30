// Drawing canvas — pointer drawing, eraser, undo history, and PNG export.
(function () {
  const canvas = document.getElementById("draw-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const colorInput = document.getElementById("draw-color");
  const sizeInput = document.getElementById("draw-size");
  const swatches = document.getElementById("draw-swatches");
  const eraserButton = document.getElementById("draw-eraser");
  const undoButton = document.getElementById("draw-undo");
  const clearButton = document.getElementById("draw-clear");
  const saveButton = document.getElementById("draw-save");
  const view = document.getElementById("view-draw");

  const BACKGROUND = "#ffffff";
  const MAX_UNDO = 20;

  let drawing = false;
  let lastPoint = null;
  let erasing = false;
  const undoStack = [];

  function resetCanvas() {
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function brushSize() {
    return parseInt(sizeInput.value, 10) || 6;
  }

  function strokeColor() {
    return erasing ? BACKGROUND : colorInput.value;
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function pushUndo() {
    try {
      undoStack.push(canvas.toDataURL("image/png"));
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    } catch (error) {
      // Canvas export can fail in rare browser states; drawing still works.
    }
  }

  function startStroke(event) {
    event.preventDefault();
    drawing = true;
    pushUndo();

    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore pointer capture failures.
      }
    }

    const point = pointFromEvent(event);
    lastPoint = point;

    ctx.fillStyle = strokeColor();
    ctx.beginPath();
    ctx.arc(point.x, point.y, brushSize() / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function moveStroke(event) {
    if (!drawing || !lastPoint) return;
    event.preventDefault();

    const point = pointFromEvent(event);

    ctx.strokeStyle = strokeColor();
    ctx.lineWidth = brushSize();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPoint = point;
  }

  function endStroke() {
    drawing = false;
    lastPoint = null;
  }

  function setErasing(value) {
    erasing = value;
    eraserButton.classList.toggle("active", erasing);
    eraserButton.setAttribute("aria-pressed", String(erasing));
    canvas.style.cursor = erasing ? "cell" : "crosshair";
  }

  function undo() {
    const data = undoStack.pop();
    if (!data) return;

    const image = new Image();
    image.onload = () => {
      resetCanvas();
      ctx.drawImage(image, 0, 0);
    };
    image.src = data;
  }

  function clearCanvas() {
    pushUndo();
    resetCanvas();
  }

  function saveImage() {
    const link = document.createElement("a");
    link.download = "drawing.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  canvas.addEventListener("pointerdown", startStroke);
  canvas.addEventListener("pointermove", moveStroke);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.buttons === 0) endStroke();
  });

  swatches.addEventListener("click", (event) => {
    const swatch = event.target.closest(".swatch");
    if (!swatch) return;

    colorInput.value = swatch.dataset.color;
    swatches.querySelectorAll(".swatch").forEach((item) => {
      item.classList.toggle("active", item === swatch);
    });
    setErasing(false);
  });

  colorInput.addEventListener("input", () => {
    swatches.querySelectorAll(".swatch").forEach((item) => {
      item.classList.remove("active");
    });
    setErasing(false);
  });

  eraserButton.addEventListener("click", () => setErasing(!erasing));
  undoButton.addEventListener("click", undo);
  clearButton.addEventListener("click", clearCanvas);
  saveButton.addEventListener("click", saveImage);

  document.addEventListener("keydown", (event) => {
    if (!view || view.hidden) return;
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    undo();
  });

  resetCanvas();

  window.Tools = window.Tools || {};
  window.Tools.draw = {
    enter() {},
    leave() {
      endStroke();
    },
  };
})();
