import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface GridCell {
  x: number;
  y: number;
}

export interface GridItem {
  id: string;
  name: string;
  description?: string;
  liveCells: GridCell[];
  generation: number;
  userId?: string;
  public?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GridListResult {
  items: GridItem[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class GridCatalogService {
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

  listGrids(page = 1, pageSize = 50): Observable<GridListResult> {
    const base = this.getBackendBase();
    const params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    const url = `${base}/v1/grids`;
    return this.http.get<any>(url, { params }).pipe(
      map((data) => {
        const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        const items = rawItems.map((it: any) => this.toGridItem(it)).filter(Boolean) as GridItem[];
        return {
          items,
          total: Number(data?.total) || items.length,
          page: Number(data?.page) || page,
          pageSize: Number(data?.pageSize) || pageSize
        };
      }),
      catchError((error) => {
        console.error('[GridCatalog] Failed to list grids.', { page, pageSize, error });
        return of({ items: [], total: 0, page, pageSize });
      })
    );
  }

  getGrid(id: string): Observable<GridItem | null> {
    if (!id) return of(null);
    const url = `${this.getBackendBase()}/v1/grids/${encodeURIComponent(id)}`;
    return this.http.get<any>(url).pipe(
      map((data) => this.toGridItem(data)),
      catchError((error) => {
        console.error('[GridCatalog] Failed to load grid by id.', { id, error });
        return of(null);
      })
    );
  }

  saveGrid(payload: {
    name: string;
    description?: string;
    liveCells: GridCell[];
    generation?: number;
    public?: boolean;
  }): Observable<GridItem> {
    const url = `${this.getBackendBase()}/v1/grids`;
    const body = {
      name: (payload.name || '').trim(),
      description: (payload.description || '').trim(),
      liveCells: Array.isArray(payload.liveCells)
        ? payload.liveCells.map((c) => ({ x: Math.floor(Number(c.x) || 0), y: Math.floor(Number(c.y) || 0) }))
        : [],
      generation: Math.max(0, Math.floor(Number(payload.generation) || 0)),
      public: !!payload.public
    };
    return this.http.post<any>(url, body).pipe(map((data) => this.toGridItem(data) as GridItem));
  }

  deleteGrid(id: string): Observable<boolean> {
    if (!id) return of(false);
    const url = `${this.getBackendBase()}/v1/grids/${encodeURIComponent(id)}`;
    return this.http.delete(url, { observe: 'response' }).pipe(
      map((res) => res.status >= 200 && res.status < 300),
      catchError((error) => {
        console.error('[GridCatalog] Failed to delete grid.', { id, error });
        return of(false);
      })
    );
  }

  private toGridItem(raw: any): GridItem | null {
    if (!raw) return null;
    const id = String(raw?.id || raw?.grid_id || raw?.gridId || '').trim();
    if (!id) return null;

    const name = String(raw?.name || 'Unnamed grid').trim();
    const description = typeof raw?.description === 'string' ? raw.description : '';
    const generation = Math.max(0, Math.floor(Number(raw?.generation) || 0));
    const liveCells = normalizeCells(raw?.liveCells ?? raw?.data ?? []);
    const userId = typeof raw?.userId === 'string' ? raw.userId : typeof raw?.user_id === 'string' ? raw.user_id : undefined;
    const isPublic = typeof raw?.public === 'boolean' ? raw.public : raw?.public === 1;
    const createdAt = typeof raw?.createdAt === 'string' ? raw.createdAt : typeof raw?.created_at === 'string' ? raw.created_at : undefined;
    const updatedAt = typeof raw?.updatedAt === 'string' ? raw.updatedAt : typeof raw?.updated_at === 'string' ? raw.updated_at : undefined;

    return { id, name, description, liveCells, generation, userId, public: isPublic, createdAt, updatedAt };
  }
}

function normalizeCells(raw: any): GridCell[] {
  let input: any = raw;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch (error) {
      console.error('[GridCatalog] Failed to parse grid liveCells payload.', error);
      input = [];
    }
  }
  const arr = Array.isArray(input) ? input : [];
  const out: GridCell[] = [];
  for (const cell of arr) {
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
