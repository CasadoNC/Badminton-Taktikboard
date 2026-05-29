const board = document.querySelector("#board");
const canvas = document.querySelector("#drawingCanvas");
const ctx = canvas.getContext("2d");
const arrowLayer = document.querySelector("#arrowLayer");
const arrowDefs = arrowLayer.querySelector("defs");
const tools = document.querySelectorAll(".tool");
const swatches = document.querySelectorAll(".swatch");
const clearLinesButton = document.querySelector("#clearLines");
const resetButton = document.querySelector("#resetBoard");
const addHomeButton = document.querySelector("#addHome");
const addAwayButton = document.querySelector("#addAway");
const addShuttleButton = document.querySelector("#addShuttle");
const saveStepButton = document.querySelector("#saveStep");
const prevStepButton = document.querySelector("#prevStep");
const playSequenceButton = document.querySelector("#playSequence");
const nextStepButton = document.querySelector("#nextStep");
const deleteStepButton = document.querySelector("#deleteStep");
const stepCounter = document.querySelector("#stepCounter");
const sequenceSpeedInput = document.querySelector("#sequenceSpeed");

const state = {
  mode: "select",
  color: "#ff4d4d",
  tokenCounts: { home: 0, away: 0, shuttle: 0 },
  activeToken: null,
  activeArrow: null,
  selectedArrow: null,
  drawing: false,
  arrowStart: null,
  sequence: {
    steps: [],
    currentIndex: -1,
    playing: false,
    speed: 1,
  },
};

function resizeCanvas() {
  const rect = board.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const image = ctx.getImageData(0, 0, canvas.width || 1, canvas.height || 1);

  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (image.width > 1 && image.height > 1) {
    const temp = document.createElement("canvas");
    temp.width = image.width;
    temp.height = image.height;
    temp.getContext("2d").putImageData(image, 0, 0);
    ctx.drawImage(temp, 0, 0, rect.width, rect.height);
  }
}

function pointFromEvent(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
  };
}

function setMode(mode) {
  state.mode = mode;
  tools.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  board.classList.toggle("select-mode", mode === "select");
  board.classList.toggle("erase-mode", mode === "erase");
}

function addToken(type, xPercent, yPercent) {
  state.tokenCounts[type] += 1;
  const token = document.createElement("button");
  token.className = `token ${type === "shuttle" ? "shuttle" : `player ${type}`}`;
  token.type = "button";
  token.style.left = `${xPercent}%`;
  token.style.top = `${yPercent}%`;
  token.dataset.type = type;
  token.setAttribute("aria-label", type === "shuttle" ? "Shuttle" : `${type === "home" ? "Heimspieler" : "Gegner"} ${state.tokenCounts[type]}`);

  if (type === "shuttle") {
    const image = document.createElement("img");
    image.src = "assets/shuttle.svg";
    image.alt = "";
    image.draggable = false;
    token.appendChild(image);
  } else {
    token.textContent = state.tokenCounts[type];
  }

  token.addEventListener("pointerdown", (event) => {
    if (state.mode !== "select") return;
    event.preventDefault();
    token.setPointerCapture(event.pointerId);
    state.activeToken = token;
  });

  token.addEventListener("pointermove", (event) => {
    if (state.activeToken !== token) return;
    const rect = board.getBoundingClientRect();
    const point = pointFromEvent(event);
    token.style.left = `${(point.x / rect.width) * 100}%`;
    token.style.top = `${(point.y / rect.height) * 100}%`;
  });

  token.addEventListener("pointerup", () => {
    state.activeToken = null;
  });

  board.appendChild(token);
}

function seedBoard() {
  board.querySelectorAll(".token").forEach((token) => token.remove());
  state.tokenCounts = { home: 0, away: 0, shuttle: 0 };
  addToken("home", 35, 73);
  addToken("home", 65, 73);
  addToken("away", 35, 27);
  addToken("away", 65, 27);
  addToken("shuttle", 52, 47);
}

function clearLines() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  clearArrows();
}

function clearArrows() {
  clearArrowSelection();
  arrowLayer.querySelectorAll("g.play-arrow").forEach((arrow) => arrow.remove());
}

function markerIdForColor(color) {
  return `arrowHead-${color.replace("#", "")}`;
}

function ensureArrowMarker(color) {
  const markerId = markerIdForColor(color);
  if (document.getElementById(markerId)) return markerId;

  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", markerId);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");

  const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
  head.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  head.setAttribute("fill", color);
  marker.appendChild(head);
  arrowDefs.appendChild(marker);

  return markerId;
}

function drawArrow(start, end, color = state.color) {
  const markerId = ensureArrowMarker(color);
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "path");

  arrow.classList.add("play-arrow");
  arrow.dataset.x1 = start.x;
  arrow.dataset.y1 = start.y;
  arrow.dataset.x2 = end.x;
  arrow.dataset.y2 = end.y;

  path.classList.add("play-arrow-line");
  path.setAttribute("stroke", color);
  path.setAttribute("marker-end", `url(#${markerId})`);

  hitArea.classList.add("play-arrow-hit");
  hitArea.setAttribute("stroke", "transparent");

  arrow.append(path, hitArea);
  updateArrowPath(arrow);
  enableArrowDrag(arrow);
  arrowLayer.appendChild(arrow);
}

function selectArrow(arrow) {
  if (state.selectedArrow && state.selectedArrow !== arrow) {
    state.selectedArrow.classList.remove("selected");
  }

  state.selectedArrow = arrow;
  arrow.classList.add("selected");
}

function clearArrowSelection() {
  if (!state.selectedArrow) return;
  state.selectedArrow.classList.remove("selected");
  state.selectedArrow = null;
}

function updateArrowPath(arrow) {
  const pathData = `M ${arrow.dataset.x1} ${arrow.dataset.y1} L ${arrow.dataset.x2} ${arrow.dataset.y2}`;
  arrow.querySelectorAll("path").forEach((path) => path.setAttribute("d", pathData));
}

function enableArrowDrag(arrow) {
  arrow.addEventListener("pointerdown", (event) => {
    if (state.mode !== "select") return;
    event.preventDefault();
    event.stopPropagation();
    selectArrow(arrow);
    arrow.setPointerCapture(event.pointerId);
    state.activeArrow = {
      arrow,
      point: pointFromEvent(event),
      x1: Number(arrow.dataset.x1),
      y1: Number(arrow.dataset.y1),
      x2: Number(arrow.dataset.x2),
      y2: Number(arrow.dataset.y2),
    };
  });

  arrow.addEventListener("pointermove", (event) => {
    if (!state.activeArrow || state.activeArrow.arrow !== arrow) return;
    const currentPoint = pointFromEvent(event);
    const dx = currentPoint.x - state.activeArrow.point.x;
    const dy = currentPoint.y - state.activeArrow.point.y;
    arrow.dataset.x1 = state.activeArrow.x1 + dx;
    arrow.dataset.y1 = state.activeArrow.y1 + dy;
    arrow.dataset.x2 = state.activeArrow.x2 + dx;
    arrow.dataset.y2 = state.activeArrow.y2 + dy;
    updateArrowPath(arrow);
  });

  arrow.addEventListener("pointerup", () => {
    state.activeArrow = null;
  });
}

function getTokenSnapshots() {
  const counts = {};
  return [...board.querySelectorAll(".token")].map((token) => {
    const type = token.dataset.type;
    counts[type] = (counts[type] || 0) + 1;
    return {
      type,
      index: counts[type],
      left: Number.parseFloat(token.style.left),
      top: Number.parseFloat(token.style.top),
    };
  });
}

function getArrowSnapshots() {
  return [...arrowLayer.querySelectorAll("g.play-arrow")].map((arrow) => ({
    x1: Number(arrow.dataset.x1),
    y1: Number(arrow.dataset.y1),
    x2: Number(arrow.dataset.x2),
    y2: Number(arrow.dataset.y2),
    color: arrow.querySelector(".play-arrow-line")?.getAttribute("stroke") || state.color,
  }));
}

function captureBoardState() {
  return {
    tokens: getTokenSnapshots(),
    arrows: getArrowSnapshots(),
  };
}

function tokenKey(tokenSnapshot) {
  return `${tokenSnapshot.type}-${tokenSnapshot.index}`;
}

function currentTokenMap() {
  const counts = {};
  const map = new Map();
  board.querySelectorAll(".token").forEach((token) => {
    const type = token.dataset.type;
    counts[type] = (counts[type] || 0) + 1;
    map.set(`${type}-${counts[type]}`, token);
  });
  return map;
}

function restoreArrows(arrows) {
  clearArrows();
  arrows.forEach((arrow) => {
    drawArrow(
      { x: arrow.x1, y: arrow.y1 },
      { x: arrow.x2, y: arrow.y2 },
      arrow.color,
    );
  });
}

function restoreTokens(tokens) {
  board.querySelectorAll(".token").forEach((token) => token.remove());
  state.tokenCounts = { home: 0, away: 0, shuttle: 0 };
  tokens.forEach((token) => addToken(token.type, token.left, token.top));
}

function restoreBoardState(snapshot) {
  stopSequence();
  restoreTokens(snapshot.tokens);
  restoreArrows(snapshot.arrows);
}

function animateTokenTo(token, target, duration) {
  return new Promise((resolve) => {
    token.classList.add("sequencing");
    token.style.setProperty("--sequence-duration", `${duration}ms`);
    requestAnimationFrame(() => {
      token.style.left = `${target.left}%`;
      token.style.top = `${target.top}%`;
    });
    window.setTimeout(() => {
      token.classList.remove("sequencing");
      token.style.removeProperty("--sequence-duration");
      resolve();
    }, duration);
  });
}

async function animateToBoardState(snapshot) {
  const duration = Math.round(900 / state.sequence.speed);
  const existingTokens = currentTokenMap();
  const targetKeys = new Set(snapshot.tokens.map(tokenKey));
  const animations = [];

  snapshot.tokens.forEach((target) => {
    const existing = existingTokens.get(tokenKey(target));
    if (existing) {
      animations.push(animateTokenTo(existing, target, duration));
    } else {
      addToken(target.type, target.left, target.top);
    }
  });

  existingTokens.forEach((token, key) => {
    if (!targetKeys.has(key)) token.remove();
  });

  clearArrows();
  await Promise.all(animations);
  restoreArrows(snapshot.arrows);
}

function updateSequenceUi() {
  const total = state.sequence.steps.length;
  const current = state.sequence.currentIndex >= 0 ? state.sequence.currentIndex + 1 : 0;
  stepCounter.textContent = `${current}/${total}`;
  prevStepButton.disabled = total === 0 || state.sequence.currentIndex <= 0 || state.sequence.playing;
  nextStepButton.disabled = total === 0 || state.sequence.currentIndex >= total - 1 || state.sequence.playing;
  deleteStepButton.disabled = total === 0 || state.sequence.playing;
  playSequenceButton.disabled = total < 2;
  playSequenceButton.textContent = state.sequence.playing ? "Ⅱ" : "▶";
}

function saveStep() {
  state.sequence.steps.push(captureBoardState());
  state.sequence.currentIndex = state.sequence.steps.length - 1;
  updateSequenceUi();
}

function goToStep(index) {
  if (index < 0 || index >= state.sequence.steps.length || state.sequence.playing) return;
  state.sequence.currentIndex = index;
  restoreBoardState(state.sequence.steps[index]);
  updateSequenceUi();
}

function stopSequence() {
  if (!state.sequence.playing) return;
  state.sequence.playing = false;
  updateSequenceUi();
}

async function playSequence() {
  if (state.sequence.playing) {
    stopSequence();
    return;
  }

  if (state.sequence.steps.length < 2) return;
  state.sequence.playing = true;
  setMode("select");
  clearArrowSelection();

  let index = state.sequence.currentIndex > -1 ? state.sequence.currentIndex : 0;
  if (index >= state.sequence.steps.length - 1) index = 0;
  state.sequence.currentIndex = index;
  restoreBoardState(state.sequence.steps[index]);
  state.sequence.playing = true;
  updateSequenceUi();

  while (state.sequence.playing && state.sequence.currentIndex < state.sequence.steps.length - 1) {
    const nextIndex = state.sequence.currentIndex + 1;
    await animateToBoardState(state.sequence.steps[nextIndex]);
    if (!state.sequence.playing) break;
    state.sequence.currentIndex = nextIndex;
    updateSequenceUi();
    await new Promise((resolve) => window.setTimeout(resolve, Math.round(260 / state.sequence.speed)));
  }

  state.sequence.playing = false;
  updateSequenceUi();
}

function deleteCurrentStep() {
  if (state.sequence.playing || state.sequence.currentIndex < 0) return;
  state.sequence.steps.splice(state.sequence.currentIndex, 1);
  if (state.sequence.steps.length === 0) {
    state.sequence.currentIndex = -1;
  } else {
    state.sequence.currentIndex = Math.min(state.sequence.currentIndex, state.sequence.steps.length - 1);
    restoreBoardState(state.sequence.steps[state.sequence.currentIndex]);
  }
  updateSequenceUi();
}

function eraseAt(point) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(point.x, point.y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  arrowLayer.querySelectorAll("g.play-arrow").forEach((arrow) => {
    const box = arrow.getBBox();
    const nearX = point.x >= box.x - 16 && point.x <= box.x + box.width + 16;
    const nearY = point.y >= box.y - 16 && point.y <= box.y + box.height + 16;
    if (nearX && nearY) arrow.remove();
  });
}

board.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".token")) return;
  if (state.mode === "select" && !event.target.closest(".play-arrow")) {
    clearArrowSelection();
  }

  const point = pointFromEvent(event);

  if (state.mode === "draw") {
    state.drawing = true;
    ctx.strokeStyle = state.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  if (state.mode === "erase") {
    state.drawing = true;
    eraseAt(point);
  }

  if (state.mode === "arrow") {
    state.arrowStart = point;
  }
});

board.addEventListener("pointermove", (event) => {
  if (!state.drawing) return;
  const point = pointFromEvent(event);

  if (state.mode === "draw") {
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  if (state.mode === "erase") {
    eraseAt(point);
  }
});

board.addEventListener("pointerup", (event) => {
  const point = pointFromEvent(event);
  if (state.mode === "arrow" && state.arrowStart) {
    drawArrow(state.arrowStart, point);
  }

  state.drawing = false;
  state.arrowStart = null;
});

tools.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

swatches.forEach((button) => {
  button.addEventListener("click", () => {
    state.color = button.dataset.color;
    swatches.forEach((item) => item.classList.toggle("active", item === button));
  });
});

addHomeButton.addEventListener("click", () => addToken("home", 50, 72));
addAwayButton.addEventListener("click", () => addToken("away", 50, 28));
addShuttleButton.addEventListener("click", () => addToken("shuttle", 50, 50));
clearLinesButton.addEventListener("click", clearLines);
resetButton.addEventListener("click", () => {
  stopSequence();
  clearLines();
  seedBoard();
  setMode("select");
});
saveStepButton.addEventListener("click", saveStep);
prevStepButton.addEventListener("click", () => goToStep(state.sequence.currentIndex - 1));
nextStepButton.addEventListener("click", () => goToStep(state.sequence.currentIndex + 1));
playSequenceButton.addEventListener("click", playSequence);
deleteStepButton.addEventListener("click", deleteCurrentStep);
sequenceSpeedInput.addEventListener("input", () => {
  state.sequence.speed = Number(sequenceSpeedInput.value);
});

window.addEventListener("keydown", (event) => {
  if ((event.key === "Delete" || event.key === "Del") && state.selectedArrow) {
    event.preventDefault();
    state.selectedArrow.remove();
    state.selectedArrow = null;
  }
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
seedBoard();
setMode("select");
updateSequenceUi();
