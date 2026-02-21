import { fakeAsync, tick } from '@angular/core/testing';
import { GameOfLifeComponent } from './game-of-life.component';

describe('GameOfLifeComponent photosensitivity browser compatibility', () => {
  function createComponent() {
    const runtime = {
      pause: jasmine.createSpy('pause'),
      syncNow: jasmine.createSpy('syncNow')
    };
    const model = {
      setLiveCells: jasmine.createSpy('setLiveCells')
    };
    const ngZone = {
      run: (fn: () => any) => fn(),
      runOutsideAngular: (fn: () => any) => fn()
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
      ngZone as any
    );

    return { component };
  }

  it('returns a clear error when canvas is unavailable', () => {
    const { component } = createComponent();
    spyOn(component as any, 'getPrimaryCanvasElement').and.returnValue(null);

    component.runPhotosensitivityProbe();

    expect(component.photoTestResult).toContain('canvas is not ready');
    expect(component.photoTestInProgress).toBeFalse();
  });

  it('falls back to compatibility mode when getImageData is unavailable', fakeAsync(() => {
    const { component } = createComponent();
    const sourceCanvas = { width: 640, height: 360 } as any;
    const samplingContext = {
      clearRect: () => {},
      drawImage: () => {}
      // getImageData intentionally missing
    } as any;
    const nativeCreateElement = document.createElement.bind(document);

    spyOn(component as any, 'getPrimaryCanvasElement').and.returnValue(sourceCanvas);
    spyOn(component as any, 'getMonotonicNow').and.callFake(() => Date.now());
    spyOn(document, 'createElement').and.callFake((tag: any) => {
      if (String(tag).toLowerCase() === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => samplingContext
        } as any;
      }
      return nativeCreateElement(tag);
    });

    component.runPhotosensitivityProbe();
    tick(1300);

    expect(component.photoTestInProgress).toBeFalse();
    expect(component.photoTestResult).toContain('INCONCLUSIVE');
    expect(component.photoTestResult).toContain('Compatibility Mode');
  }));

  it('falls back to compatibility mode when drawImage is unavailable', fakeAsync(() => {
    const { component } = createComponent();
    const sourceCanvas = { width: 640, height: 360 } as any;
    const samplingContext = {
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) })
      // drawImage intentionally missing
    } as any;
    const nativeCreateElement = document.createElement.bind(document);

    spyOn(component as any, 'getPrimaryCanvasElement').and.returnValue(sourceCanvas);
    spyOn(component as any, 'getMonotonicNow').and.callFake(() => Date.now());
    spyOn(document, 'createElement').and.callFake((tag: any) => {
      if (String(tag).toLowerCase() === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => samplingContext
        } as any;
      }
      return nativeCreateElement(tag);
    });

    component.runPhotosensitivityProbe();
    tick(1300);

    expect(component.photoTestInProgress).toBeFalse();
    expect(component.photoTestResult).toContain('INCONCLUSIVE');
    expect(component.photoTestResult).toContain('APIs are unavailable');
  }));

  it('falls back to compatibility mode when browser blocks pixel sampling', fakeAsync(() => {
    const { component } = createComponent();
    const sourceCanvas = { width: 640, height: 360 } as any;
    const samplingContext = {
      clearRect: () => {},
      drawImage: () => {},
      getImageData: () => {
        throw new Error('security blocked');
      }
    } as any;
    const nativeCreateElement = document.createElement.bind(document);

    spyOn(component as any, 'getPrimaryCanvasElement').and.returnValue(sourceCanvas);
    spyOn(component as any, 'getMonotonicNow').and.callFake(() => Date.now());
    spyOn(document, 'createElement').and.callFake((tag: any) => {
      if (String(tag).toLowerCase() === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => samplingContext
        } as any;
      }
      return nativeCreateElement(tag);
    });

    component.runPhotosensitivityProbe();
    tick(1300);

    expect(component.photoTestInProgress).toBeFalse();
    expect(component.photoTestResult).toContain('INCONCLUSIVE');
    expect(component.photoTestResult).toContain('blocked by browser security');
  }));

  it('auto-opens the results dialog after a background probe launched from toolbar flow', fakeAsync(() => {
    const { component } = createComponent();
    component.adaCompliance = true;
    const sourceCanvas = { width: 640, height: 360 } as any;
    const samplingContext = {
      clearRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(96 * 54 * 4) })
    } as any;
    const nativeCreateElement = document.createElement.bind(document);

    spyOn(component as any, 'getPrimaryCanvasElement').and.returnValue(sourceCanvas);
    spyOn(component as any, 'getMonotonicNow').and.callFake(() => Date.now());
    spyOn(document, 'createElement').and.callFake((tag: any) => {
      if (String(tag).toLowerCase() === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => samplingContext
        } as any;
      }
      return nativeCreateElement(tag);
    });

    const started = component.runPhotosensitivityProbe({ showResultsDialogOnComplete: true });
    expect(started).toBeTrue();
    expect(component.showPhotosensitivityDialog).toBeFalse();

    tick(13000);

    expect(component.photoTestInProgress).toBeFalse();
    expect(component.showPhotosensitivityDialog).toBeTrue();
    expect(component.photoTestResult.length).toBeGreaterThan(0);
  }));
});
