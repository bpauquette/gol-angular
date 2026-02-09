import { Injectable, OnDestroy } from '@angular/core';
import { Cell } from '../model/game-model.service';

export interface PatternSearchOptions {
  candidates: number;
  generations: number;
  topK: number;
  soupSize: number;
  fillPercent: number;
  seed: number;
}

export interface PatternSearchCandidate {
  id: string;
  score: number;
  longevity: number;
  volatility: number;
  novelty: number;
  survivalGenerations: number;
  initialPopulation: number;
  peakPopulation: number;
  finalPopulation: number;
  seedCells: Cell[];
}

export interface PatternSearchResult {
  requestId: number;
  examined: number;
  elapsedMs: number;
  workerUsed: boolean;
  patterns: PatternSearchCandidate[];
}

interface PendingPatternSearch {
  resolve: (result: PatternSearchResult) => void;
  reject: (error: Error) => void;
  startedAt: number;
}

interface EvaluatedCandidate {
  index: number;
  seedCells: Cell[];
  survivalGenerations: number;
  initialPopulation: number;
  peakPopulation: number;
  finalPopulation: number;
  volatilityRaw: number;
  signature: string;
}

interface SearchCoreResult {
  examined: number;
  patterns: PatternSearchCandidate[];
}

const DEFAULT_SEARCH_OPTIONS: PatternSearchOptions = {
  candidates: 180,
  generations: 256,
  topK: 8,
  soupSize: 20,
  fillPercent: 28,
  seed: Math.floor(Date.now() % 2_000_000_000)
};

@Injectable({ providedIn: 'root' })
export class PatternDiscoveryService implements OnDestroy {
  private worker: Worker | null = null;
  private workerFailed = false;
  private requestSeq = 1;
  private pending = new Map<number, PendingPatternSearch>();

  ngOnDestroy() {
    this.shutdown();
  }

  async search(options?: Partial<PatternSearchOptions>): Promise<PatternSearchResult> {
    const normalized = normalizePatternSearchOptions(options);
    const requestId = this.requestSeq++;
    const worker = this.ensureWorker();
    if (!worker) {
      return this.searchFallback(requestId, normalized);
    }

    return new Promise<PatternSearchResult>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve,
        reject,
        startedAt: performance.now()
      });

      worker.postMessage({
        type: 'search',
        requestId,
        options: normalized
      });
    });
  }

  shutdown() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.forEach(({ reject }) => reject(new Error('Pattern worker terminated')));
    this.pending.clear();
  }

  private ensureWorker() {
    if (this.workerFailed) return null;
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;

    try {
      this.worker = new Worker('/assets/workers/pattern-discovery.worker.js');
      this.worker.onmessage = (event: MessageEvent) => this.handleWorkerMessage(event);
      this.worker.onerror = () => {
        this.workerFailed = true;
        this.shutdown();
      };
      return this.worker;
    } catch (error) {
      console.error('[PatternDiscovery] Failed to initialize pattern worker.', error);
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

    if (data.type === 'searchError') {
      pending.reject(new Error(String(data.message || 'Pattern search failed')));
      return;
    }

    if (data.type !== 'searchResult') {
      pending.reject(new Error('Pattern worker returned unknown message type'));
      return;
    }

    const patterns = normalizeWorkerPatterns(data.patterns);
    const elapsedMs = Number(data.elapsedMs);
    pending.resolve({
      requestId,
      examined: Math.max(patterns.length, Math.floor(Number(data.examined) || 0)),
      elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : performance.now() - pending.startedAt,
      workerUsed: true,
      patterns
    });
  }

  private async searchFallback(requestId: number, options: PatternSearchOptions): Promise<PatternSearchResult> {
    const startedAt = performance.now();
    // Yield once before heavy fallback execution so UI events flush first.
    await yieldToEventLoop();
    const core = runPatternSearchInMemory(options);
    await yieldToEventLoop();
    return {
      requestId,
      examined: core.examined,
      elapsedMs: performance.now() - startedAt,
      workerUsed: false,
      patterns: core.patterns
    };
  }
}

export function normalizePatternSearchOptions(options?: Partial<PatternSearchOptions>): PatternSearchOptions {
  const input = options || {};
  const candidates = clampInt(input.candidates, 25, 2000, DEFAULT_SEARCH_OPTIONS.candidates);
  const generations = clampInt(input.generations, 32, 2000, DEFAULT_SEARCH_OPTIONS.generations);
  const topK = clampInt(input.topK, 1, 20, DEFAULT_SEARCH_OPTIONS.topK);
  const soupSize = clampInt(input.soupSize, 8, 80, DEFAULT_SEARCH_OPTIONS.soupSize);
  const fillPercent = clampInt(input.fillPercent, 4, 70, DEFAULT_SEARCH_OPTIONS.fillPercent);
  const seed = clampInt(input.seed, 1, 2_000_000_000, DEFAULT_SEARCH_OPTIONS.seed);
  return {
    candidates,
    generations,
    topK,
    soupSize,
    fillPercent,
    seed
  };
}

export function runPatternSearchInMemory(optionsInput?: Partial<PatternSearchOptions>): SearchCoreResult {
  const options = normalizePatternSearchOptions(optionsInput);
  const rng = createRng(options.seed);
  const candidates: EvaluatedCandidate[] = [];

  for (let index = 0; index < options.candidates; index++) {
    const seedCells = generateSoup(options.soupSize, options.fillPercent, rng);
    candidates.push(evaluateCandidate(index, seedCells, options.generations));
  }

  const signatureCounts = new Map<string, number>();
  candidates.forEach((candidate) => {
    signatureCounts.set(candidate.signature, (signatureCounts.get(candidate.signature) || 0) + 1);
  });

  const scored: PatternSearchCandidate[] = candidates.map((candidate) => {
    const longevity = safeRatio(candidate.survivalGenerations, options.generations);
    const volatility = safeRatio(candidate.volatilityRaw, options.generations);
    const duplicateCount = Math.max(1, signatureCounts.get(candidate.signature) || 1);
    const novelty = 1 / duplicateCount;
    const activityBoost = safeRatio(
      Math.max(0, candidate.peakPopulation - candidate.initialPopulation),
      Math.max(1, candidate.initialPopulation * 2)
    );
    const score = clamp01(
      longevity * 0.45 +
      volatility * 0.30 +
      novelty * 0.15 +
      activityBoost * 0.10
    );
    return {
      id: `pattern-${candidate.index + 1}`,
      score,
      longevity,
      volatility,
      novelty,
      survivalGenerations: candidate.survivalGenerations,
      initialPopulation: candidate.initialPopulation,
      peakPopulation: candidate.peakPopulation,
      finalPopulation: candidate.finalPopulation,
      seedCells: candidate.seedCells
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    examined: options.candidates,
    patterns: scored.slice(0, options.topK)
  };
}

function normalizeWorkerPatterns(list: unknown): PatternSearchCandidate[] {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => {
    const candidate = item as Partial<PatternSearchCandidate> | null;
    return {
      id: String(candidate?.id || `pattern-${index + 1}`),
      score: clamp01(Number(candidate?.score) || 0),
      longevity: clamp01(Number(candidate?.longevity) || 0),
      volatility: clamp01(Number(candidate?.volatility) || 0),
      novelty: clamp01(Number(candidate?.novelty) || 0),
      survivalGenerations: Math.max(0, Math.floor(Number(candidate?.survivalGenerations) || 0)),
      initialPopulation: Math.max(0, Math.floor(Number(candidate?.initialPopulation) || 0)),
      peakPopulation: Math.max(0, Math.floor(Number(candidate?.peakPopulation) || 0)),
      finalPopulation: Math.max(0, Math.floor(Number(candidate?.finalPopulation) || 0)),
      seedCells: normalizeCells(candidate?.seedCells)
    };
  });
}

function evaluateCandidate(index: number, cells: Cell[], generations: number): EvaluatedCandidate {
  let live = setFromCells(cells);
  let initialPopulation = live.size;
  let peakPopulation = initialPopulation;
  let finalPopulation = initialPopulation;
  let survivalGenerations = initialPopulation > 0 ? 0 : -1;
  let volatilityRaw = 0;
  let previousPopulation = initialPopulation;
  const sampleStride = Math.max(1, Math.floor(generations / 12));
  const samples: number[] = [initialPopulation];

  for (let gen = 1; gen <= generations; gen++) {
    live = stepOnce(live);
    const population = live.size;
    finalPopulation = population;
    if (population > 0) {
      survivalGenerations = gen;
    }
    if (population !== previousPopulation) {
      volatilityRaw++;
    }
    previousPopulation = population;
    if (population > peakPopulation) {
      peakPopulation = population;
    }
    if (gen % sampleStride === 0 || gen === generations) {
      samples.push(population);
    }
    if (population === 0 && gen > 12) {
      break;
    }
  }

  const signature = `${samples.join('-')}|${compactBoundingSignature(live)}`;
  return {
    index,
    seedCells: cells,
    survivalGenerations: Math.max(0, survivalGenerations),
    initialPopulation,
    peakPopulation,
    finalPopulation,
    volatilityRaw,
    signature
  };
}

function compactBoundingSignature(live: Set<string>) {
  if (live.size === 0) return 'dead';
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  live.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return `${width}x${height}`;
}

function generateSoup(size: number, fillPercent: number, rng: () => number) {
  const half = Math.floor(size / 2);
  const fill = clamp01(fillPercent / 100);
  const cells: Cell[] = [];
  for (let y = -half; y <= half; y++) {
    for (let x = -half; x <= half; x++) {
      if (rng() <= fill) {
        cells.push({ x, y });
      }
    }
  }
  if (cells.length === 0) {
    cells.push({ x: 0, y: 0 });
  }
  return cells;
}

function normalizeCells(list: unknown): Cell[] {
  if (!Array.isArray(list)) return [];
  const cells: Cell[] = [];
  for (const item of list) {
    const cell = item as Partial<Cell> | null;
    const x = Math.floor(Number(cell?.x));
    const y = Math.floor(Number(cell?.y));
    if (Number.isFinite(x) && Number.isFinite(y)) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function setFromCells(cells: Cell[]) {
  const live = new Set<string>();
  for (const cell of cells) {
    live.add(`${cell.x},${cell.y}`);
  }
  return live;
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

function createRng(seedInput: number) {
  let seed = seedInput >>> 0;
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function safeRatio(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return clamp01(value / total);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const num = Math.floor(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
