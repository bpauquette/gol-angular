import { Injectable } from '@angular/core';

export interface ToolOverlay {
  drawOverlay(ctx: CanvasRenderingContext2D): void;
}

@Injectable({ providedIn: 'root' })
export class ToolsService {
  // Example: Draw tool overlay
  getDrawToolOverlay(cells: { x: number; y: number }[]): ToolOverlay {
    return {
      drawOverlay(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.strokeStyle = '#1976d2';
        ctx.lineWidth = 2;
        for (const cell of cells) {
          ctx.strokeRect(cell.x * 8, cell.y * 8, 8, 8);
        }
        ctx.restore();
      }
    };
  }

  // Add other tool overlays as needed
}
