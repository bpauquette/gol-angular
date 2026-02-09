import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

type AuthMode = 'login' | 'register';

interface LoginResponse {
  token?: string;
  error?: string;
}

interface RegisterResponse {
  ok?: boolean;
  token?: string;
  error?: string;
}

interface CheckEmailResponse {
  exists?: boolean;
}

interface MeResponse {
  email?: string;
  hasDonated?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSubject = new BehaviorSubject<string | null>(null);
  readonly token$ = this.tokenSubject.asObservable();

  private emailSubject = new BehaviorSubject<string | null>(null);
  readonly email$ = this.emailSubject.asObservable();

  private hasDonatedSubject = new BehaviorSubject<boolean>(false);
  readonly hasDonated$ = this.hasDonatedSubject.asObservable();

  private backendBase?: string;

  constructor(private http: HttpClient) {
    const storedToken = sessionStorage.getItem('authToken');
    const storedEmail = sessionStorage.getItem('authEmail');

    if (storedToken && !this.isTokenExpired(storedToken)) {
      this.tokenSubject.next(storedToken);
      this.emailSubject.next(storedEmail);
      // Populate hasDonated/email from backend when possible (non-blocking).
      queueMicrotask(() => void this.refreshMe());
    } else {
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('authEmail');
    }

    window.addEventListener('auth:logout', () => this.logout());
  }

  get token(): string | null {
    return this.tokenSubject.value;
  }

  get email(): string | null {
    return this.emailSubject.value;
  }

  get isLoggedIn(): boolean {
    return !!this.tokenSubject.value;
  }

  getBackendApiBase(): string {
    if (this.backendBase) return this.backendBase;
    const host = window?.location?.host || '';
    if (host === 'localhost:4200' || host === '127.0.0.1:4200') {
      this.backendBase = 'http://localhost:55000';
      return this.backendBase;
    }
    const origin = window?.location?.origin;
    if (origin) {
      this.backendBase = `${origin}/api`;
      return this.backendBase;
    }
    this.backendBase = '/api';
    return this.backendBase;
  }

  getAuthApiBase(): string {
    const base = this.getBackendApiBase();
    return base.endsWith('/api') ? `${base}/auth` : `${base}/api/auth`;
  }

  async login(email: string, password: string) {
    const normalizedEmail = (email || '').trim();
    const res = await this.postAuth<LoginResponse>('/login', { email: normalizedEmail, password });
    if (res?.error) throw new Error(res.error);
    if (!res?.token) throw new Error('Login failed: no token returned');
    this.setSession(normalizedEmail, res.token);
    await this.refreshMe();
  }

  async register(payload: { email: string; password: string; firstName: string; lastName: string; aboutMe?: string }) {
    const body = {
      email: (payload.email || '').trim(),
      password: payload.password,
      firstName: (payload.firstName || '').trim(),
      lastName: (payload.lastName || '').trim(),
      aboutMe: (payload.aboutMe || '').trim()
    };
    const res = await this.postAuth<RegisterResponse>('/register', body);
    if (res?.error) throw new Error(res.error);
    if (res?.token) {
      this.setSession(body.email, res.token);
      await this.refreshMe();
      return;
    }
    if (res?.ok) {
      // Backend may not return a token — follow the reference behavior:
      // attempt to login using the just-provided credentials.
      await this.login(body.email, body.password);
      return;
    }
    throw new Error('Registration failed: unexpected server response');
  }

  logout() {
    this.tokenSubject.next(null);
    this.emailSubject.next(null);
    this.hasDonatedSubject.next(false);
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('authEmail');
  }

  async refreshMe() {
    const token = this.tokenSubject.value || sessionStorage.getItem('authToken');
    if (!token) return;
    if (this.isTokenExpired(token)) {
      this.logout();
      return;
    }
    try {
      const url = `${this.getBackendApiBase()}/v1/me?_ts=${Date.now()}`;
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache'
      });
      const res = await firstValueFrom(this.http.get<MeResponse>(url, { headers }));
      if (typeof res?.hasDonated === 'boolean') this.hasDonatedSubject.next(res.hasDonated);
      if (typeof res?.email === 'string' && res.email.trim()) {
        this.emailSubject.next(res.email.trim());
        sessionStorage.setItem('authEmail', res.email.trim());
      }
    } catch (error) {
      console.error('[AuthService] Failed to refresh profile state.', error);
    }
  }

  async checkEmail(email: string): Promise<boolean> {
    const normalized = (email || '').trim();
    if (!normalized) return false;
    try {
      const res = await this.postAuth<CheckEmailResponse>('/check-email', { email: normalized });
      const exists = !!res?.exists;
      localStorage.setItem('lastCheckedEmail', normalized);
      localStorage.setItem('emailExists', exists ? 'true' : 'false');
      return exists;
    } catch (error) {
      console.error('[AuthService] Failed to check email availability.', { email: normalized, error });
      return false;
    }
  }

  getLastCheckedEmail(): string | null {
    return localStorage.getItem('lastCheckedEmail');
  }

  getLastEmailRegistered(): boolean {
    return localStorage.getItem('emailExists') === 'true';
  }

  private setSession(email: string, token: string) {
    this.tokenSubject.next(token);
    this.emailSubject.next(email);
    sessionStorage.setItem('authToken', token);
    sessionStorage.setItem('authEmail', email);
  }

  private async postAuth<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.getAuthApiBase()}${path}`;
    try {
      const res = await firstValueFrom(this.http.post<T>(url, body, { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) }));
      return res;
    } catch (err: any) {
      const status = err?.status;
      const serverMsg = err?.error?.error || (typeof err?.error === 'string' ? err.error : err?.message);
      const msg = status ? `HTTP ${status}: ${serverMsg || 'Request failed'}` : (serverMsg || 'Request failed');
      console.error('[AuthService] Auth API request failed.', { path, status, serverMsg, err });
      // Mirror reference behavior: if token is invalid/expired, trigger logout.
      if (String(serverMsg || '').includes('Invalid or expired token')) {
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
      const e = new Error(msg);
      (e as any).status = status;
      (e as any).body = err?.error;
      throw e;
    }
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payload = this.decodeJwtPayload(token);
      const exp = Number(payload?.exp);
      if (!Number.isFinite(exp)) return false;
      return exp * 1000 < Date.now();
    } catch (error) {
      console.error('[AuthService] Failed to decode auth token expiration.', error);
      return true;
    }
  }

  private decodeJwtPayload(token: string): any {
    const parts = String(token || '').split('.');
    if (parts.length < 2) throw new Error('Invalid token');
    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  }
}

export type { AuthMode };
