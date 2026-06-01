const {
  GRID_SIZE,
  INITIAL_SALVOS,
  SHIP_LENGTHS,
  GAME_MODES,
  START_PERKS,
  getPhaseSalvos,
} = window.AppConfig;
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
  showEndOverlay,
  renderBoards,
  renderHud,
  scrollEndBoards,
  setStatus,
  showStartOverlay,
  syncEndBoardFrame: uiSyncEndBoardFrame,
  syncHudWidth: uiSyncHudWidth,
} = window.AppUi;

const PROFILE_STORAGE_KEY = "fleet-command-c64-profile-v2";

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
  gameMode: "classic",
  startPerk: "none",
  riskModeEnabled: false,
  riskBoostArmed: false,
  riskBoostUsed: false,
  riskPenaltyNextRound: 0,
  bonusSalvosNextRound: 0,
  lastShotEffects: [],
  playerShotPlan: [],
  resolvingPlayerBarrage: false,
  endBoardView: "player",
  menuOpen: true,
  menuCanReturn: false,
  pendingAction: null,
  scanPreview: new Set(),
  dailyChallengeActive: false,
  dailyChallengeDate: "",
  abilities: { scan: 0, line: 0, mine: 0 },
  mineArmed: false,
  objective: null,
  playerRoundHits: 0,
  playerRoundShots: 0,
  totalPlayerShots: 0,
  totalObjectivesCompleted: 0,
  profile: loadProfile(),
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
ui.startGameBtn.addEventListener("click", () => startGameFromMenu(false));
ui.dailyChallengeBtn.addEventListener("click", () => startGameFromMenu(true));
ui.backToGameBtn.addEventListener("click", returnFromMenu);
ui.scanBtn.addEventListener("click", () => toggleAction("scan"));
ui.lineBtn.addEventListener("click", () => toggleAction("line"));
ui.mineBtn.addEventListener("click", armMine);
ui.riskBoostBtn.addEventListener("click", activateRiskBoost);
ui.enemyBoard.addEventListener("click", handleEnemyBoardClick);
window.addEventListener("resize", () => uiSyncHudWidth(ui, state));
window.addEventListener("resize", () => uiSyncEndBoardFrame(ui, state));

showStartMenu();
renderAbilityUi();

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return {
        gamesPlayed: 0,
        wins: 0,
        dailyBest: {},
        tutorialSeen: false,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      gamesPlayed: Number(parsed.gamesPlayed) || 0,
      wins: Number(parsed.wins) || 0,
      dailyBest: parsed.dailyBest && typeof parsed.dailyBest === "object" ? parsed.dailyBest : {},
      tutorialSeen: Boolean(parsed.tutorialSeen),
    };
  } catch {
    return {
      gamesPlayed: 0,
      wins: 0,
      dailyBest: {},
      tutorialSeen: false,
    };
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(state.profile));
}

function updateProfileLine() {
  const bestToday = state.profile.dailyBest[getTodayKey()];
  const dailyText = bestToday ? ` | Daily best: ${bestToday}` : "";
  ui.profileStats.textContent = `Profil: ${state.profile.gamesPlayed} gier, ${state.profile.wins} wygranych${dailyText}`;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashString(seedText) {
  let hash = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    hash = Math.imul(hash ^ seedText.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
}

function createSeededRandom(seedText) {
  const seedFn = hashString(seedText);
  let seed = seedFn();

  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getModeConfig() {
  return GAME_MODES[state.gameMode] || {
    shipLengths: SHIP_LENGTHS,
    salvoMultiplier: 1,
    abilities: { scan: 1, line: 1, mine: 1 },
  };
}

function getPerkConfig() {
  return START_PERKS[state.startPerk] || START_PERKS.none;
}

function computeModeSalvos(fleet, multiplier) {
  return Math.max(1, Math.round(getPhaseSalvos(fleet) * multiplier));
}

function initGame(options = {}) {
  audio.ensureAudioContext();

  const modeConfig = getModeConfig();
  const perkConfig = getPerkConfig();
  const seedText = `${getTodayKey()}|${state.aiDifficulty}|${state.gameMode}`;
  const rng = options.dailyChallenge ? createSeededRandom(seedText) : Math.random;

  state.playerBoard = createEmptyBoard();
  state.enemyBoard = createEmptyBoard();
  state.playerFleet = placeFleetRandom(state.playerBoard, modeConfig.shipLengths, rng);
  state.enemyFleet = placeFleetRandom(state.enemyBoard, modeConfig.shipLengths, rng);

  state.salvos = {
    player: Math.min(
      computeModeSalvos(state.playerFleet, modeConfig.salvoMultiplier) + perkConfig.bonus.salvos,
      getAvailableEnemyTargets(state).length
    ),
    ai: Math.min(computeModeSalvos(state.enemyFleet, modeConfig.salvoMultiplier), getAvailablePlayerTargets(state).length),
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
  state.pendingAction = null;
  state.scanPreview = new Set();
  state.mineArmed = false;
  state.riskBoostArmed = false;
  state.riskBoostUsed = false;
  state.riskPenaltyNextRound = 0;
  state.bonusSalvosNextRound = 0;
  state.playerRoundHits = 0;
  state.playerRoundShots = 0;
  state.totalPlayerShots = 0;
  state.totalObjectivesCompleted = 0;
  state.dailyChallengeActive = Boolean(options.dailyChallenge);
  state.dailyChallengeDate = options.dailyChallenge ? getTodayKey() : "";

  state.abilities = {
    scan: Math.max(0, modeConfig.abilities.scan + perkConfig.bonus.scan),
    line: Math.max(0, modeConfig.abilities.line + perkConfig.bonus.line),
    mine: Math.max(0, modeConfig.abilities.mine + perkConfig.bonus.mine),
  };

  state.profile.gamesPlayed += 1;
  state.profile.tutorialSeen = true;
  saveProfile();

  createNewRoundObjective();

  hideEndOverlay(ui);
  hideStartMenu();
  renderBoards(ui, state);
  renderHud(ui, state);
  renderAbilityUi();
  updateObjectiveText();
  updateProfileLine();
  setStatus(ui, `Runda 1: cele ${state.salvos.player}.`);
}

function startGameFromMenu(isDailyChallenge = false) {
  state.aiDifficulty = ui.startDifficultySelect.value;
  state.gameMode = ui.startModeSelect.value;
  state.startPerk = ui.startPerkSelect.value;
  state.riskModeEnabled = Boolean(ui.riskModeToggle.checked);
  initGame({ dailyChallenge: isDailyChallenge });
}

function showStartMenu() {
  const hasStartedGame = state.playerFleet.length > 0 && state.enemyFleet.length > 0;
  const canReturn = hasStartedGame && state.phase === "player" && !state.over && !state.resolvingPlayerBarrage;

  ui.startDifficultySelect.value = state.aiDifficulty;
  ui.startModeSelect.value = state.gameMode;
  ui.startPerkSelect.value = state.startPerk;
  ui.riskModeToggle.checked = state.riskModeEnabled;
  ui.backToGameBtn.disabled = !canReturn;

  updateProfileLine();
  ui.tutorialHint.textContent = state.profile.tutorialSeen
    ? "Tip: użyj Skan 3x3 albo Salwy liniowej, gdy utkniesz."
    : "Tutorial: klikaj pola na radarze, aby zaplanować cele salwy.";

  state.menuOpen = true;
  state.menuCanReturn = canReturn;
  if (canReturn) {
    state.over = true;
  }

  document.body.classList.add("menu-open");
  renderBoards(ui, state);
  renderHud(ui, state);
  renderAbilityUi();
  hideEndOverlay(ui);
  showStartOverlay(ui);
  setStatus(ui, "Wybierz poziom i startuj.");
}

function hideStartMenu() {
  document.body.classList.remove("menu-open");
  state.menuCanReturn = false;
  ui.backToGameBtn.disabled = false;
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
  renderAbilityUi();
  setStatus(ui, `Runda ${state.round}: cele ${state.salvos.player}.`);
}

function toggleAction(action) {
  if (state.phase !== "player" || state.over || state.resolvingPlayerBarrage) {
    return;
  }

  if (state.abilities[action] <= 0) {
    setStatus(ui, "Brak ładunków tej umiejętności.");
    return;
  }

  state.pendingAction = state.pendingAction === action ? null : action;
  renderAbilityUi();

  if (state.pendingAction === "scan") {
    setStatus(ui, "Skan aktywny: kliknij pole na radarze.");
  } else if (state.pendingAction === "line") {
    setStatus(ui, "Salwa liniowa aktywna: kliknij pole w wybranym rzędzie.");
  }
}

function armMine() {
  if (state.phase !== "player" || state.over || state.resolvingPlayerBarrage) {
    return;
  }

  if (state.abilities.mine <= 0) {
    setStatus(ui, "Brak min.");
    return;
  }

  if (state.mineArmed) {
    setStatus(ui, "Mina już uzbrojona.");
    return;
  }

  state.abilities.mine -= 1;
  state.mineArmed = true;
  renderAbilityUi();
  setStatus(ui, "Mina uzbrojona: pierwszy strzał AI będzie zneutralizowany.");
}

function activateRiskBoost() {
  if (!state.riskModeEnabled || state.phase !== "player" || state.over || state.resolvingPlayerBarrage) {
    return;
  }

  if (state.riskBoostUsed) {
    setStatus(ui, "Ryzyko podbite już w tej rundzie.");
    return;
  }

  const availableTargets = getAvailableEnemyTargets(state).length;
  state.salvos.player = Math.min(state.salvos.player + 3, availableTargets);
  state.riskBoostUsed = true;
  state.riskBoostArmed = true;

  renderHud(ui, state);
  renderAbilityUi();
  setStatus(ui, `Podbito ryzyko: cele +3. Jeśli nie trafisz, kolejna runda -2 salwy.`);
}

function renderAbilityUi() {
  ui.scanBtn.textContent = `Skan 3x3 (${state.abilities.scan})`;
  ui.lineBtn.textContent = `Salwa liniowa (${state.abilities.line})`;
  ui.mineBtn.textContent = `Mina (${state.abilities.mine})`;

  const playerReady = state.phase === "player" && !state.over && !state.resolvingPlayerBarrage;

  ui.scanBtn.disabled = !playerReady || state.abilities.scan <= 0;
  ui.lineBtn.disabled = !playerReady || state.abilities.line <= 0;
  ui.mineBtn.disabled = !playerReady || state.abilities.mine <= 0 || state.mineArmed;
  ui.riskBoostBtn.disabled = !playerReady || !state.riskModeEnabled || state.riskBoostUsed;

  ui.scanBtn.classList.toggle("active", state.pendingAction === "scan");
  ui.lineBtn.classList.toggle("active", state.pendingAction === "line");
}

function createNewRoundObjective() {
  const sinkObjective = state.round % 2 === 0;
  state.objective = sinkObjective
    ? {
        type: "sink",
        target: 1,
        progress: 0,
        reward: 2,
        completed: false,
        rewarded: false,
        desc: "zatop 1 statek",
      }
    : {
        type: "hit",
        target: 2,
        progress: 0,
        reward: 1,
        completed: false,
        rewarded: false,
        desc: "traf 2 razy",
      };

  updateObjectiveText();
}

function updateObjectiveText() {
  if (!state.objective || !ui.objectiveText) {
    return;
  }

  const statusText = state.objective.completed
    ? "wykonany"
    : `${state.objective.progress}/${state.objective.target}`;
  ui.objectiveText.textContent = `Cel rundy: ${state.objective.desc} (${statusText}, +${state.objective.reward} salwy)`;
}

function updateObjectiveFromResult(result) {
  if (!state.objective || state.objective.completed) {
    return;
  }

  if (state.objective.type === "hit" && result.hit) {
    state.objective.progress += 1;
  }

  if (state.objective.type === "sink" && result.sunkShip) {
    state.objective.progress += 1;
  }

  if (state.objective.progress >= state.objective.target) {
    state.objective.completed = true;
  }

  updateObjectiveText();
}

function tryRewardObjective() {
  if (!state.objective || !state.objective.completed || state.objective.rewarded) {
    return;
  }

  state.objective.rewarded = true;
  state.bonusSalvosNextRound += state.objective.reward;
  state.totalObjectivesCompleted += 1;
  setStatus(ui, `Cel rundy wykonany. Bonus na następną rundę: +${state.objective.reward} salwy.`);
}

function getHeatHint(idx) {
  let minDistance = Infinity;
  for (let i = 0; i < state.enemyBoard.length; i += 1) {
    if (state.enemyBoard[i] !== 1) {
      continue;
    }

    const rowA = Math.floor(i / GRID_SIZE);
    const colA = i % GRID_SIZE;
    const rowB = Math.floor(idx / GRID_SIZE);
    const colB = idx % GRID_SIZE;
    const dist = Math.abs(rowA - rowB) + Math.abs(colA - colB);
    minDistance = Math.min(minDistance, dist);
  }

  if (minDistance <= 1) {
    return "Gorąco.";
  }
  if (minDistance <= 3) {
    return "Ciepło.";
  }
  return "Zimno.";
}

function getAreaFromIndex(idx) {
  const row = Math.floor(idx / GRID_SIZE);
  const col = idx % GRID_SIZE;
  const cells = [];

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE) {
        continue;
      }
      cells.push(nr * GRID_SIZE + nc);
    }
  }

  return cells;
}

function performScan(idx) {
  state.pendingAction = null;

  if (state.abilities.scan <= 0) {
    setStatus(ui, "Brak skanów.");
    renderAbilityUi();
    return;
  }

  state.abilities.scan -= 1;
  const area = getAreaFromIndex(idx);
  const shipCells = area.filter((cellIdx) => state.enemyBoard[cellIdx] === 1).length;

  state.scanPreview = new Set(area);
  renderBoards(ui, state);
  renderHud(ui, state);
  renderAbilityUi();

  const thermal = shipCells === 0 ? "Pusto." : shipCells <= 2 ? "Słaby sygnał." : "Mocny sygnał.";
  setStatus(ui, `Skan: ${shipCells} segmentów statku w obszarze 3x3. ${thermal}`);

  setTimeout(() => {
    state.scanPreview = new Set();
    renderBoards(ui, state);
    renderHud(ui, state);
  }, 750);
}

function performLineStrike(idx) {
  state.pendingAction = null;

  if (state.abilities.line <= 0) {
    setStatus(ui, "Brak salw liniowych.");
    renderAbilityUi();
    return;
  }

  state.abilities.line -= 1;
  renderAbilityUi();

  const row = Math.floor(idx / GRID_SIZE);
  const rowTargets = [];
  for (let col = 0; col < GRID_SIZE; col += 1) {
    const target = row * GRID_SIZE + col;
    if (state.enemyBoard[target] !== 2 && state.enemyBoard[target] !== 3) {
      rowTargets.push(target);
    }
  }

  if (rowTargets.length === 0) {
    setStatus(ui, "Salwa liniowa: ten rząd jest już wyczyszczony.");
    return;
  }

  const effects = [];
  let hits = 0;
  let sunkCount = 0;

  for (const target of rowTargets) {
    const result = resolveShot("player", target, state);
    if (!result.valid) {
      continue;
    }

    state.totalPlayerShots += 1;
    state.playerRoundShots += 1;

    if (result.hit) {
      hits += 1;
      state.hits.player += 1;
      state.playerRoundHits += 1;
      audio.playSfx(result.sunkShip ? "sunk" : "hit");
    } else {
      audio.playSfx("miss");
    }

    if (result.sunkShip) {
      sunkCount += 1;
      state.sunk.player += 1;
    }

    updateObjectiveFromResult(result);

    effects.push({
      target: "enemy",
      idx: target,
      kind: result.sunkShip ? "sunk" : result.hit ? "hit" : "miss",
    });
  }

  state.lastShotEffects = effects;
  state.salvos.player = 0;

  renderBoards(ui, state);
  renderHud(ui, state);

  if (checkGameEnd()) {
    return;
  }

  setStatus(ui, `Salwa liniowa: trafień ${hits}, zatopień ${sunkCount}. Tura wroga.`);
  tryRewardObjective();
  state.resolvingPlayerBarrage = false;
  state.phase = "ai";
  state.salvos.ai = Math.min(computeModeSalvos(state.enemyFleet, getModeConfig().salvoMultiplier), getAvailablePlayerTargets(state).length);
  renderHud(ui, state);
  renderAbilityUi();
  setTimeout(runAiBarrage, 550);
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

  if (state.pendingAction === "scan") {
    performScan(idx);
    return;
  }

  if (state.pendingAction === "line") {
    performLineStrike(idx);
    return;
  }

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
    renderAbilityUi();
    setTimeout(resolvePlayerBarrage, 220);
  }
}

function resolvePlayerBarrage() {
  if (state.over) {
    return;
  }

  if (state.playerShotPlan.length === 0) {
    state.resolvingPlayerBarrage = false;
    tryRewardObjective();

    if (state.riskBoostArmed && state.playerRoundHits === 0) {
      state.riskPenaltyNextRound += 2;
      setStatus(ui, "Ryzyko nie weszło: następna runda -2 salwy.");
    }

    state.phase = "ai";
    state.salvos.ai = Math.min(computeModeSalvos(state.enemyFleet, getModeConfig().salvoMultiplier), getAvailablePlayerTargets(state).length);
    renderHud(ui, state);
    renderAbilityUi();
    setTimeout(runAiBarrage, 500);
    return;
  }

  const idx = state.playerShotPlan.shift();
  const result = resolveShot("player", idx, state);

  if (!result.valid) {
    setTimeout(resolvePlayerBarrage, 50);
    return;
  }

  state.totalPlayerShots += 1;
  state.playerRoundShots += 1;

  if (result.hit) {
    state.hits.player += 1;
    state.playerRoundHits += 1;
    audio.playSfx(result.sunkShip ? "sunk" : "hit");
  } else {
    audio.playSfx("miss");
  }

  state.lastShotEffects = [{
    target: "enemy",
    idx,
    kind: result.sunkShip ? "sunk" : result.hit ? "hit" : "miss",
  }];

  updateObjectiveFromResult(result);

  if (result.sunkShip) {
    state.sunk.player += 1;
    state.salvos.ai = Math.min(computeModeSalvos(state.enemyFleet, getModeConfig().salvoMultiplier), getAvailablePlayerTargets(state).length);
    setStatus(ui, `Trafiony i zatopiony. Zostało: ${state.playerShotPlan.length}.`);
  } else if (result.hit) {
    setStatus(ui, `Trafienie. Zostało: ${state.playerShotPlan.length}.`);
  } else {
    setStatus(ui, `Pudło. ${getHeatHint(idx)} Zostało: ${state.playerShotPlan.length}.`);
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
  let result;

  if (state.mineArmed) {
    state.mineArmed = false;
    result = { valid: true, hit: false, sunkShip: null, idx };
    state.lastShotEffects = [{ target: "player", idx, kind: "miss" }];
    setStatus(ui, "Mina zneutralizowała strzał AI.");
  } else {
    result = resolveShot("ai", idx, state);

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
  }

  results.push(result);
  renderBoards(ui, state);
  renderHud(ui, state);
  renderAbilityUi();

  if (checkGameEnd()) {
    return;
  }

  setTimeout(() => animateEnemyBarrage(plan, index + 1, results), result.sunkShip ? 260 : 150);
}

function startPlayerPhase() {
  if (state.over) {
    return;
  }

  const modeConfig = getModeConfig();
  const availableTargets = getAvailableEnemyTargets(state).length;
  const baseSalvos = computeModeSalvos(state.playerFleet, modeConfig.salvoMultiplier);

  state.phase = "player";
  state.round += 1;
  state.playerShotPlan = [];
  state.resolvingPlayerBarrage = false;

  const roundSalvos = baseSalvos + state.bonusSalvosNextRound - state.riskPenaltyNextRound;
  state.salvos.player = Math.max(1, Math.min(roundSalvos, availableTargets));

  state.playerRoundHits = 0;
  state.playerRoundShots = 0;
  state.riskBoostArmed = false;
  state.riskBoostUsed = false;
  state.bonusSalvosNextRound = 0;
  state.riskPenaltyNextRound = 0;

  createNewRoundObjective();

  setStatus(ui, `Runda ${state.round}: cele ${state.salvos.player}.`);
  renderHud(ui, state);
  renderAbilityUi();
}

function checkGameEnd() {
  const enemyAllSunk = state.enemyFleet.every((ship) => ship.sunk);
  const playerAllSunk = state.playerFleet.every((ship) => ship.sunk);

  if (enemyAllSunk) {
    endGame(true, "Wygrana! Flota wroga została zatopiona.");
    return true;
  }

  if (playerAllSunk) {
    endGame(false, "Przegrana. Wróg zatopił Twoją flotę.");
    return true;
  }

  return false;
}

function buildEndSummary(playerWon, message) {
  const accuracy = state.totalPlayerShots > 0
    ? Math.round((state.hits.player / state.totalPlayerShots) * 100)
    : 0;

  let summary = `${message} Celność: ${accuracy}%. Cele rundowe: ${state.totalObjectivesCompleted}.`;

  if (state.dailyChallengeActive) {
    const score = state.round * 100 + Math.max(0, state.totalPlayerShots - state.hits.player) * 8;
    if (playerWon) {
      const best = state.profile.dailyBest[state.dailyChallengeDate];
      if (!best || score < best) {
        state.profile.dailyBest[state.dailyChallengeDate] = score;
        summary += ` Nowy rekord daily: ${score}.`;
      } else {
        summary += ` Daily score: ${score} (best ${best}).`;
      }
    } else {
      summary += ` Daily score (porażka): ${score}.`;
    }
  }

  return summary;
}

function endGame(playerWon, message) {
  state.over = true;
  state.phase = "done";
  state.resolvingPlayerBarrage = false;
  state.playerShotPlan = [];
  state.pendingAction = null;
  state.endBoardView = "player";

  if (playerWon) {
    state.profile.wins += 1;
  }
  saveProfile();

  const summary = buildEndSummary(playerWon, message);

  setStatus(ui, `${message} Użyj strzałek.`);
  renderBoards(ui, state);
  renderHud(ui, state);
  renderAbilityUi();
  showEndOverlay(ui, state, summary);

  requestAnimationFrame(() => {
    if (ui.boards) {
      ui.boards.classList.add("end-view-player");
      ui.boards.classList.remove("end-view-enemy");
    }
    uiSyncEndBoardFrame(ui, state);
  });

  audio.playSfx("end");
}
