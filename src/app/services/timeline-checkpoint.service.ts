import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Cell } from '../model/game-model.service';

export interface TimelineCheckpoint {
  id: number;
  generation: number;
  liveCount: number;
  createdAtMs: number;
  cells: Cell[];
}

@Injectable({ providedIn: 'root' })
export class TimelineCheckpointService {
  private readonly maxCheckpoints = 12;
  private readonly minGenerationGap = 64;

  private nextCheckpointId = 1;
  private checkpointsSubject = new BehaviorSubject<TimelineCheckpoint[]>([]);
  readonly checkpoints$ = this.checkpointsSubject.asObservable();

  addCheckpoint(generation: number, cells: Cell[]) {
    const normalizedGeneration = Math.max(0, Math.floor(Number(generation) || 0));
    const normalizedCells = Array.isArray(cells) ? cells : [];
    const current = this.checkpointsSubject.value;
    const last = current[0];

    if (last && Math.abs(normalizedGeneration - last.generation) < this.minGenerationGap) {
      return;
    }

    const next: TimelineCheckpoint = {
      id: this.nextCheckpointId++,
      generation: normalizedGeneration,
      liveCount: normalizedCells.length,
      createdAtMs: Date.now(),
      // Keep immutable snapshot for reliable rewind.
      cells: normalizedCells.map(cell => ({ x: cell.x, y: cell.y }))
    };

    this.checkpointsSubject.next([next, ...current].slice(0, this.maxCheckpoints));
  }

  restoreCheckpoint(id: number) {
    const targetId = Math.floor(Number(id) || 0);
    return this.checkpointsSubject.value.find(checkpoint => checkpoint.id === targetId) || null;
  }

  clear() {
    this.checkpointsSubject.next([]);
  }
}
