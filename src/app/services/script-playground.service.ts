import { Injectable } from '@angular/core';
import { Cell, GameModelService } from '../model/game-model.service';
import { GameRuntimeService } from './game-runtime.service';
import { ShapeImportService } from './shape-import.service';

export interface ScriptTemplate {
  id: string;
  name: string;
  audience: 'Kids' | 'Teens' | 'All';
  difficulty: 'Starter' | 'Builder' | 'Explorer';
  description: string;
  challenge: string;
  code: string;
}

export interface ScriptLearningPanel {
  id: string;
  title: string;
  audience: 'Kids' | 'Teens';
  focus: string;
  tryThis: string;
  templateId: string;
}

export interface ScriptExecutionContext {
  model: GameModelService;
  runtime: Pick<GameRuntimeService, 'pause' | 'start'>;
  shapeImport: ShapeImportService;
  getGeneration: () => number;
  maxOperations?: number;
  signal?: AbortSignal;
  onProgress?: (event: ScriptProgressEvent) => void;
  onLog?: (line: string) => void;
}

export interface ScriptRunResult {
  generation: number;
  liveCellCount: number;
  operationCount: number;
  durationMs: number;
  logs: string[];
  output: string;
}

export interface ScriptProgressEvent {
  phase: 'start' | 'running' | 'complete';
  operationCount: number;
  maxOperations: number;
  action: string;
  percent: number;
  elapsedMs: number;
}

type ScriptCell = { x: number; y: number };
type ScriptPoint = [number, number];

const STAMP_TEXT_GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100']
};

@Injectable({ providedIn: 'root' })
export class ScriptPlaygroundService {
  private readonly defaultMaxOperations = 250_000;

  private readonly templates: ScriptTemplate[] = [
    {
      id: 'explorer-steady-squares',
      name: 'Steady Squares',
      audience: 'All',
      difficulty: 'Explorer',
      description: 'Grow centered squares and measure how quickly each square settles.',
      challenge: 'Increase the max size or lower max steps to compare transient behavior.',
      code: [
        'api.clear();',
        'for (let size = 6; size <= 54; size += 4) {',
        '  api.clear();',
        '  const offset = -Math.floor(size / 2);',
        '  api.fillRect(offset, offset, size, size, true);',
        '  const settled = await api.untilSteady(260, 18);',
        '  const detail = settled.stable',
        '    ? ("steady in " + settled.steps + " steps (period " + settled.period + ")")',
        '    : "not steady within cap";',
        '  api.log("Square " + size + "x" + size + ": " + detail);',
        '}'
      ].join('\n')
    },
    {
      id: 'explorer-pulsar-gol-sign',
      name: 'Pulsar GOL Sign',
      audience: 'All',
      difficulty: 'Explorer',
      description: 'Render GOL by stamping pulsars on a 5x7 text grid.',
      challenge: 'Swap the text and spacing to create your own pulsar banner.',
      code: [
        'api.clear();',
        'api.stamp("pulsar", -236, -108);',
        'api.drawStampText("GOL", -160, -84, "pulsar", 16, 2);',
        'api.stamp("pulsar", 168, 36);',
        'api.log("Pulsar GOL sign deployed.");'
      ].join('\n')
    },
    {
      id: 'explorer-pulsar-bryan',
      name: 'Pulsar BRYAN Banner',
      audience: 'All',
      difficulty: 'Explorer',
      description: 'Build a nameplate using pulsars as text pixels plus glider accents.',
      challenge: 'Try your own name and tweak spacing/density for visual balance.',
      code: [
        'api.clear();',
        'api.drawStampText("BRYAN", -240, -80, "pulsar", 13, 2);',
        'for (let i = 0; i < 6; i += 1) {',
        '  api.stamp("glider", -220 + i * 38, 48 + ((i % 2) * 4));',
        '}',
        'api.log("Pulsar BRYAN banner ready.");'
      ].join('\n')
    },
    {
      id: 'explorer-pulsar-open-to-roles',
      name: 'Pulsar OPEN TO ROLES',
      audience: 'All',
      difficulty: 'Explorer',
      description: 'Draw a bold message using pulsar glyphs and a moving glider escort.',
      challenge: 'Swap in your own message and tune spacing for your display.',
      code: [
        'api.clear();',
        'api.drawStampText("OPEN TO ROLES", -310, -96, "pulsar", 12, 2);',
        'for (let i = 0; i < 10; i += 1) {',
        '  api.stamp("glider", -300 + i * 58, 72 + (i % 3));',
        '}',
        'api.log("Pulsar recruiting banner ready.");'
      ].join('\n')
    }
  ];

  private readonly learningPanels: ScriptLearningPanel[] = [
    {
      id: 'teens-experiment-analyst',
      title: 'Experiment Analyst',
      audience: 'Teens',
      focus: 'Run repeatable experiments and compare stabilization outcomes.',
      tryThis: 'Load "Steady Squares" and compare step counts as the square grows.',
      templateId: 'explorer-steady-squares'
    },
    {
      id: 'kids-pattern-artist',
      title: 'Pattern Artist',
      audience: 'Kids',
      focus: 'Use ready-made stamps to paint words and motifs.',
      tryThis: 'Load "Pulsar GOL Sign" then replace the text.',
      templateId: 'explorer-pulsar-gol-sign'
    },
    {
      id: 'teens-portfolio-banner',
      title: 'Portfolio Banner',
      audience: 'Teens',
      focus: 'Design high-visibility patterns for demos and social screenshots.',
      tryThis: 'Load "Pulsar OPEN TO ROLES" and customize the message.',
      templateId: 'explorer-pulsar-open-to-roles'
    }
  ];

  private readonly apiReference: string[] = [
    'api.clear()',
    'api.setCell(x, y, alive?)',
    'api.toggleCell(x, y)',
    'api.addCells([{ x, y }, ...])',
    'api.replaceCells([{ x, y }, ...])',
    'api.fillRect(x, y, width, height, alive?)',
    'api.frameRect(x, y, width, height, alive?)',
    'api.line(x0, y0, x1, y1, alive?)',
    'api.randomRect(x, y, width, height, density?)',
    'api.stamp("glider" | "blinker" | "block" | "lwss" | "pulsar", x, y)',
    'api.drawStampText(text, x, y, stampName?, cellSpacing?, letterSpacing?)',
    'api.loadRle(text, name?)',
    'api.step(generations?)',
    'api.untilSteady(maxSteps?, historyWindow?) -> { stable, steps, period }',
    'api.pause() / api.start()',
    'api.wait(ms)',
    'api.log(message)'
  ];

  getTemplates() {
    return this.templates.slice();
  }

  getLearningPanels() {
    return this.learningPanels.slice();
  }

  getApiReference() {
    return this.apiReference.slice();
  }

  findTemplate(templateId: string | null | undefined) {
    if (!templateId) return null;
    return this.templates.find((item) => item.id === templateId) || null;
  }

  async runScript(scriptCode: string, context: ScriptExecutionContext): Promise<ScriptRunResult> {
    const source = String(scriptCode || '').trim();
    if (!source) {
      throw new Error('Script is empty.');
    }

    const startedAt = Date.now();
    const model = context.model;
    const runtime = context.runtime;
    const shapeImport = context.shapeImport;
    const getGeneration = context.getGeneration;
    const signal = context.signal;
    const maxOperations = this.normalizeMaxOperations(context.maxOperations);
    const logs: string[] = [];
    let operationCount = 0;
    let currentAction = 'Initializing script';

    const emitLog = (line: string) => {
      if (typeof context.onLog === 'function') {
        context.onLog(line);
      }
    };

    const pushLog = (message: unknown) => {
      const line = String(message ?? '');
      logs.push(line);
      emitLog(line);
    };

    const emitProgress = (phase: 'start' | 'running' | 'complete') => {
      if (typeof context.onProgress !== 'function') return;
      const rawPercent = maxOperations > 0 ? (operationCount / maxOperations) * 100 : 0;
      context.onProgress({
        phase,
        operationCount,
        maxOperations,
        action: currentAction,
        percent: Math.max(0, Math.min(100, rawPercent)),
        elapsedMs: Date.now() - startedAt
      });
    };

    const setAction = (action: string) => {
      currentAction = String(action || '').trim() || currentAction;
      emitProgress('running');
    };

    const throwIfAborted = () => {
      if (signal?.aborted) {
        throw new Error('Script execution canceled by user.');
      }
    };

    emitProgress('start');
    throwIfAborted();

    const consume = (amount = 1) => {
      const normalized = Math.max(1, Math.floor(Number(amount) || 1));
      throwIfAborted();
      operationCount += normalized;
      if (operationCount > maxOperations) {
        throw new Error(`Script exceeded operation limit (${maxOperations}). Try smaller loops or regions.`);
      }
      emitProgress('running');
    };

    const runUntilSteady = async (maxStepsInput: number, historyWindowInput: number) => {
      const maxSteps = Math.max(1, Math.min(20_000, Math.floor(Number(maxStepsInput) || 1)));
      const historyWindow = Math.max(2, Math.min(256, Math.floor(Number(historyWindowInput) || 18)));
      const seen = new Map<string, number>();
      const queue: string[] = [];
      const initialSignature = this.serializeCells(model.getLiveCells());
      seen.set(initialSignature, 0);
      queue.push(initialSignature);
      let steps = 0;
      while (steps < maxSteps) {
        throwIfAborted();
        model.step(1);
        consume(1);
        steps += 1;

        const signature = this.serializeCells(model.getLiveCells());
        const previousStep = seen.get(signature);
        if (typeof previousStep === 'number') {
          return {
            stable: true,
            steps,
            period: Math.max(1, steps - previousStep)
          };
        }
        seen.set(signature, steps);
        queue.push(signature);
        if (queue.length > historyWindow) {
          const removed = queue.shift();
          if (removed) {
            seen.delete(removed);
          }
        }

        if (steps % 64 === 0) {
          await this.delayWithAbort(0, signal);
        }
      }
      return { stable: false, steps: maxSteps, period: 0 };
    };

    const api = {
      clear: () => {
        setAction('api.clear()');
        consume(1);
        model.clear();
      },
      setCell: (x: number, y: number, alive = true) => {
        setAction('api.setCell(x, y)');
        consume(1);
        model.setCellAlive(this.toInt(x), this.toInt(y), !!alive);
      },
      toggleCell: (x: number, y: number) => {
        setAction('api.toggleCell(x, y)');
        consume(1);
        model.toggleCell(this.toInt(x), this.toInt(y));
      },
      addCells: (cells: ScriptCell[]) => {
        setAction('api.addCells([...])');
        const normalized = this.normalizeCells(cells);
        consume(normalized.length || 1);
        for (const cell of normalized) {
          throwIfAborted();
          model.setCellAlive(cell.x, cell.y, true);
        }
      },
      replaceCells: (cells: ScriptCell[]) => {
        setAction('api.replaceCells([...])');
        const normalized = this.normalizeCells(cells);
        consume(normalized.length || 1);
        throwIfAborted();
        model.setLiveCells(normalized, getGeneration());
      },
      fillRect: (x: number, y: number, width: number, height: number, alive = true) => {
        setAction('api.fillRect(...)');
        const points = this.computeFilledRect(this.toInt(x), this.toInt(y), this.toInt(width), this.toInt(height));
        consume(points.length || 1);
        for (let i = 0; i < points.length; i += 1) {
          if (i % 128 === 0) throwIfAborted();
          const [px, py] = points[i];
          model.setCellAlive(px, py, !!alive);
        }
      },
      frameRect: (x: number, y: number, width: number, height: number, alive = true) => {
        setAction('api.frameRect(...)');
        const points = this.computeRectPerimeter(this.toInt(x), this.toInt(y), this.toInt(width), this.toInt(height));
        consume(points.length || 1);
        for (let i = 0; i < points.length; i += 1) {
          if (i % 128 === 0) throwIfAborted();
          const [px, py] = points[i];
          model.setCellAlive(px, py, !!alive);
        }
      },
      line: (x0: number, y0: number, x1: number, y1: number, alive = true) => {
        setAction('api.line(...)');
        const points = this.computeLine(this.toInt(x0), this.toInt(y0), this.toInt(x1), this.toInt(y1));
        consume(points.length || 1);
        for (let i = 0; i < points.length; i += 1) {
          if (i % 128 === 0) throwIfAborted();
          const [px, py] = points[i];
          model.setCellAlive(px, py, !!alive);
        }
      },
      randomRect: (x: number, y: number, width: number, height: number, density = 0.35) => {
        setAction('api.randomRect(...)');
        const points = this.computeFilledRect(this.toInt(x), this.toInt(y), this.toInt(width), this.toInt(height));
        const p = Math.max(0, Math.min(1, Number(density) || 0));
        consume(points.length || 1);
        for (let i = 0; i < points.length; i += 1) {
          if (i % 128 === 0) throwIfAborted();
          const [px, py] = points[i];
          if (Math.random() < p) {
            model.setCellAlive(px, py, true);
          }
        }
      },
      stamp: (patternName: string, x: number, y: number) => {
        setAction(`api.stamp("${patternName}", x, y)`);
        const stamp = this.getStamp(patternName);
        consume(stamp.length || 1);
        const anchorX = this.toInt(x);
        const anchorY = this.toInt(y);
        for (const [sx, sy] of stamp) {
          throwIfAborted();
          model.setCellAlive(anchorX + sx, anchorY + sy, true);
        }
      },
      drawStampText: (text: string, x: number, y: number, stampName = 'pulsar', cellSpacing = 16, letterSpacing = 2) => {
        const message = String(text || '').toUpperCase();
        const spacing = Math.max(8, this.toInt(cellSpacing));
        const gap = Math.max(1, this.toInt(letterSpacing));
        const stamp = this.getStamp(stampName);
        let cursorX = this.toInt(x);
        const cursorY = this.toInt(y);
        let placements = 0;
        setAction(`api.drawStampText("${message}", ...)`);

        for (const rawChar of message) {
          if (rawChar === ' ') {
            cursorX += (5 + gap) * spacing;
            continue;
          }
          const glyph = STAMP_TEXT_GLYPHS[rawChar] || STAMP_TEXT_GLYPHS['?'];
          const glyphWidth = glyph[0]?.length || 5;
          for (let row = 0; row < glyph.length; row += 1) {
            const rowText = String(glyph[row] || '');
            for (let col = 0; col < glyphWidth; col += 1) {
              if (rowText[col] !== '1') continue;
              const anchorX = cursorX + col * spacing;
              const anchorY = cursorY + row * spacing;
              consume(stamp.length || 1);
              placements += 1;
              for (const [sx, sy] of stamp) {
                throwIfAborted();
                model.setCellAlive(anchorX + sx, anchorY + sy, true);
              }
            }
          }
          cursorX += (glyphWidth + gap) * spacing;
        }
        pushLog(`Stamped ${placements} "${stampName}" glyphs for "${message}".`);
        return placements;
      },
      loadRle: (rleText: string, name = 'Script Import') => {
        setAction('api.loadRle(...)');
        const parsed = shapeImport.parse(String(rleText || ''), String(name || 'Script Import'));
        consume(parsed.cells.length || 1);
        throwIfAborted();
        model.setLiveCells(parsed.cells, getGeneration());
      },
      step: (generations = 1) => {
        const steps = Math.max(1, Math.min(10_000, Math.floor(Number(generations) || 1)));
        setAction(`api.step(${steps})`);
        consume(steps);
        throwIfAborted();
        model.step(steps);
      },
      untilSteady: async (maxSteps = 512, historyWindow = 18) => {
        setAction(`api.untilSteady(${maxSteps}, ${historyWindow})`);
        return runUntilSteady(maxSteps, historyWindow);
      },
      getLiveCells: () => model.getLiveCells(),
      getGeneration: () => getGeneration(),
      pause: () => {
        setAction('api.pause()');
        throwIfAborted();
        runtime.pause();
      },
      start: () => {
        setAction('api.start()');
        throwIfAborted();
        runtime.start();
      },
      wait: (ms: number) => {
        const timeout = Math.max(0, Math.min(2000, Math.floor(Number(ms) || 0)));
        setAction(`api.wait(${timeout})`);
        consume(Math.max(1, Math.ceil(timeout / 50)));
        return this.delayWithAbort(timeout, signal);
      },
      log: (message: unknown) => {
        setAction('api.log(...)');
        pushLog(message);
      }
    };

    const runner = new Function('api', `"use strict"; return (async () => {\n${source}\n})();`) as (apiArg: typeof api) => Promise<unknown>;
    try {
      await runner(api);
      throwIfAborted();
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw new Error('Script execution canceled by user.');
      }
      const message = String((error as { message?: unknown })?.message || error || 'Script execution failed.');
      throw new Error(`Script failed during ${currentAction}: ${message}`);
    }

    const generation = getGeneration();
    const liveCellCount = model.getLiveCells().length;
    if (!logs.length) {
      pushLog(`Script finished at generation ${generation}.`);
    }
    currentAction = 'Completed';
    emitProgress('complete');
    const durationMs = Date.now() - startedAt;

    return {
      generation,
      liveCellCount,
      operationCount,
      durationMs,
      logs: logs.slice(),
      output: logs.join('\n')
    };
  }

  private delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Script execution canceled by user.'));
        return;
      }
      const timer = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('Script execution canceled by user.'));
      };
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private normalizeMaxOperations(input: number | null | undefined) {
    const candidate = Math.floor(Number(input));
    if (!Number.isFinite(candidate) || candidate < 1000) {
      return this.defaultMaxOperations;
    }
    return Math.min(5_000_000, candidate);
  }

  private normalizeCells(cells: ScriptCell[]) {
    const source = Array.isArray(cells) ? cells : [];
    const dedupe = new Set<string>();
    const normalized: Cell[] = [];
    for (const cell of source) {
      const x = this.toInt(cell?.x);
      const y = this.toInt(cell?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const key = `${x},${y}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      normalized.push({ x, y });
    }
    return normalized;
  }

  private toInt(value: unknown) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
  }

  private computeFilledRect(x: number, y: number, width: number, height: number): ScriptPoint[] {
    const points: ScriptPoint[] = [];
    const w = Math.max(1, Math.abs(width));
    const h = Math.max(1, Math.abs(height));
    const xDir = width < 0 ? -1 : 1;
    const yDir = height < 0 ? -1 : 1;
    for (let iy = 0; iy < h; iy += 1) {
      for (let ix = 0; ix < w; ix += 1) {
        points.push([x + ix * xDir, y + iy * yDir]);
      }
    }
    return points;
  }

  private computeRectPerimeter(x: number, y: number, width: number, height: number): ScriptPoint[] {
    const points: ScriptPoint[] = [];
    const w = Math.max(1, Math.abs(width));
    const h = Math.max(1, Math.abs(height));
    const xDir = width < 0 ? -1 : 1;
    const yDir = height < 0 ? -1 : 1;
    for (let ix = 0; ix < w; ix += 1) {
      points.push([x + ix * xDir, y]);
      if (h > 1) {
        points.push([x + ix * xDir, y + (h - 1) * yDir]);
      }
    }
    for (let iy = 1; iy < h - 1; iy += 1) {
      points.push([x, y + iy * yDir]);
      if (w > 1) {
        points.push([x + (w - 1) * xDir, y + iy * yDir]);
      }
    }
    return points;
  }

  private computeLine(x0: number, y0: number, x1: number, y1: number): ScriptPoint[] {
    const points: ScriptPoint[] = [];
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    while (true) {
      points.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = err * 2;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return points;
  }

  private serializeCells(cells: Cell[]) {
    const normalized = this.normalizeCells(cells);
    normalized.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    return normalized.map((cell) => `${cell.x},${cell.y}`).join('|');
  }

  private getStamp(patternName: string): ScriptPoint[] {
    const key = String(patternName || '').trim().toLowerCase();
    if (key === 'glider') {
      return [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]];
    }
    if (key === 'blinker') {
      return [[0, 0], [1, 0], [2, 0]];
    }
    if (key === 'block') {
      return [[0, 0], [1, 0], [0, 1], [1, 1]];
    }
    if (key === 'lwss') {
      return [[1, 0], [4, 0], [0, 1], [0, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3]];
    }
    if (key === 'pulsar') {
      return [
        [2, 0], [3, 0], [4, 0], [8, 0], [9, 0], [10, 0],
        [0, 2], [5, 2], [7, 2], [12, 2],
        [0, 3], [5, 3], [7, 3], [12, 3],
        [0, 4], [5, 4], [7, 4], [12, 4],
        [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5],
        [2, 7], [3, 7], [4, 7], [8, 7], [9, 7], [10, 7],
        [0, 8], [5, 8], [7, 8], [12, 8],
        [0, 9], [5, 9], [7, 9], [12, 9],
        [0, 10], [5, 10], [7, 10], [12, 10],
        [2, 12], [3, 12], [4, 12], [8, 12], [9, 12], [10, 12]
      ];
    }
    throw new Error(`Unknown stamp "${patternName}". Supported: glider, blinker, block, lwss, pulsar.`);
  }
}
