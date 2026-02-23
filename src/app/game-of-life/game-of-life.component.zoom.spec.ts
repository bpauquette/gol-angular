import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent zoom behavior', () => {
  let originalDprDescriptor: PropertyDescriptor | undefined;

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
      {} as any,
      runtime as any,
      model as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { open: () => ({ dismiss: () => {} }) } as any,
      {} as any
    );

    return { component };
  }

  function setDpr(value: number) {
    Object.defineProperty(globalThis, 'devicePixelRatio', {
      configurable: true,
      value
    });
  }

  beforeEach(() => {
    originalDprDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  });

  afterEach(() => {
    if (originalDprDescriptor) {
      Object.defineProperty(globalThis, 'devicePixelRatio', originalDprDescriptor);
    } else {
      delete (globalThis as any).devicePixelRatio;
    }
  });

  it('matches React-style multiplicative zoom steps', () => {
    setDpr(1);
    const { component } = createComponent();
    const calc = (component as any).calculateZoomCellSize.bind(component);

    expect(calc(8, -1)).toBe(9);
    expect(calc(8, 1)).toBe(7);
  });

  it('uses device-pixel min clamp and max 200 clamp', () => {
    setDpr(2);
    const { component } = createComponent();
    const calc = (component as any).calculateZoomCellSize.bind(component);

    expect(calc(0.5, 1)).toBe(0.5);
    expect(calc(200, -1)).toBe(200);
  });

  it('keeps the anchor cell stable when zooming at a pointer location', () => {
    setDpr(1);
    const { component } = createComponent();
    component.cellSize = 8;
    component.offsetX = 10;
    component.offsetY = -4;
    component.lastCanvasWidth = 800;
    component.lastCanvasHeight = 600;

    const screenX = 620;
    const screenY = 430;
    const centerX = component.lastCanvasWidth / 2;
    const centerY = component.lastCanvasHeight / 2;
    const beforeCellX = component.offsetX + (screenX - centerX) / component.cellSize;
    const beforeCellY = component.offsetY + (screenY - centerY) / component.cellSize;

    (component as any).applyZoomAtPoint(-120, screenX, screenY);

    const afterCellX = component.offsetX + (screenX - centerX) / component.cellSize;
    const afterCellY = component.offsetY + (screenY - centerY) / component.cellSize;

    expect(afterCellX).toBeCloseTo(beforeCellX, 6);
    expect(afterCellY).toBeCloseTo(beforeCellY, 6);
  });
});
