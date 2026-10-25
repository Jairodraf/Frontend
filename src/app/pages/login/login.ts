// src/app/pages/login/login.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

/**
 * Componente de página de inicio de sesión.
 * Permite a los usuarios autenticarse con email y contraseña.
 * Redirige según el rol del usuario (Admin o User).
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NzButtonModule, NzFormModule, NzInputModule, NzIconModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})

export class Login implements OnInit {
  /** Formulario reactivo con campos de email y contraseña */
  validateForm: FormGroup;
  /** Indicador de carga durante el proceso de login */
  loading = false;
  /** Controla la visibilidad del modal de error de credenciales */
  showLoginError = false;
  /** Controla la visibilidad de la contraseña en el campo de texto */
  passwordVisible = false;

  // Servicios inyectados
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);
  private msg = inject(NzMessageService);
  private auth = inject(AuthService);

  /**
   * Constructor del componente.
   * Inicializa el formulario reactivo con validaciones para email y contraseña.
   */
  constructor() {
    this.validateForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      contrasena: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  /**
   * Hook de inicialización del componente.
   * Si el usuario ya tiene sesión activa, redirige a la página principal
   * para evitar que vuelva a la pantalla de login.
   */
  ngOnInit(): void {
    if (this.auth.hasToken()) {
      this.router.navigateByUrl('/');
    }
  }

  /**
   * Maneja el envío del formulario de login.
   * Valida los campos, envía las credenciales al servidor,
   * y redirige según el rol del usuario (Admin o User).
   */
  submitForm(): void {
    // Validar el formulario: marcar campos como dirty si hay errores
    if (this.validateForm.invalid) {
      Object.values(this.validateForm.controls).forEach(c => {
        c.markAsDirty();
        c.updateValueAndValidity();
      });
      return;
    }

    const { email, contrasena } = this.validateForm.value;
    this.loading = true;

    // Enviar credenciales al servidor (vía proxy configurado en proxy.conf.json)
    this.http.post<{ token: string; rol: string; empleadoId: number }>(
      '/api/auth/login',
      { email, contrasena }
    )
    .pipe(finalize(() => this.loading = false))
    .subscribe({
      next: (res) => {
        // Guardar token, rol y empleadoId en el AuthService
        // Esto actualiza los observables isAdmin$ e isLogged$ para actualizar el header
        this.auth.setAuth(res.token, res.rol, res.empleadoId);

        // Redirigir según el rol del usuario
        if (res.rol === 'Admin') {
          this.router.navigateByUrl('/fichaje'); // Dashboard de administrador
        } else {
          this.router.navigateByUrl('/fichaje'); // Dashboard de usuario
        }
      },
      error: (err) => {
        // Error 401: credenciales incorrectas
        if (err?.status === 401) {
          this.showLoginError = true;
        } else {
          this.msg.error('Error de conexión');
        }
      }
    });
  }

  /** Cierra el modal de error de credenciales */
  closeLoginError() {
    this.showLoginError = false;
  }
}
