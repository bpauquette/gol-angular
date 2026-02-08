import { ChangeDetectionStrategy, Component, Input, OnChanges, ElementRef, ViewChild, AfterViewInit, HostListener, Output, EventEmitter } from '@angular/core';
import { ToolsService, ToolOverlay } from '../model/tools.service';

@Component({
  selector: 'app-game-canvas',
  template: `
    <canvas
      #canvas
      [style.transform]="canvasTransform"
      [style.background]="backgroundColor"
      [style.border-color]="borderColor"
    ></canvas>
  `,
  styleUrls: ['./game-canvas.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameCanvasComponent implements OnChanges, AfterViewInit {
  @Input() liveCells: { x: number; y: number }[] = [];
  @Input() overlay?: ToolOverlay;
  @Input() toolPreview?: { cells: [number, number][]; color: string };
  @Input() cellSize = 8;
  @Input() offsetX = 0;
  @Input() offsetY = 0;
  @Input() crosshair?: { x: number; y: number; color?: string };
  @Input() shiftX = 0;
  @Input() shiftY = 0;
  @Input() cellColor = '#7CFF7C';
  @Input() backgroundColor = '#041d38';
  @Input() borderColor = '#1b2b40';

  @Output() cursorChange = new EventEmitter<{ x: number; y: number }>();
  @Output() canvasEvent = new EventEmitter<{ type: 'down' | 'move' | 'up'; x: number; y: number }>();
  @Output() zoomChange = new EventEmitter<{ deltaY: number; screenX: number; screenY: number; width: number; height: number }>();

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private resizeObserver?: ResizeObserver;
  private isPointerDown = false;
  private lastHoverCell: { x: number; y: number } | null = null;
  private drawPending = false;
  private canvasWidthPx = 0;
  private canvasHeightPx = 0;
  private dpr = 1;
  private lastCellSize = 0;

  get canvasTransform() {
    return `translate(${this.shiftX}px, ${this.shiftY}px)`;
  }

  constructor(private tools: ToolsService) {}

  ngAfterViewInit() {
    this.resizeCanvas();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement as Element);
    }
  }

  ngOnChanges() {
    if (this.cellSize !== this.lastCellSize) {
      this.lastCellSize = this.cellSize;
      this.resizeCanvas();
      return;
    }
    this.scheduleDraw();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.resizeCanvas();
  }

  @HostListener('mousedown', ['$event'])
  onPointerDown(event: MouseEvent) {
    this.isPointerDown = true;
    const pos = this.getCellFromEvent(event);
    this.lastHoverCell = pos;
    if (pos) this.canvasEvent.emit({ type: 'down', ...pos });
  }

  @HostListener('mouseup', ['$event'])
  onPointerUp(event: MouseEvent) {
    this.handlePointerUp(event);
  }

  @HostListener('window:mouseup', ['$event'])
  onWindowPointerUp(event: MouseEvent) {
    this.handlePointerUp(event);
  }

  @HostListener('window:blur')
  onWindowBlur() {
    // If the window loses focus during a drag, finalize with the last known cell.
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    if (this.lastHoverCell) {
      this.canvasEvent.emit({ type: 'up', ...this.lastHoverCell });
    }
  }

  @HostListener('mousemove', ['$event'])
  onPointerMove(event: MouseEvent) {
    const pos = this.getCellFromEvent(event);
    if (!pos) return;
    this.lastHoverCell = pos;
    this.cursorChange.emit({ x: pos.x, y: pos.y });
    if (this.isPointerDown) {
      this.canvasEvent.emit({ type: 'move', ...pos });
    }
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent) {
    // Allow zoom without modifiers to match the original feel.
    event.preventDefault();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    this.zoomChange.emit({
      deltaY: event.deltaY,
      screenX,
      screenY,
      width: rect.width,
      height: rect.height
    });
  }

  private scheduleDraw() {
    if (this.drawPending) return;
    this.drawPending = true;
    requestAnimationFrame(() => {
      this.drawPending = false;
      this.draw();
    });
  }

  private getCellFromEvent(event: MouseEvent) {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const xPx = event.clientX - rect.left;
    const yPx = event.clientY - rect.top;
    const centerX = this.canvasWidthPx / 2;
    const centerY = this.canvasHeightPx / 2;
    const x = Math.floor(this.offsetX + (xPx - centerX) / this.cellSize);
    const y = Math.floor(this.offsetY + (yPx - centerY) / this.cellSize);
    return { x, y };
  }

  private handlePointerUp(event: MouseEvent) {
    if (!this.isPointerDown) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    const pos = inside ? this.getCellFromEvent(event) : this.lastHoverCell;

    this.isPointerDown = false;
    if (pos) this.canvasEvent.emit({ type: 'up', ...pos });
  }

  private resizeCanvas() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const widthPx = Math.max(1, parent.clientWidth);
    const heightPx = Math.max(1, parent.clientHeight);

    this.canvasWidthPx = widthPx;
    this.canvasHeightPx = heightPx;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    const pixelWidth = Math.floor(widthPx * this.dpr);
    const pixelHeight = Math.floor(heightPx * this.dpr);

    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    this.scheduleDraw();
  }

  draw() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvasWidthPx, this.canvasHeightPx);

    ctx.fillStyle = this.cellColor;
    const centerX = this.canvasWidthPx / 2;
    const centerY = this.canvasHeightPx / 2;
    for (const cell of this.liveCells) {
      const x = (cell.x - this.offsetX) * this.cellSize + centerX;
      const y = (cell.y - this.offsetY) * this.cellSize + centerY;
      if (x + this.cellSize < 0 || y + this.cellSize < 0 || x >= this.canvasWidthPx || y >= this.canvasHeightPx) continue;
      ctx.fillRect(x, y, this.cellSize, this.cellSize);
    }

    if (this.crosshair) {
      ctx.save();
      // Match reference: bold blue crosshairs + a center dot (behind the preview).
      ctx.strokeStyle = this.crosshair.color || 'rgba(90,180,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.95;

      const cellX = (this.crosshair.x - this.offsetX) * this.cellSize + centerX;
      const cellY = (this.crosshair.y - this.offsetY) * this.cellSize + centerY;
      const crossX = cellX + this.cellSize / 2;
      const crossY = cellY + this.cellSize / 2;

      ctx.beginPath();
      ctx.moveTo(0, crossY);
      ctx.lineTo(this.canvasWidthPx, crossY);
      ctx.moveTo(crossX, 0);
      ctx.lineTo(crossX, this.canvasHeightPx);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(crossX, crossY, this.cellSize * 0.12, 0, 2 * Math.PI);
      ctx.fillStyle = this.crosshair.color || 'rgba(90,180,255,0.95)';
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.restore();
    }

    if (this.toolPreview && Array.isArray(this.toolPreview.cells)) {
      ctx.save();
      ctx.fillStyle = this.toolPreview.color || 'rgba(255,255,255,0.3)';
      for (const [x, y] of this.toolPreview.cells) {
        const px = (x - this.offsetX) * this.cellSize + centerX;
        const py = (y - this.offsetY) * this.cellSize + centerY;
        if (px + this.cellSize < 0 || py + this.cellSize < 0 || px >= this.canvasWidthPx || py >= this.canvasHeightPx) continue;
        ctx.fillRect(px, py, this.cellSize, this.cellSize);
      }
      ctx.restore();
    }

    if (this.overlay) {
      this.overlay.drawOverlay(ctx);
    }
  }
}
