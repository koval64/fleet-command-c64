const { INITIAL_SALVOS, SHIP_LENGTHS, getPhaseSalvos } = window.AppConfig;
const { createAudioController } = window.AppAudio;
const { createEmptyBoard, placeFleetRandom, resolveShot } = window.AppBoard;
const {
  applyEnemyBarrageResults,
  buildEnemyBarragePlan,
  getAvailableEnemyTargets,
  getAvailablePlayerTargets,
} = window.AppAi;
const {
  collectUi,
  hideEndOverlay,
  hideStartOverlay,
  renderBoards,
  renderHud,
  scrollEndBoards,
  setStatus,
  showStartOverlay,
  syncEndBoardFrame: uiSyncEndBoardFrame,
  syncHudWidth: uiSyncHudWidth,
} = window.AppUi;

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
  endBoardView: "player",
  menuOpen: true,
  menuCanReturn: false,
};

const ui = collectUi();
const audio = createAudioController();

window.state = state;
window.syncEndBoardFrame = () => uiSyncEndBoardFrame(ui, state);

ui.rematchBtn.addEventListener("click", showStartMenu);
ui.closeOverlayBtn.addEventListener("click", () => hideEndOverlay(ui));
ui.endScrollPrev.addEventListener("click", () => scrollEndBoards(ui, state, "toggle"));
ui.endScrollNext.addEventListener("click", () => scrollEndBoards(ui, state, "toggle"));
ui.newGameBtn.addEventListener("click", showStartMenu);
ui.startGameBtn.addEventListener("click", startGameFromMenu);
ui.backToGameBtn.addEventListener("click", returnFromMenu);
ui.enemyBoard.addEventListener("click", handleEnemyBoardClick);
window.addEventListener("resize", () => uiSyncHudWidth(ui, state));
window.addEventListener("resize", () => uiSyncEndBoardFrame(ui, state));

showStartMenu();

function initGame() {
  audio.ensureAudioContext();
  state.playerBoard = createEmptyBoard();
  state.enemyBoard = createEmptyBoard();
  state.playerFleet = placeFleetRandom(state.playerBoard, SHIP_LENGTHS);
  state.enemyFleet = placeFleetRandom(state.enemyBoard, SHIP_LENGTHS);
  state.salvos = {
    player: Math.min(getPhaseSalvos(state.playerFleet), getAvailableEnemyTargets(state).length),
    ai: Math.min(getPhaseSalvos(state.enemyFleet), getAvailablePlayerTargets(state).length),
  };
  state.hits = { player: 0, ai: 0 };
  state.sunk = { player: 0, ai: 0 };
  state.phase = "player";
  state.round = 1;
  state.over = false;
  state.menuOpen = false;
  state.aiTargetQueue = [];
  state.lastShotEffects = [];
  state.playerShotPlan = [];
  state.resolvingPlayerBarrage = false;
  state.endBoardView = "player";

  hideEndOverlay(ui);
  hideStartMenu();

  renderBoards(ui, state);
  renderHud(ui, state);
    setStatus(ui, `Runda 1: cele ${state.salvos.player}.`);
}

function startGameFromMenu() {
  state.aiDifficulty = ui.startDifficultySelect.value;
  initGame();
}

function showStartMenu() {
  const hasStartedGame = state.playerFleet.length > 0 && state.enemyFleet.length > 0;
  const canReturn = hasStartedGame && state.phase === "player" && !state.over && !state.resolvingPlayerBarrage;

  if (ui.startDifficultySelect) {
    ui.startDifficultySelect.value = state.aiDifficulty;
  }
  if (ui.backToGameBtn) {
    ui.backToGameBtn.disabled = !canReturn;
  }

  state.menuOpen = true;
  state.menuCanReturn = canReturn;
  if (canReturn) {
    state.over = true;
  }
  document.body.classList.add("menu-open");
  renderBoards(ui, state);
  renderHud(ui, state);
  hideEndOverlay(ui);
  showStartOverlay(ui);
    setStatus(ui, "Wybierz poziom wroga.");
}

function hideStartMenu() {
  document.body.classList.remove("menu-open");
  state.menuCanReturn = false;
  if (ui.backToGameBtn) {
    ui.backToGameBtn.disabled = false;
  }
  hideStartOverlay(ui);
}

function returnFromMenu() {
  if (!state.menuCanReturn) {
    setStatus(ui, "Najpierw kliknij Nowa gra.");
    return;
  }

  state.menuOpen = false;
  state.over = false;
  hideStartMenu();
  renderHud(ui, state);
  setStatus(ui, `Runda ${state.round}: cele ${state.salvos.player}.`);
}

function handleEnemyBoardClick(event) {
  if (state.over || state.phase !== "player" || state.resolvingPlayerBarrage) {
    return;
  }

  audio.ensureAudioContext();

  const cell = event.target.closest(".cell");
  if (!cell) {
    return;
  }

  const idx = Number(cell.dataset.index);
  if (state.enemyBoard[idx] === 2 || state.enemyBoard[idx] === 3) {
     setStatus(ui, "To pole już było ostrzelane.");
    return;
  }

  const plannedIndex = state.playerShotPlan.indexOf(idx);
  if (plannedIndex >= 0) {
    state.playerShotPlan.splice(plannedIndex, 1);
    state.salvos.player += 1;
      setStatus(ui, `Cel usunięty. Kolejka: ${state.playerShotPlan.length}.`);
    cell.classList.remove("planned");
    renderHud(ui, state);
    return;
  }

  if (state.salvos.player <= 0) {
      setStatus(ui, "Limit celów osiągnięty.");
    return;
  }

  state.playerShotPlan.push(idx);
  state.salvos.player -= 1;
  audio.playSfx("mark");
    setStatus(ui, `Cel dodany. Kolejka: ${state.playerShotPlan.length}.`);

  cell.classList.add("planned");
  renderHud(ui, state);

  if (state.salvos.player === 0) {
    state.resolvingPlayerBarrage = true;
      setStatus(ui, "Trwa salwa...");
    renderHud(ui, state);
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
    state.salvos.ai = Math.min(getPhaseSalvos(state.enemyFleet), getAvailablePlayerTargets(state).length);
      setStatus(ui, `Tura wroga: strzały ${state.salvos.ai}.`);
    renderHud(ui, state);
    setTimeout(runAiBarrage, 500);
    return;
  }

  const idx = state.playerShotPlan.shift();
  const result = resolveShot("player", idx, state);

  if (!result.valid) {
    setTimeout(resolvePlayerBarrage, 50);
    return;
  }

  if (result.hit) {
    state.hits.player += 1;
    audio.playSfx(result.sunkShip ? "sunk" : "hit");
  } else {
    audio.playSfx("miss");
  }

  state.lastShotEffects = [{
    target: "enemy",
    idx,
    kind: result.sunkShip ? "sunk" : result.hit ? "hit" : "miss",
  }];

  if (result.sunkShip) {
    state.sunk.player += 1;
    state.salvos.ai = Math.min(getPhaseSalvos(state.enemyFleet), getAvailablePlayerTargets(state).length);
     setStatus(ui, `Trafiony i zatopiony. Zostało: ${state.playerShotPlan.length}.`);
  } else {
     setStatus(ui, result.hit ? `Trafienie. Zostało: ${state.playerShotPlan.length}.` : `Pudło. Zostało: ${state.playerShotPlan.length}.`);
  }

  renderBoards(ui, state);
  renderHud(ui, state);

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

  const barragePlan = buildEnemyBarragePlan(state, state.salvos.ai);
    setStatus(ui, `Wróg oddaje strzały: ${barragePlan.length}.`);
  renderHud(ui, state);

  setTimeout(() => {
    animateEnemyBarrage(barragePlan, 0, []);
  }, 350);
}

function animateEnemyBarrage(plan, index, results) {
  if (state.over) {
    return;
  }

  if (index >= plan.length) {
    const summary = applyEnemyBarrageResults(state, results);

    if (state.over) {
      return;
    }

    renderBoards(ui, state);
    renderHud(ui, state);

    if (checkGameEnd()) {
      return;
    }

    setStatus(ui, summary);
    setTimeout(startPlayerPhase, 650);
    return;
  }

  const idx = plan[index];
  const result = resolveShot("ai", idx, state);

  if (!result.valid) {
    setTimeout(() => animateEnemyBarrage(plan, index + 1, results), 50);
    return;
  }

  if (result.hit) {
    audio.playSfx(result.sunkShip ? "sunk" : "hit");
  } else {
    audio.playSfx("miss");
  }

  state.lastShotEffects = [{
    target: "player",
    idx,
    kind: result.sunkShip ? "sunk" : result.hit ? "hit" : "miss",
  }];

  results.push(result);
  renderBoards(ui, state);
  renderHud(ui, state);

  if (checkGameEnd()) {
    return;
  }

  setTimeout(() => animateEnemyBarrage(plan, index + 1, results), result.sunkShip ? 260 : 150);
}

function startPlayerPhase() {
  if (state.over) {
    return;
  }

  state.phase = "player";
  state.round += 1;
  state.salvos.player = Math.min(getPhaseSalvos(state.playerFleet), getAvailableEnemyTargets(state).length);
  state.playerShotPlan = [];
  state.resolvingPlayerBarrage = false;
  setStatus(ui, `Runda ${state.round}: cele ${state.salvos.player}.`);
  renderHud(ui, state);
}

function checkGameEnd() {
  const enemyAllSunk = state.enemyFleet.every((ship) => ship.sunk);
  const playerAllSunk = state.playerFleet.every((ship) => ship.sunk);

  if (enemyAllSunk) {
      endGame("Wygrana! Flota wroga została zatopiona.");
    return true;
  }

  if (playerAllSunk) {
      endGame("Przegrana. Wróg zatopił Twoją flotę.");
    return true;
  }

  return false;
}

function endGame(message) {
  state.over = true;
  state.phase = "done";
  state.resolvingPlayerBarrage = false;
  state.playerShotPlan = [];
  state.endBoardView = "player";
  setStatus(ui, `${message} Użyj strzałek.`);
  renderBoards(ui, state);
  renderHud(ui, state);
  hideEndOverlay(ui);
  requestAnimationFrame(() => {
    if (ui.boards) {
      ui.boards.classList.add("end-view-player");
      ui.boards.classList.remove("end-view-enemy");
    }
    uiSyncEndBoardFrame(ui, state);
  });
  audio.playSfx("end");
}
