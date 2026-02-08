import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthService, AuthMode } from '../services/auth.service';

export interface AuthDialogData {
  mode?: AuthMode;
  message?: string;
  initialEmail?: string;
}

@Component({
  selector: 'app-auth-dialog',
  templateUrl: './auth-dialog.component.html',
  styleUrls: ['./auth-dialog.component.css']
})
export class AuthDialogComponent {
  mode: AuthMode = 'login';
  message = '';

  // Login form
  loginEmail = '';
  loginPassword = '';
  showLoginPassword = false;

  // Register form
  regFirstName = '';
  regLastName = '';
  regAboutMe = '';
  regEmail = '';
  regPassword = '';
  showRegPassword = false;

  submitting = false;
  errorMsg = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: AuthDialogData,
    private dialogRef: MatDialogRef<AuthDialogComponent>,
    private auth: AuthService
  ) {
    this.mode = data?.mode || 'login';
    this.message = data?.message || '';

    const initial = data?.initialEmail || this.auth.getLastCheckedEmail() || '';
    if (initial) {
      this.loginEmail = initial;
      this.regEmail = initial;
    }
  }

  setMode(mode: AuthMode) {
    this.mode = mode;
    this.errorMsg = '';
  }

  async submitLogin() {
    if (this.submitting) return;
    this.errorMsg = '';

    const email = (this.loginEmail || '').trim();
    if (!email) {
      this.errorMsg = 'Email is required';
      return;
    }
    if (!this.loginPassword) {
      this.errorMsg = 'Password is required';
      return;
    }

    try {
      this.submitting = true;
      await this.auth.login(email, this.loginPassword);
      this.dialogRef.close(true);
    } catch (e: any) {
      const msg = e?.message || 'Login failed';
      this.errorMsg = msg;

      // Reference behavior: if login fails due to unknown email, offer register flow.
      if (msg.includes('Invalid login') && email) {
        const exists = await this.auth.checkEmail(email);
        if (!exists) {
          this.regEmail = email;
          this.setMode('register');
          this.errorMsg = 'No account found for that email — please register.';
        }
      }
    } finally {
      this.submitting = false;
    }
  }

  async submitRegister() {
    if (this.submitting) return;
    this.errorMsg = '';

    const firstName = (this.regFirstName || '').trim();
    const lastName = (this.regLastName || '').trim();
    const email = (this.regEmail || '').trim();
    const password = this.regPassword || '';

    if (!firstName) {
      this.errorMsg = 'First name is required';
      return;
    }
    if (!lastName) {
      this.errorMsg = 'Last name is required';
      return;
    }
    if (!email) {
      this.errorMsg = 'Email is required';
      return;
    }
    const pwError = this.validatePassword(password);
    if (pwError) {
      this.errorMsg = pwError;
      return;
    }

    try {
      this.submitting = true;
      await this.auth.register({
        email,
        password,
        firstName,
        lastName,
        aboutMe: this.regAboutMe || ''
      });
      this.dialogRef.close(true);
    } catch (e: any) {
      const msg = e?.message || 'Registration failed';
      this.errorMsg = msg;
      const status = (e as any)?.status;
      if (status === 409) {
        this.loginEmail = email;
        this.setMode('login');
        this.errorMsg = 'Account already exists — please log in.';
      }
    } finally {
      this.submitting = false;
    }
  }

  logout() {
    this.auth.logout();
  }

  close() {
    this.dialogRef.close(false);
  }

  private validatePassword(pw: string) {
    if (!pw) return 'Password is required';
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter.';
    if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password must contain a digit.';
    if (!/[!@#$%^&*(),.?\":{}|<>]/.test(pw)) return 'Password must contain a special character.';
    return null;
  }
}

