(() => {
  const { BOARD_CELLS, GRID_SIZE, getPhaseSalvos, randomInt } = window.AppConfig;

  function getAvailablePlayerTargets(state, excluded = new Set()) {
  const available = [];
  for (let i = 0; i < BOARD_CELLS; i += 1) {
    if (!excluded.has(i) && state.playerBoard[i] !== 2 && state.playerBoard[i] !== 3) {
      available.push(i);
    }
  }

  return available;
  }

  function getAvailableEnemyTargets(state, excluded = new Set()) {
  const available = [];
  for (let i = 0; i < BOARD_CELLS; i += 1) {
    if (!excluded.has(i) && state.enemyBoard[i] !== 2 && state.enemyBoard[i] !== 3) {
      available.push(i);
    }
  }

  return available;
  }

  function pickAiTarget(state, excluded = new Set()) {
  const available = getAvailablePlayerTargets(state, excluded);
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

  function buildEnemyBarragePlan(state, shotCount) {
  const plan = [];
  const excluded = new Set();

  for (let i = 0; i < shotCount; i += 1) {
    const target = pickAiTarget(state, excluded);
    if (target === null) {
      break;
    }

    excluded.add(target);
    plan.push(target);
  }

  return plan;
  }

  function enqueueNeighborTargets(state, idx) {
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

  function applyEnemyBarrageResults(state, results) {
  let hits = 0;
  let sunkShips = 0;

  for (const result of results) {
    if (!result.valid) {
      continue;
    }

    if (result.hit) {
      hits += 1;
      enqueueNeighborTargets(state, result.idx);
    }

    if (result.sunkShip) {
      sunkShips += 1;
    }
  }

  if (hits > 0) {
    state.hits.ai += hits;
  }

  if (sunkShips > 0) {
    state.sunk.ai += sunkShips;
  }

  state.salvos.player = getPhaseSalvos(state.playerFleet);

  if (hits === 0) {
    return "Salwa wroga: brak trafień.";
  }

  if (sunkShips > 0) {
    return `Salwa wroga: trafień ${hits}, zatopień ${sunkShips}.`;
  }

  return `Salwa wroga: trafień ${hits}.`;
  }

  window.AppAi = {
    getAvailablePlayerTargets,
    getAvailableEnemyTargets,
    pickAiTarget,
    buildEnemyBarragePlan,
    enqueueNeighborTargets,
    applyEnemyBarrageResults,
  };
})();
