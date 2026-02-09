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
}

export interface ScriptRunResult {
  generation: number;
  liveCellCount: number;
  operationCount: number;
  output: string;
}

type ScriptCell = { x: number; y: number };
type ScriptPoint = [number, number];

@Injectable({ providedIn: 'root' })
export class ScriptPlaygroundService {
  private readonly defaultMaxOperations = 250_000;

  private readonly templates: ScriptTemplate[] = [
    {
      id: 'starter-glider-school',
      name: 'Glider School',
      audience: 'Kids',
      difficulty: 'Starter',
      description: 'Place a row of gliders with simple loops and spacing.',
      challenge: 'Change spacing so gliders collide in the center.',
      code: [
        '// Glider School: start simple and experiment.',
        'api.clear();',
        'for (let i = 0; i < 5; i += 1) {',
        '  api.stamp("glider", -24 + i * 8, -10 + i);',
        '}',
        'api.log("Built a glider fleet.");'
      ].join('\n')
    },
    {
      id: 'starter-pulse-grid',
      name: 'Pulse Grid',
      audience: 'Kids',
      difficulty: 'Starter',
      description: 'Build a grid of blinkers to observe synchronized oscillation.',
      challenge: 'Try replacing every other blinker with a toad.',
      code: [
        'api.clear();',
        'for (let y = -18; y <= 18; y += 6) {',
        '  for (let x = -24; x <= 24; x += 6) {',
        '    api.stamp("blinker", x, y);',
        '  }',
        '}',
        'api.log("Pulse grid deployed.");'
      ].join('\n')
    },
    {
      id: 'builder-city-lights',
      name: 'City Lights',
      audience: 'Teens',
      difficulty: 'Builder',
      description: 'Use geometry helpers to build a skyline and seed motion.',
      challenge: 'Animate street traffic by adding lightweight spaceships.',
      code: [
        'api.clear();',
        'api.fillRect(-40, 10, 80, 20, true); // ground',
        'for (let i = 0; i < 9; i += 1) {',
        '  const x = -38 + i * 9;',
        '  const h = 4 + ((i * 7) % 11);',
        '  api.fillRect(x, 10 - h, 6, h, true);',
        '  api.frameRect(x, 10 - h, 6, h, false); // windows cutout',
        '}',
        'api.stamp("lwss", -30, -8);',
        'api.stamp("lwss", 4, -4);',
        'api.log("City Lights loaded.");'
      ].join('\n')
    },
    {
      id: 'builder-random-lab',
      name: 'Random Lab',
      audience: 'Teens',
      difficulty: 'Builder',
      description: 'Generate structured randomness with regions and density.',
      challenge: 'Try 0.28, 0.35, and 0.42 density. Which stabilizes fastest?',
      code: [
        'api.clear();',
        'api.frameRect(-52, -28, 104, 56, true);',
        'api.randomRect(-48, -24, 96, 48, 0.34);',
        'api.log("Random lab seeded. Press Play and observe.");'
      ].join('\n')
    },
    {
      id: 'explorer-collision-course',
      name: 'Collision Course',
      audience: 'All',
      difficulty: 'Explorer',
      description: 'Set up long-range glider collisions and inspect aftermath.',
      challenge: 'Shift one launch point by 1 cell and compare outcomes.',
      code: [
        'api.clear();',
        'for (let i = 0; i < 7; i += 1) {',
        '  api.stamp("glider", -60 + i * 10, -28 + i * 4);',
        '}',
        'for (let i = 0; i < 7; i += 1) {',
        '  api.stamp("glider", 40 - i * 10, 24 - i * 4);',
        '}',
        'api.log("Collision course armed.");'
      ].join('\n')
    },
    {
      id: 'explorer-rle-import',
      name: 'RLE Quick Import',
      audience: 'All',
      difficulty: 'Explorer',
      description: 'Load an RLE pattern directly from script.',
      challenge: 'Replace this sample with a LifeWiki RLE and test scale.',
      code: [
        'const rle = `#N Glider',
        'x = 3, y = 3, rule = B3/S23',
        'bob$2bo$3o!`;',
        'api.loadRle(rle, "Script Glider");',
        'api.log("RLE imported from script.");'
      ].join('\n')
    }
  ];

  private readonly learningPanels: ScriptLearningPanel[] = [
    {
      id: 'kids-pattern-thinker',
      title: 'Pattern Thinker',
      audience: 'Kids',
      focus: 'Learn loops by building repeating structures.',
      tryThis: 'Load "Glider School", then change loop count and spacing.',
      templateId: 'starter-glider-school'
    },
    {
      id: 'kids-rules-detective',
      title: 'Rules Detective',
      audience: 'Kids',
      focus: 'Test how small rule changes in setup affect outcomes.',
      tryThis: 'Load "Pulse Grid" and mix oscillators to observe rhythm shifts.',
      templateId: 'starter-pulse-grid'
    },
    {
      id: 'teens-systems-designer',
      title: 'Systems Designer',
      audience: 'Teens',
      focus: 'Compose geometry helpers into larger engineered scenes.',
      tryThis: 'Load "City Lights" and build your own skyline algorithm.',
      templateId: 'builder-city-lights'
    },
    {
      id: 'teens-experiment-analyst',
      title: 'Experiment Analyst',
      audience: 'Teens',
      focus: 'Run repeatable experiments and compare outcomes.',
      tryThis: 'Load "Random Lab", vary density, and track stabilization behavior.',
      templateId: 'builder-random-lab'
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
    'api.stamp("glider" | "blinker" | "block" | "lwss", x, y)',
    'api.loadRle(text, name?)',
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

    const model = context.model;
    const runtime = context.runtime;
    const shapeImport = context.shapeImport;
    const getGeneration = context.getGeneration;
    const maxOperations = this.normalizeMaxOperations(context.maxOperations);
    const logs: string[] = [];
    let operationCount = 0;

    const consume = (amount = 1) => {
      const normalized = Math.max(1, Math.floor(Number(amount) || 1));
      operationCount += normalized;
      if (operationCount > maxOperations) {
        throw new Error(`Script exceeded operation limit (${maxOperations}). Try smaller loops or regions.`);
      }
    };

    const api = {
      clear: () => {
        consume(1);
        model.clear();
      },
      setCell: (x: number, y: number, alive = true) => {
        consume(1);
        model.setCellAlive(this.toInt(x), this.toInt(y), !!alive);
      },
      toggleCell: (x: number, y: number) => {
        consume(1);
        model.toggleCell(this.toInt(x), this.toInt(y));
      },
      addCells: (cells: ScriptCell[]) => {
        const normalized = this.normalizeCells(cells);
        consume(normalized.length || 1);
        for (const cell of normalized) {
          model.setCellAlive(cell.x, cell.y, true);
        }
      },
      replaceCells: (cells: ScriptCell[]) => {
        const normalized = this.normalizeCells(cells);
        consume(normalized.length || 1);
        model.setLiveCells(normalized, getGeneration());
      },
      fillRect: (x: number, y: number, width: number, height: number, alive = true) => {
        const points = this.computeFilledRect(this.toInt(x), this.toInt(y), this.toInt(width), this.toInt(height));
        consume(points.length || 1);
        for (const [px, py] of points) {
          model.setCellAlive(px, py, !!alive);
        }
      },
      frameRect: (x: number, y: number, width: number, height: number, alive = true) => {
        const points = this.computeRectPerimeter(this.toInt(x), this.toInt(y), this.toInt(width), this.toInt(height));
        consume(points.length || 1);
        for (const [px, py] of points) {
          model.setCellAlive(px, py, !!alive);
        }
      },
      line: (x0: number, y0: number, x1: number, y1: number, alive = true) => {
        const points = this.computeLine(this.toInt(x0), this.toInt(y0), this.toInt(x1), this.toInt(y1));
        consume(points.length || 1);
        for (const [px, py] of points) {
          model.setCellAlive(px, py, !!alive);
        }
      },
      randomRect: (x: number, y: number, width: number, height: number, density = 0.35) => {
        const points = this.computeFilledRect(this.toInt(x), this.toInt(y), this.toInt(width), this.toInt(height));
        const p = Math.max(0, Math.min(1, Number(density) || 0));
        consume(points.length || 1);
        for (const [px, py] of points) {
          if (Math.random() < p) {
            model.setCellAlive(px, py, true);
          }
        }
      },
      stamp: (patternName: string, x: number, y: number) => {
        const stamp = this.getStamp(patternName);
        consume(stamp.length || 1);
        const anchorX = this.toInt(x);
        const anchorY = this.toInt(y);
        for (const [sx, sy] of stamp) {
          model.setCellAlive(anchorX + sx, anchorY + sy, true);
        }
      },
      loadRle: (rleText: string, name = 'Script Import') => {
        const parsed = shapeImport.parse(String(rleText || ''), String(name || 'Script Import'));
        consume(parsed.cells.length || 1);
        model.setLiveCells(parsed.cells, getGeneration());
      },
      getLiveCells: () => model.getLiveCells(),
      getGeneration: () => getGeneration(),
      pause: () => runtime.pause(),
      start: () => runtime.start(),
      wait: (ms: number) => {
        const timeout = Math.max(0, Math.min(2000, Math.floor(Number(ms) || 0)));
        return new Promise<void>((resolve) => {
          setTimeout(resolve, timeout);
        });
      },
      log: (message: unknown) => {
        logs.push(String(message ?? ''));
      }
    };

    const runner = new Function('api', `"use strict"; return (async () => {\n${source}\n})();`) as (apiArg: typeof api) => Promise<unknown>;
    await runner(api);

    const generation = getGeneration();
    const liveCellCount = model.getLiveCells().length;
    if (!logs.length) {
      logs.push(`Script finished at generation ${generation}.`);
    }

    return {
      generation,
      liveCellCount,
      operationCount,
      output: logs.join('\n')
    };
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
    throw new Error(`Unknown stamp "${patternName}". Supported: glider, blinker, block, lwss.`);
  }
}
