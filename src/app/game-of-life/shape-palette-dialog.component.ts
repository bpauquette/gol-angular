import { Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { BehaviorSubject, combineLatest, of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, takeUntil, tap, finalize } from 'rxjs/operators';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ShapeCatalogService } from '../services/shape-catalog.service';

export interface ShapeCell { x: number; y: number; }
export interface ShapeItem {
  id?: string;
  name: string;
  cells?: ShapeCell[];
  description?: string;
  public?: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  width?: number;
  height?: number;
  population?: number;
  period?: number;
}

export interface ShapePaletteDialogData {
  recentShapes?: ShapeItem[];
}

@Component({
  selector: 'app-shape-palette-dialog',
  templateUrl: './shape-palette-dialog.component.html',
  styleUrls: ['./shape-palette-dialog.component.css']
})
export class ShapePaletteDialogComponent implements OnInit, OnDestroy {
  @Input() shapes: ShapeItem[] = [];
  @Input() recentShapes: ShapeItem[] = [];
  @Output() selectShape = new EventEmitter<ShapeItem>();
  @Output() addRecent = new EventEmitter<ShapeItem>();

  query = '';
  pageIndex = 0;
  pageSize = 10;
  selectedShape?: ShapeItem;
  showFullDescription = false;
  total = 0;
  loading = false;
  hydratorActive = false;
  errorMessage = '';
  private recentLimit = 12;
  private query$ = new BehaviorSubject<string>('');
  private page$ = new BehaviorSubject<number>(0);
  private destroy$ = new Subject<void>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ShapePaletteDialogData,
    private dialogRef: MatDialogRef<ShapePaletteDialogComponent>,
    private catalog: ShapeCatalogService
  ) {
    this.shapes = [];
    this.recentShapes = (data?.recentShapes || []).slice(0, this.recentLimit);
    this.selectedShape = this.shapes[0];
  }

  ngOnInit(): void {
    combineLatest([
      this.query$.pipe(
        debounceTime(200),
        map(val => val.trim()),
        distinctUntilChanged()
      ),
      this.page$
    ]).pipe(
      tap(() => {
        this.loading = true;
        this.errorMessage = '';
      }),
      switchMap(([query, page]) =>
        this.catalog.fetchShapeNames(query, this.pageSize, page * this.pageSize).pipe(
          catchError((error) => {
            console.error('[ShapePaletteDialog] Failed to fetch shape names.', { query, page, error });
            this.errorMessage = 'Unable to reach the shapes service.';
            return of({ items: [], total: 0 });
          })
        )
      ),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      const items = result.items || [];
      this.shapes = items;
      this.total = result.total || items.length;
      this.loading = false;
      if (!this.selectedShape && this.shapes.length) {
        this.selectedShape = this.shapes[0];
      }
      this.catalog.prefetchShapes(this.shapes);
      this.hydrateVisibleShapes(this.shapes);
    });

    this.query$.next(this.query);
    this.page$.next(this.pageIndex);
    if (this.recentShapes?.length) {
      this.hydrateRecents(this.recentShapes);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  clearQuery() {
    this.query = '';
    this.pageIndex = 0;
    this.query$.next('');
    this.page$.next(0);
  }

  onQueryChange(value: string) {
    this.query = value;
    this.pageIndex = 0;
    this.query$.next(value);
    this.page$.next(0);
  }

  get filteredShapes() {
    return this.shapes;
  }

  get pagedShapes() {
    return this.filteredShapes;
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  select(item: ShapeItem) {
    this.selectedShape = item;
    this.showFullDescription = false;
    if (item?.id && !(item.cells?.length)) {
      this.catalog.fetchShapeById(String(item.id)).subscribe((shape) => {
        this.selectedShape = shape;
      });
    }
  }

  useRecent(item: ShapeItem) {
    this.select(item);
    this.placeSelected();
  }

  placeSelected() {
    if (!this.selectedShape) return;
    if (this.selectedShape.id && !(this.selectedShape.cells?.length)) {
      this.catalog.fetchShapeById(String(this.selectedShape.id)).subscribe((shape) => {
        this.addShapeToRecents(shape);
        this.selectShape.emit(shape);
        this.dialogRef.close(shape);
      });
      return;
    }
    this.addShapeToRecents(this.selectedShape);
    this.selectShape.emit(this.selectedShape);
    this.dialogRef.close(this.selectedShape);
  }

  addToRecents() {
    if (!this.selectedShape) return;
    this.addShapeToRecents(this.selectedShape);
  }

  close() {
    this.dialogRef.close();
  }

  nextPage() {
    if (this.pageIndex < this.totalPages - 1) this.pageIndex++;
    this.page$.next(this.pageIndex);
  }

  prevPage() {
    if (this.pageIndex > 0) this.pageIndex--;
    this.page$.next(this.pageIndex);
  }

  trackByName(_: number, item: ShapeItem) {
    return item.id || item.name;
  }

  isHydrated(shape: ShapeItem) {
    return !!shape?.cells?.length;
  }

  onListScroll() {
    this.hydrateVisibleShapes(this.shapes);
  }

  toggleDescription() {
    this.showFullDescription = !this.showFullDescription;
  }

  get descriptionText() {
    const desc = this.selectedShape?.description || '';
    if (this.showFullDescription || desc.length <= 160) return desc;
    return `${desc.slice(0, 160).trim()}…`;
  }

  getShapeCellCount(shape: ShapeItem) {
    if (shape.cells?.length) return shape.cells.length;
    if (typeof shape.population === 'number') return shape.population;
    return null;
  }

  getShapeSizeLabel(shape: ShapeItem) {
    const width = shape.width ?? null;
    const height = shape.height ?? null;
    if (width && height) return `${width}×${height}`;
    if (shape.cells?.length) {
      const bounds = this.getBounds(shape.cells);
      return `${bounds.width}×${bounds.height}`;
    }
    return null;
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
    const width = Number.isFinite(minX) ? (maxX - minX + 1) : 0;
    const height = Number.isFinite(minY) ? (maxY - minY + 1) : 0;
    return { width, height };
  }

  private addShapeToRecents(shape: ShapeItem) {
    if (!shape) return;
    const commit = (resolved: ShapeItem) => {
      const key = resolved.id || resolved.name;
      const exists = this.recentShapes.some(s => (s.id || s.name) === key);
      if (exists) return;
      this.recentShapes = [resolved, ...this.recentShapes].slice(0, this.recentLimit);
      this.addRecent.emit(resolved);
    };

    if (shape.id && !(shape.cells?.length)) {
      this.catalog.fetchShapeById(String(shape.id)).subscribe((resolved) => {
        commit(resolved);
      });
      return;
    }

    commit(shape);
  }

  private hydrateVisibleShapes(items: ShapeItem[]) {
    if (this.hydratorActive) return;
    this.hydratorActive = true;
    this.catalog.attachHydratedShapes(items, this.pageSize).pipe(
      finalize(() => {
        this.hydratorActive = false;
      })
    ).subscribe((hydrated) => {
      this.shapes = hydrated;
    });
  }

  private hydrateRecents(items: ShapeItem[]) {
    this.catalog.attachHydratedShapes(items, this.recentLimit).subscribe((hydrated) => {
      this.recentShapes = hydrated;
    });
  }

  get shapeMeta() {
    const shape = this.selectedShape;
    if (!shape || !shape.cells?.length) return { cellCount: 0, width: 0, height: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of shape.cells) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }
    return {
      cellCount: shape.cells.length,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }
}
