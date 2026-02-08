/*
 * Off-main-thread Conway stepping worker.
 * Keeps message contract small so the Angular runtime can stay readable.
 */

function toKey(x, y) {
  return x + ',' + y;
}

function setFromCells(cells) {
  const live = new Set();
  const list = Array.isArray(cells) ? cells : [];
  for (let i = 0; i < list.length; i++) {
    const cell = list[i];
    if (!cell) continue;
    live.add(toKey(cell.x | 0, cell.y | 0));
  }
  return live;
}

function cellsFromSet(live) {
  const cells = [];
  live.forEach((key) => {
    const parts = key.split(',');
    cells.push({ x: Number(parts[0]), y: Number(parts[1]) });
  });
  return cells;
}

function stepOnce(liveCells) {
  const neighborCounts = new Map();
  liveCells.forEach((key) => {
    const parts = key.split(',');
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nKey = toKey(x + dx, y + dy);
        neighborCounts.set(nKey, (neighborCounts.get(nKey) || 0) + 1);
      }
    }
  });

  const next = new Set();
  neighborCounts.forEach((count, key) => {
    if (count === 3 || (count === 2 && liveCells.has(key))) {
      next.add(key);
    }
  });
  return next;
}

function stepMany(cells, generations) {
  let live = setFromCells(cells);
  const steps = Math.max(1, Math.floor(Number(generations) || 1));
  for (let i = 0; i < steps; i++) {
    live = stepOnce(live);
  }
  return cellsFromSet(live);
}

self.onmessage = function onMessage(event) {
  const data = event && event.data ? event.data : {};
  if (data.type !== 'step') return;

  const requestId = Number(data.requestId) || 0;
  const generations = Math.max(1, Math.floor(Number(data.generations) || 1));
  const start = Date.now();

  try {
    const cells = stepMany(data.cells, generations);
    self.postMessage({
      type: 'stepResult',
      requestId: requestId,
      generations: generations,
      cells: cells,
      elapsedMs: Date.now() - start
    });
  } catch (error) {
    self.postMessage({
      type: 'stepError',
      requestId: requestId,
      message: error && error.message ? String(error.message) : 'Simulation worker failed'
    });
  }
};
