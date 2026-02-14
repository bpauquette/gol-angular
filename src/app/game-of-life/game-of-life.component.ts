import { Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom, fromEvent } from 'rxjs';
import { ToolsService, ToolOverlay } from '../model/tools.service';
import { EngineMode, GameModelService } from '../model/game-model.service';
import { GameRuntimeService, DuplicateShape, StableDetectionInfo, PerformanceCaps } from '../services/game-runtime.service';
import { HashlifeRunMode } from '../services/hashlife-observatory.service';
import { TimelineCheckpoint } from '../services/timeline-checkpoint.service';
import { MatDialog } from '@angular/material/dialog';
import { ShapePaletteDialogComponent, ShapeItem } from './shape-palette-dialog.component';
import { AuthDialogComponent } from '../auth/auth-dialog.component';
import { AuthService } from '../services/auth.service';
import { ShapeCatalogService } from '../services/shape-catalog.service';
import { GridCatalogService, GridItem } from '../services/grid-catalog.service';
import { AdaComplianceService } from '../services/ada-compliance.service';
import { ShapeImportService } from '../services/shape-import.service';
import { ScriptCatalogService, ScriptItem } from '../services/script-catalog.service';
import {
  ScriptLearningPanel,
  ScriptProgressEvent,
  ScriptPlaygroundService,
  ScriptTemplate
} from '../services/script-playground.service';
import { GlobalShortcutsService, ShortcutTool } from '../services/global-shortcuts.service';
import { SimulationColorSchemeService } from '../services/simulation-color-scheme.service';

type ToolName = ShortcutTool;
interface HashlifeShowcasePattern {
  id: string;
  name: string;
  hint: string;
  recommendedTarget: number;
  cells: { x: number; y: number }[];
}

type HashlifePresetId = 'inspect' | 'balanced' | 'fast_forward';

interface HashlifePreset {
  id: HashlifePresetId;
  label: string;
  hint: string;
  runMode: HashlifeRunMode;
  exponent: number;
}

type ClientPlatform = 'iphone' | 'android' | 'mobile' | 'desktop';

interface PhotosensitivityProbeMetrics {
  elapsedMs: number;
  frameCount: number;
  flashEvents: number;
  flashRateHz: number;
  peakChangedAreaRatio: number;
  peakGlobalLumaDelta: number;
}

interface ScriptRunHistoryItem {
  startedAt: string;
  name: string;
  status: 'ok' | 'error' | 'canceled';
  operationCount: number;
  durationMs: number;
  summary: string;
}

@Component({
  selector: 'app-game-of-life',
  templateUrl: './game-of-life.component.html',
  styleUrls: ['./game-of-life.component.css']
})
export class GameOfLifeComponent implements OnInit, OnDestroy {
  liveCells: { x: number; y: number }[] = [];
  generation = 0;
  engineMode: EngineMode = 'normal';
  generationBatchSize = 16;
  hashlifeRunMode: HashlifeRunMode = 'cruise';
  hashlifeSkipExponent = 7;
  hashlifePresetId: HashlifePresetId = 'balanced';
  showHashlifeAdvanced = false;
  showHashlifePanelMobile = false;
  hashlifeAdvancedSinceRender = 0;
  hashlifeWorkerElapsedMs = 0;
  hashlifeWorkerUsed = true;
  hashlifeTargetInput = '100K';
  hashlifeLeapTarget: number | null = null;
  hashlifeLeapEtaSeconds: number | null = null;
  hashlifeThroughputGps = 0;
  readonly hashlifeQuickTargets = [10_000, 100_000, 1_000_000];
  readonly hashlifePresets: HashlifePreset[] = [
    {
      id: 'inspect',
      label: 'Inspect (small jumps)',
      hint: 'Best for understanding behavior with frequent redraws and smaller generation jumps.',
      runMode: 'explore',
      exponent: 4
    },
    {
      id: 'balanced',
      label: 'Balanced (recommended)',
      hint: 'Best default: fast enough to progress while still readable during normal exploration.',
      runMode: 'cruise',
      exponent: 7
    },
    {
      id: 'fast_forward',
      label: 'Fast-forward (large jumps)',
      hint: 'Best for long leaps (10K+ generations) where speed matters more than frame-by-frame detail.',
      runMode: 'warp',
      exponent: 11
    }
  ];
  readonly hashlifeShowcasePatterns: HashlifeShowcasePattern[] = [
    {
      id: 'acorn',
      name: 'Acorn',
      hint: 'Small seed with a long chaotic growth.',
      recommendedTarget: 5206,
      cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 1 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }]
    },
    {
      id: 'r-pentomino',
      name: 'R-pentomino',
      hint: 'Classic long transient before stabilization.',
      recommendedTarget: 1103,
      cells: [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 0 }]
    },
    {
      id: 'diehard',
      name: 'Diehard',
      hint: 'Famous pattern that survives for 130 generations.',
      recommendedTarget: 130,
      cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 7, y: 2 }]
    }
  ];
  checkpoints: TimelineCheckpoint[] = [];
  popHistory: number[] = [];
  maxChartGenerations = 5000;
  isRunning = false;
  adaCompliance = false;
  overlay?: ToolOverlay;

  shapesLoading = false;
  shapesProgress: number | null = null;
  shapesError: string | null = null;

  showDuplicateDialog = false;
  duplicateShape: DuplicateShape | null = null;

  showStableDialog = false;
  stableDetectionInfo: StableDetectionInfo | null = null;
  detectStablePopulation = false;

  showFirstLoadWarning = false;
  optionsOpen = false;
  isCompactViewport = false;

  showSaveDialog = false;
  showLoadDialog = false;
  saveName = '';
  saveDescription = '';
  saveIsPublic = false;
  saveGridError: string | null = null;
  gridOpInFlight = false;
  loadGridId = '';
  loadGridError: string | null = null;
  gridsLoading = false;
  gridsError: string | null = null;
  grids: GridItem[] = [];
  gridSearch = '';
  selectedGridId: string | null = null;
  private wasRunningBeforeGridDialog = false;

  shapesNotifMessage = '';
  loginNotifMessage = '';
  shapesNotifOpen = false;
  loginNotifOpen = false;

  isLoggedIn = false;
  authEmail: string | null = null;
  hasDonated = false;

  showImportShapeDialog = false;
  importShapeName = 'Imported Shape';
  importShapeDescription = '';
  importShapeText = '';
  importShapeUrl = '';
  importShapePublic = false;
  importShapeBusy = false;
  importShapeError: string | null = null;

  showHelpDialog = false;
  showAboutDialog = false;
  showPhotosensitivityDialog = false;
  photosensitivityTesterEnabled = false;
  photoTestInProgress = false;
  photoTestResult = '';
  private photoTestTimerId: ReturnType<typeof setTimeout> | null = null;
  private reopenPhotosensitivityDialogAfterProbe = false;

  showScriptDialog = false;
  scriptName = 'Quick Script';
  scriptCode = [
    '// Script API: api.clear(), api.setCell(x,y), api.addCells([{x,y}]), api.loadRle(text)',
    'api.clear();',
    'api.addCells([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);'
  ].join('\n');
  scriptOutput = '';
  scriptError: string | null = null;
  scriptIsPublic = false;
  scriptsLoading = false;
  scriptsError: string | null = null;
  myScripts: ScriptItem[] = [];
  selectedScriptId: string | null = null;
  selectedScriptTemplateId: string | null = null;
  scriptTemplates: ScriptTemplate[] = [];
  scriptLearningPanels: ScriptLearningPanel[] = [];
  scriptApiReference: string[] = [];
  scriptMaxOperations = 250000;
  scriptRunning = false;
  scriptCancelRequested = false;
  scriptProgressPercent = 0;
  scriptProgressAction = '';
  scriptOperationCount = 0;
  scriptElapsedMs = 0;
  scriptDebugLog: string[] = [];
  scriptRunHistory: ScriptRunHistoryItem[] = [];

  showStatisticsDialog = false;
  showAccountDialog = false;
  showMyShapesDialog = false;
  myShapesLoading = false;
  myShapesError: string | null = null;
  myShapes: ShapeItem[] = [];
  selectedMyShapeId: string | null = null;

  showPrivacyPolicyDialog = false;

  showCaptureDialog = false;
  captureShapeName = 'Captured Shape';
  captureShapeDescription = '';
  captureShapePublic = false;
  captureShapeError: string | null = null;
  capturedShapeCells: { x: number; y: number }[] = [];

  cursorCell = { x: 0, y: 0 };
  shapeCrosshair: { x: number; y: number; color?: string } | null = null;
  selectedTool: ToolName = 'draw';
  selectedShape: ShapeItem | null = null;
  recentShapes: ShapeItem[] = [];
  toolState: { start?: { x: number; y: number }; last?: { x: number; y: number }; preview?: [number, number][] } = {};
  toolPreview: { cells: [number, number][]; color: string } | null = null;
  randomRectPercent = 50;
  private isPointerDown = false;
  offsetX = 0;
  offsetY = 0;
  cellSize = 8;
  minCellSize = 2;
  maxCellSize = 32;
  lastCanvasWidth = 800;
  lastCanvasHeight = 600;

  performanceCaps: PerformanceCaps = { maxFPS: 60, maxGPS: 30, enableFPSCap: false, enableGPSCap: false };

  clientPlatform: ClientPlatform = 'desktop';
  isPhoneClient = false;
  isIphoneMitigation = false;
  idleDimmed = false;
  canvasShiftX = 0;
  canvasShiftY = 0;
  canvasCellColor = '#7CFF7C';
  canvasBackgroundColor = '#041d38';
  canvasBorderColor = '#1b2b40';
  checkpointNoticeText = '';
  checkpointNoticeSuccess = true;

  private readonly iphoneShiftPath: Array<[number, number]> = [
    [0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]
  ];
  private shiftPathIndex = 0;
  private shiftIntervalId: ReturnType<typeof setInterval> | null = null;
  private idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private checkpointNoticeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly idleDimDelayMs = 45000;
  private readonly shiftIntervalMs = 18000;
  private readonly uiDebugLogsEnabled = true;
  private hasShownHashlifeGuidance = false;

  shapePalette = [
    { name: 'glider', cells: [{x:0,y:1},{x:1,y:2},{x:2,y:0},{x:2,y:1},{x:2,y:2}] },
    { name: 'blinker', cells: [{x:0,y:1},{x:1,y:1},{x:2,y:1}] },
    { name: 'block', cells: [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}] },
    { name: 'toad', cells: [{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}] },
    { name: 'beacon', cells: [{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:2},{x:3,y:2},{x:2,y:3},{x:3,y:3}] },
    { name: 'lwss', cells: [{x:1,y:0},{x:4,y:0},{x:0,y:1},{x:0,y:2},{x:4,y:2},{x:0,y:3},{x:1,y:3},{x:2,y:3},{x:3,y:3}] },
    { name: 'pulsar', cells: [
      {x:2,y:0},{x:3,y:0},{x:4,y:0},{x:8,y:0},{x:9,y:0},{x:10,y:0},
      {x:0,y:2},{x:5,y:2},{x:7,y:2},{x:12,y:2},
      {x:0,y:3},{x:5,y:3},{x:7,y:3},{x:12,y:3},
      {x:0,y:4},{x:5,y:4},{x:7,y:4},{x:12,y:4},
      {x:2,y:5},{x:3,y:5},{x:4,y:5},{x:8,y:5},{x:9,y:5},{x:10,y:5},
      {x:2,y:7},{x:3,y:7},{x:4,y:7},{x:8,y:7},{x:9,y:7},{x:10,y:7},
      {x:0,y:8},{x:5,y:8},{x:7,y:8},{x:12,y:8},
      {x:0,y:9},{x:5,y:9},{x:7,y:9},{x:12,y:9},
      {x:0,y:10},{x:5,y:10},{x:7,y:10},{x:12,y:10},
      {x:2,y:12},{x:3,y:12},{x:4,y:12},{x:8,y:12},{x:9,y:12},{x:10,y:12}
    ] },
    { name: 'pentomino r', cells: [{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:1,y:1},{x:1,y:2}] }
  ];

  private subscriptions = new Subscription();
  private shapeHydrationSub?: Subscription;
  private readonly recentsStorageKey = 'gol.recentShapes.v1';
  private removeShortcutListeners: (() => void) | null = null;
  private scriptAbortController: AbortController | null = null;

  constructor(
    private tools: ToolsService,
    private runtime: GameRuntimeService,
    private model: GameModelService,
    private dialog: MatDialog,
    private auth: AuthService,
    private shapesCatalog: ShapeCatalogService,
    private gridsCatalog: GridCatalogService,
    private adaService: AdaComplianceService,
    private shapeImport: ShapeImportService,
    private scriptsCatalog: ScriptCatalogService,
    private scriptPlayground: ScriptPlaygroundService,
    private shortcuts: GlobalShortcutsService,
    private simulationColorSchemes: SimulationColorSchemeService,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.updateViewportMode();
    this.subscriptions.add(
      this.simulationColorSchemes.scheme$.subscribe(scheme => {
        this.canvasCellColor = scheme.cellColor;
        this.canvasBackgroundColor = scheme.backgroundColor;
        this.canvasBorderColor = scheme.borderColor;
      })
    );

    this.clientPlatform = this.detectClientPlatform();
    this.isPhoneClient = this.clientPlatform !== 'desktop';
    this.exposeClientPlatform();
    this.isIphoneMitigation = this.clientPlatform === 'iphone';
    if (this.isIphoneMitigation) {
      this.applyIphoneCanvasDefaults();
      this.startIphoneMitigationTimers();
      this.subscriptions.add(fromEvent(window, 'touchstart').subscribe(() => this.markInteraction()));
      this.subscriptions.add(fromEvent(window, 'touchmove').subscribe(() => this.markInteraction()));
      this.subscriptions.add(fromEvent(window, 'mousedown').subscribe(() => this.markInteraction()));
      this.subscriptions.add(fromEvent(window, 'keydown').subscribe(() => this.markInteraction()));
      this.subscriptions.add(fromEvent(window, 'wheel').subscribe(() => this.markInteraction()));
      this.markInteraction();
    }

    this.scriptTemplates = this.scriptPlayground.getTemplates();
    this.scriptLearningPanels = this.scriptPlayground.getLearningPanels();
    this.scriptApiReference = this.scriptPlayground.getApiReference();
    if (!this.selectedScriptTemplateId && this.scriptTemplates.length > 0) {
      this.selectedScriptTemplateId = this.scriptTemplates[0].id;
    }

    this.loadRecentShapes();
    this.subscriptions.add(this.runtime.liveCells$.subscribe(cells => {
      this.liveCells = cells;
      this.refreshOverlay();
    }));
    this.subscriptions.add(this.runtime.generation$.subscribe(gen => {
      this.generation = gen;
      this.updateHashlifeLeapProgress();
    }));
    this.subscriptions.add(this.runtime.engineMode$.subscribe(mode => this.engineMode = mode));
    this.subscriptions.add(this.runtime.generationBatchSize$.subscribe(size => this.generationBatchSize = size));
    this.subscriptions.add(this.runtime.hashlifeRunMode$.subscribe(mode => {
      this.hashlifeRunMode = mode;
      this.syncHashlifePresetFromState();
    }));
    this.subscriptions.add(this.runtime.hashlifeSkipExponent$.subscribe(exponent => {
      this.hashlifeSkipExponent = exponent;
      this.syncHashlifePresetFromState();
    }));
    this.subscriptions.add(this.runtime.hashlifeTelemetry$.subscribe(telemetry => {
      this.hashlifeAdvancedSinceRender = telemetry.advancedSinceRender;
      this.hashlifeWorkerElapsedMs = telemetry.workerElapsedMs;
      this.hashlifeWorkerUsed = telemetry.workerUsed;
      if (telemetry.workerElapsedMs > 0 && telemetry.effectiveBatchSize > 0) {
        this.hashlifeThroughputGps = Math.max(
          0,
          Math.floor((telemetry.effectiveBatchSize / telemetry.workerElapsedMs) * 1000)
        );
      }
      this.updateHashlifeLeapProgress();
    }));
    this.subscriptions.add(this.runtime.checkpoints$.subscribe(checkpoints => {
      this.checkpoints = Array.isArray(checkpoints) ? checkpoints.slice(0, 6) : [];
    }));
    this.subscriptions.add(this.runtime.popHistory$.subscribe(hist => this.popHistory = Array.isArray(hist) ? hist : []));
    this.subscriptions.add(this.runtime.maxChartGenerations$.subscribe(val => this.maxChartGenerations = Number(val) || 5000));
    this.subscriptions.add(this.runtime.isRunning$.subscribe(val => this.isRunning = val));
    this.subscriptions.add(this.runtime.adaCompliance$.subscribe(val => {
      this.adaCompliance = val;
      if (!val && this.showPhotosensitivityDialog) {
        this.closePhotosensitivityTest();
      }
    }));
    this.subscriptions.add(this.runtime.shapesLoading$.subscribe(val => this.shapesLoading = val));
    this.subscriptions.add(this.runtime.shapesProgress$.subscribe(val => this.shapesProgress = val));
    this.subscriptions.add(this.runtime.shapesError$.subscribe(val => this.shapesError = val));
    this.subscriptions.add(this.runtime.shapesNotifOpen$.subscribe(val => this.shapesNotifOpen = val));
    this.subscriptions.add(this.runtime.loginNotifOpen$.subscribe(val => this.loginNotifOpen = val));
    this.subscriptions.add(this.runtime.shapesNotifMessage$.subscribe(val => this.shapesNotifMessage = val));
    this.subscriptions.add(this.runtime.loginNotifMessage$.subscribe(val => this.loginNotifMessage = val));
    this.subscriptions.add(this.runtime.showDuplicateDialog$.subscribe(val => this.showDuplicateDialog = val));
    this.subscriptions.add(this.runtime.duplicateShape$.subscribe(val => this.duplicateShape = val));
    this.subscriptions.add(this.runtime.showStableDialog$.subscribe(val => this.showStableDialog = val));
    this.subscriptions.add(this.runtime.stableDetectionInfo$.subscribe(val => this.stableDetectionInfo = val));
    this.subscriptions.add(this.runtime.detectStablePopulation$.subscribe(val => this.detectStablePopulation = val));
    this.subscriptions.add(this.runtime.showFirstLoadWarning$.subscribe(val => this.showFirstLoadWarning = val));
    this.subscriptions.add(this.runtime.optionsOpen$.subscribe(val => this.optionsOpen = val));
    this.subscriptions.add(this.runtime.performanceCaps$.subscribe(val => this.performanceCaps = val));
    this.subscriptions.add(this.runtime.photosensitivityTesterEnabled$.subscribe(val => this.photosensitivityTesterEnabled = val));

    this.subscriptions.add(this.auth.token$.subscribe(token => this.isLoggedIn = !!token));
    this.subscriptions.add(this.auth.email$.subscribe(email => this.authEmail = email));
    this.subscriptions.add(this.auth.hasDonated$.subscribe(hasDonated => this.hasDonated = !!hasDonated));

    this.removeShortcutListeners = this.shortcuts.register({
      canHandle: () => this.canHandleGlobalShortcuts(),
      toggleRun: () => this.toggleRun(),
      step: () => this.step(),
      clear: () => this.clear(),
      openHelp: () => this.openHelpDialog(),
      openScript: () => this.openScriptPlayground(),
      openShapePalette: () => {
        this.setTool('shapes');
        this.openShapePalette();
      },
      toggleOptions: () => this.toggleOptions(),
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      panByCells: (dx, dy) => this.panByCells(dx, dy),
      setTool: (tool) => this.setTool(tool)
    });
  }

  ngOnDestroy() {
    if (this.scriptAbortController) {
      this.scriptAbortController.abort();
      this.scriptAbortController = null;
    }
    this.runtime.pause();
    this.stopIphoneMitigationTimers();
    this.clearCheckpointNoticeTimer();
    this.cancelPhotosensitivityProbe();
    if (this.removeShortcutListeners) {
      this.removeShortcutListeners();
      this.removeShortcutListeners = null;
    }
    this.subscriptions.unsubscribe();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (String(event.key || '') !== 'Escape') return;
    if (!this.closeTopmostDialog()) return;
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('window:resize')
  onViewportResize() {
    this.updateViewportMode();
  }

  toggleRun() {
    this.runtime.toggleRun();
  }

  step() {
    this.runtime.step();
  }

  onEngineModeChange(mode: EngineMode | string) {
    const normalized: EngineMode = mode === 'hashlife' ? 'hashlife' : 'normal';
    const enteringHashlife = this.engineMode !== 'hashlife' && normalized === 'hashlife';
    this.logUi('engine.select', {
      from: this.engineMode,
      to: normalized,
      running: this.isRunning,
      generation: this.generation
    });
    if (this.engineMode === normalized) return;
    if (normalized !== 'hashlife') {
      this.cancelHashlifeLeap(false);
    }
    this.engineMode = normalized;
    this.runtime.setEngineMode(normalized);
    if (enteringHashlife) {
      this.syncHashlifePresetFromState();
      if (!this.hasShownHashlifeGuidance) {
        this.hasShownHashlifeGuidance = true;
        this.showCheckpointNotice(
          'HashLife is optimized for big jumps and long milestones. Use Normal mode for detailed frame-by-frame editing.',
          true
        );
      }
    }
  }

  onGenerationBatchSizeChange(value: any) {
    this.runtime.setGenerationBatchSize(Number(value));
  }

  onHashlifeRunModeChange(mode: HashlifeRunMode | string) {
    const normalized: HashlifeRunMode = mode === 'explore' || mode === 'warp' ? mode : 'cruise';
    this.logUi('hashlife.mode.select', {
      from: this.hashlifeRunMode,
      to: normalized,
      running: this.isRunning
    });
    if (this.hashlifeRunMode === normalized) return;
    this.hashlifeRunMode = normalized;
    this.runtime.setHashlifeRunMode(normalized);
    this.syncHashlifePresetFromState();
  }

  onHashlifeSkipExponentChange(exponent: number) {
    const normalized = Math.max(0, Math.min(15, Math.floor(Number(exponent) || 0)));
    this.logUi('hashlife.jump.select', {
      from: this.hashlifeSkipExponent,
      to: normalized,
      running: this.isRunning
    });
    if (this.hashlifeSkipExponent === normalized) return;
    this.hashlifeSkipExponent = normalized;
    this.runtime.setHashlifeSkipExponent(normalized);
    this.syncHashlifePresetFromState();
  }

  onHashlifePresetChange(presetId: HashlifePresetId | string) {
    const preset = this.getHashlifePresetById(presetId);
    this.logUi('hashlife.preset.select', {
      from: this.hashlifePresetId,
      to: preset.id,
      runMode: preset.runMode,
      exponent: preset.exponent
    });
    this.hashlifePresetId = preset.id;
    this.onHashlifeRunModeChange(preset.runMode);
    this.onHashlifeSkipExponentChange(preset.exponent);
  }

  toggleHashlifeAdvanced() {
    this.showHashlifeAdvanced = !this.showHashlifeAdvanced;
    this.logUi('hashlife.advanced.toggle', { open: this.showHashlifeAdvanced });
  }

  get hashlifePresetHint() {
    return this.getHashlifePresetById(this.hashlifePresetId).hint;
  }

  get clientPlatformLabel() {
    if (this.clientPlatform === 'iphone') return 'iPhone';
    if (this.clientPlatform === 'android') return 'Android';
    if (this.clientPlatform === 'mobile') return 'Mobile';
    return 'Desktop';
  }

  get hideMobileDock() {
    return this.optionsOpen || this.isModalDialogOpen();
  }

  adjustHashlifeSkipExponent(delta: number) {
    const next = Math.max(0, Math.min(15, this.hashlifeSkipExponent + Math.sign(delta || 0)));
    this.onHashlifeSkipExponentChange(next);
  }

  loadHashlifeShowcase(patternId: string) {
    const pattern = this.hashlifeShowcasePatterns.find(item => item.id === patternId);
    if (!pattern) return;

    const centered = this.centerPattern(pattern.cells, 0, 0);
    this.cancelHashlifeLeap(false);
    this.runtime.pause();
    this.model.setLiveCells(centered, 0);
    this.runtime.syncNow(true);
    this.hashlifeTargetInput = String(pattern.recommendedTarget);
    this.showCheckpointNotice(
      `${pattern.name} loaded. Try leaping to G${this.formatGeneration(pattern.recommendedTarget)}.`,
      true
    );
    this.logUi('hashlife.showcase.load', {
      id: pattern.id,
      name: pattern.name,
      cells: centered.length
    });
  }

  startHashlifeLeap(targetGeneration?: number) {
    const requested = typeof targetGeneration === 'number'
      ? targetGeneration
      : this.parseGenerationInput(this.hashlifeTargetInput);
    if (requested === null) {
      this.showCheckpointNotice('Enter a valid leap target like 10000, 100K, or 1M.', false);
      return;
    }

    if (this.engineMode !== 'hashlife') {
      this.onEngineModeChange('hashlife');
    }

    const target = Math.max(this.generation + 1, Math.floor(requested));
    this.hashlifeLeapTarget = target;
    this.updateHashlifeLeapProgress();

    // For large leaps, bias toward speed settings so the feature feels worthwhile.
    if (target - this.generation >= 100_000) {
      this.onHashlifeRunModeChange('warp');
      if (this.hashlifeSkipExponent < 11) {
        this.onHashlifeSkipExponentChange(11);
      }
    }

    if (!this.isRunning) {
      this.runtime.start();
    }

    this.showCheckpointNotice(`Leaping toward G${this.formatGeneration(target)}.`, true);
    this.logUi('hashlife.leap.start', {
      target,
      generation: this.generation,
      runMode: this.hashlifeRunMode,
      exponent: this.hashlifeSkipExponent
    });
  }

  startRelativeHashlifeLeap(delta: number) {
    const normalized = Math.max(1, Math.floor(Number(delta) || 0));
    this.startHashlifeLeap(this.generation + normalized);
  }

  cancelHashlifeLeap(showNotice = true) {
    if (this.hashlifeLeapTarget === null) return;
    const target = this.hashlifeLeapTarget;
    this.hashlifeLeapTarget = null;
    this.hashlifeLeapEtaSeconds = null;
    if (showNotice) {
      this.showCheckpointNotice('Leap cancelled.', false);
    }
    this.logUi('hashlife.leap.cancel', {
      target,
      generation: this.generation
    });
  }

  restoreCheckpoint(id: number) {
    const checkpoint = this.checkpoints.find(item => item.id === id) || null;
    this.cancelHashlifeLeap(false);
    const ok = this.runtime.restoreCheckpoint(id);
    this.logUi('checkpoint.restore', {
      id,
      ok,
      checkpointGeneration: checkpoint?.generation ?? null,
      checkpointLiveCount: checkpoint?.liveCount ?? null
    });
    if (ok) {
      if (checkpoint) {
        this.showCheckpointNotice(
          `Restored G${this.formatGeneration(checkpoint.generation)} (${checkpoint.liveCount} cells).`,
          true
        );
      } else {
        this.showCheckpointNotice('Checkpoint restored.', true);
      }
      return;
    }
    this.showCheckpointNotice('Checkpoint restore failed.', false);
  }

  get hashlifeBatchSize() {
    return Math.pow(2, this.hashlifeSkipExponent);
  }

  formatGeneration(generation: number) {
    const value = Math.max(0, Math.floor(Number(generation) || 0));
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(value);
  }

  formatDuration(seconds: number | null) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins <= 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  clear() {
    this.cancelHashlifeLeap(false);
    this.runtime.clear();
  }

  refreshOverlay() {
    // Disable debug overlay that outlines every live cell in blue.
    // Tool previews are handled by the canvas directly.
    this.overlay = undefined;
  }

  retryShapesLoad() {
    this.runtime.retryShapesLoad();
  }

  closeDuplicateDialog() {
    this.runtime.closeDuplicateDialog();
  }

  handleViewExistingShape() {
    this.runtime.handleViewExistingShape();
  }

  handleKeepPaused() {
    this.runtime.handleKeepPaused();
  }

  handleContinueRunning() {
    this.runtime.handleContinueRunning();
  }

  closeFirstLoadWarning() {
    this.runtime.closeFirstLoadWarning();
  }

  openOptions() {
    this.runtime.setOptionsOpen(true);
  }

  closeOptions() {
    this.runtime.setOptionsOpen(false);
  }

  toggleOptions() {
    this.runtime.toggleOptions();
  }

  setOptionsOpen(open: boolean) {
    this.runtime.setOptionsOpen(open);
  }

  openSaveDialog() {
    if (!this.auth.isLoggedIn) {
      this.runtime.showLoginNotif('Please login to save grid states.');
      this.openAuth('login');
      return;
    }
    this.wasRunningBeforeGridDialog = this.isRunning;
    if (this.isRunning) this.runtime.pause();
    this.saveGridError = null;
    this.gridOpInFlight = false;
    this.showSaveDialog = true;
  }

  closeSaveDialog() {
    this.showSaveDialog = false;
    this.saveGridError = null;
    this.gridOpInFlight = false;
    this.resumeIfNeeded();
  }

  openLoadDialog() {
    this.wasRunningBeforeGridDialog = this.isRunning;
    if (this.isRunning) this.runtime.pause();
    this.loadGridError = null;
    this.gridsError = null;
    this.showLoadDialog = true;
    void this.refreshGridsList();
  }

  closeLoadDialog() {
    this.showLoadDialog = false;
    this.loadGridError = null;
    this.gridsError = null;
    this.gridsLoading = false;
    this.gridOpInFlight = false;
    this.gridSearch = '';
    this.selectedGridId = null;
    this.resumeIfNeeded();
  }

  get filteredGrids(): GridItem[] {
    const grids = Array.isArray(this.grids) ? this.grids : [];
    const term = (this.gridSearch || '').trim().toLowerCase();
    if (!term) return grids;
    return grids.filter(g => {
      const name = String(g?.name || '').toLowerCase();
      const desc = String(g?.description || '').toLowerCase();
      return name.includes(term) || desc.includes(term) || String(g?.id || '').toLowerCase().includes(term);
    });
  }

  async handleSaveGrid() {
    if (this.gridOpInFlight) return;
    this.saveGridError = null;

    const name = String(this.saveName || '').trim();
    if (!name) {
      this.saveGridError = 'Name is required.';
      return;
    }
    if (name.length > 100) {
      this.saveGridError = 'Name must be 100 characters or less.';
      return;
    }
    if (!this.auth.isLoggedIn) {
      this.runtime.showLoginNotif('Please login to save grid states.');
      this.openAuth('login');
      return;
    }

    try {
      this.gridOpInFlight = true;
      const payload = {
        name,
        description: String(this.saveDescription || '').trim(),
        liveCells: Array.isArray(this.liveCells) ? this.liveCells : [],
        generation: this.generation || 0,
        public: !!this.saveIsPublic
      };
      await firstValueFrom(this.gridsCatalog.saveGrid(payload));
      this.saveName = '';
      this.saveDescription = '';
      this.saveIsPublic = false;
      this.showSaveDialog = false;
      await this.refreshGridsList();
    } catch (err: any) {
      console.error('[GameOfLife] Failed to save grid.', err);
      this.saveGridError = this.toUserError(err, 'Failed to save grid.');
    } finally {
      this.gridOpInFlight = false;
      if (!this.showSaveDialog) this.resumeIfNeeded();
    }
  }

  async handleLoadGrid(gridId?: string) {
    if (this.gridOpInFlight) return;
    this.loadGridError = null;

    const id = String(gridId || this.selectedGridId || this.loadGridId || '').trim();
    if (!id) {
      this.loadGridError = 'Select a grid to load.';
      return;
    }

    try {
      this.gridOpInFlight = true;
      const grid = await firstValueFrom(this.gridsCatalog.getGrid(id));
      if (!grid) {
        this.loadGridError = 'Grid not found.';
        return;
      }
      this.model.setLiveCells(grid.liveCells || [], grid.generation || 0);
      this.runtime.syncNow(true);
      this.showLoadDialog = false;
    } catch (err: any) {
      console.error('[GameOfLife] Failed to load grid.', { gridId: id, err });
      this.loadGridError = this.toUserError(err, 'Failed to load grid.');
    } finally {
      this.gridOpInFlight = false;
      if (!this.showLoadDialog) this.resumeIfNeeded();
    }
  }

  async handleDeleteGrid(gridId: string) {
    if (this.gridOpInFlight) return;
    if (!this.auth.isLoggedIn) {
      this.runtime.showLoginNotif('Please login to delete grid states.');
      this.openAuth('login');
      return;
    }
    const id = String(gridId || '').trim();
    if (!id) return;

    try {
      this.gridOpInFlight = true;
      const ok = await firstValueFrom(this.gridsCatalog.deleteGrid(id));
      if (!ok) {
        this.gridsError = 'Delete failed (not allowed or not found).';
      }
      if (this.selectedGridId === id) this.selectedGridId = null;
      await this.refreshGridsList();
    } catch (err: any) {
      console.error('[GameOfLife] Failed to delete grid.', { gridId: id, err });
      this.gridsError = this.toUserError(err, 'Failed to delete grid.');
    } finally {
      this.gridOpInFlight = false;
    }
  }

  async refreshGridsList() {
    this.gridsLoading = true;
    this.gridsError = null;
    try {
      const res = await firstValueFrom(this.gridsCatalog.listGrids(1, 100));
      this.grids = Array.isArray(res?.items) ? res.items : [];
    } catch (err: any) {
      console.error('[GameOfLife] Failed to refresh grids list.', err);
      this.grids = [];
      this.gridsError = this.toUserError(err, 'Failed to load saved grids.');
    } finally {
      this.gridsLoading = false;
    }
  }

  private resumeIfNeeded() {
    if (!this.wasRunningBeforeGridDialog) return;
    // Use runtime state (not local subscription timing) to resume reliably.
    this.runtime.start();
    this.wasRunningBeforeGridDialog = false;
  }

  private toUserError(err: any, fallback: string) {
    const msg = String(err?.message || err?.error?.error || err?.error || '').trim();
    return msg ? msg : fallback;
  }

  dismissShapesNotif() {
    this.runtime.dismissShapesNotif();
  }

  dismissLoginNotif() {
    this.runtime.dismissLoginNotif();
  }

  onCursorChange(pos: { x: number; y: number }) {
    this.cursorCell = pos;
    // Shape overlay is only shown while the pointer is down (dragging), like the reference app.
    if (this.selectedTool !== 'shapes' || !this.selectedShape || !this.isPointerDown) {
      this.shapeCrosshair = null;
      return;
    }
    this.shapeCrosshair = { x: pos.x, y: pos.y, color: 'rgba(90,180,255,0.85)' };
    this.toolPreview = { cells: this.getAnchoredShapeCells(pos.x, pos.y, this.selectedShape.cells || []), color: 'rgba(124,255,124,0.55)' };
  }

  zoomIn() {
    this.applyZoomAtPoint(-1, this.lastCanvasWidth / 2, this.lastCanvasHeight / 2);
  }

  zoomOut() {
    this.applyZoomAtPoint(1, this.lastCanvasWidth / 2, this.lastCanvasHeight / 2);
  }

  onZoom(payload: { deltaY: number; screenX: number; screenY: number; width: number; height: number }) {
    if (!payload) return;
    const { deltaY, screenX, screenY, width, height } = payload;
    this.lastCanvasWidth = width || this.lastCanvasWidth;
    this.lastCanvasHeight = height || this.lastCanvasHeight;
    this.applyZoomAtPoint(deltaY, screenX, screenY);
  }

  onPan(payload: { deltaX: number; deltaY: number }) {
    if (!payload) return;
    this.offsetX -= (Number(payload.deltaX) || 0) / this.cellSize;
    this.offsetY -= (Number(payload.deltaY) || 0) / this.cellSize;
  }

  panByCells(dx: number, dy: number) {
    this.offsetX += Math.floor(Number(dx) || 0);
    this.offsetY += Math.floor(Number(dy) || 0);
  }

  private applyZoomAtPoint(deltaY: number, screenX: number, screenY: number) {
    const prevSize = this.cellSize;
    const nextSize = deltaY > 0
      ? Math.max(this.minCellSize, prevSize - 1)
      : Math.min(this.maxCellSize, prevSize + 1);
    if (nextSize === prevSize) return;

    const centerX = this.lastCanvasWidth / 2;
    const centerY = this.lastCanvasHeight / 2;
    const cellX = this.offsetX + (screenX - centerX) / prevSize;
    const cellY = this.offsetY + (screenY - centerY) / prevSize;

    this.cellSize = nextSize;
    this.offsetX = cellX - (screenX - centerX) / nextSize;
    this.offsetY = cellY - (screenY - centerY) / nextSize;
  }

  setTool(tool: ToolName) {
    this.selectedTool = tool;
    this.toolState = {};
    this.toolPreview = null;
    if (tool !== 'shapes') this.shapeCrosshair = null;
  }

  selectShape(shape: ShapeItem) {
    this.selectedShape = shape;
    this.setTool('shapes');
    this.ensureSelectedShapeHydrated();
  }

  openShapePalette() {
    const dialogRef = this.dialog.open(ShapePaletteDialogComponent, {
      data: { recentShapes: this.recentShapes },
      width: '1100px',
      maxWidth: '96vw'
    });
    dialogRef.componentInstance.selectShape.subscribe((shape) => {
      this.selectShape(shape);
    });
    dialogRef.componentInstance.addRecent.subscribe((shape) => {
      this.addRecentShape(shape);
    });
  }

  openAuth(mode: 'login' | 'register') {
    this.dialog.open(AuthDialogComponent, {
      data: { mode },
      width: '560px',
      maxWidth: '92vw'
    });
  }

  openDonate() {
    const donateUrl = this.getDonateUrl();
    this.logUi('donate.open', { donateUrl });
    const popup = window.open(donateUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      // Fallback for popup blockers.
      window.location.href = donateUrl;
    }
  }

  openLifeWiki() {
    const wikiUrl = 'https://conwaylife.com/wiki/Main_Page';
    const popup = window.open(wikiUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      window.location.href = wikiUrl;
    }
  }

  openImportShapeDialog() {
    this.importShapeName = 'Imported Shape';
    this.importShapeDescription = '';
    this.importShapeText = '';
    this.importShapeUrl = '';
    this.importShapePublic = false;
    this.importShapeError = null;
    this.showImportShapeDialog = true;
  }

  closeImportShapeDialog() {
    this.showImportShapeDialog = false;
    this.importShapeBusy = false;
    this.importShapeError = null;
  }

  async handleImportShape(saveToCatalog: boolean) {
    this.importShapeError = null;
    this.importShapeBusy = true;
    try {
      let source = String(this.importShapeText || '').trim();
      if (!source) {
        const url = String(this.importShapeUrl || '').trim();
        if (!url) {
          throw new Error('Paste RLE/coordinate text or provide a URL.');
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Unable to fetch URL: HTTP ${response.status}`);
        }
        source = await response.text();
      }

      const parsed = this.shapeImport.parse(source, String(this.importShapeName || '').trim() || 'Imported Shape');
      const shape: ShapeItem = {
        name: String(this.importShapeName || parsed.name || 'Imported Shape').trim(),
        description: String(this.importShapeDescription || parsed.description || '').trim(),
        cells: parsed.cells,
        width: parsed.width,
        height: parsed.height,
        population: parsed.cells.length,
        period: 1
      };

      this.selectShape(shape);
      this.addRecentShape(shape);
      this.showCheckpointNotice(`Imported "${shape.name}" with ${shape.cells?.length || 0} cells.`, true);

      if (saveToCatalog) {
        if (!this.auth.isLoggedIn) {
          throw new Error('Login is required to save imported shapes.');
        }
        const saved = await firstValueFrom(this.shapesCatalog.saveShape({
          name: shape.name,
          description: shape.description,
          cells: shape.cells || [],
          rleText: parsed.rleText || source,
          public: !!this.importShapePublic,
          width: shape.width,
          height: shape.height,
          period: shape.period
        }));
        if (saved?.id) {
          shape.id = saved.id;
        }
        this.showCheckpointNotice(`Saved "${shape.name}" to your shape catalog.`, true);
      }

      this.showImportShapeDialog = false;
    } catch (error: any) {
      console.error('[GameOfLife] Failed to import shape.', error);
      this.importShapeError = String(error?.message || 'Import failed.');
    } finally {
      this.importShapeBusy = false;
    }
  }

  openHelpDialog() {
    this.showHelpDialog = true;
  }

  closeHelpDialog() {
    this.showHelpDialog = false;
  }

  openAboutDialog() {
    this.showAboutDialog = true;
  }

  closeAboutDialog() {
    this.showAboutDialog = false;
  }

  openPhotosensitivityTest() {
    if (!this.photosensitivityTesterEnabled) {
      this.showCheckpointNotice('Enable photosensitivity tester in Options while ADA mode is on.', false);
      return;
    }
    if (this.photoTestInProgress) {
      this.showCheckpointNotice('Photosensitivity probe is already running in the background.', true);
      return;
    }
    this.photoTestResult = '';
    this.showPhotosensitivityDialog = true;
  }

  closePhotosensitivityTest() {
    this.showPhotosensitivityDialog = false;
    this.photoTestInProgress = false;
    this.reopenPhotosensitivityDialogAfterProbe = false;
    this.cancelPhotosensitivityProbe();
  }

  runPhotosensitivityProbe() {
    if (this.photoTestInProgress) return;
    const sourceCanvas = this.getPrimaryCanvasElement();
    if (!sourceCanvas || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
      this.photoTestResult = 'Unable to run probe: canvas is not ready.';
      return;
    }

    const scratch = document.createElement('canvas');
    scratch.width = 96;
    scratch.height = Math.max(54, Math.min(72, Math.round((sourceCanvas.height / sourceCanvas.width) * 96)));
    const scratchCtx = scratch.getContext('2d');
    if (!scratchCtx) {
      this.photoTestResult = 'Unable to run probe: no canvas sampling context.';
      return;
    }

    this.cancelPhotosensitivityProbe();
    this.photoTestInProgress = true;
    this.reopenPhotosensitivityDialogAfterProbe = this.showPhotosensitivityDialog;
    this.showPhotosensitivityDialog = false;
    this.photoTestResult = 'Passive probe is running in the background for 12 seconds. Keep using the app normally.';

    const durationMs = 12000;
    const sampleIntervalMs = 220;
    const minFlashGapMs = 120;
    const pixelDeltaThreshold = 0.24;
    const changedAreaThreshold = 0.2;
    const globalLumaThreshold = 0.1;

    const startedAt = performance.now();
    let frameCount = 0;
    let flashEvents = 0;
    let lastFlashAt = -Infinity;
    let previousMeanLuma: number | null = null;
    let peakChangedAreaRatio = 0;
    let peakGlobalLumaDelta = 0;
    const pixelCount = scratch.width * scratch.height;
    let previousLumaBuffer: Float32Array | null = null;
    let currentLumaBuffer = new Float32Array(pixelCount);

    const finalize = (elapsed: number) => {
      const measuredFps = Math.max(0, Math.round((frameCount / Math.max(1, elapsed)) * 1000));
      const flashRateHz = flashEvents / Math.max(0.001, elapsed / 1000);
      const metrics: PhotosensitivityProbeMetrics = {
        elapsedMs: elapsed,
        frameCount,
        flashEvents,
        flashRateHz,
        peakChangedAreaRatio,
        peakGlobalLumaDelta
      };
      const caps = this.performanceCaps;
      this.ngZone.run(() => {
        this.photoTestResult = this.buildPhotosensitivitySummary(metrics, measuredFps, caps);
        this.photoTestInProgress = false;
        this.photoTestTimerId = null;
        if (this.reopenPhotosensitivityDialogAfterProbe && this.adaCompliance && this.photosensitivityTesterEnabled) {
          this.showPhotosensitivityDialog = true;
        }
        this.reopenPhotosensitivityDialogAfterProbe = false;
      });
    };

    const sample = () => {
      if (!this.photoTestInProgress) {
        this.photoTestTimerId = null;
        return;
      }

      const sampleStartedAt = performance.now();
      frameCount += 1;
      scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
      scratchCtx.drawImage(sourceCanvas, 0, 0, scratch.width, scratch.height);
      const imageData = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
      const data = imageData.data;
      let lumaSum = 0;
      let changedPixels = 0;

      for (let pixelIndex = 0, dataIndex = 0; pixelIndex < pixelCount; pixelIndex += 1, dataIndex += 4) {
        const r = data[dataIndex] / 255;
        const g = data[dataIndex + 1] / 255;
        const b = data[dataIndex + 2] / 255;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        currentLumaBuffer[pixelIndex] = luma;
        lumaSum += luma;
        if (previousLumaBuffer && Math.abs(luma - previousLumaBuffer[pixelIndex]) >= pixelDeltaThreshold) {
          changedPixels += 1;
        }
      }

      const meanLuma = lumaSum / pixelCount;
      if (previousLumaBuffer && previousMeanLuma !== null) {
        const changedAreaRatio = changedPixels / pixelCount;
        const globalLumaDelta = Math.abs(meanLuma - previousMeanLuma);
        peakChangedAreaRatio = Math.max(peakChangedAreaRatio, changedAreaRatio);
        peakGlobalLumaDelta = Math.max(peakGlobalLumaDelta, globalLumaDelta);

        if (
          changedAreaRatio >= changedAreaThreshold
          && globalLumaDelta >= globalLumaThreshold
          && sampleStartedAt - lastFlashAt >= minFlashGapMs
        ) {
          flashEvents += 1;
          lastFlashAt = sampleStartedAt;
        }
      }

      previousMeanLuma = meanLuma;
      if (!previousLumaBuffer) {
        previousLumaBuffer = new Float32Array(pixelCount);
      }
      const swap = previousLumaBuffer;
      previousLumaBuffer = currentLumaBuffer;
      currentLumaBuffer = swap;

      const elapsed = sampleStartedAt - startedAt;
      if (elapsed >= durationMs) {
        finalize(elapsed);
        return;
      }

      const sampleCostMs = performance.now() - sampleStartedAt;
      const delayMs = Math.max(80, sampleIntervalMs - sampleCostMs);
      this.photoTestTimerId = setTimeout(sample, delayMs);
    };

    this.ngZone.runOutsideAngular(() => {
      sample();
    });
  }

  applySafeVisualCaps() {
    this.adaService.setAdaCompliance(true);
    this.runtime.setPhotosensitivityTesterEnabled(true);
    this.photoTestResult = 'ADA mode enabled. Autoplay remains available with conservative safety caps.';
  }

  openScriptPlayground() {
    this.showScriptDialog = true;
    if (!this.selectedScriptTemplateId && this.scriptTemplates.length > 0) {
      this.selectedScriptTemplateId = this.scriptTemplates[0].id;
    }
    if (!String(this.scriptCode || '').trim() && this.selectedScriptTemplateId) {
      this.applyScriptTemplate(this.selectedScriptTemplateId);
    }
    void this.refreshScriptLibrary();
  }

  closeScriptPlayground() {
    this.showScriptDialog = false;
    this.scriptError = null;
  }

  applySelectedScriptTemplate() {
    this.applyScriptTemplate(this.selectedScriptTemplateId);
  }

  appendScriptSnippet(snippet: string) {
    const next = String(snippet || '').trim();
    if (!next) return;
    const current = String(this.scriptCode || '').replace(/\s+$/, '');
    this.scriptCode = current ? `${current}\n${next}\n` : `${next}\n`;
  }

  applyLearningTemplate(panelId: string) {
    const panel = this.scriptLearningPanels.find((item) => item.id === panelId);
    if (!panel) return;
    this.applyScriptTemplate(panel.templateId);
  }

  applyScriptTemplate(templateId: string | null | undefined) {
    const template = this.scriptPlayground.findTemplate(templateId);
    if (!template) {
      this.scriptError = 'Template not found.';
      return;
    }
    this.selectedScriptTemplateId = template.id;
    this.scriptName = template.name;
    this.scriptCode = template.code;
    this.scriptError = null;
    this.scriptOutput = `Loaded template "${template.name}".`;
  }

  async refreshScriptLibrary() {
    this.scriptsLoading = true;
    this.scriptsError = null;
    try {
      const res = this.auth.isLoggedIn
        ? await firstValueFrom(this.scriptsCatalog.listMyScripts(1, 200))
        : await firstValueFrom(this.scriptsCatalog.listPublicScripts(1, 200));
      this.myScripts = Array.isArray(res?.items) ? res.items : [];
      if (!this.selectedScriptId && this.myScripts.length > 0) {
        this.selectedScriptId = this.myScripts[0].id;
      }
    } catch (error: any) {
      console.error('[GameOfLife] Failed to refresh script library.', error);
      this.scriptsError = String(error?.message || 'Unable to load scripts.');
      this.myScripts = [];
    } finally {
      this.scriptsLoading = false;
    }
  }

  loadScriptFromLibrary(scriptId: string) {
    const script = this.myScripts.find((item) => item.id === scriptId);
    if (!script) return;
    this.selectedScriptId = script.id;
    this.scriptName = script.name;
    this.scriptCode = script.content;
    this.scriptError = null;
    this.scriptOutput = `Loaded script "${script.name}" from library.`;
  }

  async saveCurrentScript() {
    this.scriptError = null;
    if (!this.auth.isLoggedIn) {
      this.openAuth('login');
      this.scriptError = 'Login is required to save scripts.';
      return;
    }
    const name = String(this.scriptName || '').trim();
    const content = String(this.scriptCode || '').trim();
    if (!name || !content) {
      this.scriptError = 'Script name and content are required.';
      return;
    }
    try {
      await firstValueFrom(this.scriptsCatalog.saveScript(name, content, this.scriptIsPublic));
      this.scriptOutput = `Saved script "${name}".`;
      await this.refreshScriptLibrary();
    } catch (error: any) {
      console.error('[GameOfLife] Failed to save script.', error);
      this.scriptError = String(error?.message || 'Failed to save script.');
    }
  }

  async deleteSelectedScript() {
    this.scriptError = null;
    if (!this.selectedScriptId) return;
    const id = this.selectedScriptId;
    try {
      const ok = await firstValueFrom(this.scriptsCatalog.deleteScript(id));
      if (!ok) {
        this.scriptError = 'Unable to delete selected script.';
        return;
      }
      this.scriptOutput = 'Script deleted.';
      this.selectedScriptId = null;
      await this.refreshScriptLibrary();
    } catch (error: any) {
      console.error('[GameOfLife] Failed to delete script.', { scriptId: id, error });
      this.scriptError = String(error?.message || 'Unable to delete selected script.');
    }
  }

  clearScriptConsole() {
    this.scriptDebugLog = [];
  }

  cancelScriptRun() {
    if (!this.scriptRunning || !this.scriptAbortController) return;
    this.scriptCancelRequested = true;
    this.scriptProgressAction = 'Cancel requested. Waiting for current operation to stop...';
    this.scriptAbortController.abort();
  }

  async runScript() {
    if (this.scriptRunning) return;
    this.scriptError = null;
    this.scriptOutput = '';
    this.scriptCancelRequested = false;
    this.scriptRunning = true;
    this.scriptProgressPercent = 0;
    this.scriptProgressAction = 'Preparing script runtime...';
    this.scriptOperationCount = 0;
    this.scriptElapsedMs = 0;
    const startedAtMs = Date.now();
    const scriptLabel = String(this.scriptName || 'Script').trim() || 'Script';
    this.pushScriptLog(`Run started: ${scriptLabel}`);

    const abortController = new AbortController();
    this.scriptAbortController = abortController;

    try {
      const result = await this.scriptPlayground.runScript(this.scriptCode, {
        model: this.model,
        runtime: this.runtime,
        shapeImport: this.shapeImport,
        getGeneration: () => this.generation,
        maxOperations: this.scriptMaxOperations,
        signal: abortController.signal,
        onProgress: (event: ScriptProgressEvent) => this.applyScriptProgress(event),
        onLog: (line: string) => this.pushScriptLog(line)
      });
      this.runtime.syncIntoRunLoop();
      this.scriptElapsedMs = result.durationMs;
      this.scriptProgressPercent = 100;
      this.scriptProgressAction = 'Script completed.';
      this.scriptOutput = `${result.output}\nGeneration: ${result.generation}\nLive Cells: ${result.liveCellCount}\nOperations: ${result.operationCount}\nDuration: ${result.durationMs} ms`;
      this.pushScriptLog(`Run completed in ${result.durationMs} ms.`);
      this.pushScriptRunHistory({
        startedAt: new Date(startedAtMs).toISOString(),
        name: scriptLabel,
        status: 'ok',
        operationCount: result.operationCount,
        durationMs: result.durationMs,
        summary: `Generation ${result.generation}, ${result.liveCellCount} live cells.`
      });
    } catch (error: any) {
      console.error('[GameOfLife] Script execution failed.', error);
      const message = String(error?.message || 'Script execution failed.');
      const canceled = abortController.signal.aborted || /canceled by user/i.test(message);
      this.scriptError = canceled ? 'Script canceled by user.' : message;
      this.scriptProgressAction = canceled ? 'Script canceled.' : 'Script failed.';
      this.pushScriptLog(canceled ? 'Run canceled by user.' : `Run failed: ${message}`);
      this.pushScriptRunHistory({
        startedAt: new Date(startedAtMs).toISOString(),
        name: scriptLabel,
        status: canceled ? 'canceled' : 'error',
        operationCount: this.scriptOperationCount,
        durationMs: Date.now() - startedAtMs,
        summary: canceled ? 'Canceled by user.' : message
      });
    } finally {
      this.scriptRunning = false;
      this.scriptAbortController = null;
    }
  }

  private applyScriptProgress(event: ScriptProgressEvent) {
    this.scriptOperationCount = Math.max(0, Math.floor(Number(event?.operationCount) || 0));
    this.scriptElapsedMs = Math.max(0, Math.floor(Number(event?.elapsedMs) || 0));
    this.scriptProgressPercent = Math.max(0, Math.min(100, Number(event?.percent) || 0));
    if (event?.action) {
      this.scriptProgressAction = String(event.action);
    }
    if (event?.phase === 'complete') {
      this.scriptProgressPercent = 100;
    }
  }

  private pushScriptLog(line: string) {
    const message = String(line || '').trim();
    if (!message) return;
    const stamped = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.scriptDebugLog = [stamped, ...this.scriptDebugLog].slice(0, 160);
  }

  private pushScriptRunHistory(item: ScriptRunHistoryItem) {
    this.scriptRunHistory = [item, ...this.scriptRunHistory].slice(0, 8);
  }

  openStatisticsDialog() {
    this.showStatisticsDialog = true;
  }

  closeStatisticsDialog() {
    this.showStatisticsDialog = false;
  }

  openAccountDialog() {
    if (!this.auth.isLoggedIn) {
      this.openAuth('login');
      return;
    }
    void this.auth.refreshMe();
    this.showAccountDialog = true;
  }

  closeAccountDialog() {
    this.showAccountDialog = false;
  }

  async openMyShapesDialog() {
    if (!this.auth.isLoggedIn) {
      this.openAuth('login');
      return;
    }
    this.showMyShapesDialog = true;
    await this.refreshMyShapes();
  }

  closeMyShapesDialog() {
    this.showMyShapesDialog = false;
  }

  async refreshMyShapes() {
    this.myShapesLoading = true;
    this.myShapesError = null;
    try {
      const result = await firstValueFrom(this.shapesCatalog.listMyShapes(1, 250));
      this.myShapes = Array.isArray(result?.items) ? result.items : [];
      if (!this.selectedMyShapeId && this.myShapes.length > 0) {
        this.selectedMyShapeId = String(this.myShapes[0].id || '');
      }
    } catch (error: any) {
      console.error('[GameOfLife] Failed to refresh my shapes.', error);
      this.myShapesError = String(error?.message || 'Unable to load your shapes.');
      this.myShapes = [];
    } finally {
      this.myShapesLoading = false;
    }
  }

  selectMyShape(shapeId: string) {
    this.selectedMyShapeId = shapeId;
  }

  useSelectedMyShape() {
    const shape = this.myShapes.find((item) => String(item.id || '') === String(this.selectedMyShapeId || ''));
    if (!shape) return;
    this.selectShape(shape);
    this.addRecentShape(shape);
    this.showCheckpointNotice(`Selected shape "${shape.name}".`, true);
  }

  loadSelectedMyShapeToGrid() {
    const shape = this.myShapes.find((item) => String(item.id || '') === String(this.selectedMyShapeId || ''));
    if (!shape?.cells?.length) return;
    this.runtime.pause();
    this.model.setLiveCells(shape.cells, 0);
    this.runtime.syncNow(true);
    this.showCheckpointNotice(`Loaded "${shape.name}" onto the grid.`, true);
  }

  async toggleSelectedMyShapePublic() {
    const shape = this.myShapes.find((item) => String(item.id || '') === String(this.selectedMyShapeId || ''));
    if (!shape?.id) return;
    const shapeId = String(shape.id);
    const nextPublic = !shape.public;
    try {
      const ok = await firstValueFrom(this.shapesCatalog.setShapePublic(shapeId, nextPublic));
      if (!ok) {
        this.myShapesError = 'Unable to change visibility for this shape.';
        return;
      }
      await this.refreshMyShapes();
    } catch (error: any) {
      console.error('[GameOfLife] Failed to toggle shape visibility.', { shapeId, nextPublic, error });
      this.myShapesError = String(error?.message || 'Unable to change visibility for this shape.');
    }
  }

  async deleteSelectedMyShape() {
    const shape = this.myShapes.find((item) => String(item.id || '') === String(this.selectedMyShapeId || ''));
    if (!shape?.id) return;
    const shapeId = String(shape.id);
    try {
      const ok = await firstValueFrom(this.shapesCatalog.deleteShape(shapeId));
      if (!ok) {
        this.myShapesError = 'Unable to delete selected shape.';
        return;
      }
      this.selectedMyShapeId = null;
      await this.refreshMyShapes();
    } catch (error: any) {
      console.error('[GameOfLife] Failed to delete my shape.', { shapeId, error });
      this.myShapesError = String(error?.message || 'Unable to delete selected shape.');
    }
  }

  openPrivacyPolicyDialog() {
    this.showPrivacyPolicyDialog = true;
  }

  closePrivacyPolicyDialog() {
    this.showPrivacyPolicyDialog = false;
  }

  closeCaptureDialog() {
    this.showCaptureDialog = false;
    this.captureShapeError = null;
  }

  async confirmCaptureShape(saveToCatalog: boolean) {
    this.captureShapeError = null;
    if (!this.capturedShapeCells.length) {
      this.captureShapeError = 'No captured cells to save.';
      return;
    }
    const shape: ShapeItem = {
      name: String(this.captureShapeName || 'Captured Shape').trim(),
      description: String(this.captureShapeDescription || '').trim(),
      cells: this.capturedShapeCells.slice(),
      population: this.capturedShapeCells.length
    };
    if (!shape.name) {
      this.captureShapeError = 'Shape name is required.';
      return;
    }

    try {
      if (saveToCatalog) {
        if (!this.auth.isLoggedIn) {
          this.openAuth('login');
          this.captureShapeError = 'Login is required to save captured shapes.';
          return;
        }
        const saved = await firstValueFrom(this.shapesCatalog.saveShape({
          name: shape.name,
          description: shape.description,
          cells: shape.cells || [],
          public: !!this.captureShapePublic
        }));
        if (saved?.id) shape.id = saved.id;
      }

      this.selectShape(shape);
      this.addRecentShape(shape);
      this.showCaptureDialog = false;
      this.showCheckpointNotice(`Captured shape "${shape.name}" is ready to place.`, true);
    } catch (error: any) {
      console.error('[GameOfLife] Failed to confirm captured shape.', error);
      this.captureShapeError = String(error?.message || 'Unable to save captured shape.');
    }
  }

  logout() {
    this.auth.logout();
    this.closeAccountDialog();
  }

  onCanvasEvent(evt: { type: 'down' | 'move' | 'up'; x: number; y: number }) {
    if (!evt) return;
    if (this.isIphoneMitigation) this.markInteraction();
    if (evt.type === 'down') {
      this.isPointerDown = true;
      this.toolState.start = { x: evt.x, y: evt.y };
      this.toolState.last = { x: evt.x, y: evt.y };
      if (this.selectedTool === 'draw') {
        this.model.setCellAlive(evt.x, evt.y, true);
        this.syncCells();
      } else if (this.selectedTool === 'toggle') {
        this.model.toggleCell(evt.x, evt.y);
        this.syncCells();
      } else if (this.selectedTool === 'shapes' && this.selectedShape?.cells?.length) {
        this.shapeCrosshair = { x: evt.x, y: evt.y, color: 'rgba(90,180,255,0.85)' };
        this.toolPreview = { cells: this.getAnchoredShapeCells(evt.x, evt.y, this.selectedShape.cells), color: 'rgba(124,255,124,0.55)' };
      }
      return;
    }

    if (evt.type === 'move') {
      if (!this.toolState.start) return;
      const sx = this.toolState.start.x;
      const sy = this.toolState.start.y;
      if (this.selectedTool === 'draw') {
        const pts = computeLine(this.toolState.last?.x ?? evt.x, this.toolState.last?.y ?? evt.y, evt.x, evt.y);
        for (const [px, py] of pts) this.model.setCellAlive(px, py, true);
        this.toolState.last = { x: evt.x, y: evt.y };
        this.syncCells();
      } else if (this.selectedTool === 'toggle') {
        const pts = computeLine(this.toolState.last?.x ?? evt.x, this.toolState.last?.y ?? evt.y, evt.x, evt.y);
        for (const [px, py] of pts) this.model.toggleCell(px, py);
        this.toolState.last = { x: evt.x, y: evt.y };
        this.syncCells();
      } else if (this.selectedTool === 'erase') {
        this.toolState.preview = computeRectFill(sx, sy, evt.x, evt.y);
        this.toolPreview = { cells: this.toolState.preview, color: 'rgba(255,0,0,0.2)' };
      } else if (this.selectedTool === 'line') {
        this.toolState.preview = computeLine(sx, sy, evt.x, evt.y);
        this.toolPreview = { cells: this.toolState.preview, color: 'rgba(0,255,0,0.4)' };
      } else if (this.selectedTool === 'rect') {
        this.toolState.preview = computeRectPerimeter(sx, sy, evt.x, evt.y);
        this.toolPreview = { cells: this.toolState.preview, color: 'rgba(255,255,255,0.2)' };
      } else if (this.selectedTool === 'square') {
        this.toolState.preview = computeSquarePerimeter(sx, sy, evt.x, evt.y);
        this.toolPreview = { cells: this.toolState.preview, color: 'rgba(255,255,255,0.2)' };
      } else if (this.selectedTool === 'circle') {
        this.toolState.preview = computeCircleFromBounds(sx, sy, evt.x, evt.y);
        this.toolPreview = { cells: this.toolState.preview, color: 'rgba(0,255,0,0.3)' };
      } else if (this.selectedTool === 'oval') {
        this.toolState.preview = computeOvalFromBounds(sx, sy, evt.x, evt.y);
        this.toolPreview = { cells: this.toolState.preview, color: 'rgba(255,0,0,0.3)' };
      } else if (this.selectedTool === 'randomRect') {
        this.toolState.preview = computeRectFill(sx, sy, evt.x, evt.y);
        this.toolPreview = { cells: this.toolState.preview, color: 'rgba(255,255,255,0.1)' };
      } else if (this.selectedTool === 'capture') {
        this.toolState.preview = computeRectPerimeter(sx, sy, evt.x, evt.y);
        this.toolPreview = { cells: this.toolState.preview, color: 'rgba(0,255,136,0.3)' };
      } else if (this.selectedTool === 'shapes' && this.selectedShape?.cells?.length) {
        this.shapeCrosshair = { x: evt.x, y: evt.y, color: 'rgba(90,180,255,0.85)' };
        this.toolPreview = { cells: this.getAnchoredShapeCells(evt.x, evt.y, this.selectedShape.cells), color: 'rgba(124,255,124,0.55)' };
      }
      return;
    }

    if (evt.type === 'up') {
      this.isPointerDown = false;
      this.shapeCrosshair = null;
      const sx = this.toolState.start?.x ?? evt.x;
      const sy = this.toolState.start?.y ?? evt.y;
      let mutated = this.selectedTool === 'draw' || this.selectedTool === 'toggle';
      if (this.selectedTool === 'erase') {
        const cells = computeRectFill(sx, sy, evt.x, evt.y);
        for (const [px, py] of cells) this.model.setCellAlive(px, py, false);
        this.syncCells();
        mutated = true;
      } else if (this.selectedTool === 'line') {
        const cells = computeLine(sx, sy, evt.x, evt.y);
        for (const [px, py] of cells) this.model.setCellAlive(px, py, true);
        this.syncCells();
        mutated = true;
      } else if (this.selectedTool === 'rect') {
        const cells = computeRectPerimeter(sx, sy, evt.x, evt.y);
        for (const [px, py] of cells) this.model.setCellAlive(px, py, true);
        this.syncCells();
        mutated = true;
      } else if (this.selectedTool === 'square') {
        const cells = computeSquarePerimeter(sx, sy, evt.x, evt.y);
        for (const [px, py] of cells) this.model.setCellAlive(px, py, true);
        this.syncCells();
        mutated = true;
      } else if (this.selectedTool === 'circle') {
        const cells = computeCircleFromBounds(sx, sy, evt.x, evt.y);
        for (const [px, py] of cells) this.model.setCellAlive(px, py, true);
        this.syncCells();
        mutated = true;
      } else if (this.selectedTool === 'oval') {
        const cells = computeOvalFromBounds(sx, sy, evt.x, evt.y);
        for (const [px, py] of cells) this.model.setCellAlive(px, py, true);
        this.syncCells();
        mutated = true;
      } else if (this.selectedTool === 'randomRect') {
        const cells = computeRectFill(sx, sy, evt.x, evt.y);
        const p = Math.max(0, Math.min(1, this.randomRectPercent / 100));
        for (const [px, py] of cells) {
          if (Math.random() < p) this.model.setCellAlive(px, py, true);
        }
        this.syncCells();
        mutated = true;
      } else if (this.selectedTool === 'capture') {
        const captured = this.captureRegion(sx, sy, evt.x, evt.y);
        this.capturedShapeCells = captured;
        if (!captured.length) {
          this.captureShapeError = 'No live cells were found inside the captured region.';
          this.showCaptureDialog = true;
        } else {
          const bounds = computeBounds(captured);
          this.captureShapeError = null;
          this.captureShapeName = `Captured ${bounds.width}x${bounds.height}`;
          this.captureShapeDescription = `Captured ${captured.length} live cells at generation ${this.generation}.`;
          this.captureShapePublic = false;
          this.showCaptureDialog = true;
          this.showCheckpointNotice(`Captured ${captured.length} cells. Name it and choose what to do next.`, true);
        }
      } else if (this.selectedTool === 'shapes' && this.selectedShape?.cells?.length) {
        // Place the shape on mouse up so users can align while dragging.
        this.placeShape(evt.x, evt.y, this.selectedShape.cells);
        this.syncCells();
        mutated = true;
      }
      this.toolState = {};
      this.toolPreview = null;
      if (mutated) {
        this.runtime.syncIntoRunLoop();
      }
    }
  }

  private canHandleGlobalShortcuts() {
    return !this.isModalDialogOpen();
  }

  private getPrimaryCanvasElement() {
    return document.querySelector('app-game-canvas canvas') as HTMLCanvasElement | null;
  }

  private cancelPhotosensitivityProbe() {
    if (this.photoTestTimerId !== null) {
      clearTimeout(this.photoTestTimerId);
      this.photoTestTimerId = null;
    }
    this.reopenPhotosensitivityDialogAfterProbe = false;
  }

  private buildPhotosensitivitySummary(metrics: PhotosensitivityProbeMetrics, measuredFps: number, caps: PerformanceCaps) {
    const comfortableCaps = caps.enableFPSCap && caps.maxFPS <= 3 && caps.enableGPSCap && caps.maxGPS <= 3;
    const severeFlashRisk = metrics.flashRateHz > 3
      || (metrics.peakChangedAreaRatio >= 0.35 && metrics.peakGlobalLumaDelta >= 0.16);
    const moderateFlashRisk = metrics.flashRateHz > 2
      || metrics.peakChangedAreaRatio >= 0.25
      || metrics.peakGlobalLumaDelta >= 0.12;

    let status = 'PASS';
    const findings: string[] = [];
    const guidance: string[] = [];

    if (severeFlashRisk) {
      status = 'FAIL';
      findings.push('Detected rapid high-contrast canvas flashes beyond conservative thresholds.');
      guidance.push('Keep ADA mode on and avoid autoplay for high-motion scenes.');
    } else if (moderateFlashRisk) {
      status = 'WARNING';
      findings.push('Detected moderate flash intensity/frequency; sensitive users may be affected.');
    } else {
      findings.push('No strong flash-risk signature detected during this sample window.');
    }

    if (!comfortableCaps) {
      if (status === 'PASS') status = 'WARNING';
      guidance.push('Enable FPS/GPS caps at 3 or lower for safer playback limits.');
    }
    if (this.adaCompliance) {
      guidance.push('ADA mode active: autoplay is limited by conservative FPS/GPS safety caps.');
    }
    if (!guidance.length) {
      guidance.push('Continue manual review with real patterns and user testing.');
    }

    const lines = [
      `Result: ${status}`,
      `Frames sampled: ${metrics.frameCount} in ${(metrics.elapsedMs / 1000).toFixed(1)}s (~${measuredFps} FPS).`,
      `Estimated flash events: ${metrics.flashEvents} (${metrics.flashRateHz.toFixed(2)} / sec).`,
      `Peak changed area: ${(metrics.peakChangedAreaRatio * 100).toFixed(1)}%.`,
      `Peak global luminance delta: ${(metrics.peakGlobalLumaDelta * 100).toFixed(1)}%.`,
      ...findings.map((entry) => `Finding: ${entry}`),
      ...guidance.map((entry) => `Guidance: ${entry}`),
      'Note: heuristic safety probe only. This is not a medical diagnostic.'
    ];
    return lines.join('\n');
  }

  private closeTopmostDialog() {
    if (this.showCaptureDialog) {
      this.closeCaptureDialog();
      return true;
    }
    if (this.showPrivacyPolicyDialog) {
      this.closePrivacyPolicyDialog();
      return true;
    }
    if (this.showMyShapesDialog) {
      this.closeMyShapesDialog();
      return true;
    }
    if (this.showAccountDialog) {
      this.closeAccountDialog();
      return true;
    }
    if (this.showStatisticsDialog) {
      this.closeStatisticsDialog();
      return true;
    }
    if (this.showScriptDialog) {
      this.closeScriptPlayground();
      return true;
    }
    if (this.showPhotosensitivityDialog) {
      this.closePhotosensitivityTest();
      return true;
    }
    if (this.showAboutDialog) {
      this.closeAboutDialog();
      return true;
    }
    if (this.showHelpDialog) {
      this.closeHelpDialog();
      return true;
    }
    if (this.showImportShapeDialog) {
      this.closeImportShapeDialog();
      return true;
    }
    if (this.showFirstLoadWarning) {
      this.closeFirstLoadWarning();
      return true;
    }
    if (this.showStableDialog) {
      this.handleKeepPaused();
      return true;
    }
    if (this.showDuplicateDialog) {
      this.closeDuplicateDialog();
      return true;
    }
    if (this.showLoadDialog) {
      this.closeLoadDialog();
      return true;
    }
    if (this.showSaveDialog) {
      this.closeSaveDialog();
      return true;
    }
    return false;
  }

  private isModalDialogOpen() {
    return this.showSaveDialog
      || this.showLoadDialog
      || this.showImportShapeDialog
      || this.showHelpDialog
      || this.showAboutDialog
      || this.showPhotosensitivityDialog
      || this.showScriptDialog
      || this.showStatisticsDialog
      || this.showAccountDialog
      || this.showMyShapesDialog
      || this.showPrivacyPolicyDialog
      || this.showCaptureDialog
      || this.showDuplicateDialog
      || this.showStableDialog
      || this.showFirstLoadWarning;
  }

  private detectClientPlatform(): ClientPlatform {
    if (typeof navigator === 'undefined') return 'desktop';
    const ua = String(navigator.userAgent || '').toLowerCase();
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    const coarsePointer = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches);
    const narrowViewport = typeof window !== 'undefined'
      && Math.min(Number(window.innerWidth || 0), Number(window.innerHeight || 0)) <= 1024;

    if (/\biphone\b|\bipod\b/.test(ua)) {
      return 'iphone';
    }
    if (/\bandroid\b/.test(ua)) {
      return 'android';
    }
    // iPadOS may report as Macintosh while still being touch-driven.
    if ((/\bmacintosh\b/.test(ua) && touchPoints > 1) || /\bmobile\b|\bwindows phone\b/.test(ua)) {
      return 'mobile';
    }
    if (touchPoints > 1 && coarsePointer && narrowViewport) {
      return 'mobile';
    }
    return 'desktop';
  }

  private exposeClientPlatform() {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-gol-platform', this.clientPlatform);
      if (document.body) {
        document.body.setAttribute('data-gol-platform', this.clientPlatform);
      }
    }
    if (typeof window !== 'undefined') {
      (window as Window & { __golClientPlatform?: string }).__golClientPlatform = this.clientPlatform;
    }
  }

  private updateViewportMode() {
    if (typeof window === 'undefined') return;
    this.isCompactViewport = window.matchMedia('(max-width: 900px)').matches;
  }

  private applyIphoneCanvasDefaults() {
    // Keep color scheme centralized in SimulationColorSchemeService.
    // iPhone mitigation should not override selected/ADA-enforced palettes.
  }

  private startIphoneMitigationTimers() {
    this.shiftIntervalId = setInterval(() => {
      this.shiftPathIndex = (this.shiftPathIndex + 1) % this.iphoneShiftPath.length;
      const [x, y] = this.iphoneShiftPath[this.shiftPathIndex];
      this.canvasShiftX = x;
      this.canvasShiftY = y;
    }, this.shiftIntervalMs);
  }

  private stopIphoneMitigationTimers() {
    if (this.shiftIntervalId) {
      clearInterval(this.shiftIntervalId);
      this.shiftIntervalId = null;
    }
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
  }

  private logUi(event: string, detail: Record<string, unknown> = {}) {
    if (!this.uiDebugLogsEnabled) return;
    console.info(`[GOL UI] ${event}`, {
      ts: new Date().toISOString(),
      ...detail
    });
  }

  private showCheckpointNotice(message: string, success: boolean) {
    this.checkpointNoticeText = String(message || '').trim();
    this.checkpointNoticeSuccess = !!success;
    this.clearCheckpointNoticeTimer();
    this.checkpointNoticeTimeoutId = setTimeout(() => {
      this.checkpointNoticeTimeoutId = null;
      this.checkpointNoticeText = '';
    }, 4500);
  }

  private clearCheckpointNoticeTimer() {
    if (!this.checkpointNoticeTimeoutId) return;
    clearTimeout(this.checkpointNoticeTimeoutId);
    this.checkpointNoticeTimeoutId = null;
  }

  private updateHashlifeLeapProgress() {
    if (this.hashlifeLeapTarget === null) return;
    const remaining = this.hashlifeLeapTarget - this.generation;

    if (remaining <= 0) {
      this.runtime.pause();
      const reached = this.hashlifeLeapTarget;
      this.hashlifeLeapTarget = null;
      this.hashlifeLeapEtaSeconds = null;
      this.showCheckpointNotice(`Reached G${this.formatGeneration(reached)}.`, true);
      this.logUi('hashlife.leap.complete', {
        generation: this.generation,
        target: reached
      });
      return;
    }

    if (this.hashlifeThroughputGps > 0) {
      this.hashlifeLeapEtaSeconds = Math.ceil(remaining / this.hashlifeThroughputGps);
    } else {
      this.hashlifeLeapEtaSeconds = null;
    }
  }

  private syncHashlifePresetFromState() {
    const exact = this.hashlifePresets.find(
      preset => preset.runMode === this.hashlifeRunMode && preset.exponent === this.hashlifeSkipExponent
    );
    if (exact) {
      this.hashlifePresetId = exact.id;
      return;
    }

    if (this.hashlifeRunMode === 'warp' || this.hashlifeSkipExponent >= 10) {
      this.hashlifePresetId = 'fast_forward';
      return;
    }
    if (this.hashlifeRunMode === 'explore' || this.hashlifeSkipExponent <= 5) {
      this.hashlifePresetId = 'inspect';
      return;
    }
    this.hashlifePresetId = 'balanced';
  }

  private getHashlifePresetById(presetId: HashlifePresetId | string) {
    const normalized = String(presetId || '').trim();
    return this.hashlifePresets.find(preset => preset.id === normalized) || this.hashlifePresets[1];
  }

  private parseGenerationInput(value: string) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/,/g, '');
    const match = normalized.match(/^(\d+(?:\.\d+)?)([KMB])?$/);
    if (!match) return null;

    const base = Number(match[1]);
    if (!Number.isFinite(base) || base <= 0) return null;

    const suffix = match[2] || '';
    const multiplier = suffix === 'K'
      ? 1_000
      : suffix === 'M'
        ? 1_000_000
        : suffix === 'B'
          ? 1_000_000_000
          : 1;
    return Math.floor(base * multiplier);
  }

  private centerPattern(cells: { x: number; y: number }[], centerX: number, centerY: number) {
    if (!Array.isArray(cells) || cells.length === 0) return [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cell of cells) {
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x);
      minY = Math.min(minY, cell.y);
      maxY = Math.max(maxY, cell.y);
    }
    const offsetX = centerX - Math.floor((minX + maxX) / 2);
    const offsetY = centerY - Math.floor((minY + maxY) / 2);
    return cells.map(cell => ({ x: cell.x + offsetX, y: cell.y + offsetY }));
  }

  private markInteraction() {
    this.idleDimmed = false;
    if (this.idleTimeoutId) clearTimeout(this.idleTimeoutId);
    this.idleTimeoutId = setTimeout(() => {
      this.idleDimmed = true;
    }, this.idleDimDelayMs);
  }

  private placeShape(x: number, y: number, cells: { x: number; y: number }[]) {
    if (!cells) return;
    const anchored = this.getAnchoredShapeCells(x, y, cells);
    for (const [px, py] of anchored) {
      this.model.setCellAlive(px, py, true);
    }
  }

  private captureRegion(x0: number, y0: number, x1: number, y1: number) {
    const xMin = Math.min(x0, x1);
    const xMax = Math.max(x0, x1);
    const yMin = Math.min(y0, y1);
    const yMax = Math.max(y0, y1);
    const out: { x: number; y: number }[] = [];
    const live = Array.isArray(this.liveCells) ? this.liveCells : [];
    for (const cell of live) {
      const x = Math.floor(Number(cell?.x));
      const y = Math.floor(Number(cell?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < xMin || x > xMax || y < yMin || y > yMax) continue;
      out.push({ x: x - xMin, y: y - yMin });
    }
    return out;
  }

  private syncCells() {
    this.liveCells = this.model.getLiveCells();
    this.refreshOverlay();
  }

  private getAnchoredShapeCells(anchorX: number, anchorY: number, cells: { x: number; y: number }[]): [number, number][] {
    if (!cells?.length) return [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of cells) {
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x);
      minY = Math.min(minY, cell.y);
      maxY = Math.max(maxY, cell.y);
    }
    const centerX = Math.floor((minX + maxX) / 2);
    const centerY = Math.floor((minY + maxY) / 2);
    return cells.map(cell => [anchorX + (cell.x - centerX), anchorY + (cell.y - centerY)] as [number, number]);
  }

  private loadRecentShapes() {
    try {
      const raw = localStorage.getItem(this.recentsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.recentShapes = parsed.filter(Boolean).slice(0, 12);
      }
    } catch (error) {
      console.error('[GameOfLife] Failed to load recent shapes from storage.', error);
    }
  }

  private persistRecentShapes() {
    try {
      localStorage.setItem(this.recentsStorageKey, JSON.stringify(this.recentShapes.slice(0, 12)));
    } catch (error) {
      console.error('[GameOfLife] Failed to persist recent shapes to storage.', error);
    }
  }

  private addRecentShape(shape: ShapeItem) {
    if (!shape) return;
    const key = shape.id || shape.name;
    const exists = this.recentShapes.some(s => (s.id || s.name) === key);
    if (exists) return;
    this.recentShapes = [shape, ...this.recentShapes].slice(0, 12);
    this.persistRecentShapes();
  }

  get statusShape() {
    return this.selectedShape;
  }

  get statusShapeLabel() {
    if (!this.selectedShape) return '';
    return this.selectedShape.name || 'Shape';
  }

  get statusShapeMeta() {
    if (!this.selectedShape) return '';
    const cells = this.selectedShape.cells || [];
    const count = cells.length ? `C${cells.length}` : '';
    const size = cells.length ? this.getShapeSizeLabel(cells) : '';
    return [count, size].filter(Boolean).join(' ');
  }

  private ensureSelectedShapeHydrated() {
    const shape = this.selectedShape;
    if (!shape?.id) return;
    if (shape.cells?.length) return;

    try {
      this.shapeHydrationSub?.unsubscribe();
    } catch (error) {
      console.error('[GameOfLife] Failed to unsubscribe shape hydration stream.', error);
    }
    this.shapeHydrationSub = this.shapesCatalog.fetchShapeById(String(shape.id)).subscribe((hydrated) => {
      if (this.selectedShape?.id !== shape.id) return;
      this.selectedShape = hydrated;
    });
    this.subscriptions.add(this.shapeHydrationSub);
  }

  private getShapeSizeLabel(cells: { x: number; y: number }[]) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of cells) {
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x);
      minY = Math.min(minY, cell.y);
      maxY = Math.max(maxY, cell.y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return '';
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    return `${width}x${height}`;
  }

  private getDonateUrl() {
    const apiBase = this.auth.getBackendApiBase();
    if (apiBase.endsWith('/api')) {
      return `${apiBase.slice(0, -4)}/donate`;
    }
    return `${apiBase.replace(/\/+$/, '')}/donate`;
  }
}

function computeLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

function computeRectPerimeter(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  const pts: [number, number][] = [];
  for (let x = xMin; x <= xMax; x++) {
    pts.push([x, yMin]);
    if (yMax !== yMin) pts.push([x, yMax]);
  }
  for (let y = yMin + 1; y <= yMax - 1; y++) {
    pts.push([xMin, y]);
    if (xMax !== xMin) pts.push([xMax, y]);
  }
  return pts;
}

function computeSquarePerimeter(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const size = Math.max(dx, dy);
  const xDir = x1 >= x0 ? 1 : -1;
  const yDir = y1 >= y0 ? 1 : -1;
  const xMax = x0 + size * xDir;
  const yMax = y0 + size * yDir;
  return computeRectPerimeter(x0, y0, xMax, yMax);
}

function computeRectFill(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  const pts: [number, number][] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      pts.push([x, y]);
    }
  }
  return pts;
}

function computeBounds(cells: { x: number; y: number }[]) {
  if (!Array.isArray(cells) || cells.length === 0) {
    return { width: 0, height: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, Number(cell?.x));
    maxX = Math.max(maxX, Number(cell?.x));
    minY = Math.min(minY, Number(cell?.y));
    maxY = Math.max(maxY, Number(cell?.y));
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { width: 0, height: 0 };
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

function computeCircleFromBounds(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  const width = xMax - xMin;
  const height = yMax - yMin;
  const diameter = Math.min(width, height);
  const r = Math.max(1, Math.floor(diameter / 2));
  const cx = Math.floor(xMin + width / 2);
  const cy = Math.floor(yMin + height / 2);
  return computeCircle(cx, cy, r);
}

function computeCircle(cx: number, cy: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  if (r <= 0) return pts;
  let x = r;
  let y = 0;
  let dx = 1 - (r << 1);
  let dy = 1;
  let err = 0;
  const addOctants = (px: number, py: number) => {
    pts.push([cx + px, cy + py], [cx + py, cy + px], [cx - py, cy + px], [cx - px, cy + py],
             [cx - px, cy - py], [cx - py, cy - px], [cx + py, cy - px], [cx + px, cy - py]);
  };
  while (x >= y) {
    addOctants(x, y);
    y++;
    err += dy;
    dy += 2;
    if ((err << 1) + dx > 0) {
      x--;
      err += dx;
      dx += 2;
    }
  }
  const seen = new Set<string>();
  const unique: [number, number][] = [];
  for (const p of pts) {
    const key = `${p[0]},${p[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}

function computeOvalFromBounds(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  const rx = Math.max(1, Math.floor((xMax - xMin) / 2));
  const ry = Math.max(1, Math.floor((yMax - yMin) / 2));
  const cx = xMin + rx;
  const cy = yMin + ry;
  const pts: [number, number][] = [];
  const plot4 = (px: number, py: number) => {
    pts.push([cx + px, cy + py], [cx - px, cy + py], [cx + px, cy - py], [cx - px, cy - py]);
  };
  let x = 0;
  let y = ry;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  let d1 = ry2 - rx2 * ry + 0.25 * rx2;
  while (2 * ry2 * x <= 2 * rx2 * y) {
    plot4(x, y);
    if (d1 < 0) {
      x += 1;
      d1 += 2 * ry2 * x + ry2;
    } else {
      x += 1;
      y -= 1;
      d1 += 2 * ry2 * x - 2 * rx2 * y + ry2;
    }
  }
  let d2 = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y >= 0) {
    plot4(x, y);
    if (d2 > 0) {
      y -= 1;
      d2 += -2 * rx2 * y + rx2;
    } else {
      x += 1;
      y -= 1;
      d2 += 2 * ry2 * x - 2 * rx2 * y + rx2;
    }
  }
  const seen = new Set<string>();
  const unique: [number, number][] = [];
  for (const p of pts) {
    const key = `${p[0]},${p[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}
