import { Component, OnDestroy, OnInit } from '@angular/core';
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

type ToolName = 'draw' | 'erase' | 'line' | 'rect' | 'square' | 'circle' | 'oval' | 'randomRect' | 'capture' | 'shapes' | 'toggle';

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
  hashlifeAdvancedSinceRender = 0;
  hashlifeWorkerElapsedMs = 0;
  hashlifeWorkerUsed = true;
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

  constructor(
    private tools: ToolsService,
    private runtime: GameRuntimeService,
    private model: GameModelService,
    private dialog: MatDialog,
    private auth: AuthService,
    private shapesCatalog: ShapeCatalogService,
    private gridsCatalog: GridCatalogService
  ) {}

  ngOnInit() {
    this.isIphoneMitigation = this.detectIphone();
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

    this.loadRecentShapes();
    this.subscriptions.add(this.runtime.liveCells$.subscribe(cells => {
      this.liveCells = cells;
      this.refreshOverlay();
    }));
    this.subscriptions.add(this.runtime.generation$.subscribe(gen => this.generation = gen));
    this.subscriptions.add(this.runtime.engineMode$.subscribe(mode => this.engineMode = mode));
    this.subscriptions.add(this.runtime.generationBatchSize$.subscribe(size => this.generationBatchSize = size));
    this.subscriptions.add(this.runtime.hashlifeRunMode$.subscribe(mode => this.hashlifeRunMode = mode));
    this.subscriptions.add(this.runtime.hashlifeSkipExponent$.subscribe(exponent => this.hashlifeSkipExponent = exponent));
    this.subscriptions.add(this.runtime.hashlifeTelemetry$.subscribe(telemetry => {
      this.hashlifeAdvancedSinceRender = telemetry.advancedSinceRender;
      this.hashlifeWorkerElapsedMs = telemetry.workerElapsedMs;
      this.hashlifeWorkerUsed = telemetry.workerUsed;
    }));
    this.subscriptions.add(this.runtime.checkpoints$.subscribe(checkpoints => {
      this.checkpoints = Array.isArray(checkpoints) ? checkpoints.slice(0, 6) : [];
    }));
    this.subscriptions.add(this.runtime.popHistory$.subscribe(hist => this.popHistory = Array.isArray(hist) ? hist : []));
    this.subscriptions.add(this.runtime.maxChartGenerations$.subscribe(val => this.maxChartGenerations = Number(val) || 5000));
    this.subscriptions.add(this.runtime.isRunning$.subscribe(val => this.isRunning = val));
    this.subscriptions.add(this.runtime.adaCompliance$.subscribe(val => this.adaCompliance = val));
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

    this.subscriptions.add(this.auth.token$.subscribe(token => this.isLoggedIn = !!token));
    this.subscriptions.add(this.auth.email$.subscribe(email => this.authEmail = email));
  }

  ngOnDestroy() {
    this.runtime.pause();
    this.stopIphoneMitigationTimers();
    this.clearCheckpointNoticeTimer();
    this.subscriptions.unsubscribe();
  }

  toggleRun() {
    this.runtime.toggleRun();
  }

  step() {
    this.runtime.step();
  }

  onEngineModeChange(mode: EngineMode | string) {
    const normalized: EngineMode = mode === 'hashlife' ? 'hashlife' : 'normal';
    this.logUi('engine.select', {
      from: this.engineMode,
      to: normalized,
      running: this.isRunning,
      generation: this.generation
    });
    if (this.engineMode === normalized) return;
    this.engineMode = normalized;
    this.runtime.setEngineMode(normalized);
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
  }

  adjustHashlifeSkipExponent(delta: number) {
    const next = Math.max(0, Math.min(15, this.hashlifeSkipExponent + Math.sign(delta || 0)));
    this.onHashlifeSkipExponentChange(next);
  }

  restoreCheckpoint(id: number) {
    const checkpoint = this.checkpoints.find(item => item.id === id) || null;
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

  clear() {
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
      this.grids = [];
      this.gridsError = this.toUserError(err, 'Failed to load saved grids.');
    } finally {
      this.gridsLoading = false;
    }
  }

  private resumeIfNeeded() {
    if (!this.wasRunningBeforeGridDialog) return;
    if (this.adaCompliance) return;
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

  logout() {
    this.auth.logout();
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
        // TODO: wire capture dialog; for now just clear preview
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

  private detectIphone() {
    const ua = navigator.userAgent || '';
    return /iPhone|iPod/i.test(ua);
  }

  private applyIphoneCanvasDefaults() {
    // Slightly softer palette for smaller OLED surfaces during long sessions.
    this.canvasCellColor = '#5FCF93';
    this.canvasBackgroundColor = '#0A1A2A';
    this.canvasBorderColor = '#2A3E52';
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
    } catch {
      // ignore parse errors
    }
  }

  private persistRecentShapes() {
    try {
      localStorage.setItem(this.recentsStorageKey, JSON.stringify(this.recentShapes.slice(0, 12)));
    } catch {
      // ignore storage errors
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

    try { this.shapeHydrationSub?.unsubscribe(); } catch { /* ignore */ }
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
