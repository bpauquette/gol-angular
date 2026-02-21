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
});
