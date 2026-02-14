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
  signal?: AbortSignal;
  onProgress?: (event: ScriptProgressEvent) => void;
  onLog?: (line: string) => void;
  onWorldChange?: (event: ScriptWorldChangeEvent) => void;
}

export type ScriptRunStateIntent = 'unchanged' | 'running' | 'paused';

export interface ScriptRunResult {
  generation: number;
  liveCellCount: number;
  operationCount: number;
  durationMs: number;
  logs: string[];
  output: string;
  runStateIntent: ScriptRunStateIntent;
  runId: string;
}

export interface ScriptProgressEvent {
  phase: 'start' | 'running' | 'complete';
  operationCount: number;
  action: string;
  percent: number;
  elapsedMs: number;
}

export interface ScriptWorldChangeEvent {
  reason: 'command' | 'step' | 'until-steady';
  line: number;
  command: string;
  generation: number;
  liveCellCount: number;
}

interface ScriptState {
  cells: Set<string>;
  vars: Record<string, number | string | boolean>;
  output: string[];
  x: number;
  y: number;
  penDown: boolean;
}

interface Block {
  line: string;
  indent: number;
  idx: number;
}

@Injectable({ providedIn: 'root' })
export class ScriptPlaygroundService {
  private readonly templates: ScriptTemplate[] = [
    {
      id: 'basic-drawing',
      name: 'Basic Drawing',
      audience: 'All',
      difficulty: 'Starter',
      description: 'Simple pen, goto, and rectangle drawing commands.',
      challenge: 'Move the shapes and change rectangle sizes.',
      code: 'PENDOWN\nRECT 4 3\nGOTO 10 5\nRECT 2 2\n'
    },
    {
      id: 'conway-glider',
      name: 'Conway Glider',
      audience: 'All',
      difficulty: 'Starter',
      description: 'Build a glider and step it forward.',
      challenge: 'Change the start position and step count.',
      code: '# Conway\'s Glider Pattern\nCLEAR\nPENDOWN\nGOTO 1 0\nRECT 1 1\nGOTO 2 1\nRECT 1 1\nGOTO 0 2\nRECT 1 1\nGOTO 1 2\nRECT 1 1\nGOTO 2 2\nRECT 1 1\nSTEP 10\n'
    },
    {
      id: 'geometric-shapes',
      name: 'Geometric Shapes',
      audience: 'All',
      difficulty: 'Builder',
      description: 'Quick pattern sketching with rectangles.',
      challenge: 'Add loops to automate repeated structures.',
      code: '# Showcase drawing tools\nCLEAR\nPENDOWN\nGOTO 5 5\nRECT 3 3\nGOTO 15 5\nRECT 2 4\nGOTO 25 5\nRECT 1 8\n'
    },
    {
      id: 'random-garden',
      name: 'Random Garden',
      audience: 'All',
      difficulty: 'Builder',
      description: 'Create a small structured garden-like pattern.',
      challenge: 'Use FOR loops to add repeated decorations.',
      code: '# Create scattered patterns\nCLEAR\nPENDOWN\nGOTO 5 5\nRECT 5 1\nGOTO 5 10\nRECT 5 1\nGOTO 8 7\nRECT 2 2\n'
    },
    {
      id: 'steady-squares',
      name: 'Steady Squares',
      audience: 'All',
      difficulty: 'Explorer',
      description: 'Grow centered squares and measure stabilization.',
      challenge: 'Increase max size or reduce max steps.',
      code: '# Growing squares with UNTIL_STEADY\nCLEAR\nPENDOWN\nsize = 2\nWHILE size <= 100\n  CLEAR\n  offset = 0 - (size / 2)\n  GOTO offset offset\n  RECT size size\n  START\n  UNTIL_STEADY steps 100\n  STOP\n  size = size + 1\nEND\n'
    },
    {
      id: 'empty-script',
      name: 'Empty Script',
      audience: 'All',
      difficulty: 'Starter',
      description: 'Blank starting point for custom scripts.',
      challenge: 'Try PENDOWN, GOTO, RECT, and STEP.',
      code: '# Enter your commands here\nCLEAR\nPENDOWN\n'
    }
  ];

  private readonly learningPanels: ScriptLearningPanel[] = [];

  private readonly languageReference: string[] = [
    'Commands:',
    'PENDOWN, PENUP, GOTO x y, RECT w h, CLEAR',
    'STEP n, START, STOP, CAPTURE name',
    'PRINT expr, COUNT varName, LABEL expr, UNTIL_STEADY varName maxSteps',
    '',
    'Control flow:',
    'IF cond ... ELSE ... END',
    'WHILE cond ... END',
    'FOR i FROM start TO end [STEP n] ... END',
    '',
    'Expressions:',
    'x = 4, name = "hello", x = x + 1',
    'String funcs: STRLEN, TOUPPER, TOLOWER, TRIM, SUBSTRING, INDEX, REPLACE',
    'Conditions: ==, !=, <, >, <=, >= with AND / OR / NOT',
    '',
    'Notes:',
    '- Lines starting with # are comments.',
    '- Use END to close IF/WHILE/FOR blocks.'
  ];

  getTemplates() {
    return this.templates.slice();
  }

  getLearningPanels() {
    return this.learningPanels.slice();
  }

  getApiReference() {
    return this.languageReference.slice();
  }

  findTemplate(templateId: string | null | undefined) {
    if (!templateId) return null;
    return this.templates.find((item) => item.id === templateId) || null;
  }

  async runScript(scriptCode: string, context: ScriptExecutionContext): Promise<ScriptRunResult> {
    const source = String(scriptCode || '');
    const lines = source.split(/\r?\n/);
    const blocks = this.parseBlocks(lines);
    if (!blocks.length) {
      throw new Error('Script is empty.');
    }

    const startedAt = Date.now();
    const runId = `script-${startedAt}-${Math.floor(Math.random() * 1_000_000)}`;
    const signal = context.signal;

    const logs: string[] = [];
    const model = context.model;
    let runStateIntent: ScriptRunStateIntent = 'unchanged';

    let operationCount = 0;
    let currentAction = 'Initializing script';

    const emitLog = (line: string) => {
      logs.push(line);
      if (typeof context.onLog === 'function') {
        context.onLog(line);
      }
    };

    const emitProgress = (phase: 'start' | 'running' | 'complete', blockIndex = 0) => {
      if (typeof context.onProgress !== 'function') return;
      const percent = Math.max(0, Math.min(100, (blockIndex / Math.max(1, blocks.length)) * 100));
      context.onProgress({
        phase,
        operationCount,
        action: currentAction,
        percent,
        elapsedMs: Date.now() - startedAt
      });
    };

    const emitWorldChange = (
      reason: ScriptWorldChangeEvent['reason'],
      line: number,
      command: string
    ) => {
      if (typeof context.onWorldChange !== 'function') return;
      context.onWorldChange({
        reason,
        line,
        command,
        generation: context.getGeneration(),
        liveCellCount: model.getLiveCells().length
      });
    };

    const throwIfAborted = () => {
      if (signal?.aborted) {
        throw new Error('Script execution canceled by user.');
      }
    };

    const consume = (amount = 1) => {
      operationCount += Math.max(1, Math.floor(Number(amount) || 1));
    };

    const syncModelFromState = (state: ScriptState) => {
      const live: Cell[] = [];
      for (const key of state.cells) {
        const [xText, yText] = key.split(',');
        const x = Math.floor(Number(xText));
        const y = Math.floor(Number(yText));
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        live.push({ x, y });
      }
      model.setLiveCells(live, context.getGeneration());
    };

    const state: ScriptState = {
      cells: new Set(model.getLiveCells().map((cell) => `${cell.x},${cell.y}`)),
      vars: {},
      output: [],
      x: 0,
      y: 0,
      penDown: false
    };

    const runUntilSteady = async (varName: string, maxSteps: number, line: number) => {
      let stepCount = 0;
      let stable = false;
      let period = 0;

      const signature = (cells: Set<string>) => Array.from(cells).sort().join('|');
      const seen = new Map<string, number>();
      const initial = signature(state.cells);
      seen.set(initial, 0);

      while (stepCount < maxSteps && !stable) {
        throwIfAborted();
        model.step(1);
        stepCount += 1;
        consume(1);
        state.cells = new Set(model.getLiveCells().map((cell) => `${cell.x},${cell.y}`));
        emitWorldChange('until-steady', line, 'UNTIL_STEADY');

        const next = signature(state.cells);
        const previous = seen.get(next);
        if (typeof previous === 'number') {
          stable = true;
          period = Math.max(1, stepCount - previous);
        } else {
          seen.set(next, stepCount);
        }

        if (stepCount % 8 === 0) {
          await this.delayWithAbort(0, signal);
        }
      }

      state.vars[varName] = stable ? stepCount : -1;
      if (stable && period > 0) {
        state.vars[`${varName}_period`] = period;
      }
      emitLog(`UNTIL_STEADY ${varName}=${state.vars[varName]}`);
    };

    const executeCommand = async (line: string, lineNumber: number) => {
      throwIfAborted();

      if (/^PENDOWN$/i.test(line)) {
        currentAction = 'PENDOWN';
        state.penDown = true;
        consume(1);
        return;
      }
      if (/^PENUP$/i.test(line)) {
        currentAction = 'PENUP';
        state.penDown = false;
        consume(1);
        return;
      }

      const gotoMatch = line.match(/^GOTO\s+(\S+)\s+(\S+)$/i);
      if (gotoMatch) {
        currentAction = 'GOTO';
        state.x = Math.floor(Number(this.parseValue(gotoMatch[1], state)) || 0);
        state.y = Math.floor(Number(this.parseValue(gotoMatch[2], state)) || 0);
        consume(1);
        return;
      }

      const rectMatch = line.match(/^RECT\s+(\S+)\s+(\S+)$/i);
      if (rectMatch) {
        currentAction = 'RECT';
        const width = Math.floor(Number(this.parseValue(rectMatch[1], state)) || 0);
        const height = Math.floor(Number(this.parseValue(rectMatch[2], state)) || 0);
        const w = Math.max(0, width);
        const h = Math.max(0, height);
        if (state.penDown) {
          for (let dx = 0; dx < w; dx += 1) {
            for (let dy = 0; dy < h; dy += 1) {
              state.cells.add(`${state.x + dx},${state.y + dy}`);
              consume(1);
            }
          }
          syncModelFromState(state);
          emitWorldChange('command', lineNumber, 'RECT');
        } else {
          consume(1);
        }
        return;
      }

      if (/^CLEAR$/i.test(line)) {
        currentAction = 'CLEAR';
        state.cells.clear();
        consume(1);
        model.clear();
        emitWorldChange('command', lineNumber, 'CLEAR');
        return;
      }

      const stepMatch = line.match(/^STEP\s+(\d+)$/i);
      if (stepMatch) {
        currentAction = 'STEP';
        const n = Math.max(0, Math.floor(Number(stepMatch[1])));
        for (let i = 0; i < n; i += 1) {
          throwIfAborted();
          model.step(1);
          state.cells = new Set(model.getLiveCells().map((cell) => `${cell.x},${cell.y}`));
          consume(1);
          emitWorldChange('step', lineNumber, 'STEP');
          await this.delayWithAbort(16, signal);
        }
        return;
      }

      if (/^START$/i.test(line)) {
        currentAction = 'START';
        runStateIntent = 'running';
        consume(1);
        emitLog('START intent recorded: runtime will be running after script ends.');
        return;
      }

      if (/^STOP$/i.test(line)) {
        currentAction = 'STOP';
        runStateIntent = 'paused';
        consume(1);
        emitLog('STOP intent recorded: runtime will remain paused after script ends.');
        return;
      }

      const captureMatch = line.match(/^CAPTURE\s+(.+)$/i);
      if (captureMatch) {
        currentAction = 'CAPTURE';
        emitLog(`Captured pattern "${captureMatch[1].trim()}" (${state.cells.size} cells)`);
        consume(1);
        return;
      }

      const printMatch = line.match(/^PRINT\s+(.+)$/i);
      if (printMatch) {
        currentAction = 'PRINT';
        const value = this.evalExpr(printMatch[1], state);
        emitLog(String(value));
        state.output.push(String(value));
        consume(1);
        return;
      }

      const countMatch = line.match(/^COUNT\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
      if (countMatch) {
        currentAction = 'COUNT';
        state.vars[countMatch[1]] = state.cells.size;
        consume(1);
        return;
      }

      const labelMatch = line.match(/^LABEL\s+(.+)$/i);
      if (labelMatch) {
        currentAction = 'LABEL';
        const label = this.evalExpr(labelMatch[1], state);
        emitLog(`LABEL (${state.x},${state.y}): ${String(label)}`);
        consume(1);
        return;
      }

      const untilSteadyMatch = line.match(/^UNTIL_STEADY\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(\S+)$/i);
      if (untilSteadyMatch) {
        currentAction = 'UNTIL_STEADY';
        const varName = untilSteadyMatch[1];
        const maxSteps = Math.max(1, Math.floor(Number(this.parseValue(untilSteadyMatch[2], state)) || 1));
        await runUntilSteady(varName, maxSteps, lineNumber);
        return;
      }

      const assignMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
      if (assignMatch) {
        currentAction = 'ASSIGN';
        state.vars[assignMatch[1]] = this.evalExpr(assignMatch[2], state);
        consume(1);
        return;
      }

      throw new Error(`Unknown command: ${line}`);
    };

    const executeBlock = async (subset: Block[]) => {
      let i = 0;
      while (i < subset.length) {
        throwIfAborted();
        const line = subset[i].line;

        const forMatch = line.match(/^FOR\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+FROM\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+))?$/i);
        if (forMatch) {
          const varName = forMatch[1];
          const start = Math.floor(Number(this.evalExpr(forMatch[2], state)) || 0);
          const end = Math.floor(Number(this.evalExpr(forMatch[3], state)) || 0);
          const step = Math.floor(Number(this.evalExpr(forMatch[4] || '1', state)) || 0);
          if (step === 0) throw new Error('FOR loop STEP cannot be zero');

          const loopEnd = this.findControlBlockEnd(subset, i, /^FOR\s+/i);
          const body = subset.slice(i + 1, loopEnd);
          if (step > 0) {
            for (let value = start; value <= end; value += step) {
              state.vars[varName] = value;
              await executeBlock(body);
            }
          } else {
            for (let value = start; value >= end; value += step) {
              state.vars[varName] = value;
              await executeBlock(body);
            }
          }
          i = loopEnd + 1;
          emitProgress('running', subset[Math.min(i, subset.length - 1)].idx + 1);
          continue;
        }

        const whileMatch = line.match(/^WHILE\s+(.+)$/i);
        if (whileMatch) {
          const condition = whileMatch[1];
          const loopEnd = this.findControlBlockEnd(subset, i, /^WHILE\s+/i);
          const body = subset.slice(i + 1, loopEnd);
          while (!signal?.aborted && this.evalCondCompound(condition, state)) {
            await executeBlock(body);
          }
          i = loopEnd + 1;
          emitProgress('running', subset[Math.min(i, subset.length - 1)].idx + 1);
          continue;
        }

        const ifMatch = line.match(/^IF\s+(.+)$/i);
        if (ifMatch) {
          const condition = ifMatch[1];
          const blockEnd = this.findControlBlockEnd(subset, i, /^IF\s+/i);
          const elseIdx = this.findElseIndex(subset, i, blockEnd);
          if (this.evalCondCompound(condition, state)) {
            const ifBody = subset.slice(i + 1, elseIdx >= 0 ? elseIdx : blockEnd);
            await executeBlock(ifBody);
          } else if (elseIdx >= 0) {
            const elseBody = subset.slice(elseIdx + 1, blockEnd);
            await executeBlock(elseBody);
          }
          i = blockEnd + 1;
          emitProgress('running', subset[Math.min(i, subset.length - 1)].idx + 1);
          continue;
        }

        if (/^ELSE$/i.test(line) || /^END$/i.test(line)) {
          i += 1;
          continue;
        }

        await executeCommand(line, subset[i].idx + 1);
        currentAction = `L${subset[i].idx + 1}: ${line}`;
        emitProgress('running', subset[i].idx + 1);
        i += 1;
      }
    };

    emitProgress('start', 0);
    await executeBlock(blocks);
    throwIfAborted();

    const generation = context.getGeneration();
    const liveCellCount = model.getLiveCells().length;
    if (!logs.length) {
      emitLog(`Script finished at generation ${generation}.`);
    }
    currentAction = 'Completed';
    emitProgress('complete', blocks.length);

    return {
      generation,
      liveCellCount,
      operationCount,
      durationMs: Date.now() - startedAt,
      logs: logs.slice(),
      output: logs.join('\n'),
      runStateIntent,
      runId
    };
  }

  private parseBlocks(rawLines: string[]) {
    const blocks: Block[] = [];
    for (let i = 0; i < rawLines.length; i += 1) {
      const raw = String(rawLines[i] || '');
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const indent = (raw.match(/^\s*/) || [''])[0].length;
      blocks.push({ line, indent, idx: i });
    }
    return blocks;
  }

  private findControlBlockEnd(blocks: Block[], startIndex: number, opener: RegExp) {
    let nest = 1;
    let idx = startIndex + 1;
    while (idx < blocks.length && nest > 0) {
      const line = blocks[idx].line;
      if (opener.test(line)) nest += 1;
      if (/^END$/i.test(line)) nest -= 1;
      idx += 1;
    }
    return Math.max(startIndex, idx - 1);
  }

  private findElseIndex(blocks: Block[], startIndex: number, endIndex: number) {
    for (let idx = startIndex + 1; idx < endIndex; idx += 1) {
      if (/^ELSE$/i.test(blocks[idx].line) && blocks[idx].indent === blocks[startIndex].indent) {
        return idx;
      }
    }
    return -1;
  }

  private parseValue(token: string, state: ScriptState): number | string | boolean {
    const tok = String(token || '').trim();
    if (!tok) return 0;
    if (/^".*"$/.test(tok)) return tok.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
    if (tok in state.vars) return state.vars[tok];
    return 0;
  }

  private evalExpr(expr: string, state: ScriptState): number | string | boolean {
    const value = String(expr || '').trim();
    if (!value) return 0;

    let match = value.match(/^STRLEN\s*\(\s*(.+?)\s*\)$/i);
    if (match) return String(this.parseValue(match[1], state)).length;

    match = value.match(/^TOUPPER\s*\(\s*(.+?)\s*\)$/i);
    if (match) return String(this.parseValue(match[1], state)).toUpperCase();

    match = value.match(/^TOLOWER\s*\(\s*(.+?)\s*\)$/i);
    if (match) return String(this.parseValue(match[1], state)).toLowerCase();

    match = value.match(/^TRIM\s*\(\s*(.+?)\s*\)$/i);
    if (match) return String(this.parseValue(match[1], state)).trim();

    match = value.match(/^SUBSTRING\s*\(\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
    if (match) {
      const source = String(this.parseValue(match[1], state));
      const start = Math.floor(Number(this.parseValue(match[2], state)));
      const end = Math.floor(Number(this.parseValue(match[3], state)));
      return source.substring(start, end);
    }

    match = value.match(/^INDEX\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
    if (match) {
      const source = String(this.parseValue(match[1], state));
      const pattern = String(this.parseValue(match[2], state));
      return source.indexOf(pattern);
    }

    match = value.match(/^REPLACE\s*\(\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
    if (match) {
      const source = String(this.parseValue(match[1], state));
      const oldValue = String(this.parseValue(match[2], state));
      const newValue = String(this.parseValue(match[3], state));
      return source.split(oldValue).join(newValue);
    }

    match = value.match(/^(.+)\s*([+\-*/])\s*(.+)$/);
    if (match) {
      const left = this.parseValue(match[1], state);
      const right = this.parseValue(match[3], state);
      switch (match[2]) {
        case '+':
          if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
          return Number(left) + Number(right);
        case '-':
          return Number(left) - Number(right);
        case '*':
          return Number(left) * Number(right);
        case '/':
          return Number(left) / Number(right);
      }
    }

    return this.parseValue(value, state);
  }

  private evalCond(lhs: string, op: string, rhs: string, state: ScriptState) {
    const a = this.parseValue(lhs, state);
    const b = this.parseValue(rhs, state);
    switch (op) {
      case '==': return a === b;
      case '!=': return a !== b;
      case '<': return Number(a) < Number(b);
      case '>': return Number(a) > Number(b);
      case '<=': return Number(a) <= Number(b);
      case '>=': return Number(a) >= Number(b);
      default: return false;
    }
  }

  private evalCondCompound(condition: string, state: ScriptState): boolean {
    const cond = String(condition || '').trim();
    if (!cond) return false;
    return this.parseOr(cond, state);
  }

  private parseOr(expr: string, state: ScriptState): boolean {
    const match = expr.match(/\s+OR\s+/i);
    if (!match || match.index === undefined) {
      return this.parseAnd(expr, state);
    }
    const left = expr.slice(0, match.index).trim();
    const right = expr.slice(match.index + match[0].length).trim();
    return this.parseAnd(left, state) || this.parseOr(right, state);
  }

  private parseAnd(expr: string, state: ScriptState): boolean {
    const match = expr.match(/\s+AND\s+/i);
    if (!match || match.index === undefined) {
      return this.parseNot(expr, state);
    }
    const left = expr.slice(0, match.index).trim();
    const right = expr.slice(match.index + match[0].length).trim();
    return this.parseNot(left, state) && this.parseAnd(right, state);
  }

  private parseNot(expr: string, state: ScriptState): boolean {
    const trimmed = expr.trim();
    const match = trimmed.match(/^NOT\s+(.+)$/i);
    if (match) {
      return !this.parseNot(match[1], state);
    }
    return this.parseComparison(trimmed, state);
  }

  private parseComparison(expr: string, state: ScriptState): boolean {
    const match = expr.match(/^(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
    if (match) {
      return this.evalCond(match[1].trim(), match[2], match[3].trim(), state);
    }
    const value = this.parseValue(expr, state);
    return value !== 0 && value !== '' && value !== false;
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
}
