// src/app/pages/registro/registro.ts
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
  FormsModule,
} from '@angular/forms';
import { Subject } from 'rxjs';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { EmpleadosService, CreateEmpleadoDto, UpdateEmpleadoDto, EmpleadoDto } from '../../services/empleados.service';
import { finalize } from 'rxjs/operators';
import { NzMessageService } from 'ng-zorro-antd/message';
import { HttpErrorResponse } from '@angular/common/http';
import { NzAutocompleteModule } from 'ng-zorro-antd/auto-complete';
import { CommonModule } from '@angular/common';

/**
 * Componente de página de registro de empleados.
 * Permite crear, actualizar y eliminar empleados (solo Admin).
 * Incluye búsqueda de empleados existentes para modificar o eliminar.
 */
@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzCheckboxModule,
    NzButtonModule,
    NzSelectModule,
    NzModalModule,
    NzAutocompleteModule,
    CommonModule,
  ],
  templateUrl: './registro.html',
  styleUrls: ['./registro.scss'],
})
export class Registro implements OnInit, OnDestroy {
  // Servicios inyectados
  private fb = inject(NonNullableFormBuilder);
  private destroy$ = new Subject<void>();
  private api = inject(EmpleadosService);
  private msg = inject(NzMessageService);

  // Control de modales
  /** Controla la visibilidad del modal de confirmación de acción */
  isConfirmVisible = false;
  /** Controla la visibilidad del modal de éxito al crear */
  isSuccessVisible = false;
  /** Controla la visibilidad del modal de éxito al actualizar */
  isUpdateSuccessVisible = false;
  /** Controla la visibilidad del modal de éxito al eliminar */
  isDeleteSuccessVisible = false;
  /** Indicador de carga durante operaciones */
  loading = false;
  /** Indicador de carga durante actualizaciones */
  isUpdating = false;

  /** Datos del empleado para mostrar en modal de confirmación */
  datosConfirmados: any = {};
  /** Acción a realizar (crear, actualizar o eliminar) */
  accion: 'crear' | 'actualizar' | 'eliminar' = 'crear';

  // Búsqueda de empleados
  /** Lista completa de empleados cargada desde el servidor */
  empleados: EmpleadoDto[] = [];
  /** Empleados filtrados por la búsqueda */
  empleadosFiltrados: EmpleadoDto[] = [];
  /** Texto de búsqueda ingresado */
  busquedaEmpleado = '';
  /** Empleado seleccionado para modificar o eliminar */
  empleadoSeleccionado: EmpleadoDto | null = null;

  /**
   * Formulario reactivo con todos los campos de empleado.
   * Incluye validaciones para nombre, apellidos, DNI, email, contraseña, teléfono y rol.
   * La contraseña requiere min 8 caracteres con mayúscula, minúscula, número y símbolo.
   */
  validateForm = this.fb.group({
    nombre: this.fb.control('', [Validators.required, Validators.minLength(3)]),
    apellidos: this.fb.control('', [Validators.required, Validators.minLength(3)]),
    dni: this.fb.control('', [
      Validators.required,
      Validators.minLength(9),
      Validators.maxLength(9),
    ]),
    email: this.fb.control('', [Validators.email, Validators.required]),
    password: this.fb.control('', [
      Validators.required,
      Validators.minLength(8),
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/),
    ]),
    phoneNumberPrefix: this.fb.control('+34'),
    phoneNumber: this.fb.control('', [
      Validators.required,
      Validators.minLength(9),
      Validators.pattern('^[0-9]{9}$'),
    ]),
    rol: this.fb.control('', [Validators.required, Validators.pattern(/^(admin|user)$/i)]),
  });

  /**
   * Hook de inicialización del componente.
   * Carga la lista completa de empleados para la funcionalidad de búsqueda.
   */
  ngOnInit(): void {
    // Cargar todos los empleados para búsqueda
    this.api.getAll().subscribe({
      next: (data) => {
        this.empleados = data;
      },
      error: () => {
        this.msg.error('Error al cargar empleados');
      },
    });
  }

  /**
   * Hook de destrucción del componente.
   * Limpia las suscripciones activas para evitar fugas de memoria.
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Filtra la lista de empleados mientras el usuario escribe en el campo de búsqueda.
   * Busca coincidencias en nombre, apellidos, DNI o email.
   * @param event Evento del input de búsqueda
   */
  onEmpleadoSearch(event: Event): void {
    const input = (event.target as HTMLInputElement).value.toLowerCase();
    this.busquedaEmpleado = input;
    if (!input) {
      this.empleadosFiltrados = [];
      return;
    }
    this.empleadosFiltrados = this.empleados.filter(
      (emp) =>
        emp.nombre.toLowerCase().includes(input) ||
        emp.apellidos.toLowerCase().includes(input) ||
        emp.dni.toLowerCase().includes(input) ||
        emp.email.toLowerCase().includes(input)
    );
  }

  /**
   * Selecciona un empleado de la lista de resultados de búsqueda.
   * Rellena el formulario con los datos del empleado seleccionado
   * para permitir su modificación o eliminación.
   * @param emp Empleado seleccionado
   */
  selectEmpleado(emp: EmpleadoDto): void {
    this.empleadoSeleccionado = emp;

    // Extraer el número de teléfono sin el prefijo +34 si existe
    let phoneNumber = '';
    if (emp.telefono) {
      // Si el teléfono incluye +34, quitarlo
      phoneNumber = emp.telefono.replace(/^\+34/, '').trim();
    }

    // Rellenar el formulario con los datos del empleado
    this.validateForm.patchValue({
      nombre: emp.nombre,
      apellidos: emp.apellidos,
      dni: emp.dni,
      email: emp.email,
      phoneNumber: phoneNumber,
      rol: emp.rol,
    });
    this.busquedaEmpleado = '';
    this.empleadosFiltrados = [];
  }

  /**
   * Maneja el envío del formulario para crear un nuevo empleado.
   * Valida los campos y muestra el modal de confirmación.
   */
  submitForm(): void {
    // Si el formulario es válido, preparar confirmación
    if (this.validateForm.valid) {
      this.datosConfirmados = this.validateForm.value;
      this.accion = 'crear';
      this.isConfirmVisible = true;
    } else {
      // Si hay errores, marcar campos como dirty para mostrar validaciones
      Object.values(this.validateForm.controls).forEach((control) => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }

  /**
   * Maneja la confirmación de la acción seleccionada.
   * Redirige al método correspondiente según la acción (crear, actualizar o eliminar).
   */
  handleConfirmOk(): void {
    // Redirigir según la acción seleccionada
    if (this.accion === 'actualizar') {
      this.handleUpdateOk();
      return;
    }

    if (this.accion === 'eliminar') {
      this.handleDeleteOk();
      return;
    }

    // Obtener valores del formulario
    const v = this.validateForm.getRawValue();

    // Normalizar el rol a formato del backend (Admin o User)
    const rol = (v.rol || '').toString().toLowerCase() === 'admin' ? 'Admin' : 'User';

    // Combinar prefijo y número de teléfono
    const telefonoRaw = `${v.phoneNumberPrefix ?? ''}${v.phoneNumber ?? ''}`.replace(/\s+/g, '');
    const telefono = telefonoRaw.length ? telefonoRaw : null;

    // Crear DTO (Data Transfer Object) para enviar al backend
    const dto: CreateEmpleadoDto = {
      nombre: v.nombre!.trim(),
      apellidos: v.apellidos!.trim(),
      dni: v.dni!.trim().toUpperCase(), // DNI en mayúsculas por convención
      email: v.email!.trim().toLowerCase(), // Email en minúsculas por convención
      contrasena: v.password!,
      telefono,
      rol, // "Admin" o "User"
    };

    this.loading = true;

    this.api
      .create(dto)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.validateForm.enable();
        })
      )
      .subscribe({
        next: (res: EmpleadoDto) => {
          this.isConfirmVisible = false;
          this.msg.success(`Empleado ${res.nombre} creado`);
          this.validateForm.reset();
          this.validateForm.patchValue({ phoneNumberPrefix: '+34' });
          this.empleadoSeleccionado = null;
          this.busquedaEmpleado = '';
          this.empleadosFiltrados = [];
          this.isSuccessVisible = true;
          // Recargar lista de empleados
          this.api.getAll().subscribe({
            next: (data) => {
              this.empleados = data;
            },
          });
        },
        error: (err: HttpErrorResponse) => {
          if (err?.status === 409) {
            this.msg.error('Ya existe un empleado con ese DNI o Email');
          } else if (err?.status === 403 || err?.status === 401) {
            this.msg.error('No autorizado. Debes iniciar sesión como Admin');
          } else {
            this.msg.error('Error al crear el empleado');
          }
        },
      });
  }

  /** Cancela la confirmación y cierra el modal */
  handleConfirmCancel(): void {
    this.isConfirmVisible = false;
  }

  /** Cierra el modal de éxito al crear empleado */
  handleSuccessOk(): void {
    this.isSuccessVisible = false;
  }

  /**
   * Cierra el modal de éxito al actualizar empleado.
   * Limpia el formulario y la selección de empleado.
   */
  handleUpdateSuccessOk(): void {
    this.isUpdateSuccessVisible = false;
    // Limpiar formulario tras cerrar modal de éxito
    this.empleadoSeleccionado = null;
    this.busquedaEmpleado = '';
    this.empleadosFiltrados = [];
    this.validateForm.reset();
    this.validateForm.controls['phoneNumberPrefix'].setValue('+34');
  }

  /**
   * Cierra el modal de éxito al eliminar empleado.
   * Limpia el formulario y la selección de empleado.
   */
  handleDeleteSuccessOk(): void {
    this.isDeleteSuccessVisible = false;
    // Limpiar formulario tras cerrar modal de éxito
    this.empleadoSeleccionado = null;
    this.busquedaEmpleado = '';
    this.empleadosFiltrados = [];
    this.validateForm.reset();
    this.validateForm.controls['phoneNumberPrefix'].setValue('+34');
  }

  /**
   * Prepara la actualización de un empleado.
   * Combina los datos actuales del empleado con los campos modificados en el formulario.
   * Muestra el modal de confirmación antes de enviar al servidor.
   */
  updateEmpleado(): void {
    // Validar que hay un empleado seleccionado
    if (!this.empleadoSeleccionado) {
      this.msg.warning('Debes seleccionar un empleado para modificar');
      return;
    }

    // Permitir actualizaciones parciales: combinar datos actuales con campos modificados
    const v = this.validateForm.getRawValue();

    // Inicializar objeto con datos actuales del empleado
    const merged: any = {
      nombre: this.empleadoSeleccionado.nombre,
      apellidos: this.empleadoSeleccionado.apellidos,
      dni: this.empleadoSeleccionado.dni,
      email: this.empleadoSeleccionado.email,
      phoneNumberPrefix: this.validateForm.controls['phoneNumberPrefix'].value || '+34',
      phoneNumber: this.empleadoSeleccionado.telefono ?? '',
      rol: this.empleadoSeleccionado.rol,
    };

    // Sobrescribir solo los campos que tengan valores nuevos en el formulario
    if (v.nombre && v.nombre.trim() !== '') merged.nombre = v.nombre.trim();
    if (v.apellidos && v.apellidos.trim() !== '') merged.apellidos = v.apellidos.trim();
    if (v.dni && v.dni.trim() !== '') merged.dni = v.dni.trim();
    if (v.email && v.email.trim() !== '') merged.email = v.email.trim();
    if (v.phoneNumber && v.phoneNumber.trim() !== '') merged.phoneNumber = v.phoneNumber.trim();
    if (v.rol && v.rol.trim() !== '') merged.rol = v.rol.trim();

    this.datosConfirmados = merged;
    this.accion = 'actualizar';
    this.isConfirmVisible = true;
  }

  /**
   * Confirma y ejecuta la actualización del empleado.
   * Construye un DTO con solo los campos modificados y lo envía al servidor.
   * Si no hay cambios, informa al usuario y limpia el formulario.
   */
  handleUpdateOk(): void {
    if (!this.empleadoSeleccionado) return;

    this.isUpdating = true;
    const v = this.validateForm.getRawValue();

    // Construir DTO parcial con solo los campos modificados
    const dto: UpdateEmpleadoDto = {};

    // Función auxiliar: añadir campo al DTO solo si ha cambiado respecto al original
    const addIfChanged = (key: keyof UpdateEmpleadoDto, value: any) => {
      if (value === undefined || value === null) return;
      // Comparar con el valor actual del empleadoSeleccionado
      const existing = (this.empleadoSeleccionado as any)[key];
      if (typeof value === 'string') {
        if (value.trim() === '') return;
      }
      // Normalizar campos para comparación (mayúsculas, minúsculas, etc.)
      let normalizedNew = value;
      let normalizedExisting = existing;
      if (key === 'dni' && typeof value === 'string') normalizedNew = value.trim().toUpperCase();
      if (key === 'email' && typeof value === 'string') normalizedNew = value.trim().toLowerCase();
      if (key === 'nombre' && typeof value === 'string') normalizedNew = value.trim();
      if (key === 'apellidos' && typeof value === 'string') normalizedNew = value.trim();

      if (normalizedNew !== normalizedExisting) {
        (dto as any)[key] = normalizedNew;
      }
    };

    // Aplicar cambios de cada campo si fueron modificados
    addIfChanged('nombre', v.nombre);
    addIfChanged('apellidos', v.apellidos);
    addIfChanged('dni', v.dni ? v.dni.toUpperCase() : undefined);
    addIfChanged('email', v.email ? v.email.toLowerCase() : undefined);

    const telefonoRaw = `${v.phoneNumberPrefix ?? ''}${v.phoneNumber ?? ''}`.replace(/\s+/g, '');
    if (telefonoRaw) addIfChanged('telefono', telefonoRaw);

    if (v.rol) addIfChanged('rol', (v.rol || '').toString());

    // Incluir contraseña solo si fue proporcionada (campo opcional en actualización)
    if (v.password && v.password.trim()) {
      addIfChanged('contrasena', v.password);
    }

    // Si no hay cambios, informar al usuario y limpiar formulario
    if (Object.keys(dto).length === 0) {
      this.isUpdating = false;
      this.msg.info('No hay cambios para actualizar');
      this.empleadoSeleccionado = null;
      this.busquedaEmpleado = '';
      this.empleadosFiltrados = [];
      this.validateForm.reset();
      this.validateForm.controls['phoneNumberPrefix'].setValue('+34');
      return;
    }

    this.api
      .update(this.empleadoSeleccionado.id, dto)
      .pipe(
        finalize(() => {
          this.isUpdating = false;
        })
      )
      .subscribe({
        next: (res: EmpleadoDto) => {
          this.isConfirmVisible = false;
          // Mostrar modal de éxito
          this.isUpdateSuccessVisible = true;
          // Recargar lista de empleados
          this.api.getAll().subscribe({
            next: (data) => {
              this.empleados = data;
            },
          });
        },
        error: (err: HttpErrorResponse) => {
          if (err?.status === 409) {
            this.msg.error('Ya existe un empleado con ese DNI o Email');
          } else if (err?.status === 403 || err?.status === 401) {
            this.msg.error('No autorizado. Solo admins pueden actualizar empleados');
          } else {
            this.msg.error('Error al actualizar el empleado');
          }
        },
      });
  }

  /**
   * Confirma y ejecuta la eliminación del empleado.
   * Envía la petición al servidor y actualiza la lista de empleados.
   */
  handleDeleteOk(): void {
    if (!this.empleadoSeleccionado) return;

    this.loading = true;

    this.api
      .delete(this.empleadoSeleccionado.id)
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: () => {
          this.isConfirmVisible = false;
          // Mostrar modal de éxito
          this.isDeleteSuccessVisible = true;
          // Recargar lista de empleados
          this.api.getAll().subscribe({
            next: (data) => {
              this.empleados = data;
            },
          });
        },
        error: (err: HttpErrorResponse) => {
          if (err?.status === 403 || err?.status === 401) {
            this.msg.error('No autorizado. Solo admins pueden eliminar empleados');
          } else {
            this.msg.error('Error al eliminar el empleado');
          }
        },
      });
  }

  /**
   * Prepara la eliminación de un empleado.
   * Muestra el modal de confirmación con los datos del empleado a eliminar.
   */
  deleteEmpleado(): void {
    if (!this.empleadoSeleccionado) {
      this.msg.warning('Debes seleccionar un empleado para eliminar');
      return;
    }

    // Abrir modal de confirmación con los datos del empleado
    this.datosConfirmados = {
      nombre: this.empleadoSeleccionado.nombre,
      apellidos: this.empleadoSeleccionado.apellidos,
      dni: this.empleadoSeleccionado.dni,
      email: this.empleadoSeleccionado.email,
      phoneNumber: this.empleadoSeleccionado.telefono ?? '',
    };
    this.accion = 'eliminar' as any;
    this.isConfirmVisible = true;
  }

  /**
   * Validador personalizado para confirmar que dos campos coinciden.
   * Utilizado para confirmar contraseña en formularios.
   * @param control Control del campo de confirmación
   * @returns Errores de validación o null si es válido
   */
  confirmationValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return { required: true };
    if (control.value !== this.validateForm.controls.password.value)
      return { confirm: true, error: true };
    return null;
  }
}
