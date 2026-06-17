const board = document.querySelector("#board");
const canvas = document.querySelector("#drawingCanvas");
const ctx = canvas.getContext("2d");
const areaLayer = document.querySelector("#areaLayer");
const arrowLayer = document.querySelector("#arrowLayer");
const arrowDefs = arrowLayer.querySelector("defs");
const tools = document.querySelectorAll(".tool");
const colorMenuButton = document.querySelector("#colorMenuButton");
const colorMenu = document.querySelector("#colorMenu");
const colorPreview = document.querySelector("#colorPreview");
const colorOptions = document.querySelectorAll(".color-option");
const resetButton = document.querySelector("#resetBoard");
const addHomeButton = document.querySelector("#addHome");
const addAwayButton = document.querySelector("#addAway");
const addShuttleButton = document.querySelector("#addShuttle");
const projectTitleInput = document.querySelector("#projectTitle");
const boardTitle = document.querySelector("#boardTitle");
const notesInput = document.querySelector("#notes");
const saveStepButton = document.querySelector("#saveStep");
const prevStepButton = document.querySelector("#prevStep");
const playSequenceButton = document.querySelector("#playSequence");
const nextStepButton = document.querySelector("#nextStep");
const deleteStepButton = document.querySelector("#deleteStep");
const stepCounter = document.querySelector("#stepCounter");
const sequenceSpeedInput = document.querySelector("#sequenceSpeed");
const exportProjectButton = document.querySelector("#exportProject");
const importProjectButton = document.querySelector("#importProject");
const importFileInput = document.querySelector("#importFile");
const storageStatus = document.querySelector("#storageStatus");

const STORAGE_KEY = "badminton-taktikboard-project";
const FIELD_BOUNDS = {
  left: 5.79,
  net: 49.1,
  right: 93.98,
  top: 11.39,
  bottom: 87.99,
};
const MIN_AREA_SIZE = 2;

const state = {
  mode: "select",
  color: "#ff4d4d",
  tokenCounts: { home: 0, away: 0, shuttle: 0 },
  activeToken: null,
  selectedToken: null,
  activeArrow: null,
  selectedArrow: null,
  activeAreaDrag: null,
  activeAreaResize: null,
  selectedArea: null,
  drawing: false,
  arrowStart: null,
  areaStart: null,
  activeArea: null,
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fieldBoundsInPixels() {
  const rect = board.getBoundingClientRect();
  return {
    left: (FIELD_BOUNDS.left / 100) * rect.width,
    right: (FIELD_BOUNDS.right / 100) * rect.width,
    top: (FIELD_BOUNDS.top / 100) * rect.height,
    bottom: (FIELD_BOUNDS.bottom / 100) * rect.height,
  };
}

function clampPointToField(point) {
  const bounds = fieldBoundsInPixels();
  return {
    x: clamp(point.x, bounds.left, bounds.right),
    y: clamp(point.y, bounds.top, bounds.bottom),
  };
}

function areaSideFromPercent(xPercent) {
  return xPercent < FIELD_BOUNDS.net ? "left" : "right";
}

function horizontalBoundsForSide(side) {
  return side === "left"
    ? { left: FIELD_BOUNDS.left, right: FIELD_BOUNDS.net }
    : { left: FIELD_BOUNDS.net, right: FIELD_BOUNDS.right };
}

function areaSideFromSnapshot(snapshot) {
  return snapshot.side || areaSideFromPercent(Number(snapshot.left) + (Number(snapshot.width) || 0) / 2);
}

function constrainAreaSnapshot(snapshot) {
  const side = areaSideFromSnapshot(snapshot);
  const horizontal = horizontalBoundsForSide(side);
  const maxWidth = horizontal.right - horizontal.left;
  const maxHeight = FIELD_BOUNDS.bottom - FIELD_BOUNDS.top;
  const width = clamp(Number(snapshot.width) || 0, 0, maxWidth);
  const height = clamp(Number(snapshot.height) || 0, 0, maxHeight);

  return {
    ...snapshot,
    side,
    color: snapshot.color || state.color,
    left: clamp(Number(snapshot.left) || horizontal.left, horizontal.left, horizontal.right - width),
    top: clamp(Number(snapshot.top) || FIELD_BOUNDS.top, FIELD_BOUNDS.top, FIELD_BOUNDS.bottom - height),
    width,
    height,
  };
}

function setMode(mode) {
  state.mode = mode;
  tools.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  board.classList.toggle("select-mode", mode === "select");
  board.classList.toggle("erase-mode", mode === "erase");
  board.classList.toggle("area-mode", mode === "area");
}

function tokenLabel(type, index) {
  if (type === "shuttle") return index > 1 ? `Shuttle ${index}` : "Shuttle";
  return `${type === "home" ? "Heimspieler" : "Gegner"} ${index}`;
}

function refreshTokenLabels() {
  const counts = { home: 0, away: 0, shuttle: 0 };
  board.querySelectorAll(".token").forEach((token) => {
    const type = token.dataset.type;
    counts[type] = (counts[type] || 0) + 1;
    token.setAttribute("aria-label", tokenLabel(type, counts[type]));
    if (type !== "shuttle") token.textContent = counts[type];
  });
  state.tokenCounts = counts;
}

function selectToken(token) {
  clearArrowSelection();
  clearAreaSelection();
  if (state.selectedToken && state.selectedToken !== token) {
    state.selectedToken.classList.remove("selected");
  }

  state.selectedToken = token;
  token.classList.add("selected");
}

function clearTokenSelection() {
  if (!state.selectedToken) return;
  state.selectedToken.classList.remove("selected");
  state.selectedToken = null;
}

function removeToken(token) {
  if (!token) return;
  if (state.activeToken === token) state.activeToken = null;
  if (state.selectedToken === token) state.selectedToken = null;
  token.remove();
  refreshTokenLabels();
}

function addToken(type, xPercent, yPercent) {
  state.tokenCounts[type] += 1;
  const token = document.createElement("button");
  token.className = `token ${type === "shuttle" ? "shuttle" : `player ${type}`}`;
  token.type = "button";
  token.style.left = `${xPercent}%`;
  token.style.top = `${yPercent}%`;
  token.dataset.type = type;
  token.setAttribute("aria-label", tokenLabel(type, state.tokenCounts[type]));

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
    event.stopPropagation();
    selectToken(token);
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
  clearTokenSelection();
  board.querySelectorAll(".token").forEach((token) => token.remove());
  state.tokenCounts = { home: 0, away: 0, shuttle: 0 };
  addToken("home", 28, 35);
  addToken("home", 28, 65);
  addToken("away", 72, 35);
  addToken("away", 72, 65);
  addToken("shuttle", 50, 50);
}

function clearLines() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  clearAreas();
  clearArrows();
}

function setStorageStatus(message) {
  storageStatus.textContent = message;
  window.clearTimeout(setStorageStatus.timeout);
  setStorageStatus.timeout = window.setTimeout(() => {
    storageStatus.textContent = "";
  }, 2600);
}

function updateBoardTitle() {
  const title = projectTitleInput.value.trim();
  boardTitle.textContent = title;
  boardTitle.hidden = title.length === 0;
}

function canvasImage() {
  return canvas.toDataURL("image/png");
}

function restoreCanvas(imageData) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!imageData) return;

  const image = new Image();
  image.addEventListener("load", () => {
    const rect = board.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, rect.width, rect.height);
  });
  image.src = imageData;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function clearAreas() {
  state.activeArea = null;
  clearAreaSelection();
  areaLayer.querySelectorAll(".marked-area").forEach((area) => area.remove());
}

function normalizeArea(start, end) {
  const rect = board.getBoundingClientRect();
  const constrainedStart = clampPointToField(start);
  const startPercent = (constrainedStart.x / rect.width) * 100;
  const side = areaSideFromPercent(startPercent);
  const horizontal = horizontalBoundsForSide(side);
  const constrainedEnd = {
    x: clamp(end.x, (horizontal.left / 100) * rect.width, (horizontal.right / 100) * rect.width),
    y: clamp(end.y, (FIELD_BOUNDS.top / 100) * rect.height, (FIELD_BOUNDS.bottom / 100) * rect.height),
  };
  const left = Math.min(constrainedStart.x, constrainedEnd.x);
  const top = Math.min(constrainedStart.y, constrainedEnd.y);
  const width = Math.abs(constrainedEnd.x - constrainedStart.x);
  const height = Math.abs(constrainedEnd.y - constrainedStart.y);

  return {
    left: (left / rect.width) * 100,
    top: (top / rect.height) * 100,
    width: (width / rect.width) * 100,
    height: (height / rect.height) * 100,
    color: state.color,
    side,
  };
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function applyAreaStyle(area, snapshot) {
  const constrained = constrainAreaSnapshot(snapshot);
  area.style.left = `${constrained.left}%`;
  area.style.top = `${constrained.top}%`;
  area.style.width = `${constrained.width}%`;
  area.style.height = `${constrained.height}%`;
  area.style.backgroundColor = hexToRgba(constrained.color, 0.66);
  area.dataset.left = constrained.left;
  area.dataset.top = constrained.top;
  area.dataset.width = constrained.width;
  area.dataset.height = constrained.height;
  area.dataset.color = constrained.color;
  area.dataset.side = constrained.side;
}

function addArea(snapshot, isDraft = false) {
  const area = document.createElement("div");
  area.className = `marked-area${isDraft ? " draft" : ""}`;
  applyAreaStyle(area, snapshot);
  ["nw", "ne", "se", "sw"].forEach((handle) => {
    const grip = document.createElement("span");
    grip.className = `area-resize-handle ${handle}`;
    grip.dataset.handle = handle;
    area.appendChild(grip);
  });
  areaLayer.appendChild(area);
  return area;
}

function getAreaSnapshots() {
  return [...areaLayer.querySelectorAll(".marked-area:not(.draft)")].map((area) => ({
    left: Number(area.dataset.left),
    top: Number(area.dataset.top),
    width: Number(area.dataset.width),
    height: Number(area.dataset.height),
    color: area.dataset.color,
    side: area.dataset.side,
  }));
}

function restoreAreas(areas = []) {
  clearAreas();
  areas.forEach((area) => addArea(area));
}

function selectArea(area) {
  clearArrowSelection();
  clearTokenSelection();
  if (state.selectedArea && state.selectedArea !== area) {
    state.selectedArea.classList.remove("selected");
    state.selectedArea.style.cursor = "";
  }

  state.selectedArea = area;
  area.classList.add("selected");
}

function clearAreaSelection() {
  if (!state.selectedArea) return;
  state.selectedArea.classList.remove("selected");
  state.selectedArea.style.cursor = "";
  state.selectedArea = null;
}

function areaContainsPoint(area, point) {
  const rect = board.getBoundingClientRect();
  const left = (Number(area.dataset.left) / 100) * rect.width;
  const top = (Number(area.dataset.top) / 100) * rect.height;
  const width = (Number(area.dataset.width) / 100) * rect.width;
  const height = (Number(area.dataset.height) / 100) * rect.height;

  return point.x >= left && point.x <= left + width && point.y >= top && point.y <= top + height;
}

function getAreaAtPoint(point) {
  return [...areaLayer.querySelectorAll(".marked-area:not(.draft)")].reverse().find((area) => areaContainsPoint(area, point));
}

function getAreaResizeTargetAtPoint(point) {
  const rect = board.getBoundingClientRect();
  const threshold = 12;

  return [...areaLayer.querySelectorAll(".marked-area.selected:not(.draft)")].reverse().map((area) => {
    const left = (Number(area.dataset.left) / 100) * rect.width;
    const top = (Number(area.dataset.top) / 100) * rect.height;
    const right = left + (Number(area.dataset.width) / 100) * rect.width;
    const bottom = top + (Number(area.dataset.height) / 100) * rect.height;
    const nearLeft = Math.abs(point.x - left) <= threshold;
    const nearRight = Math.abs(point.x - right) <= threshold;
    const nearTop = Math.abs(point.y - top) <= threshold;
    const nearBottom = Math.abs(point.y - bottom) <= threshold;
    const withinHorizontal = point.x >= left - threshold && point.x <= right + threshold;
    const withinVertical = point.y >= top - threshold && point.y <= bottom + threshold;

    let handle = "";
    if (nearTop && withinHorizontal) handle += "n";
    if (nearBottom && withinHorizontal) handle += "s";
    if (nearLeft && withinVertical) handle += "w";
    if (nearRight && withinVertical) handle += "e";

    return handle ? { area, handle } : null;
  }).find(Boolean);
}

function cursorForAreaHandle(handle) {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "nwse-resize";
}

function updateAreaResizeCursor(point) {
  if (!state.selectedArea || state.activeAreaDrag || state.activeAreaResize) return;
  const resizeTarget = getAreaResizeTargetAtPoint(point);
  state.selectedArea.style.cursor = resizeTarget ? cursorForAreaHandle(resizeTarget.handle) : "";
}

function pointToPercent(point) {
  const rect = board.getBoundingClientRect();
  return {
    x: (point.x / rect.width) * 100,
    y: (point.y / rect.height) * 100,
  };
}

function resizedAreaSnapshot(resize, point) {
  const percent = pointToPercent(point);
  const horizontal = horizontalBoundsForSide(resize.side);
  let left = resize.left;
  let top = resize.top;
  let right = resize.left + resize.width;
  let bottom = resize.top + resize.height;

  if (resize.handle.includes("w")) {
    left = clamp(percent.x, horizontal.left, right - MIN_AREA_SIZE);
  }

  if (resize.handle.includes("e")) {
    right = clamp(percent.x, left + MIN_AREA_SIZE, horizontal.right);
  }

  if (resize.handle.includes("n")) {
    top = clamp(percent.y, FIELD_BOUNDS.top, bottom - MIN_AREA_SIZE);
  }

  if (resize.handle.includes("s")) {
    bottom = clamp(percent.y, top + MIN_AREA_SIZE, FIELD_BOUNDS.bottom);
  }

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    color: resize.area.dataset.color,
    side: resize.side,
  };
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
  clearAreaSelection();
  clearTokenSelection();
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
    areas: getAreaSnapshots(),
    arrows: getArrowSnapshots(),
    drawing: canvasImage(),
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
  clearTokenSelection();
  board.querySelectorAll(".token").forEach((token) => token.remove());
  state.tokenCounts = { home: 0, away: 0, shuttle: 0 };
  tokens.forEach((token) => addToken(token.type, token.left, token.top));
}

function restoreBoardState(snapshot) {
  stopSequence();
  restoreTokens(snapshot.tokens);
  restoreAreas(snapshot.areas);
  restoreCanvas(snapshot.drawing);
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
  restoreAreas(snapshot.areas);
  await Promise.all(animations);
  restoreCanvas(snapshot.drawing);
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
  state.sequence.steps.push(cloneData(captureBoardState()));
  state.sequence.currentIndex = state.sequence.steps.length - 1;
  updateSequenceUi();
  setStorageStatus("Schritt gespeichert");
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
  setStorageStatus("Schritt gelöscht");
}

function projectSnapshot() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    title: projectTitleInput.value,
    board: captureBoardState(),
    notes: notesInput.value,
    sequence: {
      steps: cloneData(state.sequence.steps),
      currentIndex: state.sequence.currentIndex,
      speed: state.sequence.speed,
    },
  };
}

function restoreProject(project) {
  if (!project || !project.board || !project.sequence) {
    throw new Error("Diese Datei ist kein Taktikboard-Projekt.");
  }

  stopSequence();
  projectTitleInput.value = project.title || "";
  updateBoardTitle();
  notesInput.value = project.notes || "";
  state.sequence.steps = project.sequence.steps || [];
  state.sequence.currentIndex = Math.min(
    project.sequence.currentIndex ?? state.sequence.steps.length - 1,
    state.sequence.steps.length - 1,
  );
  state.sequence.speed = Number(project.sequence.speed || 1);
  sequenceSpeedInput.value = String(state.sequence.speed);
  restoreBoardState(project.board);
  updateSequenceUi();
}

function saveProject() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projectSnapshot()));
  setStorageStatus("Gespeichert");
}

function loadProject() {
  const savedProject = localStorage.getItem(STORAGE_KEY);
  if (!savedProject) {
    setStorageStatus("Nichts gespeichert");
    return;
  }

  restoreProject(JSON.parse(savedProject));
  setStorageStatus("Geladen");
}

function sanitizeFileName(fileName) {
  return fileName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ");
}

function ensureJsonExtension(fileName) {
  return fileName.toLowerCase().endsWith(".json") ? fileName : `${fileName}.json`;
}

function defaultExportFileName() {
  const title = sanitizeFileName(projectTitleInput.value || "");
  const baseName = title || "badminton-spielzug";
  return ensureJsonExtension(`${baseName}-${new Date().toISOString().slice(0, 10)}`);
}

function downloadProjectBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportProject() {
  const project = projectSnapshot();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  const fileName = defaultExportFileName();
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });

  if ("showSaveFilePicker" in window) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "JSON-Datei",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      setStorageStatus("Exportiert & gespeichert");
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        setStorageStatus("Export abgebrochen");
        return;
      }
    }
  }

  const chosenName = window.prompt("Dateiname", fileName);
  if (chosenName === null) {
    setStorageStatus("Export abgebrochen");
    return;
  }

  downloadProjectBlob(blob, ensureJsonExtension(sanitizeFileName(chosenName) || fileName));
  setStorageStatus("Exportiert & gespeichert");
}

function importProjectFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      restoreProject(JSON.parse(reader.result));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projectSnapshot()));
      setStorageStatus("Importiert");
    } catch (error) {
      setStorageStatus(error.message);
    }
  });
  reader.readAsText(file);
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

  areaLayer.querySelectorAll(".marked-area").forEach((area) => {
    if (areaContainsPoint(area, point)) {
      if (state.selectedArea === area) clearAreaSelection();
      area.remove();
    }
  });
}

board.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".token")) return;
  const point = pointFromEvent(event);

  if (state.mode === "select" && !event.target.closest(".play-arrow")) {
    clearArrowSelection();
    const resizeTarget = getAreaResizeTargetAtPoint(point);
    if (resizeTarget) {
      const area = resizeTarget.area;
      event.preventDefault();
      event.stopPropagation();
      selectArea(area);
      board.setPointerCapture(event.pointerId);
      state.activeAreaResize = {
        area,
        handle: resizeTarget.handle,
        left: Number(area.dataset.left),
        top: Number(area.dataset.top),
        width: Number(area.dataset.width),
        height: Number(area.dataset.height),
        side: area.dataset.side || areaSideFromSnapshot(area.dataset),
      };
      area.style.cursor = cursorForAreaHandle(resizeTarget.handle);
      return;
    }

    const area = getAreaAtPoint(point);
    if (area) {
      event.preventDefault();
      selectArea(area);
      board.setPointerCapture(event.pointerId);
      state.activeAreaDrag = {
        area,
        point,
        left: Number(area.dataset.left),
        top: Number(area.dataset.top),
        width: Number(area.dataset.width),
        height: Number(area.dataset.height),
        side: area.dataset.side || areaSideFromSnapshot(area.dataset),
      };
      return;
    }
    clearTokenSelection();
    clearAreaSelection();
  }

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

  if (state.mode === "area") {
    state.areaStart = point;
    state.activeArea = addArea(normalizeArea(point, point), true);
    board.setPointerCapture(event.pointerId);
  }

  if (state.mode === "arrow") {
    state.arrowStart = point;
  }
});

board.addEventListener("pointermove", (event) => {
  const point = pointFromEvent(event);

  if (state.mode === "select" && state.activeAreaResize) {
    applyAreaStyle(state.activeAreaResize.area, resizedAreaSnapshot(state.activeAreaResize, point));
    return;
  }

  if (state.mode === "select" && state.activeAreaDrag) {
    const rect = board.getBoundingClientRect();
    const dx = ((point.x - state.activeAreaDrag.point.x) / rect.width) * 100;
    const dy = ((point.y - state.activeAreaDrag.point.y) / rect.height) * 100;
    const horizontal = horizontalBoundsForSide(state.activeAreaDrag.side);
    const maxLeft = Math.max(horizontal.left, horizontal.right - state.activeAreaDrag.width);
    const maxTop = Math.max(FIELD_BOUNDS.top, FIELD_BOUNDS.bottom - state.activeAreaDrag.height);
    const left = clamp(state.activeAreaDrag.left + dx, horizontal.left, maxLeft);
    const top = clamp(state.activeAreaDrag.top + dy, FIELD_BOUNDS.top, maxTop);

    applyAreaStyle(state.activeAreaDrag.area, {
      left,
      top,
      width: state.activeAreaDrag.width,
      height: state.activeAreaDrag.height,
      color: state.activeAreaDrag.area.dataset.color,
      side: state.activeAreaDrag.side,
    });
    return;
  }

  if (state.mode === "select") {
    updateAreaResizeCursor(point);
  }

  if (state.mode === "area" && state.areaStart && state.activeArea) {
    applyAreaStyle(state.activeArea, normalizeArea(state.areaStart, point));
    return;
  }

  if (!state.drawing) return;

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
  state.activeAreaDrag = null;
  state.activeAreaResize = null;
  updateAreaResizeCursor(point);

  if (state.mode === "area" && state.areaStart && state.activeArea) {
    const area = normalizeArea(state.areaStart, point);
    if (area.width < 1 || area.height < 1) {
      state.activeArea.remove();
    } else {
      state.activeArea.classList.remove("draft");
      applyAreaStyle(state.activeArea, area);
    }
  }

  if (state.mode === "arrow" && state.arrowStart) {
    drawArrow(state.arrowStart, point);
  }

  state.drawing = false;
  state.arrowStart = null;
  state.areaStart = null;
  state.activeArea = null;
});

tools.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

function updateSelectedColor(color) {
  state.color = color;
  colorPreview.style.backgroundColor = color;
  colorOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.color === color);
  });
}

function closeColorMenu() {
  colorMenu.hidden = true;
  colorMenuButton.setAttribute("aria-expanded", "false");
}

function toggleColorMenu() {
  const nextOpen = colorMenu.hidden;
  colorMenu.hidden = !nextOpen;
  colorMenuButton.setAttribute("aria-expanded", String(nextOpen));
}

colorMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleColorMenu();
});

colorOptions.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    updateSelectedColor(button.dataset.color);
    closeColorMenu();
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".color-controls")) closeColorMenu();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeColorMenu();
});

addHomeButton.addEventListener("click", () => addToken("home", 28, 50));
addAwayButton.addEventListener("click", () => addToken("away", 72, 50));
addShuttleButton.addEventListener("click", () => addToken("shuttle", 50, 50));
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
projectTitleInput.addEventListener("input", updateBoardTitle);
exportProjectButton.addEventListener("click", exportProject);
importProjectButton.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", () => {
  importProjectFile(importFileInput.files[0]);
  importFileInput.value = "";
});

window.addEventListener("keydown", (event) => {
  if ((event.key === "Delete" || event.key === "Del") && state.selectedArrow) {
    event.preventDefault();
    state.selectedArrow.remove();
    state.selectedArrow = null;
    return;
  }

  if ((event.key === "Delete" || event.key === "Del") && state.selectedArea) {
    event.preventDefault();
    state.selectedArea.remove();
    state.selectedArea = null;
    return;
  }

  if ((event.key === "Delete" || event.key === "Del") && state.selectedToken) {
    event.preventDefault();
    removeToken(state.selectedToken);
  }
});

window.addEventListener("resize", resizeCanvas);
updateSelectedColor(state.color);
updateBoardTitle();
resizeCanvas();
seedBoard();
setMode("select");
updateSequenceUi();
