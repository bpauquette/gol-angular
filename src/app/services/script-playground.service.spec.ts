import { GameModelService } from '../model/game-model.service';
import { ShapeImportService } from './shape-import.service';
import { ScriptPlaygroundService } from './script-playground.service';
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

  function createContext(maxOperations?: number, extras: Record<string, unknown> = {}) {
    return {
      model,
      runtime,
      shapeImport,
      getGeneration: () => generation,
      maxOperations,
      ...extras
    };
  }

  it('exposes templates, learning panels, and api reference', () => {
    expect(service.getTemplates().length).toBeGreaterThan(3);
    expect(service.getLearningPanels().length).toBeGreaterThan(1);
    expect(service.getApiReference()).toContain('api.fillRect(x, y, width, height, alive?)');
    expect(service.getTemplates().map((template) => template.name)).toContain('Steady Squares');
    expect(service.getTemplates().some((template) => /pulsar/i.test(template.name))).toBeTrue();
  });

  it('runs geometry scripts and reports output', async () => {
    const result = await service.runScript([
      'api.clear();',
      'api.fillRect(0, 0, 2, 2, true);',
      'api.setCell(3, 0, true);',
      'api.log("geometry done");'
    ].join('\n'), createContext());

    expect(model.getLiveCells().length).toBe(5);
    expect(result.output).toContain('geometry done');
    expect(result.operationCount).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.logs).toContain('geometry done');
  });

  it('supports await in script and built-in stamps', async () => {
    const result = await service.runScript([
      'api.clear();',
      'api.stamp("glider", 5, 5);',
      'await api.wait(1);',
      'api.pause();',
      'api.start();',
      'api.log(`cells=${api.getLiveCells().length}`);'
    ].join('\n'), createContext());

    expect(model.getLiveCells().length).toBe(5);
    expect(runtime.pause).toHaveBeenCalled();
    expect(runtime.start).toHaveBeenCalled();
    expect(result.output).toContain('cells=5');
  });

  it('loads RLE patterns from script', async () => {
    generation = 42;
    await service.runScript([
      'const rle = "x = 3, y = 3, rule = B3/S23\\nbob$2bo$3o!";',
      'api.loadRle(rle, "glider");'
    ].join('\n'), createContext());

    expect(model.getLiveCells().length).toBe(5);
  });

  it('supports stability checks and pulsar text stamping', async () => {
    const result = await service.runScript([
      'api.clear();',
      'api.fillRect(0, 0, 6, 6, true);',
      'const settled = await api.untilSteady(32, 12);',
      'api.drawStampText("GO", -40, -24, "pulsar", 12, 2);',
      'api.log("stable=" + settled.stable + " steps=" + settled.steps + " period=" + settled.period);'
    ].join('\n'), createContext(500000));

    expect(model.getLiveCells().length).toBeGreaterThan(40);
    expect(result.output).toContain('stable=');
  });

  it('fails when script exceeds operation limit', async () => {
    await expectAsync(service.runScript([
      'api.clear();',
      'for (let i = 0; i < 5000; i += 1) {',
      '  api.setCell(i, 0, true);',
      '}'
    ].join('\n'), createContext(1000))).toBeRejectedWithError(/operation limit/i);
  });

  it('emits progress and log callbacks during execution', async () => {
    const progressEvents: Array<{ phase: string; action: string }> = [];
    const logLines: string[] = [];
    const result = await service.runScript([
      'api.clear();',
      'api.setCell(1, 1, true);',
      'api.log("telemetry ok");'
    ].join('\n'), createContext(undefined, {
      onProgress: (event: { phase: string; action: string }) => progressEvents.push(event),
      onLog: (line: string) => logLines.push(line)
    }));

    expect(progressEvents.length).toBeGreaterThan(1);
    expect(progressEvents[0].phase).toBe('start');
    expect(progressEvents[progressEvents.length - 1].phase).toBe('complete');
    expect(progressEvents.some((event) => /api\.setCell/i.test(event.action))).toBeTrue();
    expect(logLines).toContain('telemetry ok');
    expect(result.logs).toContain('telemetry ok');
  });

  it('cancels script execution via AbortSignal', async () => {
    const abortController = new AbortController();
    abortController.abort();
    await expectAsync(service.runScript([
      'api.clear();',
      'await api.wait(250);',
      'api.log("should not run");'
    ].join('\n'), createContext(undefined, { signal: abortController.signal }))).toBeRejectedWithError(/canceled/i);
  });
});
