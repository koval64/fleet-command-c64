(() => {
  const GRID_SIZE = 10;
  const BOARD_CELLS = GRID_SIZE * GRID_SIZE;
  const SHOTS_PER_SHIP = 2;
  const SHIP_LENGTHS = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  const INITIAL_SALVOS = SHOTS_PER_SHIP * SHIP_LENGTHS.length;
  const GAME_MODES = {
    classic: {
      label: "Klasyczny",
      shipLengths: SHIP_LENGTHS,
      salvoMultiplier: 1,
      abilities: { scan: 1, line: 1, mine: 1 },
    },
    blitz: {
      label: "Blitz",
      shipLengths: [4, 3, 3, 2, 2, 1, 1, 1],
      salvoMultiplier: 1.2,
      abilities: { scan: 1, line: 2, mine: 0 },
    },
    tactical: {
      label: "Taktyczny",
      shipLengths: SHIP_LENGTHS,
      salvoMultiplier: 0.85,
      abilities: { scan: 2, line: 1, mine: 2 },
    },
  };
  const START_PERKS = {
    none: { label: "Brak", bonus: { scan: 0, line: 0, mine: 0, salvos: 0 } },
    scan: { label: "Dodatkowy skan", bonus: { scan: 1, line: 0, mine: 0, salvos: 0 } },
    line: { label: "Dodatkowa salwa liniowa", bonus: { scan: 0, line: 1, mine: 0, salvos: 0 } },
    mine: { label: "Dodatkowa mina", bonus: { scan: 0, line: 0, mine: 1, salvos: 0 } },
    salvo: { label: "+1 salwa", bonus: { scan: 0, line: 0, mine: 0, salvos: 1 } },
  };

  function getPhaseSalvos(fleet) {
    const aliveShips = fleet.filter((ship) => !ship.sunk).length;
    return aliveShips * SHOTS_PER_SHIP;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  window.AppConfig = {
    GRID_SIZE,
    BOARD_CELLS,
    SHOTS_PER_SHIP,
    SHIP_LENGTHS,
    INITIAL_SALVOS,
    GAME_MODES,
    START_PERKS,
    getPhaseSalvos,
    randomInt,
    capitalize,
  };
})();
