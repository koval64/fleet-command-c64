(() => {
  const { BOARD_CELLS } = window.AppConfig;

  function collectUi() {
    return {
    boards: document.querySelector(".boards"),
    hudStrip: document.querySelector(".hud-strip"),
    playerWrap: document.getElementById("player-wrap"),
    enemyWrap: document.getElementById("enemy-wrap"),
    playerBoard: document.getElementById("player-board"),
    enemyBoard: document.getElementById("enemy-board"),
    status: document.getElementById("status"),
    objectiveText: document.getElementById("objective-text"),
    abilityStrip: document.getElementById("ability-strip"),
    playerSalvos: document.getElementById("player-salvos"),
    aiSalvos: document.getElementById("ai-salvos"),
    playerHits: document.getElementById("player-hits"),
    aiHits: document.getElementById("ai-hits"),
    playerSunk: document.getElementById("player-sunk"),
    aiSunk: document.getElementById("ai-sunk"),
    newGameBtn: document.getElementById("new-game-btn"),
    endPanels: document.getElementById("end-panels"),
    endOverlay: document.getElementById("end-overlay"),
    endTitle: document.getElementById("end-title"),
    endMessage: document.getElementById("end-message"),
    endScore: document.getElementById("end-score"),
    startOverlay: document.getElementById("start-overlay"),
    startDifficultySelect: document.getElementById("start-difficulty-select"),
    startModeSelect: document.getElementById("start-mode-select"),
    startPerkSelect: document.getElementById("start-perk-select"),
    riskModeToggle: document.getElementById("risk-mode-toggle"),
    dailyChallengeBtn: document.getElementById("daily-challenge-btn"),
    profileStats: document.getElementById("profile-stats"),
    tutorialHint: document.getElementById("tutorial-hint"),
    startGameBtn: document.getElementById("start-game-btn"),
    backToGameBtn: document.getElementById("back-to-game-btn"),
    scanBtn: document.getElementById("scan-btn"),
    lineBtn: document.getElementById("line-btn"),
    mineBtn: document.getElementById("mine-btn"),
    riskBoostBtn: document.getElementById("risk-boost-btn"),
    rematchBtn: document.getElementById("rematch-btn"),
    closeOverlayBtn: document.getElementById("close-overlay-btn"),
    endScrollControls: document.getElementById("end-scroll-controls"),
    endScrollPrev: document.getElementById("end-scroll-prev"),
    endScrollNext: document.getElementById("end-scroll-next"),
    };
  }

  function setStatus(ui, text) {
    ui.status.textContent = text;
  }

  function showStartOverlay(ui) {
    ui.startOverlay.classList.remove("hidden");
  }

  function hideStartOverlay(ui) {
    ui.startOverlay.classList.add("hidden");
  }

  function showEndOverlay(ui, state, message) {
    ui.endTitle.textContent = state.hits.player >= state.hits.ai ? "Raport zwycięstwa" : "Raport porażki";
    ui.endMessage.textContent = message;
    ui.endScore.textContent = `Trafienia gracza: ${state.hits.player} | Trafienia wroga: ${state.hits.ai} | Runda: ${state.round}`;
    ui.endOverlay.classList.remove("hidden");
  }

  function hideEndOverlay(ui) {
    ui.endOverlay.classList.add("hidden");
  }

  function scrollEndBoards(ui, state, mode) {
  if (state.phase !== "done") {
    return;
  }

  const shouldGoToEnemy = mode === "toggle"
    ? state.endBoardView === "player"
    : mode === "enemy";

  state.endBoardView = shouldGoToEnemy ? "enemy" : "player";
  ui.boards.classList.toggle("end-view-enemy", shouldGoToEnemy);
  ui.boards.classList.toggle("end-view-player", !shouldGoToEnemy);
  }

  function applyShotEffectClass(state, cell, target, idx) {
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
  } else if (effect.kind === "miss") {
    cell.classList.add("flash-miss");
  }
  }

  function renderBoards(ui, state) {
  ui.playerBoard.innerHTML = "";
  ui.enemyBoard.innerHTML = "";

  const playerSunkCells = new Set(
    state.playerFleet.filter((ship) => ship.sunk).flatMap((ship) => ship.cells)
  );
  const enemySunkCells = new Set(
    state.enemyFleet.filter((ship) => ship.sunk).flatMap((ship) => ship.cells)
  );

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

    if (playerSunkCells.has(i)) {
      playerCell.classList.add("sunk");
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

    if (state.scanPreview?.has(i)) {
      enemyCell.classList.add("scan-preview");
    }

    if (enemySunkCells.has(i)) {
      enemyCell.classList.add("sunk");
    }

    applyShotEffectClass(state, enemyCell, "enemy", i);
    applyShotEffectClass(state, playerCell, "player", i);

    ui.enemyBoard.appendChild(enemyCell);
  }

  state.lastShotEffects = [];
  }

  function syncHudWidth(ui, state) {
  if (!ui.hudStrip || !ui.boards) {
    return;
  }

  let targetWidth = ui.boards.getBoundingClientRect().width;

  if (state.phase === "player") {
    targetWidth = ui.enemyBoard.getBoundingClientRect().width;
  } else if (state.phase === "ai") {
    targetWidth = ui.playerBoard.getBoundingClientRect().width;
  } else if (state.phase === "done") {
    const activeWrap = state.endBoardView === "enemy" ? ui.enemyWrap : ui.playerWrap;
    const activeBoardWidth = activeWrap?.querySelector(".board")?.getBoundingClientRect().width || 0;
    if (activeBoardWidth > 0) {
      targetWidth = activeBoardWidth;
    } else {
      return;
    }
  }

  ui.hudStrip.style.width = `${Math.max(220, Math.round(targetWidth))}px`;
  }

  function syncEndBoardFrame(ui, state) {
  if (!ui.boards) {
    return;
  }

  if (state.phase !== "done") {
    ui.boards.style.height = "";
    if (ui.endPanels) {
      ui.endPanels.style.height = "";
    }
    return;
  }

  const activeWrap = state.endBoardView === "enemy" ? ui.enemyWrap : ui.playerWrap;
  const frameHeight = Math.ceil(activeWrap.getBoundingClientRect().height);
  const boardHeight = Math.ceil(activeWrap.querySelector(".board")?.getBoundingClientRect().height || 0);
  const infoHeight = Math.ceil(activeWrap.querySelector(".board-info")?.getBoundingClientRect().height || 0);
  const frameSize = Math.max(frameHeight, boardHeight + infoHeight + 8);

  if (frameSize > 0) {
    ui.boards.style.height = `${frameSize}px`;
    if (ui.endPanels) {
      ui.endPanels.style.height = `${frameSize}px`;
    }
  }
  }

  function renderHud(ui, state) {
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

  ui.newGameBtn.textContent = "Menu";
  requestAnimationFrame(() => syncHudWidth(ui, state));
  requestAnimationFrame(() => syncEndBoardFrame(ui, state));
  }

  window.AppUi = {
    collectUi,
    setStatus,
    showStartOverlay,
    hideStartOverlay,
    showEndOverlay,
    hideEndOverlay,
    scrollEndBoards,
    renderBoards,
    syncHudWidth,
    syncEndBoardFrame,
    renderHud,
  };
})();
