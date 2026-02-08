import { Injectable } from '@angular/core';

// Chunk size for region operations
const CHUNK_SIZE = 64;

@Injectable({ providedIn: 'root' })
export class ChunkedGameStateService {
  // Map chunk coordinates to sets of cell keys
  private chunks = new Map<string, Set<string>>();

  addCell(x: number, y: number) {
    const chunkKey = this.getChunkKey(x, y);
    if (!this.chunks.has(chunkKey)) {
      this.chunks.set(chunkKey, new Set());
    }
    this.chunks.get(chunkKey)!.add(`${x},${y}`);
  }

  removeCell(x: number, y: number) {
    const chunkKey = this.getChunkKey(x, y);
    const chunk = this.chunks.get(chunkKey);
    if (chunk) {
      chunk.delete(`${x},${y}`);
      if (chunk.size === 0) {
        this.chunks.delete(chunkKey);
      }
    }
  }

  getLiveCells(): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    for (const chunk of this.chunks.values()) {
      for (const key of chunk) {
        const [x, y] = key.split(',').map(Number);
        cells.push({ x, y });
      }
    }
    return cells;
  }

  getChunkKey(x: number, y: number): string {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    return `${cx},${cy}`;
  }

  clear() {
    this.chunks.clear();
  }

  // Add region operations as needed for performance
}
