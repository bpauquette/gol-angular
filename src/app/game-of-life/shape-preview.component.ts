import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';

export interface ShapeCell {
  x: number;
  y: number;
}

@Component({
  selector: 'app-shape-preview',
  template: `<canvas #preview [attr.width]="width" [attr.height]="height" [style.width.px]="width" [style.height.px]="height" class="preview-canvas"></canvas>`,
  styleUrls: ['./shape-preview.component.css']
})
export class ShapePreviewComponent implements AfterViewInit, OnChanges {
  @Input() cells: ShapeCell[] = [];
  @Input() cellColor = '#7CFF7C';
  @Input() width = 84;
  @Input() height = 52;
  @ViewChild('preview', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  ngAfterViewInit(): void {
    this.draw();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cells'] || changes['width'] || changes['height']) {
      this.draw();
    }
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#08162b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.cells || this.cells.length === 0) return;

    const bounds = this.getBounds(this.cells);
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;

    const padding = 4;
    const cellSize = Math.max(2, Math.floor(Math.min(
      (canvas.width - padding * 2) / width,
      (canvas.height - padding * 2) / height
    )));

    const offsetX = Math.floor((canvas.width - width * cellSize) / 2) - bounds.minX * cellSize;
    const offsetY = Math.floor((canvas.height - height * cellSize) / 2) - bounds.minY * cellSize;

    ctx.fillStyle = this.cellColor;
    for (const cell of this.cells) {
      ctx.fillRect(offsetX + cell.x * cellSize, offsetY + cell.y * cellSize, cellSize, cellSize);
    }
  }

  private getBounds(cells: ShapeCell[]) {
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
    return { minX, maxX, minY, maxY };
  }
}
