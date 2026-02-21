import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { GameRuntimeService } from './game-runtime.service';

const ADA_ONBOARDING_SEEN_STORAGE_KEY = 'gol.adaOnboardingSeen.v1';

function createRuntimeHarness(initialAdaCompliance = true) {
  const model = {
    generation$: new BehaviorSubject<number>(0),
    engineMode$: new BehaviorSubject<any>('normal'),
    generationBatchSize$: new BehaviorSubject<number>(16),
    getLiveCells: () => [],
    getEngineMode: () => 'normal',
    getGenerationBatchSize: () => 16
  };

  const adaCompliance$ = new BehaviorSubject<boolean>(initialAdaCompliance);
  const adaService = { adaCompliance$ };

  const simulationWorker = {
    shutdown: () => {}
  };

  const simulationLoop = {
    start: () => {},
    stop: () => {}
  };

  const observatory = {
    runMode$: new BehaviorSubject<any>('cruise'),
    skipExponent$: new BehaviorSubject<number>(7),
    telemetry$: new BehaviorSubject<any>({
      workerElapsedMs: 0,
      effectiveBatchSize: 1,
      advancedSinceRender: 0,
      workerUsed: true
    }),
    getRunMode: () => 'cruise',
    getSkipExponent: () => 7,
    getBatchSize: () => 1,
    getRenderIntervalMs: () => 16,
    recordTelemetry: () => {}
  };

  const checkpointTimeline = {
    checkpoints$: new BehaviorSubject<any[]>([]),
    clear: () => {},
    addCheckpoint: () => {},
    restoreCheckpoint: () => null
  };

  const ngZone = {
    run: (fn: () => any) => fn(),
    runOutsideAngular: (fn: () => any) => fn()
  };

  const service = new GameRuntimeService(
    model as any,
    adaService as any,
    simulationWorker as any,
    simulationLoop as any,
    observatory as any,
    checkpointTimeline as any,
    ngZone as any
  );

  return { service, adaCompliance$ };
}

function createRuntime() {
  return createRuntimeHarness().service;
}

describe('GameRuntimeService first-load ADA onboarding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows the onboarding warning on first visit', async () => {
    localStorage.removeItem(ADA_ONBOARDING_SEEN_STORAGE_KEY);
    const service = createRuntime();
    const visible = await firstValueFrom(service.showFirstLoadWarning$.pipe(take(1)));

    expect(visible).toBeTrue();
    service.ngOnDestroy();
  });

  it('does not show onboarding after it was acknowledged', async () => {
    localStorage.setItem(ADA_ONBOARDING_SEEN_STORAGE_KEY, 'true');
    const service = createRuntime();
    const visible = await firstValueFrom(service.showFirstLoadWarning$.pipe(take(1)));

    expect(visible).toBeFalse();
    service.ngOnDestroy();
  });

  it('marks onboarding as seen when closed', async () => {
    const service = createRuntime();
    service.closeFirstLoadWarning();
    const visible = await firstValueFrom(service.showFirstLoadWarning$.pipe(take(1)));

    expect(visible).toBeFalse();
    expect(localStorage.getItem(ADA_ONBOARDING_SEEN_STORAGE_KEY)).toBe('true');
    service.ngOnDestroy();
  });

  it('can replay onboarding after it was previously acknowledged', async () => {
    localStorage.setItem(ADA_ONBOARDING_SEEN_STORAGE_KEY, 'true');
    const service = createRuntime();

    service.replayFirstLoadWarning();
    const visible = await firstValueFrom(service.showFirstLoadWarning$.pipe(take(1)));

    expect(visible).toBeTrue();
    expect(localStorage.getItem(ADA_ONBOARDING_SEEN_STORAGE_KEY)).toBe('false');
    service.ngOnDestroy();
  });
});

describe('GameRuntimeService ADA state synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('keeps ADA state and safety caps consistent through rapid toggles', () => {
    const { service, adaCompliance$ } = createRuntimeHarness(false);
    let latestAda = false;
    let latestProbeAvailability = false;
    let latestCaps = {
      maxFPS: 60,
      maxGPS: 30,
      enableFPSCap: false,
      enableGPSCap: false
    };
    const adaSub = service.adaCompliance$.subscribe(val => latestAda = val);
    const probeSub = service.photosensitivityTesterEnabled$.subscribe(val => latestProbeAvailability = val);
    const capsSub = service.performanceCaps$.subscribe(caps => latestCaps = { ...caps });

    service.setEnableFPSCap(true);
    service.setMaxFPS(24);
    service.setEnableGPSCap(true);
    service.setMaxGPS(12);

    adaCompliance$.next(true);
    adaCompliance$.next(false);
    adaCompliance$.next(true);
    adaCompliance$.next(false);

    expect(latestAda).toBeFalse();
    expect(latestProbeAvailability).toBeFalse();
    expect(latestCaps).toEqual({
      maxFPS: 24,
      maxGPS: 12,
      enableFPSCap: true,
      enableGPSCap: true
    });

    adaSub.unsubscribe();
    probeSub.unsubscribe();
    capsSub.unsubscribe();
    service.ngOnDestroy();
  });

  it('does not alter ADA enablement when onboarding is acknowledged', () => {
    const { service, adaCompliance$ } = createRuntimeHarness(true);
    let latestAda = true;
    const sub = service.adaCompliance$.subscribe(val => latestAda = val);

    adaCompliance$.next(false);
    service.closeFirstLoadWarning();

    expect(latestAda).toBeFalse();
    expect(localStorage.getItem(ADA_ONBOARDING_SEEN_STORAGE_KEY)).toBe('true');

    sub.unsubscribe();
    service.ngOnDestroy();
  });

  it('resets runtime preference streams to default values', () => {
    const { service } = createRuntimeHarness(false);

    service.setDetectStablePopulation(true);
    service.setMaxChartGenerations(3333);
    service.setPopWindowSize(87);
    service.setPopTolerance(4.5);
    service.setEnableFPSCap(true);
    service.setEnableGPSCap(true);
    service.setMaxFPS(20);
    service.setMaxGPS(15);

    service.resetRuntimePreferencesToDefaults();

    let detect = true;
    let maxChart = 0;
    let popWindow = 0;
    let popTolerance = -1;
    let caps: any = null;
    const subA = service.detectStablePopulation$.subscribe(v => detect = v);
    const subB = service.maxChartGenerations$.subscribe(v => maxChart = v);
    const subC = service.popWindowSize$.subscribe(v => popWindow = v);
    const subD = service.popTolerance$.subscribe(v => popTolerance = v);
    const subE = service.performanceCaps$.subscribe(v => caps = v);

    expect(detect).toBeFalse();
    expect(maxChart).toBe(5000);
    expect(popWindow).toBe(50);
    expect(popTolerance).toBe(0);
    expect(caps).toEqual({
      maxFPS: 60,
      maxGPS: 30,
      enableFPSCap: false,
      enableGPSCap: false
    });

    subA.unsubscribe();
    subB.unsubscribe();
    subC.unsubscribe();
    subD.unsubscribe();
    subE.unsubscribe();
    service.ngOnDestroy();
  });

  it('keeps FPS/GPS caps enforced while ADA mode is enabled', () => {
    const { service, adaCompliance$ } = createRuntimeHarness(true);
    let caps: any = null;
    const sub = service.performanceCaps$.subscribe(v => caps = v);

    service.setEnableFPSCap(false);
    service.setEnableGPSCap(false);
    service.setMaxFPS(120);
    service.setMaxGPS(60);

    expect(caps).toEqual({
      maxFPS: 2,
      maxGPS: 2,
      enableFPSCap: true,
      enableGPSCap: true
    });

    adaCompliance$.next(false);
    service.setEnableFPSCap(false);
    service.setEnableGPSCap(false);
    expect(caps.enableFPSCap).toBeFalse();
    expect(caps.enableGPSCap).toBeFalse();

    sub.unsubscribe();
    service.ngOnDestroy();
  });
});
