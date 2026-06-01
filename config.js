(() => {
  const GRID_SIZE = 10;
  const BOARD_CELLS = GRID_SIZE * GRID_SIZE;
  const SHOTS_PER_SHIP = 2;
  const SHIP_LENGTHS = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  const INITIAL_SALVOS = SHOTS_PER_SHIP * SHIP_LENGTHS.length;

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
    getPhaseSalvos,
    randomInt,
    capitalize,
  };
})();
