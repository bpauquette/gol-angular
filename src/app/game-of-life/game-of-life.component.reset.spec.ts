import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent resetToGenerationZero', () => {
  type RuntimeStub = {
    pause: jasmine.Spy;
    syncNow: jasmine.Spy;
  };

  type ModelStub = {
    setLiveCells: jasmine.Spy;
  };

  function createComponent() {
    const runtime: RuntimeStub = {
      pause: jasmine.createSpy('pause'),
      syncNow: jasmine.createSpy('syncNow')
    };
    const model: ModelStub = {
      setLiveCells: jasmine.createSpy('setLiveCells')
    };

    const component = new GameOfLifeComponent(
      {} as any, // tools
      runtime as any,
      model as any,
      {} as any, // dialog
      {} as any, // auth
      {} as any, // shapesCatalog
      {} as any, // gridsCatalog
      {} as any, // adaService
      {} as any, // shapeImport
      {} as any, // scriptsCatalog
      {} as any, // scriptPlayground
      {} as any, // shortcuts
      {} as any, // simulationColorSchemes
      { open: () => ({ dismiss: () => {} }) } as any, // snackBar
      {} as any // ngZone
    );

    (component as any).cancelHashlifeLeap = jasmine.createSpy('cancelHashlifeLeap');
    (component as any).showCheckpointNotice = jasmine.createSpy('showCheckpointNotice');
    component.scriptRunning = false;

    return { component, runtime, model };
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('restores cells from stored generation-zero pattern', () => {
    const { component, runtime, model } = createComponent();
    const savedCells = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];

    localStorage.setItem(
      'gol.generationZeroPattern.v1',
      JSON.stringify({ savedAt: new Date().toISOString(), cells: savedCells })
    );

    component.generation = 42;
    component.liveCells = [{ x: 10, y: 10 }];

    component.resetToGenerationZero();

    expect(runtime.pause).toHaveBeenCalled();
    expect(model.setLiveCells).toHaveBeenCalledWith(savedCells, 0);
    expect(runtime.syncNow).toHaveBeenCalledWith(true);
    expect(component.generation).toBe(0);
    expect(component.liveCells).toEqual(savedCells);
  });

  it('falls back to normalized current cells when storage is empty', () => {
    const { component, model } = createComponent();

    component.generation = 9;
    component.liveCells = [
      { x: 2.8, y: 3.2 },
      { x: 2.2, y: 3.7 },
      { x: 4, y: 5 },
      { x: Number.NaN, y: 1 } as any
    ];

    component.resetToGenerationZero();

    const expected = [{ x: 2, y: 3 }, { x: 4, y: 5 }];
    expect(model.setLiveCells).toHaveBeenCalledWith(expected, 0);

    const raw = localStorage.getItem('gol.generationZeroPattern.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(String(raw));
    expect(parsed.cells).toEqual(expected);
  });
});
