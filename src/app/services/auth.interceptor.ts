import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.auth.token;
    if (!token) return next.handle(req);
    if (!this.shouldAttach(req.url)) return next.handle(req);

    return next.handle(
      req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      })
    );
  }

  private shouldAttach(url: string): boolean {
    // Only attach to backend calls (never to third-party origins like Google Fonts).
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const base = this.auth.getBackendApiBase();
        return url.startsWith(base);
      }
      return url.startsWith('/api') || url.startsWith('/v1');
    } catch (error) {
      console.error('[AuthInterceptor] Failed to evaluate auth header attachment.', { url, error });
      return false;
    }
  }
}
