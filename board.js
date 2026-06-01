(() => {
  const { BOARD_CELLS, GRID_SIZE, randomInt } = window.AppConfig;

  function createEmptyBoard() {
    return new Array(BOARD_CELLS).fill(0);
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

  function placeFleetRandom(board, shipLengths, rng = Math.random) {
  while (true) {
    board.fill(0);
    const fleet = [];
    let complete = true;

    for (const length of shipLengths) {
      let placed = false;

      for (let attempt = 0; attempt < 5000 && !placed; attempt += 1) {
        const horizontal = rng() < 0.5;
        const row = Math.floor(rng() * GRID_SIZE);
        const col = Math.floor(rng() * GRID_SIZE);
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

  function resolveShot(actor, idx, state) {
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

  window.AppBoard = {
    createEmptyBoard,
    placeFleetRandom,
    resolveShot,
  };
})();
