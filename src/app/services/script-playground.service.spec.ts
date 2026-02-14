import { GameModelService } from '../model/game-model.service';
import { ShapeImportService } from './shape-import.service';
import {
  ScriptPlaygroundService,
  UntilSteadyHeuristicDetector
} from './script-playground.service';
import { AdaComplianceService } from './ada-compliance.service';

describe('ScriptPlaygroundService', () => {
  let service: ScriptPlaygroundService;
  let model: GameModelService;
  let shapeImport: ShapeImportService;
  let generation: number;
  const runtime = {
    pause: jasmine.createSpy('pause'),
    start: jasmine.createSpy('start')
  };

  beforeEach(() => {
    service = new ScriptPlaygroundService();
    model = new GameModelService(new AdaComplianceService());
    shapeImport = new ShapeImportService();
    generation = 0;
    runtime.pause.calls.reset();
    runtime.start.calls.reset();
  });

  function createContext(extras: Record<string, unknown> = {}) {
    return {
      model,
      runtime,
      shapeImport,
      getGeneration: () => generation,
      ...extras
    };
  }

  it('exposes original templates and language reference', () => {
    const templates = service.getTemplates();
    const names = templates.map((template) => template.name);

    expect(names).toContain('Basic Drawing');
    expect(names).toContain('Conway Glider');
    expect(names).toContain('Geometric Shapes');
    expect(names).toContain('Random Garden');
    expect(names).toContain('Steady Squares');
    expect(names).toContain('Empty Script');
    expect(service.getApiReference().join('\n')).toContain('PENDOWN');
  });

  it('runs drawing commands', async () => {
    const result = await service.runScript([
      'CLEAR',
      'PENDOWN',
      'GOTO 0 0',
      'RECT 2 2',
      'PRINT "done"'
    ].join('\n'), createContext());

    expect(model.getLiveCells().length).toBe(4);
    expect(result.output).toContain('done');
    expect(result.operationCount).toBeGreaterThan(0);
  });

  it('supports FOR loops and assignment expressions', async () => {
    await service.runScript([
      'CLEAR',
      'PENDOWN',
      'FOR i FROM 0 TO 2',
      '  GOTO i 0',
      '  RECT 1 1',
      'END'
    ].join('\n'), createContext());

    expect(model.getLiveCells().length).toBe(3);
  });

  it('supports WHILE loops and comparisons', async () => {
    const result = await service.runScript([
      'CLEAR',
      'x = 0',
      'WHILE x < 3',
      '  x = x + 1',
      'END',
      'PRINT x'
    ].join('\n'), createContext());

    expect(result.output).toContain('3');
  });

  it('runs START/STOP and UNTIL_STEADY', async () => {
    const result = await service.runScript([
      'CLEAR',
      'PENDOWN',
      'GOTO 0 0',
      'RECT 2 2',
      'START',
      'UNTIL_STEADY steps 20',
      'STOP',
      'PRINT steps'
    ].join('\n'), createContext());

    expect(result.runStateIntent).toBe('paused');
    expect(result.output).toMatch(/\d+|-1/);
  });

  it('tracks deferred runtime intent from START/STOP', async () => {
    const running = await service.runScript([
      'CLEAR',
      'START'
    ].join('\n'), createContext());
    expect(running.runStateIntent).toBe('running');

    const paused = await service.runScript([
      'CLEAR',
      'START',
      'STOP'
    ].join('\n'), createContext());
    expect(paused.runStateIntent).toBe('paused');
  });

  it('emits progress and logs', async () => {
    const progressEvents: Array<{ phase: string; action: string }> = [];
    const logLines: string[] = [];
    const worldEvents: Array<{ reason: string; command: string }> = [];

    await service.runScript([
      'CLEAR',
      'PENDOWN',
      'RECT 1 1',
      'STEP 1',
      'PRINT "telemetry"'
    ].join('\n'), createContext({
      onProgress: (event: { phase: string; action: string }) => progressEvents.push(event),
      onLog: (line: string) => logLines.push(line),
      onWorldChange: (event: { reason: string; command: string }) => worldEvents.push(event)
    }));

    expect(progressEvents.length).toBeGreaterThan(1);
    expect(progressEvents[0].phase).toBe('start');
    expect(progressEvents[progressEvents.length - 1].phase).toBe('complete');
    expect(logLines).toContain('telemetry');
    expect(worldEvents.some((event) => event.command === 'RECT')).toBeTrue();
    expect(worldEvents.some((event) => event.command === 'STEP')).toBeTrue();
  });

  it('cancels script execution via AbortSignal', async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expectAsync(service.runScript([
      'CLEAR',
      'STEP 10'
    ].join('\n'), createContext({ signal: abortController.signal }))).toBeRejectedWithError(/canceled/i);
  });

  it('annotates UNTIL_STEADY metadata and reports inconclusive with low maxSteps', async () => {
    const result = await service.runScript([
      'CLEAR',
      'PENDOWN',
      'GOTO 1 0',
      'RECT 1 1',
      'GOTO 2 1',
      'RECT 1 1',
      'GOTO 0 2',
      'RECT 1 1',
      'GOTO 1 2',
      'RECT 1 1',
      'GOTO 2 2',
      'RECT 1 1',
      'UNTIL_STEADY probe 3',
      'PRINT probe',
      'PRINT probe_mode',
      'PRINT probe_period',
      'PRINT probe_confidence'
    ].join('\n'), createContext());

    expect(result.output).toContain('-1');
    expect(result.output).toContain('inconclusive');
  });
});

describe('UntilSteadyHeuristicDetector', () => {
  function toCellSet(cells: Array<{ x: number; y: number }>) {
    return new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  }

  it('detects still-life repeats', () => {
    const detector = new UntilSteadyHeuristicDetector();
    const block = toCellSet([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ]);

    let detection: ReturnType<UntilSteadyHeuristicDetector['observe']> = null;
    for (let step = 0; step <= 6; step += 1) {
      detection = detector.observe(step, block);
      if (detection) break;
    }

    expect(detection).not.toBeNull();
    expect(detection?.mode).toBe('still-life');
    expect(detection?.period).toBe(1);
  });

  it('detects oscillator repeats', () => {
    const detector = new UntilSteadyHeuristicDetector();
    const horizontal = toCellSet([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
    const vertical = toCellSet([
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 }
    ]);

    let detection: ReturnType<UntilSteadyHeuristicDetector['observe']> = null;
    for (let step = 0; step <= 12; step += 1) {
      const snapshot = step % 2 === 0 ? horizontal : vertical;
      detection = detector.observe(step, snapshot);
      if (detection) break;
    }

    expect(detection).not.toBeNull();
    expect(detection?.mode).toBe('oscillator');
    expect(detection?.period).toBe(2);
  });

  it('detects spaceship translation repeats', () => {
    const model = new GameModelService(new AdaComplianceService());
    model.setLiveCells([
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ], 0);

    const detector = new UntilSteadyHeuristicDetector();
    let detection: ReturnType<UntilSteadyHeuristicDetector['observe']> = null;

    for (let step = 0; step <= 24; step += 1) {
      const snapshot = toCellSet(model.getLiveCells());
      detection = detector.observe(step, snapshot);
      if (detection) break;
      model.step(1);
    }

    expect(detection).not.toBeNull();
    expect(detection?.mode).toBe('spaceship');
    expect(detection?.period).toBe(4);
    expect(detection?.dx).toBe(1);
    expect(detection?.dy).toBe(1);
  });

  it('detects periodic-with-emission growth patterns', () => {
    const detector = new UntilSteadyHeuristicDetector({
      confirmationsNeeded: 2,
      emissionMinHistory: 10,
      emissionMaxPeriod: 8,
      minGrowthPerPeriod: 1,
      minAreaGrowthPerPeriod: 1
    });

    let detection: ReturnType<UntilSteadyHeuristicDetector['observe']> = null;
    for (let step = 0; step <= 80; step += 1) {
      const cells = new Set<string>();
      if (step % 2 === 0) {
        cells.add('0,0');
        cells.add('1,0');
        cells.add('2,0');
      } else {
        cells.add('1,-1');
        cells.add('1,0');
        cells.add('1,1');
      }

      const tailLength = Math.floor(step / 2) + 1;
      for (let i = 0; i < tailLength; i += 1) {
        cells.add(`${20 + i},0`);
      }

      detection = detector.observe(step, cells);
      if (detection) break;
    }

    expect(detection).not.toBeNull();
    expect(detection?.mode).toBe('periodic-with-emission');
    expect(detection?.period).toBe(2);
  });
});
