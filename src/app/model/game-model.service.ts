import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Cell {
  x: number;
  y: number;
}

export type EngineMode = 'normal' | 'hashlife';

@Injectable({ providedIn: 'root' })
export class GameModelService {
  // The grid is represented as a Set of string keys ("x,y") for performance and easy lookup
  private liveCells = new Set<string>();
  private generationSubject = new BehaviorSubject<number>(0);
  generation$ = this.generationSubject.asObservable();
  private engineModeSubject = new BehaviorSubject<EngineMode>('normal');
  engineMode$ = this.engineModeSubject.asObservable();
  private generationBatchSizeSubject = new BehaviorSubject<number>(16);
  generationBatchSize$ = this.generationBatchSizeSubject.asObservable();

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
  // Add chunked/region operations for performance as needed
}
