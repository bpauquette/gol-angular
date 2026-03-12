import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent toggle tool behavior', () => {
  type RuntimeStub = {
    syncIntoRunLoop: jasmine.Spy;
  };

  type ModelStub = {
    toggleCell: jasmine.Spy;
    setCellAlive: jasmine.Spy;
    getLiveCells: jasmine.Spy;
  };

  function createComponent() {
    const runtime: RuntimeStub = {
      syncIntoRunLoop: jasmine.createSpy('syncIntoRunLoop')
    };

    const model: ModelStub = {
      toggleCell: jasmine.createSpy('toggleCell'),
      setCellAlive: jasmine.createSpy('setCellAlive'),
      getLiveCells: jasmine.createSpy('getLiveCells').and.returnValue([])
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

    component.scriptRunning = false;
    component.selectedTool = 'toggle';

    return { component, runtime, model };
  }

  it('sets a clicked cell alive on left click', () => {
    const { component, runtime, model } = createComponent();

    component.onCanvasEvent({ type: 'down', x: 5, y: 5, button: 0 });
    component.onCanvasEvent({ type: 'up', x: 5, y: 5, button: 0 });

    expect(model.setCellAlive).toHaveBeenCalledTimes(1);
    expect(model.setCellAlive).toHaveBeenCalledWith(5, 5, true);
    expect(runtime.syncIntoRunLoop).toHaveBeenCalledTimes(1);
  });

  it('does not repaint the same cell when move event reports the same cell', () => {
    const { component, model } = createComponent();

    component.onCanvasEvent({ type: 'down', x: 7, y: 7, button: 0 });
    component.onCanvasEvent({ type: 'move', x: 7, y: 7, button: 0 });
    component.onCanvasEvent({ type: 'up', x: 7, y: 7, button: 0 });

    expect(model.setCellAlive).toHaveBeenCalledTimes(1);
    expect(model.setCellAlive).toHaveBeenCalledWith(7, 7, true);
  });

  it('uses right click to set cells dead with the left-most toggle tool', () => {
    const { component, model } = createComponent();

    component.onCanvasEvent({ type: 'down', x: 6, y: 1, button: 2 });
    component.onCanvasEvent({ type: 'move', x: 7, y: 1, button: 2 });
    component.onCanvasEvent({ type: 'up', x: 7, y: 1, button: 2 });

    expect(model.setCellAlive).toHaveBeenCalledWith(6, 1, false);
    expect(model.setCellAlive).toHaveBeenCalledWith(7, 1, false);
  });
});
