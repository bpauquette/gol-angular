import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

export interface ScriptItem {
  id: string;
  name: string;
  content: string;
  public: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  meta?: any;
}

export interface ScriptListResult {
  items: ScriptItem[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class ScriptCatalogService {
  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listMyScripts(page = 1, pageSize = 100): Observable<ScriptListResult> {
    const base = this.auth.getBackendApiBase();
    const params = new HttpParams()
      .set('page', String(Math.max(1, Math.floor(Number(page) || 1))))
      .set('pageSize', String(Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 100)))));
    return this.http.get<any>(`${base}/v1/scripts/my`, { params }).pipe(
      map((res) => this.toScriptList(res)),
      catchError((error) => {
        console.error('[ScriptCatalog] Failed to list my scripts.', { page, pageSize, error });
        return of({ items: [], total: 0 });
      })
    );
  }

  listPublicScripts(page = 1, pageSize = 100): Observable<ScriptListResult> {
    const base = this.auth.getBackendApiBase();
    const params = new HttpParams()
      .set('page', String(Math.max(1, Math.floor(Number(page) || 1))))
      .set('pageSize', String(Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 100)))));
    return this.http.get<any>(`${base}/v1/scripts/public`, { params }).pipe(
      map((res) => this.toScriptList(res)),
      catchError((error) => {
        console.error('[ScriptCatalog] Failed to list public scripts.', { page, pageSize, error });
        return of({ items: [], total: 0 });
      })
    );
  }

  saveScript(name: string, content: string, isPublic = false, meta?: any): Observable<ScriptItem> {
    const base = this.auth.getBackendApiBase();
    const body = {
      name: String(name || '').trim(),
      content: String(content || ''),
      public: !!isPublic,
      meta: meta || null
    };
    return this.http.post<any>(`${base}/v1/scripts`, body).pipe(
      map((res) => this.toScriptItem(res))
    );
  }

  deleteScript(id: string): Observable<boolean> {
    const base = this.auth.getBackendApiBase();
    return this.http.delete(`${base}/v1/scripts/${encodeURIComponent(id)}`, { observe: 'response' }).pipe(
      map((res) => res.status >= 200 && res.status < 300),
      catchError((error) => {
        console.error('[ScriptCatalog] Failed to delete script.', { id, error });
        return of(false);
      })
    );
  }

  setScriptPublic(id: string, isPublic: boolean): Observable<boolean> {
    const base = this.auth.getBackendApiBase();
    return this.http.patch<any>(`${base}/v1/scripts/${encodeURIComponent(id)}/public`, { public: !!isPublic }).pipe(
      map((res) => !!res && res.public === !!isPublic),
      catchError((error) => {
        console.error('[ScriptCatalog] Failed to toggle script visibility.', { id, isPublic, error });
        return of(false);
      })
    );
  }

  private toScriptList(raw: any): ScriptListResult {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    return {
      items: items.map((item: any) => this.toScriptItem(item)),
      total: Number(raw?.total) || items.length
    };
  }

  private toScriptItem(raw: any): ScriptItem {
    return {
      id: String(raw?.id || ''),
      name: String(raw?.name || 'Untitled Script'),
      content: String(raw?.content || ''),
      public: !!raw?.public,
      userId: raw?.userId || raw?.user_id,
      createdAt: raw?.createdAt || raw?.created_at,
      updatedAt: raw?.updatedAt || raw?.updated_at,
      meta: raw?.meta || null
    };
  }
}
