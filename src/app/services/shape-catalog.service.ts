import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, combineLatest } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { ShapeItem } from '../game-of-life/shape-palette-dialog.component';

export interface ShapeListResult {
  items: ShapeItem[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class ShapeCatalogService {
  private cache = new Map<string, ShapeItem>();
  private inflight = new Map<string, Observable<ShapeItem>>();
  private backendBase?: string;

  constructor(private http: HttpClient) {}

  getBackendBase(): string {
    if (this.backendBase) return this.backendBase;
    const win = typeof window !== 'undefined' ? window : undefined;
    const host = win?.location?.host || '';
    if (host === 'localhost:4200' || host === '127.0.0.1:4200') {
      this.backendBase = 'http://localhost:55000';
      return this.backendBase;
    }
    const origin = win?.location?.origin;
    if (origin) {
      this.backendBase = `${origin}/api`;
      return this.backendBase;
    }
    this.backendBase = '/api';
    return this.backendBase;
  }

  fetchShapeNames(query: string, limit: number, offset: number): Observable<ShapeListResult> {
    const base = this.getBackendBase();
    const params = new HttpParams()
      .set('q', query || '')
      .set('limit', String(limit))
      .set('offset', String(offset));
    const url = `${base}/v1/shapes/names`;
    return this.http.get<any>(url, { params }).pipe(
      map((data) => {
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        const total = Number(data?.total) || items.length;
        return {
          items: items.map((item: any) => ({
            id: item.id || item.shape_id || item.shapeId,
            name: item.name || 'Unnamed shape',
            description: item.description || '',
            cells: this.normalizeCells(item.cells || item.pattern || item.liveCells || []),
            width: item.width || item.meta?.width,
            height: item.height || item.meta?.height,
            population: item.population || item.meta?.cellCount,
            period: item.period || item.meta?.period
          })),
          total
        };
      }),
      catchError(() => this.fetchShapePageFallback(query, limit, offset))
    );
  }

  fetchShapeById(id: string): Observable<ShapeItem> {
    if (!id) return of({ name: 'Unknown', cells: [] });
    const cached = this.cache.get(id);
    if (cached?.cells?.length) return of(cached);

    const inflight = this.inflight.get(id);
    if (inflight) return inflight;

    const url = `${this.getBackendBase()}/v1/shapes/${encodeURIComponent(id)}`;
    const request$ = this.http.get<any>(url).pipe(
      map((data) => ({
        id: data?.id || id,
        name: data?.name || 'Unnamed shape',
        description: data?.description || '',
        width: data?.width || data?.meta?.width,
        height: data?.height || data?.meta?.height,
        population: data?.population || data?.meta?.cellCount,
        period: data?.period || data?.meta?.period,
        cells: this.normalizeCells(data?.cells || data?.pattern || data?.liveCells || [])
      })),
      tap((shape) => {
        this.cache.set(id, shape);
      }),
      catchError(() => of({ id, name: 'Unknown shape', cells: [] })),
      shareReplay(1)
    );
    this.inflight.set(id, request$);
    request$.subscribe({
      complete: () => this.inflight.delete(id),
      error: () => this.inflight.delete(id)
    });
    return request$;
  }

  prefetchShapes(items: ShapeItem[], limit = 6) {
    const toFetch = items
      .filter(item => item?.id && !(item.cells?.length))
      .slice(0, limit);
    for (const item of toFetch) {
      this.fetchShapeById(String(item.id)).subscribe();
    }
  }

  private fetchShapePageFallback(query: string, limit: number, offset: number): Observable<ShapeListResult> {
    const base = this.getBackendBase();
    const page = Math.floor(offset / limit) + 1;
    const params = new HttpParams()
      .set('searchTerm', query || '')
      .set('page', String(page))
      .set('pageSize', String(limit));
    const url = `${base}/v1/shapes`;
    return this.http.get<any>(url, { params }).pipe(
      map((data) => {
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        const total = Number(data?.total) || items.length;
        return {
          items: items.map((item: any) => ({
            id: item.id,
            name: item.name || 'Unnamed shape',
            description: item.description || '',
            cells: this.normalizeCells(item.cells || item.pattern || item.liveCells || []),
            width: item.width || item.meta?.width,
            height: item.height || item.meta?.height,
            population: item.population || item.meta?.cellCount,
            period: item.period || item.meta?.period
          })),
          total
        };
      }),
      catchError(() => of({ items: [], total: 0 }))
    );
  }

  attachHydratedShapes(items: ShapeItem[], limit = 8): Observable<ShapeItem[]> {
    const withCells = items.map(item => {
      if (item?.id) {
        const cached = this.cache.get(String(item.id));
        return cached ? { ...item, ...cached } : item;
      }
      return item;
    });

    const targets = withCells
      .filter(item => item?.id && !(item.cells?.length))
      .slice(0, limit);

    if (!targets.length) return of(withCells);

    return combineLatest(
      targets.map(target => this.fetchShapeById(String(target.id)).pipe(
        catchError(() => of(target))
      ))
    ).pipe(
      map((hydrated) => {
        const mapById = new Map<string, ShapeItem>();
        for (const item of hydrated) {
          if (item?.id) mapById.set(String(item.id), item);
        }
        return withCells.map(item => {
          const replacement = item?.id ? mapById.get(String(item.id)) : null;
          return replacement ? { ...item, ...replacement } : item;
        });
      })
    );
  }

  private normalizeCells(raw: any): { x: number; y: number }[] {
    const input = Array.isArray(raw) ? raw : [];
    const out: { x: number; y: number }[] = [];
    for (const cell of input) {
      if (Array.isArray(cell) && cell.length >= 2) {
        const x = Number(cell[0]);
        const y = Number(cell[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
        continue;
      }
      const x = Number(cell?.x);
      const y = Number(cell?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
    }
    return out;
  }
}
