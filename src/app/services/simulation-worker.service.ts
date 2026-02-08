import { Injectable, OnDestroy } from '@angular/core';
import { Cell } from '../model/game-model.service';

export interface SimulationRequest {
  requestId: number;
  cells: Cell[];
  generations: number;
}

export interface SimulationResult {
  requestId: number;
  generations: number;
  cells: Cell[];
  elapsedMs: number;
  workerUsed: boolean;
}

interface PendingRequest {
  resolve: (result: SimulationResult) => void;
  reject: (error: Error) => void;
  startedAt: number;
  generations: number;
}

@Injectable({ providedIn: 'root' })
export class SimulationWorkerService implements OnDestroy {
  private worker: Worker | null = null;
  private workerFailed = false;
  private pending = new Map<number, PendingRequest>();

  ngOnDestroy() {
    this.shutdown();
  }

  async step(request: SimulationRequest): Promise<SimulationResult> {
    const normalized = {
      requestId: Math.max(1, Math.floor(Number(request?.requestId) || 1)),
      generations: Math.max(1, Math.floor(Number(request?.generations) || 1)),
      cells: Array.isArray(request?.cells) ? request.cells : []
    };

    const worker = this.ensureWorker();
    if (!worker) {
      return this.stepFallback(normalized);
    }

    return new Promise<SimulationResult>((resolve, reject) => {
      this.pending.set(normalized.requestId, {
        resolve,
        reject,
        startedAt: performance.now(),
        generations: normalized.generations
      });

      worker.postMessage({
        type: 'step',
        requestId: normalized.requestId,
        generations: normalized.generations,
        cells: normalized.cells
      });
    });
  }

  shutdown() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.pending.forEach(({ reject }) => reject(new Error('Simulation worker terminated')));
    this.pending.clear();
  }

  private ensureWorker() {
    if (this.workerFailed) return null;
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;

    try {
      this.worker = new Worker('/assets/workers/life-simulation.worker.js');
      this.worker.onmessage = (event: MessageEvent) => this.handleWorkerMessage(event);
      this.worker.onerror = () => {
        this.workerFailed = true;
        this.shutdown();
      };
      return this.worker;
    } catch {
      this.workerFailed = true;
      this.shutdown();
      return null;
    }
  }

  private handleWorkerMessage(event: MessageEvent) {
    const data = (event && event.data) || {};
    const requestId = Math.max(1, Math.floor(Number(data.requestId) || 1));
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);

    if (data.type === 'stepError') {
      pending.reject(new Error(String(data.message || 'Simulation worker failed')));
      return;
    }

    const cells = Array.isArray(data.cells) ? data.cells as Cell[] : [];
    const elapsedMs = Number(data.elapsedMs);
    pending.resolve({
      requestId,
      generations: Math.max(1, Math.floor(Number(data.generations) || pending.generations)),
      cells,
      elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : performance.now() - pending.startedAt,
      workerUsed: true
    });
  }

  private async stepFallback(request: SimulationRequest): Promise<SimulationResult> {
    const startedAt = performance.now();
    let live = setFromCells(request.cells);
    const chunkSize = 8;
    for (let i = 0; i < request.generations; i++) {
      live = stepOnce(live);
      if ((i + 1) % chunkSize === 0) {
        await yieldToEventLoop();
      }
    }

    // Final yield so UI events can run before the next loop iteration.
    await yieldToEventLoop();

    return {
      requestId: request.requestId,
      generations: request.generations,
      cells: cellsFromSet(live),
      elapsedMs: performance.now() - startedAt,
      workerUsed: false
    };
  }
}

function setFromCells(cells: Cell[]) {
  const live = new Set<string>();
  const list = Array.isArray(cells) ? cells : [];
  for (const cell of list) {
    if (!cell) continue;
    live.add(`${cell.x},${cell.y}`);
  }
  return live;
}

function cellsFromSet(live: Set<string>) {
  const cells: Cell[] = [];
  live.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    cells.push({ x, y });
  });
  return cells;
}

function stepOnce(liveCells: Set<string>) {
  const neighborCounts = new Map<string, number>();
  liveCells.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nKey = `${x + dx},${y + dy}`;
        neighborCounts.set(nKey, (neighborCounts.get(nKey) || 0) + 1);
      }
    }
  });

  const next = new Set<string>();
  neighborCounts.forEach((count, key) => {
    if (count === 3 || (count === 2 && liveCells.has(key))) {
      next.add(key);
    }
  });
  return next;
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
