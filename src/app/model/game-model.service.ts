import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Subscription } from 'rxjs';
import { AdaComplianceService } from '../services/ada-compliance.service';

export interface Cell {
  x: number;
  y: number;
}

export type EngineMode = 'normal' | 'hashlife';
export type SimulationColorSchemeId =
  | 'biolife'
  | 'neonCircuit'
  | 'emberField'
  | 'retroVector'
  | 'aurora'
  | 'adaSafe';

const ADA_SAFE_SCHEME_ID: SimulationColorSchemeId = 'adaSafe';
const DEFAULT_SCHEME_ID: SimulationColorSchemeId = 'biolife';
const STORAGE_KEY = 'gol.simulationColorScheme';
const PREVIOUS_STORAGE_KEY = 'gol.simulationColorScheme.previousNonAda';
const ALLOWED_SCHEMES: ReadonlySet<SimulationColorSchemeId> = new Set<SimulationColorSchemeId>([
  'biolife',
  'neonCircuit',
  'emberField',
  'retroVector',
  'aurora',
  'adaSafe'
]);

@Injectable({ providedIn: 'root' })
export class GameModelService implements OnDestroy {
  // The grid is represented as a Set of string keys ("x,y") for performance and easy lookup
  private liveCells = new Set<string>();
  private generationSubject = new BehaviorSubject<number>(0);
  generation$ = this.generationSubject.asObservable();
  private engineModeSubject = new BehaviorSubject<EngineMode>('normal');
  engineMode$ = this.engineModeSubject.asObservable();
  private generationBatchSizeSubject = new BehaviorSubject<number>(16);
  generationBatchSize$ = this.generationBatchSizeSubject.asObservable();
  private simulationColorSchemeIdSubject = new BehaviorSubject<SimulationColorSchemeId>(this.readInitialSimulationColorScheme());
  simulationColorSchemeId$ = this.simulationColorSchemeIdSubject.asObservable();
  private readonly subscriptions = new Subscription();
  private adaComplianceEnabled = false;

  constructor(private adaService: AdaComplianceService) {
    this.subscriptions.add(
      this.adaService.adaCompliance$.subscribe(enabled => {
        this.adaComplianceEnabled = !!enabled;
        this.enforceAdaSimulationColorScheme();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // Chunked state and region operations can be added for performance

  getLiveCells(): Cell[] {
    return Array.from(this.liveCells).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
  }

  setLiveCells(cells: Cell[], generation: number = 0) {
    this.liveCells.clear();
    for (const cell of cells) {
      this.liveCells.add(`${cell.x},${cell.y}`);
    }
    this.generationSubject.next(Math.max(0, Math.floor(Number(generation) || 0)));
  }

  setGeneration(generation: number) {
    this.generationSubject.next(Math.max(0, Math.floor(Number(generation) || 0)));
  }

  setEngineMode(mode: EngineMode | string) {
    const normalized: EngineMode = mode === 'hashlife' ? 'hashlife' : 'normal';
    this.engineModeSubject.next(normalized);
  }

  getEngineMode() {
    return this.engineModeSubject.value;
  }

  setGenerationBatchSize(value: number) {
    const next = Math.max(1, Math.min(4096, Math.floor(Number(value) || 1)));
    this.generationBatchSizeSubject.next(next);
  }

  getGenerationBatchSize() {
    return this.generationBatchSizeSubject.value;
  }

  step(generations: number = 1) {
    const steps = Math.max(1, Math.floor(Number(generations) || 1));
    for (let i = 0; i < steps; i++) {
      this.stepOneGeneration();
    }
    this.generationSubject.next(this.generationSubject.value + steps);
  }

  stepByEngine() {
    const steps = this.engineModeSubject.value === 'hashlife'
      ? this.generationBatchSizeSubject.value
      : 1;
    this.step(steps);
    return steps;
  }

  private stepOneGeneration() {
    // Conway's Game of Life single-generation step
    const neighborCounts = new Map<string, number>();
    for (const key of this.liveCells) {
      const [x, y] = key.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nKey = `${x + dx},${y + dy}`;
          neighborCounts.set(nKey, (neighborCounts.get(nKey) || 0) + 1);
        }
      }
    }
    const newLiveCells = new Set<string>();
    for (const [key, count] of neighborCounts.entries()) {
      if (count === 3 || (count === 2 && this.liveCells.has(key))) {
        newLiveCells.add(key);
      }
    }
    this.liveCells = newLiveCells;
  }

  clear() {
    this.liveCells.clear();
    this.generationSubject.next(0);
  }


  setCellAlive(x: number, y: number, alive: boolean) {
    const key = `${x},${y}`;
    if (alive) {
      this.liveCells.add(key);
    } else {
      this.liveCells.delete(key);
    }
  }

  toggleCell(x: number, y: number) {
    const key = `${x},${y}`;
    if (this.liveCells.has(key)) {
      this.liveCells.delete(key);
    } else {
      this.liveCells.add(key);
    }
  }

  isCellAlive(x: number, y: number) {
    return this.liveCells.has(`${x},${y}`);
  }

  setSimulationColorScheme(id: SimulationColorSchemeId | string) {
    const normalized = this.normalizeSimulationColorScheme(id);
    if (!normalized) {
      console.error('[GameModel] Rejected invalid simulation color scheme id.', { requested: id });
      return;
    }

    if (this.adaComplianceEnabled && normalized !== ADA_SAFE_SCHEME_ID) {
      console.info('[GameModel] ADA mode active; forcing ADA Safe simulation color scheme.', {
        requested: normalized
      });
      this.applySimulationColorScheme(ADA_SAFE_SCHEME_ID, true);
      return;
    }

    this.applySimulationColorScheme(normalized, true);
  }

  getSimulationColorScheme() {
    return this.simulationColorSchemeIdSubject.value;
  }

  private enforceAdaSimulationColorScheme() {
    if (this.adaComplianceEnabled) {
      const current = this.simulationColorSchemeIdSubject.value;
      if (current !== ADA_SAFE_SCHEME_ID) {
        this.writePreviousNonAdaScheme(current);
      }
      this.applySimulationColorScheme(ADA_SAFE_SCHEME_ID, true);
      return;
    }

    if (this.simulationColorSchemeIdSubject.value !== ADA_SAFE_SCHEME_ID) return;
    const previous = this.readPreviousNonAdaScheme();
    this.applySimulationColorScheme(previous || DEFAULT_SCHEME_ID, true);
  }

  private applySimulationColorScheme(id: SimulationColorSchemeId, persist: boolean) {
    this.simulationColorSchemeIdSubject.next(id);
    if (id !== ADA_SAFE_SCHEME_ID) {
      this.writePreviousNonAdaScheme(id);
    }
    if (persist) {
      this.writeScheme(id);
    }
  }

  private normalizeSimulationColorScheme(id: SimulationColorSchemeId | string | null | undefined): SimulationColorSchemeId | null {
    const value = String(id || '').trim();
    if (!value) return null;
    if (!ALLOWED_SCHEMES.has(value as SimulationColorSchemeId)) return null;
    return value as SimulationColorSchemeId;
  }

  private readInitialSimulationColorScheme(): SimulationColorSchemeId {
    try {
      const stored = this.normalizeSimulationColorScheme(localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch (error) {
      console.error('[GameModel] Failed to read simulation color scheme from storage.', error);
    }
    return DEFAULT_SCHEME_ID;
  }

  private readPreviousNonAdaScheme(): SimulationColorSchemeId | null {
    try {
      const stored = this.normalizeSimulationColorScheme(localStorage.getItem(PREVIOUS_STORAGE_KEY));
      if (stored && stored !== ADA_SAFE_SCHEME_ID) return stored;
    } catch (error) {
      console.error('[GameModel] Failed to read previous non-ADA simulation scheme.', error);
    }
    return null;
  }

  private writeScheme(id: SimulationColorSchemeId) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch (error) {
      console.error('[GameModel] Failed to persist simulation color scheme.', { id, error });
    }
  }

  private writePreviousNonAdaScheme(id: SimulationColorSchemeId) {
    if (id === ADA_SAFE_SCHEME_ID) return;
    try {
      localStorage.setItem(PREVIOUS_STORAGE_KEY, id);
    } catch (error) {
      console.error('[GameModel] Failed to persist previous non-ADA simulation scheme.', { id, error });
    }
  }
  // Add chunked/region operations for performance as needed
}
