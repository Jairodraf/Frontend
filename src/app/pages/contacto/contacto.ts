import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Componente de página de contacto
 * Permite a los usuarios enviar mensajes de contacto mediante formulario
 * que abre el cliente de correo predeterminado
 */
@Component({
  selector: 'app-contacto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contacto.html',
  styleUrl: './contacto.scss'
})
export class Contacto {
  /** Nombre del usuario que envía el mensaje */
  nombre = '';

  /** Email de contacto del usuario */
  email = '';

  /** Mensaje de contacto del usuario */
  mensaje = '';

  /** Indica si se debe mostrar el modal de confirmación de envío de email */
  showEmailConfirm = false;

  /**
   * Maneja el envío del formulario de contacto
   * Valida que todos los campos estén completos y que el mensaje tenga longitud mínima
   * Si la validación es exitosa, muestra el modal de confirmación
   */
  onSubmit() {
    // Validación: todos los campos son obligatorios
    if (!this.nombre || !this.email || !this.mensaje) {
      alert('Por favor, completa todos los campos antes de enviar.');
      return;
    }

    // Validación: el mensaje debe tener al menos 10 caracteres
    if (this.mensaje.length < 10) {
      alert('El mensaje debe tener al menos 10 caracteres.');
      return;
    }

    // Mostrar modal de confirmación antes de abrir el cliente de correo
    this.showEmailConfirm = true;
  }

  /**
   * Confirma el envío del email y abre el cliente de correo predeterminado
   * Construye el asunto y el cuerpo del email con los datos del formulario
   * Limpia el formulario después de abrir el cliente de correo
   */
  confirmEmail() {
    // Ocultar el modal de confirmación
    this.showEmailConfirm = false;

    // Construir el cuerpo del email con los datos del formulario
    const bodyLines = [
      `Nombre: ${this.nombre}`,
      `Email: ${this.email}`,
      '',
      'Mensaje:',
      this.mensaje
    ];

    // Construir el asunto del email
    const subject = `Contacto desde FichajeApp - ${this.nombre}`;

    // Crear el enlace mailto con el asunto y cuerpo codificados
    const mailto = `mailto:jaime.rafrod@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;

    // Abrir el cliente de correo predeterminado del usuario
    window.location.href = mailto;

    // Limpiar el formulario después de enviar
    this.nombre = '';
    this.email = '';
    this.mensaje = '';
  }

  /**
   * Cancela el envío del email y oculta el modal de confirmación
   * El formulario mantiene los datos introducidos por si el usuario quiere modificarlos
   */
  cancelEmail() {
    this.showEmailConfirm = false;
  }
}
