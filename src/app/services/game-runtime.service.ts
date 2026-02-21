import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { GameModelService, Cell, EngineMode } from '../model/game-model.service';
import { AdaComplianceService } from './ada-compliance.service';
import { SimulationWorkerService } from './simulation-worker.service';
import { LoopStepResult, SimulationLoopService } from './simulation-loop.service';
import {
  HashlifeObservatoryService,
  HashlifeRunMode,
  HashlifeTelemetry
} from './hashlife-observatory.service';
import { TimelineCheckpoint, TimelineCheckpointService } from './timeline-checkpoint.service';

export interface DuplicateShape {
  name: string;
  description?: string;
  cellCount?: number;
}

export interface StableDetectionInfo {
  patternType: string;
  generation: number;
  populationCount: number;
  period: number;
}

export interface PerformanceCaps {
  maxFPS: number;
  maxGPS: number;
  enableFPSCap: boolean;
  enableGPSCap: boolean;
}

const DEFAULT_CAPS: PerformanceCaps = {
  maxFPS: 60,
  maxGPS: 30,
  enableFPSCap: false,
  enableGPSCap: false
};
const ADA_ONBOARDING_SEEN_STORAGE_KEY = 'gol.adaOnboardingSeen.v1';

@Injectable({ providedIn: 'root' })
export class GameRuntimeService implements OnDestroy {
  private subscriptions = new Subscription();
  private loginNotifTimer: any = null;
  private engineRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private simulationRequestId = 0;
  private simulationInFlight = false;
  private lastCheckpointGeneration = 0;
  private lastCheckpointAtMs = 0;
  private readonly minCheckpointIntervalMs = 1500;
  private readonly minCheckpointGenerationDelta = 512;
  private readonly maxCheckpointCells = 50000;
  private readonly debugLogsEnabled = true;

  private liveCellsSubject = new BehaviorSubject<Cell[]>([]);
  liveCells$ = this.liveCellsSubject.asObservable();

  private generationSubject = new BehaviorSubject<number>(0);
  generation$ = this.generationSubject.asObservable();

  private engineModeSubject = new BehaviorSubject<EngineMode>('normal');
  engineMode$ = this.engineModeSubject.asObservable();

  private generationBatchSizeSubject = new BehaviorSubject<number>(16);
  generationBatchSize$ = this.generationBatchSizeSubject.asObservable();

  private hashlifeRunModeSubject = new BehaviorSubject<HashlifeRunMode>('cruise');
  hashlifeRunMode$ = this.hashlifeRunModeSubject.asObservable();

  private hashlifeSkipExponentSubject = new BehaviorSubject<number>(7);
  hashlifeSkipExponent$ = this.hashlifeSkipExponentSubject.asObservable();

  private hashlifeTelemetrySubject = new BehaviorSubject<HashlifeTelemetry>({
    workerElapsedMs: 0,
    effectiveBatchSize: 1,
    advancedSinceRender: 0,
    workerUsed: true
  });
  hashlifeTelemetry$ = this.hashlifeTelemetrySubject.asObservable();

  private checkpointsSubject = new BehaviorSubject<TimelineCheckpoint[]>([]);
  checkpoints$ = this.checkpointsSubject.asObservable();

  private isRunningSubject = new BehaviorSubject<boolean>(false);
  isRunning$ = this.isRunningSubject.asObservable();

  private adaComplianceSubject = new BehaviorSubject<boolean>(true);
  adaCompliance$ = this.adaComplianceSubject.asObservable();

  private shapesLoadingSubject = new BehaviorSubject<boolean>(false);
  shapesLoading$ = this.shapesLoadingSubject.asObservable();

  private shapesProgressSubject = new BehaviorSubject<number | null>(null);
  shapesProgress$ = this.shapesProgressSubject.asObservable();

  private shapesErrorSubject = new BehaviorSubject<string | null>(null);
  shapesError$ = this.shapesErrorSubject.asObservable();

  private shapesNotifOpenSubject = new BehaviorSubject<boolean>(false);
  shapesNotifOpen$ = this.shapesNotifOpenSubject.asObservable();

  private loginNotifOpenSubject = new BehaviorSubject<boolean>(false);
  loginNotifOpen$ = this.loginNotifOpenSubject.asObservable();

  private shapesNotifMessageSubject = new BehaviorSubject<string>('');
  shapesNotifMessage$ = this.shapesNotifMessageSubject.asObservable();

  private loginNotifMessageSubject = new BehaviorSubject<string>('');
  loginNotifMessage$ = this.loginNotifMessageSubject.asObservable();

  private showDuplicateDialogSubject = new BehaviorSubject<boolean>(false);
  showDuplicateDialog$ = this.showDuplicateDialogSubject.asObservable();

  private duplicateShapeSubject = new BehaviorSubject<DuplicateShape | null>(null);
  duplicateShape$ = this.duplicateShapeSubject.asObservable();

  private showStableDialogSubject = new BehaviorSubject<boolean>(false);
  showStableDialog$ = this.showStableDialogSubject.asObservable();

  private stableDetectionInfoSubject = new BehaviorSubject<StableDetectionInfo | null>(null);
  stableDetectionInfo$ = this.stableDetectionInfoSubject.asObservable();

  private detectStablePopulationSubject = new BehaviorSubject<boolean>(false);
  detectStablePopulation$ = this.detectStablePopulationSubject.asObservable();

  private showFirstLoadWarningSubject = new BehaviorSubject<boolean>(false);
  showFirstLoadWarning$ = this.showFirstLoadWarningSubject.asObservable();

  private optionsOpenSubject = new BehaviorSubject<boolean>(false);
  optionsOpen$ = this.optionsOpenSubject.asObservable();

  private popHistorySubject = new BehaviorSubject<number[]>([]);
  popHistory$ = this.popHistorySubject.asObservable();

  private popWindowSizeSubject = new BehaviorSubject<number>(50);
  popWindowSize$ = this.popWindowSizeSubject.asObservable();

  private popToleranceSubject = new BehaviorSubject<number>(0);
  popTolerance$ = this.popToleranceSubject.asObservable();

  private maxChartGenerationsSubject = new BehaviorSubject<number>(5000);
  maxChartGenerations$ = this.maxChartGenerationsSubject.asObservable();

  private performanceCapsSubject = new BehaviorSubject<PerformanceCaps>({ ...DEFAULT_CAPS });
  performanceCaps$ = this.performanceCapsSubject.asObservable();

  private photosensitivityTesterEnabledSubject = new BehaviorSubject<boolean>(true);
  photosensitivityTesterEnabled$ = this.photosensitivityTesterEnabledSubject.asObservable();

  private preferredCaps: PerformanceCaps = { ...DEFAULT_CAPS };

  constructor(
    private model: GameModelService,
    private adaService: AdaComplianceService,
    private simulationWorker: SimulationWorkerService,
    private simulationLoop: SimulationLoopService,
    private observatory: HashlifeObservatoryService,
    private checkpointTimeline: TimelineCheckpointService,
    private ngZone: NgZone
  ) {
    const adaOnboardingSeen = this.readBoolFromStorage(ADA_ONBOARDING_SEEN_STORAGE_KEY, false);
    this.showFirstLoadWarningSubject.next(!adaOnboardingSeen);

    this.liveCellsSubject.next(this.model.getLiveCells());
    this.engineModeSubject.next(this.model.getEngineMode());
    this.generationBatchSizeSubject.next(this.model.getGenerationBatchSize());
    this.hashlifeRunModeSubject.next(this.observatory.getRunMode());
    this.hashlifeSkipExponentSubject.next(this.observatory.getSkipExponent());

    this.subscriptions.add(
      this.model.generation$.subscribe(gen => {
        this.generationSubject.next(gen);
      })
    );

    this.subscriptions.add(
      this.model.engineMode$.subscribe(mode => this.engineModeSubject.next(mode))
    );

    this.subscriptions.add(
      this.model.generationBatchSize$.subscribe(size => this.generationBatchSizeSubject.next(size))
    );

    this.subscriptions.add(
      this.observatory.runMode$.subscribe(mode => this.hashlifeRunModeSubject.next(mode))
    );

    this.subscriptions.add(
      this.observatory.skipExponent$.subscribe(exponent => this.hashlifeSkipExponentSubject.next(exponent))
    );

    this.subscriptions.add(
      this.observatory.telemetry$.subscribe(telemetry => this.hashlifeTelemetrySubject.next(telemetry))
    );

    this.subscriptions.add(
      this.checkpointTimeline.checkpoints$.subscribe(checkpoints => this.checkpointsSubject.next(checkpoints))
    );

    this.subscriptions.add(
      this.adaService.adaCompliance$.subscribe(enabled => {
        this.adaComplianceSubject.next(enabled);
        this.photosensitivityTesterEnabledSubject.next(enabled);
        if (enabled) {
          this.pause();
          this.applyAdaCaps();
        } else {
          this.restorePreferredCaps();
        }
      })
    );
  }

  ngOnDestroy() {
    this.pause();
    this.cancelScheduledEngineRestart();
    this.simulationWorker.shutdown();
    if (this.loginNotifTimer) {
      clearTimeout(this.loginNotifTimer);
      this.loginNotifTimer = null;
    }
    this.subscriptions.unsubscribe();
  }

  toggleRun() {
    if (this.isRunningSubject.value) {
      this.pause();
    } else {
      this.start();
    }
  }

  start() {
    this.logRuntime('start.request', {
      running: this.isRunningSubject.value,
      engine: this.engineModeSubject.value,
      generation: this.generationSubject.value,
      adaCompliance: this.adaComplianceSubject.value
    });
    if (this.isRunningSubject.value) return;
    if (this.engineModeSubject.value === 'hashlife') {
      // Avoid blocking the mode-switch interaction path when the population is large.
      this.maybeCaptureCheckpoint(this.generationSubject.value, this.liveCellsSubject.value);
    }
    this.isRunningSubject.next(true);
    this.startSimulationLoop();
  }

  pause() {
    this.logRuntime('pause.request', {
      running: this.isRunningSubject.value,
      inFlight: this.simulationInFlight,
      generation: this.generationSubject.value
    });
    this.isRunningSubject.next(false);
    this.simulationRequestId += 1;
    this.simulationLoop.stop();
  }

  step() {
    // In ADA mode we only allow deterministic single-step progression.
    const batch = this.adaComplianceSubject.value ? 1 : this.getBaseBatchSize();
    void this.executeStepBatch(batch);
  }

  setEngineMode(mode: EngineMode | string) {
    const startedAt = performance.now();
    const target: EngineMode = mode === 'hashlife' ? 'hashlife' : 'normal';
    this.logRuntime('engine.switch.request', {
      from: this.model.getEngineMode(),
      to: target,
      running: this.isRunningSubject.value,
      generation: this.generationSubject.value,
      liveCells: this.liveCellsSubject.value.length
    });
    if (this.model.getEngineMode() === target) return;
    const wasRunning = this.isRunningSubject.value && !this.adaComplianceSubject.value;
    this.cancelScheduledEngineRestart();
    this.pause();

    // Make mode-switch deterministic by cancelling old in-flight worker work.
    this.simulationWorker.shutdown();
    this.simulationInFlight = false;
    this.simulationRequestId += 1;

    this.model.setEngineMode(target);
    if (this.model.getEngineMode() !== 'hashlife') {
      this.checkpointTimeline.clear();
      this.lastCheckpointGeneration = 0;
      this.lastCheckpointAtMs = 0;
      this.observatory.recordTelemetry({
        advancedSinceRender: 0,
        effectiveBatchSize: 1
      });
    }

    if (wasRunning) {
      this.scheduleRestartAfterEngineSwitch();
    }
    this.logRuntime('engine.switch.applied', {
      target,
      wasRunning,
      elapsedMs: Number((performance.now() - startedAt).toFixed(2))
    });
  }

  setGenerationBatchSize(value: number) {
    const normalized = Math.max(1, Math.floor(Number(value) || 1));
    this.model.setGenerationBatchSize(normalized);
    this.observatory.setSkipExponent(exponentFromBatchSize(normalized));
    this.restartLoopIfRunning();
  }

  setHashlifeRunMode(mode: HashlifeRunMode | string) {
    const normalized: HashlifeRunMode = mode === 'explore' || mode === 'warp' ? mode : 'cruise';
    this.logRuntime('hashlife.mode.request', {
      from: this.observatory.getRunMode(),
      to: normalized,
      running: this.isRunningSubject.value
    });
    if (this.observatory.getRunMode() === normalized) return;
    const wasRunning = this.isRunningSubject.value && !this.adaComplianceSubject.value;
    if (wasRunning) this.pause();
    this.observatory.setRunMode(normalized);
    const batch = this.observatory.getBatchSize('hashlife');
    this.model.setGenerationBatchSize(batch);
    this.scheduleResumeIfNeeded(wasRunning);
  }

  setHashlifeSkipExponent(exponent: number) {
    const requested = Math.max(0, Math.min(15, Math.floor(Number(exponent) || 0)));
    const prevExponent = this.observatory.getSkipExponent();
    this.logRuntime('hashlife.skip.request', {
      from: prevExponent,
      to: requested,
      running: this.isRunningSubject.value
    });
    const wasRunning = this.isRunningSubject.value && !this.adaComplianceSubject.value;
    if (wasRunning) this.pause();
    this.observatory.setSkipExponent(requested);
    if (this.observatory.getSkipExponent() === prevExponent) {
      this.scheduleResumeIfNeeded(wasRunning);
      return;
    }
    const batch = this.observatory.getBatchSize('hashlife');
    this.model.setGenerationBatchSize(batch);
    this.scheduleResumeIfNeeded(wasRunning);
  }

  restoreCheckpoint(id: number) {
    this.logRuntime('checkpoint.restore.request', {
      id,
      running: this.isRunningSubject.value,
      generation: this.generationSubject.value
    });
    const checkpoint = this.checkpointTimeline.restoreCheckpoint(id);
    if (!checkpoint) {
      this.logRuntime('checkpoint.restore.miss', { id });
      return false;
    }
    this.pause();
    this.model.setLiveCells(checkpoint.cells, checkpoint.generation);
    this.syncNow(true);
    this.logRuntime('checkpoint.restore.applied', {
      id,
      generation: checkpoint.generation,
      liveCount: checkpoint.liveCount
    });
    return true;
  }

  syncNow(resetPopulationHistory: boolean = false) {
    this.syncLiveCells();
    if (this.engineModeSubject.value === 'hashlife') {
      this.maybeCaptureCheckpoint(this.generationSubject.value, this.liveCellsSubject.value, resetPopulationHistory);
    }
    if (resetPopulationHistory) {
      const count = this.liveCellsSubject.value.length;
      this.popHistorySubject.next([count]);
    }
  }

  syncIntoRunLoop(resetPopulationHistory: boolean = false) {
    this.syncNow(resetPopulationHistory);
    if (!this.isRunningSubject.value) return;

    // Invalidate any in-flight worker result based on pre-edit snapshots.
    this.simulationRequestId += 1;
    this.restartLoopIfRunning();
  }

  clear() {
    this.model.clear();
    this.syncLiveCells();
    this.popHistorySubject.next([]);
    this.checkpointTimeline.clear();
    this.lastCheckpointGeneration = 0;
    this.lastCheckpointAtMs = 0;
    this.stableDetectionInfoSubject.next(null);
    this.showStableDialogSubject.next(false);
    this.generationSubject.next(0);
    this.observatory.recordTelemetry({
      advancedSinceRender: 0,
      effectiveBatchSize: 1,
      workerElapsedMs: 0
    });
    this.pause();
  }

  retryShapesLoad() {
    this.shapesErrorSubject.next(null);
    this.shapesLoadingSubject.next(true);
  }

  dismissShapesNotif() {
    this.shapesNotifOpenSubject.next(false);
  }

  dismissLoginNotif() {
    this.loginNotifOpenSubject.next(false);
  }

  showLoginNotif(message: string, autoCloseMs: number = 7000) {
    const msg = String(message || '').trim();
    if (!msg) return;
    this.loginNotifMessageSubject.next(msg);
    this.loginNotifOpenSubject.next(true);

    if (this.loginNotifTimer) {
      clearTimeout(this.loginNotifTimer);
      this.loginNotifTimer = null;
    }

    if (autoCloseMs > 0) {
      this.loginNotifTimer = setTimeout(() => {
        this.loginNotifOpenSubject.next(false);
        this.loginNotifTimer = null;
      }, autoCloseMs);
    }
  }

  closeDuplicateDialog() {
    this.showDuplicateDialogSubject.next(false);
    this.duplicateShapeSubject.next(null);
  }

  handleViewExistingShape() {
    this.closeDuplicateDialog();
  }

  handleKeepPaused() {
    this.showStableDialogSubject.next(false);
    this.stableDetectionInfoSubject.next(null);
    this.pause();
  }

  handleContinueRunning() {
    this.showStableDialogSubject.next(false);
    this.stableDetectionInfoSubject.next(null);
    this.start();
  }

  closeFirstLoadWarning() {
    this.writeBoolToStorage(ADA_ONBOARDING_SEEN_STORAGE_KEY, true);
    this.showFirstLoadWarningSubject.next(false);
  }

  replayFirstLoadWarning() {
    this.writeBoolToStorage(ADA_ONBOARDING_SEEN_STORAGE_KEY, false);
    this.showFirstLoadWarningSubject.next(true);
  }

  resetRuntimePreferencesToDefaults() {
    this.detectStablePopulationSubject.next(false);
    this.maxChartGenerationsSubject.next(5000);
    this.popWindowSizeSubject.next(50);
    this.popToleranceSubject.next(0);
    this.preferredCaps = { ...DEFAULT_CAPS };

    if (this.adaComplianceSubject.value) {
      this.applyAdaCaps();
      return;
    }

    this.performanceCapsSubject.next({ ...DEFAULT_CAPS });
    this.restartLoopIfRunning();
  }

  setOptionsOpen(open: boolean) {
    this.optionsOpenSubject.next(!!open);
  }

  toggleOptions() {
    this.optionsOpenSubject.next(!this.optionsOpenSubject.value);
  }

  setDetectStablePopulation(enabled: boolean) {
    this.detectStablePopulationSubject.next(!!enabled);
  }

  setMaxChartGenerations(value: number) {
    const next = Math.max(100, Math.min(100000, Math.floor(Number(value) || 5000)));
    this.maxChartGenerationsSubject.next(next);
  }

  setPopWindowSize(value: number) {
    const next = Math.max(1, Math.min(1000, Math.floor(Number(value) || 50)));
    this.popWindowSizeSubject.next(next);
  }

  setPopTolerance(value: number) {
    const next = Math.max(0, Number(value) || 0);
    this.popToleranceSubject.next(next);
  }

  setMaxFPS(value: number) {
    if (this.adaComplianceSubject.value) {
      this.applyAdaCaps();
      return;
    }
    const clamped = Math.max(1, Math.min(120, Number(value) || DEFAULT_CAPS.maxFPS));
    const caps = { ...this.performanceCapsSubject.value, maxFPS: clamped };
    this.performanceCapsSubject.next(caps);
    this.preferredCaps = { ...this.preferredCaps, maxFPS: clamped };
    this.restartLoopIfRunning();
  }

  setMaxGPS(value: number) {
    if (this.adaComplianceSubject.value) {
      this.applyAdaCaps();
      return;
    }
    const clamped = Math.max(1, Math.min(60, Number(value) || DEFAULT_CAPS.maxGPS));
    const caps = { ...this.performanceCapsSubject.value, maxGPS: clamped };
    this.performanceCapsSubject.next(caps);
    this.preferredCaps = { ...this.preferredCaps, maxGPS: clamped };
    this.restartLoopIfRunning();
  }

  setEnableFPSCap(enabled: boolean) {
    if (this.adaComplianceSubject.value) {
      this.applyAdaCaps();
      return;
    }
    const caps = { ...this.performanceCapsSubject.value, enableFPSCap: !!enabled };
    this.performanceCapsSubject.next(caps);
    this.preferredCaps = { ...this.preferredCaps, enableFPSCap: !!enabled };
    this.restartLoopIfRunning();
  }

  setEnableGPSCap(enabled: boolean) {
    if (this.adaComplianceSubject.value) {
      this.applyAdaCaps();
      return;
    }
    const caps = { ...this.performanceCapsSubject.value, enableGPSCap: !!enabled };
    this.performanceCapsSubject.next(caps);
    this.preferredCaps = { ...this.preferredCaps, enableGPSCap: !!enabled };
    this.restartLoopIfRunning();
  }

  private syncLiveCells() {
    this.liveCellsSubject.next(this.model.getLiveCells());
  }

  private startSimulationLoop() {
    this.ngZone.runOutsideAngular(() => {
      this.simulationLoop.start({
        getBaseBatchSize: () => this.getBaseBatchSize(),
        getMaxBatchSize: () => this.getMaxBatchSize(),
        getRenderIntervalMs: () => this.getRenderIntervalMs(),
        getGenerationIntervalMs: () => this.getGenerationIntervalMs(),
        runBatch: (generations) => this.executeStepBatch(generations),
        onError: (error) => {
          console.error('[GameRuntime] Simulation loop error:', error);
        }
      });
    });
  }

  private restartLoopIfRunning() {
    if (!this.isRunningSubject.value) return;
    this.startSimulationLoop();
  }

  private scheduleResumeIfNeeded(shouldResume: boolean) {
    if (!shouldResume) return;
    this.cancelScheduledEngineRestart();
    this.engineRestartTimer = setTimeout(() => {
      this.engineRestartTimer = null;
      if (this.adaComplianceSubject.value || this.isRunningSubject.value) return;
      this.start();
    }, 0);
  }

  private scheduleRestartAfterEngineSwitch() {
    this.scheduleResumeIfNeeded(true);
  }

  private cancelScheduledEngineRestart() {
    if (!this.engineRestartTimer) return;
    clearTimeout(this.engineRestartTimer);
    this.engineRestartTimer = null;
  }

  private logRuntime(event: string, detail: Record<string, unknown> = {}) {
    if (!this.debugLogsEnabled) return;
    console.info(`[GOL Runtime] ${event}`, {
      ts: new Date().toISOString(),
      ...detail
    });
  }

  private getBaseBatchSize() {
    return this.observatory.getBatchSize(this.engineModeSubject.value);
  }

  private getMaxBatchSize() {
    const base = this.getBaseBatchSize();
    if (this.engineModeSubject.value === 'hashlife') {
      return Math.max(base, Math.min(32768, base * 4));
    }
    return Math.max(16, base * 2);
  }

  private getRenderIntervalMs() {
    const ada = this.adaComplianceSubject.value;
    if (ada) return 500;

    const engineMode = this.engineModeSubject.value;
    let interval = this.observatory.getRenderIntervalMs(engineMode);

    const caps = this.performanceCapsSubject.value;
    if (caps.enableFPSCap && caps.maxFPS > 0) {
      interval = Math.max(interval, Math.max(1, Math.floor(1000 / caps.maxFPS)));
    }
    return interval;
  }

  private getGenerationIntervalMs() {
    const caps = this.performanceCapsSubject.value;
    if (caps.enableGPSCap && caps.maxGPS > 0) {
      return 1000 / caps.maxGPS;
    }
    return 0;
  }

  private async executeStepBatch(generations: number): Promise<LoopStepResult | null> {
    if (this.simulationInFlight) return null;
    const requestedGenerations = Math.max(1, Math.floor(Number(generations) || 1));
    this.simulationInFlight = true;
    const requestId = ++this.simulationRequestId;

    try {
      const snapshot = this.model.getLiveCells();
      const result = await this.simulationWorker.step({
        requestId,
        cells: snapshot,
        generations: requestedGenerations
      });

      // Ignore stale results after pause/clear/restart.
      if (result.requestId !== this.simulationRequestId) return null;

      this.ngZone.run(() => {
        const nextGeneration = this.generationSubject.value + result.generations;
        this.model.setLiveCells(result.cells, nextGeneration);
        this.syncLiveCells();
        this.observatory.recordTelemetry({
          workerElapsedMs: result.elapsedMs,
          effectiveBatchSize: result.generations,
          advancedSinceRender: result.generations,
          workerUsed: result.workerUsed
        });
        if (this.engineModeSubject.value === 'hashlife') {
          this.maybeCaptureCheckpoint(nextGeneration, result.cells);
        }
        this.trackPopulation();
      });

      return {
        elapsedMs: result.elapsedMs,
        generationsApplied: result.generations
      };
    } catch (error) {
      console.error('[GameRuntime] Simulation step failed:', error);
      return null;
    } finally {
      this.simulationInFlight = false;
    }
  }

  private trackPopulation() {
    const nextCount = this.liveCellsSubject.value.length;
    const history = [...this.popHistorySubject.value, nextCount];
    const maxHistory = this.maxChartGenerationsSubject.value;
    const trimmed = history.length > maxHistory ? history.slice(history.length - maxHistory) : history;
    this.popHistorySubject.next(trimmed);

    if (!this.detectStablePopulationSubject.value) return;
    const { popChanging } = computePopulationChange(
      trimmed,
      this.popWindowSizeSubject.value,
      this.popToleranceSubject.value
    );
    if (!popChanging && trimmed.length > 3) {
      const info: StableDetectionInfo = {
        patternType: 'Stable (Population)',
        generation: this.generationSubject.value,
        populationCount: nextCount,
        period: 1
      };
      this.stableDetectionInfoSubject.next(info);
      this.showStableDialogSubject.next(true);
      this.pause();
    }
  }

  private applyAdaCaps() {
    const caps: PerformanceCaps = {
      maxFPS: 2,
      maxGPS: 2,
      enableFPSCap: true,
      enableGPSCap: true
    };
    this.performanceCapsSubject.next(caps);
    this.restartLoopIfRunning();
  }

  private restorePreferredCaps() {
    this.performanceCapsSubject.next({ ...this.preferredCaps });
    this.restartLoopIfRunning();
  }

  private maybeCaptureCheckpoint(generation: number, cells: Cell[], force = false) {
    if (this.engineModeSubject.value !== 'hashlife') return;
    if (!Array.isArray(cells) || cells.length === 0) return;
    // Never snapshot populations that are too large to clone cheaply on the main thread.
    if (cells.length > this.maxCheckpointCells) return;

    const now = Date.now();
    const generationDelta = Math.abs(generation - this.lastCheckpointGeneration);
    const timeDelta = now - this.lastCheckpointAtMs;

    if (!force) {
      if (generationDelta < this.minCheckpointGenerationDelta) return;
      if (timeDelta < this.minCheckpointIntervalMs) return;
    }

    this.checkpointTimeline.addCheckpoint(generation, cells);
    this.lastCheckpointGeneration = generation;
    this.lastCheckpointAtMs = now;
  }

  private readBoolFromStorage(key: string, fallback: boolean) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return fallback;
    } catch (error) {
      console.error('[GameRuntime] Failed to read boolean from storage.', { key, fallback, error });
      return fallback;
    }
  }

  private writeBoolToStorage(key: string, value: boolean) {
    try {
      localStorage.setItem(key, value ? 'true' : 'false');
    } catch (error) {
      console.error('[GameRuntime] Failed to persist boolean to storage.', { key, value, error });
    }
  }
}

function computePopulationChange(history: number[] = [], windowSize: number = 1, tolerance: number = 0) {
  if (!Array.isArray(history) || history.length < 2) {
    return { delta: 0, popChanging: true };
  }
  const latest = toNumber(history[history.length - 1]);
  if (!Number.isFinite(latest)) {
    return { delta: 0, popChanging: true };
  }
  const lookback = clampWindow(windowSize, history.length);
  const comparisonIndex = Math.max(0, history.length - 1 - lookback);
  const comparison = toNumber(history[comparisonIndex]);
  if (!Number.isFinite(comparison)) {
    return { delta: 0, popChanging: true };
  }
  const delta = latest - comparison;
  const threshold = coerceTolerance(tolerance);
  return {
    delta,
    popChanging: Math.abs(delta) > threshold
  };
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function clampWindow(windowSize: number, historyLength: number) {
  const normalized = Math.max(1, Math.floor(Number(windowSize) || 1));
  const maxWindow = Math.max(1, historyLength - 1);
  return Math.min(normalized, maxWindow);
}

function coerceTolerance(tolerance: number) {
  const num = Number(tolerance);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function exponentFromBatchSize(batchSize: number) {
  const normalized = Math.max(1, Number(batchSize) || 1);
  return Math.floor(Math.log2(normalized));
}
