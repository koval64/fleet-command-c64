const GRID_SIZE = 10;
const BOARD_CELLS = GRID_SIZE * GRID_SIZE;
const SHOTS_PER_SHIP = 4;
const SHIP_LENGTHS = [6, 5, 4, 3, 2];
const INITIAL_SALVOS = SHOTS_PER_SHIP * SHIP_LENGTHS.length;

const state = {
  playerBoard: createEmptyBoard(),
  enemyBoard: createEmptyBoard(),
  playerFleet: [],
  enemyFleet: [],
  salvos: { player: INITIAL_SALVOS, ai: INITIAL_SALVOS },
  hits: { player: 0, ai: 0 },
  sunk: { player: 0, ai: 0 },
  phase: "player",
  round: 1,
  over: false,
  aiTargetQueue: [],
  aiDifficulty: "normal",
  lastShotEffects: [],
  playerShotPlan: [],
  resolvingPlayerBarrage: false,
};

const ui = {
  boards: document.querySelector(".boards"),
  hudStrip: document.querySelector(".hud-strip"),
  playerWrap: document.getElementById("player-wrap"),
  enemyWrap: document.getElementById("enemy-wrap"),
  playerBoard: document.getElementById("player-board"),
  enemyBoard: document.getElementById("enemy-board"),
  status: document.getElementById("status"),
  difficultySelect: document.getElementById("difficulty-select"),
  playerSalvos: document.getElementById("player-salvos"),
  aiSalvos: document.getElementById("ai-salvos"),
  playerHits: document.getElementById("player-hits"),
  aiHits: document.getElementById("ai-hits"),
  playerSunk: document.getElementById("player-sunk"),
  aiSunk: document.getElementById("ai-sunk"),
  newGameBtn: document.getElementById("new-game-btn"),
  endOverlay: document.getElementById("end-overlay"),
  endTitle: document.getElementById("end-title"),
  endMessage: document.getElementById("end-message"),
  endScore: document.getElementById("end-score"),
  rematchBtn: document.getElementById("rematch-btn"),
  closeOverlayBtn: document.getElementById("close-overlay-btn"),
};

let audioContext = null;

ui.newGameBtn.addEventListener("click", initGame);
ui.rematchBtn.addEventListener("click", initGame);
ui.closeOverlayBtn.addEventListener("click", hideEndOverlay);
ui.difficultySelect.addEventListener("change", () => {
  state.aiDifficulty = ui.difficultySelect.value;
  setStatus(`Enemy difficulty set to ${capitalize(state.aiDifficulty)}. Start a new round when ready.`);
});
ui.enemyBoard.addEventListener("click", handleEnemyBoardClick);
window.addEventListener("resize", syncHudWidth);

initGame();

function initGame() {
  ensureAudioContext();
  state.playerBoard = createEmptyBoard();
  state.enemyBoard = createEmptyBoard();
  state.playerFleet = placeFleetRandom(state.playerBoard, SHIP_LENGTHS);
  state.enemyFleet = placeFleetRandom(state.enemyBoard, SHIP_LENGTHS);
  state.salvos = {
    player: getPhaseSalvos(state.playerFleet),
    ai: getPhaseSalvos(state.enemyFleet),
  };
  state.hits = { player: 0, ai: 0 };
  state.sunk = { player: 0, ai: 0 };
  state.phase = "player";
  state.round = 1;
  state.over = false;
  state.aiTargetQueue = [];
  state.aiDifficulty = ui.difficultySelect.value;
  state.lastShotEffects = [];
  state.playerShotPlan = [];
  state.resolvingPlayerBarrage = false;

  hideEndOverlay();

  renderBoards();
  renderHud();
  setStatus(`Round 1. Mark ${state.salvos.player} targets on enemy radar.`);
}

function createEmptyBoard() {
  return new Array(BOARD_CELLS).fill(0);
}

function placeFleetRandom(board, shipLengths) {
  while (true) {
    board.fill(0);
    const fleet = [];
    let complete = true;

    for (const length of shipLengths) {
      let placed = false;

      for (let attempt = 0; attempt < 5000 && !placed; attempt += 1) {
        const horizontal = Math.random() < 0.5;
        const row = randomInt(0, GRID_SIZE - 1);
        const col = randomInt(0, GRID_SIZE - 1);
        const cells = [];

        for (let i = 0; i < length; i += 1) {
          const r = horizontal ? row : row + i;
          const c = horizontal ? col + i : col;

          if (r >= GRID_SIZE || c >= GRID_SIZE) {
            cells.length = 0;
            break;
          }

          const idx = r * GRID_SIZE + c;
          if (board[idx] !== 0) {
            cells.length = 0;
            break;
          }

          cells.push(idx);
        }

        if (cells.length === length && canPlaceShipWithBuffer(board, cells)) {
          for (const idx of cells) {
            board[idx] = 1;
          }

          fleet.push({
            length,
            cells,
            hits: new Set(),
            sunk: false,
          });

          placed = true;
        }
      }

      if (!placed) {
        complete = false;
        break;
      }
    }

    if (complete) {
      return fleet;
    }
  }
}

function canPlaceShipWithBuffer(board, cells) {
  const planned = new Set(cells);

  for (const idx of cells) {
    const row = Math.floor(idx / GRID_SIZE);
    const col = idx % GRID_SIZE;

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const nr = row + dr;
        const nc = col + dc;

        if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE) {
          continue;
        }

        const neighborIdx = nr * GRID_SIZE + nc;
        if (planned.has(neighborIdx)) {
          continue;
        }

        if (board[neighborIdx] === 1) {
          return false;
        }
      }
    }
  }

  return true;
}

function handleEnemyBoardClick(event) {
  if (state.over || state.phase !== "player" || state.resolvingPlayerBarrage) {
    return;
  }

  const cell = event.target.closest(".cell");
  if (!cell) {
    return;
  }

  const idx = Number(cell.dataset.index);
  if (state.enemyBoard[idx] === 2 || state.enemyBoard[idx] === 3) {
    setStatus("That tile was already targeted in a previous barrage.");
    return;
  }

  const plannedIndex = state.playerShotPlan.indexOf(idx);
  if (plannedIndex >= 0) {
    state.playerShotPlan.splice(plannedIndex, 1);
    state.salvos.player += 1;
    cell.classList.remove("planned");
    setStatus(
      `Target removed. Marked ${state.playerShotPlan.length}/${state.playerShotPlan.length + state.salvos.player}.`
    );
    renderHud();
    return;
  }

  if (state.salvos.player <= 0) {
    setStatus("All targets already marked. Executing barrage...");
    return;
  }

  state.playerShotPlan.push(idx);
  state.salvos.player -= 1;
  playSfx("mark");
  cell.classList.add("planned");
  setStatus(
    `Target locked. Marked ${state.playerShotPlan.length}/${state.playerShotPlan.length + state.salvos.player}.`
  );

  renderHud();

  if (state.salvos.player === 0) {
    state.resolvingPlayerBarrage = true;
    setStatus("Barrage locked. Executing strikes...");
    renderHud();
    setTimeout(resolvePlayerBarrage, 220);
  }
}

function resolvePlayerBarrage() {
  if (state.over) {
    return;
  }

  if (state.playerShotPlan.length === 0) {
    state.resolvingPlayerBarrage = false;
    state.phase = "ai";
    state.salvos.ai = getPhaseSalvos(state.enemyFleet);
    setStatus(`Enemy phase: the opponent fires ${state.salvos.ai} shots.`);
    renderHud();
    setTimeout(runAiBarrage, 500);
    return;
  }

  const idx = state.playerShotPlan.shift();
  const result = resolveShot("player", idx);

  if (!result.valid) {
    setTimeout(resolvePlayerBarrage, 50);
    return;
  }

  if (result.hit) {
    state.hits.player += 1;
    playSfx(result.sunkShip ? "sunk" : "hit");
  } else {
    playSfx("miss");
  }

  state.lastShotEffects = [{
    target: "enemy",
    idx,
    kind: result.sunkShip ? "sunk" : result.hit ? "hit" : "miss",
  }];

  if (result.sunkShip) {
    state.sunk.player += 1;
    state.salvos.ai = getPhaseSalvos(state.enemyFleet);
    setStatus(
      `Hit and sunk! (${result.sunkShip.length}-deck ship). Remaining queued: ${state.playerShotPlan.length}`
    );
  } else {
    setStatus(
      result.hit
        ? `Hit! Remaining queued: ${state.playerShotPlan.length}`
        : `Miss. Remaining queued: ${state.playerShotPlan.length}`
    );
  }

  renderBoards();
  renderHud();

  if (checkGameEnd()) {
    return;
  }

  setTimeout(resolvePlayerBarrage, result.sunkShip ? 280 : 150);
}

function runAiBarrage() {
  if (state.over) {
    return;
  }

  if (state.salvos.ai <= 0) {
    startPlayerPhase();
    return;
  }

  const barragePlan = buildEnemyBarragePlan(state.salvos.ai);
  setStatus(`Enemy phase: the opponent fires ${barragePlan.length} shots.`);
  renderHud();

  setTimeout(() => {
    if (state.over) {
      return;
    }

    const barrageResults = barragePlan.map((idx) => peekShotResult("ai", idx));
    const summary = applyEnemyBarrageResults(barrageResults);

    if (state.over) {
      return;
    }

    renderBoards();
    renderHud();

    if (checkGameEnd()) {
      return;
    }

    setStatus(summary);
    setTimeout(startPlayerPhase, 650);
  }, 350);
}

function startPlayerPhase() {
  if (state.over) {
    return;
  }

  state.phase = "player";
  state.round += 1;
  state.salvos.player = getPhaseSalvos(state.playerFleet);
  state.playerShotPlan = [];
  state.resolvingPlayerBarrage = false;
  setStatus(`Round ${state.round}. Player phase: mark ${state.salvos.player} targets.`);
  renderHud();
}

function buildEnemyBarragePlan(shotCount) {
  const plan = [];
  const excluded = new Set();

  for (let i = 0; i < shotCount; i += 1) {
    const target = pickAiTarget(excluded);
    if (target === null) {
      break;
    }

    excluded.add(target);
    plan.push(target);
  }

  return plan;
}

function peekShotResult(actor, idx) {
  const board = actor === "player" ? state.enemyBoard : state.playerBoard;
  const fleet = actor === "player" ? state.enemyFleet : state.playerFleet;

  if (board[idx] === 2 || board[idx] === 3) {
    return { valid: false, hit: false, sunkShip: null, idx };
  }

  if (board[idx] === 1) {
    const ship = fleet.find((unit) => unit.cells.includes(idx));
    return {
      valid: true,
      hit: true,
      sunkShip: ship && ship.hits.size + 1 === ship.length ? ship : null,
      idx,
    };
  }

  return { valid: true, hit: false, sunkShip: null, idx };
}

function applyEnemyBarrageResults(results) {
  let hits = 0;
  let sunkShips = 0;
  const revealedHits = [];

  for (const result of results) {
    if (!result.valid) {
      continue;
    }

    if (result.hit) {
      hits += 1;
      state.playerBoard[result.idx] = 2;
      revealedHits.push(result.idx);

      const ship = state.playerFleet.find((unit) => unit.cells.includes(result.idx));
      if (ship) {
        ship.hits.add(result.idx);
      }
    } else {
      state.playerBoard[result.idx] = 3;
    }
  }

  for (const ship of state.playerFleet) {
    if (!ship.sunk && ship.hits.size === ship.length) {
      ship.sunk = true;
      sunkShips += 1;

      for (const idx of ship.cells) {
        const effect = state.lastShotEffects.find(
          (entry) => entry.target === "player" && entry.idx === idx
        );
        if (effect) {
          effect.kind = "sunk";
        }
      }
    }
  }

  if (hits > 0) {
    state.hits.ai += hits;
    for (const idx of revealedHits) {
      enqueueNeighborTargets(idx);
    }
  }

  if (sunkShips > 0) {
    state.sunk.ai += sunkShips;
  }

  state.salvos.player = getPhaseSalvos(state.playerFleet);
  state.lastShotEffects = results
    .filter((result) => result.valid)
    .map((result) => ({
      target: "player",
      idx: result.idx,
      kind: result.hit ? (result.sunkShip ? "sunk" : "hit") : "miss",
    }));

  if (hits === 0) {
    return "Enemy barrage complete. No hits landed.";
  }

  if (sunkShips > 0) {
    return `Enemy barrage complete. ${hits} hit(s), ${sunkShips} ship(s) sunk.`;
  }

  return `Enemy barrage complete. ${hits} hit(s) landed.`;
}

function resolveShot(actor, idx) {
  const board = actor === "player" ? state.enemyBoard : state.playerBoard;
  const fleet = actor === "player" ? state.enemyFleet : state.playerFleet;

  if (board[idx] === 2 || board[idx] === 3) {
    return { valid: false, hit: false, sunkShip: null };
  }

  if (board[idx] === 1) {
    board[idx] = 2;

    const ship = fleet.find((unit) => unit.cells.includes(idx));
    if (ship) {
      ship.hits.add(idx);
      if (!ship.sunk && ship.hits.size === ship.length) {
        ship.sunk = true;
        return { valid: true, hit: true, sunkShip: ship };
      }
    }

    return { valid: true, hit: true, sunkShip: null };
  }

  board[idx] = 3;
  return { valid: true, hit: false, sunkShip: null };
}

function pickAiTarget(excluded = new Set()) {
  const available = getAvailablePlayerTargets(excluded);
  if (available.length === 0) {
    return null;
  }

  if (state.aiDifficulty === "easy") {
    return available[randomInt(0, available.length - 1)];
  }

  while (state.aiTargetQueue.length > 0) {
    const candidate = state.aiTargetQueue.shift();
    if (!excluded.has(candidate) && state.playerBoard[candidate] !== 2 && state.playerBoard[candidate] !== 3) {
      return candidate;
    }
  }

  if (state.aiDifficulty === "hard") {
    const parityTargets = available.filter((idx) => {
      const row = Math.floor(idx / GRID_SIZE);
      const col = idx % GRID_SIZE;
      return (row + col) % 2 === 0;
    });

    const source = parityTargets.length > 0 ? parityTargets : available;
    return source[randomInt(0, source.length - 1)];
  }

  return available[randomInt(0, available.length - 1)];
}

function getAvailablePlayerTargets(excluded = new Set()) {
  const available = [];
  for (let i = 0; i < BOARD_CELLS; i += 1) {
    if (!excluded.has(i) && state.playerBoard[i] !== 2 && state.playerBoard[i] !== 3) {
      available.push(i);
    }
  }

  return available;
}

function enqueueNeighborTargets(idx) {
  const row = Math.floor(idx / GRID_SIZE);
  const col = idx % GRID_SIZE;
  const neighbors = [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ];

  for (const [r, c] of neighbors) {
    if (r < 0 || c < 0 || r >= GRID_SIZE || c >= GRID_SIZE) {
      continue;
    }

    const neighborIdx = r * GRID_SIZE + c;
    if (state.playerBoard[neighborIdx] === 2 || state.playerBoard[neighborIdx] === 3) {
      continue;
    }

    if (!state.aiTargetQueue.includes(neighborIdx)) {
      state.aiTargetQueue.push(neighborIdx);
    }
  }
}

function checkGameEnd() {
  const enemyAllSunk = state.enemyFleet.every((ship) => ship.sunk);
  const playerAllSunk = state.playerFleet.every((ship) => ship.sunk);

  if (enemyAllSunk) {
    endGame("You win! The entire Enemy fleet has been sunk.");
    return true;
  }

  if (playerAllSunk) {
    endGame("You lose. Enemy has sunk your entire fleet.");
    return true;
  }

  return false;
}

function endGame(message) {
  state.over = true;
  state.phase = "done";
  state.resolvingPlayerBarrage = false;
  state.playerShotPlan = [];
  setStatus(message);
  renderBoards();
  renderHud();
  showEndOverlay(message);
  playSfx("end");
}

function renderBoards() {
  ui.playerBoard.innerHTML = "";
  ui.enemyBoard.innerHTML = "";

  for (let i = 0; i < BOARD_CELLS; i += 1) {
    const playerCell = document.createElement("div");
    playerCell.className = "cell";
    playerCell.dataset.index = String(i);

    if (state.playerBoard[i] === 1) {
      playerCell.classList.add("ship");
    } else if (state.playerBoard[i] === 2) {
      playerCell.classList.add("hit");
    } else if (state.playerBoard[i] === 3) {
      playerCell.classList.add("miss");
    }

    ui.playerBoard.appendChild(playerCell);

    const enemyCell = document.createElement("div");
    enemyCell.className = "cell";
    enemyCell.dataset.index = String(i);

    if (state.enemyBoard[i] === 2) {
      enemyCell.classList.add("hit");
    } else if (state.enemyBoard[i] === 3) {
      enemyCell.classList.add("miss");
    } else if (state.playerShotPlan.includes(i)) {
      enemyCell.classList.add("planned");
    }

    applyShotEffectClass(enemyCell, "enemy", i);
    applyShotEffectClass(playerCell, "player", i);

    ui.enemyBoard.appendChild(enemyCell);
  }

  state.lastShotEffects = [];
}

function renderHud() {
  ui.playerSalvos.textContent = String(state.salvos.player);
  ui.aiSalvos.textContent = String(state.salvos.ai);
  ui.playerHits.textContent = String(state.hits.player);
  ui.aiHits.textContent = String(state.hits.ai);
  ui.playerSunk.textContent = String(state.sunk.player);
  ui.aiSunk.textContent = String(state.sunk.ai);

  const enemyPhaseActive = (state.phase === "ai" || state.resolvingPlayerBarrage) && !state.over;
  ui.enemyWrap.classList.toggle("inactive", enemyPhaseActive);
  ui.playerWrap.classList.remove("inactive");

  ui.boards.classList.remove("phase-player", "phase-ai", "phase-done");
  if (state.phase === "player") {
    ui.boards.classList.add("phase-player");
  } else if (state.phase === "ai") {
    ui.boards.classList.add("phase-ai");
  } else {
    ui.boards.classList.add("phase-done");
  }

  requestAnimationFrame(syncHudWidth);
}

function setStatus(text) {
  ui.status.textContent = text;
}

function showEndOverlay(message) {
  ui.endTitle.textContent = state.hits.player >= state.hits.ai ? "Victory Report" : "Defeat Report";
  ui.endMessage.textContent = message;
  ui.endScore.textContent = `Player hits: ${state.hits.player} | Enemy hits: ${state.hits.ai} | Round: ${state.round}`;
  ui.endOverlay.classList.remove("hidden");
}

function hideEndOverlay() {
  ui.endOverlay.classList.add("hidden");
}

function applyShotEffectClass(cell, target, idx) {
  if (!state.lastShotEffects || state.lastShotEffects.length === 0) {
    return;
  }

  const effect = state.lastShotEffects.find((entry) => entry.target === target && entry.idx === idx);
  if (!effect) {
    return;
  }

  if (effect.kind === "hit") {
    cell.classList.add("flash-hit");
  } else if (effect.kind === "sunk") {
    cell.classList.add("flash-sunk");
  }
}

function ensureAudioContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      audioContext = new Ctx();
    }
  }

  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function playSfx(kind) {
  ensureAudioContext();
  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  if (kind === "hit") {
    scheduleTone(now, 420, 0.06, "square", 0.03);
  } else if (kind === "mark") {
    scheduleTone(now, 280, 0.03, "triangle", 0.015);
  } else if (kind === "miss") {
    scheduleTone(now, 170, 0.05, "triangle", 0.02);
  } else if (kind === "sunk") {
    scheduleTone(now, 520, 0.06, "sawtooth", 0.04);
    scheduleTone(now + 0.08, 420, 0.08, "sawtooth", 0.04);
  } else if (kind === "end") {
    scheduleTone(now, 300, 0.08, "triangle", 0.04);
    scheduleTone(now + 0.1, 390, 0.08, "triangle", 0.04);
    scheduleTone(now + 0.2, 520, 0.1, "triangle", 0.04);
  }
}

function scheduleTone(start, frequency, duration, waveType, gainValue) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = waveType;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getPhaseSalvos(fleet) {
  const aliveShips = fleet.filter((ship) => !ship.sunk).length;
  return aliveShips * SHOTS_PER_SHIP;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function syncHudWidth() {
  if (!ui.hudStrip || !ui.boards) {
    return;
  }

  let targetWidth = ui.boards.getBoundingClientRect().width;

  if (state.phase === "player") {
    targetWidth = ui.enemyBoard.getBoundingClientRect().width;
  } else if (state.phase === "ai") {
    targetWidth = ui.playerBoard.getBoundingClientRect().width;
  }

  ui.hudStrip.style.width = `${Math.max(220, Math.round(targetWidth))}px`;
}
