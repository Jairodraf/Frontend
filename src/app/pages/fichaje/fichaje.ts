import { Component, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FichajesService, FichajeCreateDto, FichajeDto } from '../../services/fichajes.service';
import { AuthService } from '../../services/auth.service';
import { EmpleadosService, EmpleadoDto } from '../../services/empleados.service';

/** Tipo de fichaje (entrada o salida) */
type PunchType = 'Entrada' | 'Salida';

/** Último botón presionado por el usuario */
type LastPressed = 'ENTRADA' | 'SALIDA';

/**
 * Estructura de un item del historial de fichajes.
 * Incluye tanto información de UI como metadata del backend.
 */
interface HistoryItem {
  id?: string; // ID del backend (para actualizar observación)
  type: PunchType;
  date: string;
  time: string;
  ts: string; // Timestamp ISO para ordenamiento y cálculos
  incidence?: string; // Observación/incidencia registrada
  empleadoId?: number; // ID del empleado (para filtrado por admin)
}

/**
 * Componente de página de fichaje que gestiona el registro de entradas y salidas.
 * Permite a los usuarios fichar entrada/salida, registrar incidencias, y ver historial.
 * Los administradores pueden consultar fichajes de cualquier empleado.
 */
@Component({
  selector: 'app-fichaje',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fichaje.html',
  styleUrls: ['./fichaje.scss'],
})
export class Fichaje implements AfterViewInit, OnDestroy {
  // Servicios inyectados
  private api = inject(FichajesService);
  private msg = inject(NzMessageService);
  private auth = inject(AuthService);
  private empleadosService = inject(EmpleadosService);

  // Estado del último fichaje
  /** Tipo del último fichaje (Entrada/Salida) */
  lastType: string = '—';
  /** Fecha del último fichaje */
  lastDate: string = '';
  /** Hora del último fichaje */
  lastTime: string = '';

  /** Hora actual del reloj en formato HH:MM:SS */
  currentTime: string = '';

  // Control de botones de fichaje
  /** Deshabilita el botón de Entrada si ya se ha fichado entrada */
  entradaDisabled = false;
  /** Deshabilita el botón de Salida si no hay entrada previa */
  salidaDisabled = true;

  // Historial de fichajes
  /** Lista de fichajes cargados desde backend o localStorage */
  history: HistoryItem[] = [];
  /** Clave para almacenar el historial en localStorage */
  private storageKey = 'fichaje_history_v1';

  // Control de estado de fichaje
  /** Último botón presionado (ENTRADA/SALIDA) */
  lastPressed: LastPressed | null = null;
  /** Índice del último fichaje de entrada en el historial */
  private lastEntryIndex: number | null = null;
  /** Índice del último fichaje de salida en el historial */
  private lastExitIndex: number | null = null;

  // Filtros de búsqueda
  /** Fecha de inicio del rango de filtro */
  filterStart: string = '';
  /** Fecha de fin del rango de filtro */
  filterEnd: string = '';

  // Registro de incidencias
  /** Texto de la incidencia a registrar */
  incidenceText: string = '';
  /** Controla la visibilidad del modal de éxito de incidencia */
  isIncidenceSuccessVisible: boolean = false;
  /** Controla la visibilidad del modal de éxito de fichaje */
  isFichajeSuccessVisible: boolean = false;
  /** Datos del fichaje para mostrar en modal de confirmación */
  fichajeConfirmData = { tipo: '', fecha: '', hora: '' };

  // Modal de entrada sin salida
  /** Controla la visibilidad del modal de advertencia de entrada sin salida */
  isEntradaSinSalidaVisible: boolean = false;
  /** Datos de la entrada sin salida para mostrar en modal */
  entradaSinSalidaData = { fecha: '', hora: '' };

  // Modal de error de fechas
  /** Controla la visibilidad del modal de error cuando fecha fin < fecha inicio */
  showDateError = false;

  // Funcionalidad admin
  /** Indica si el usuario actual es administrador */
  isAdmin = false;
  /** Lista de todos los empleados (solo admin) */
  empleados: EmpleadoDto[] = [];
  /** ID del empleado seleccionado para consultar fichajes (solo admin) */
  selectedEmpleadoId: number | null = null;
  /** Query de búsqueda de empleados */
  searchQuery = '';
  /** Lista de empleados filtrados por la búsqueda */
  filteredEmpleados: EmpleadoDto[] = [];
  /** Controla la visibilidad de la lista de empleados filtrados */
  showEmpleadosList = false;

  // Resultados de filtrado y agrupación
  /** Grupos de fichajes agrupados por fecha con pares entrada-salida */
  filteredGroups: Array<{
    date: string;
    pairs: Array<{ entrada: HistoryItem | null; salida: HistoryItem | null; durationMs: number }>;
    totalMs: number;
  }> = [];
  /** Tiempo total trabajado en el rango filtrado (en milisegundos) */
  filteredTotalMs: number = 0;

  /** Identificador del intervalo del reloj */
  private clockIntervalId: any = null;

  /**
   * Constructor del componente.
   * Inicializa el historial, el reloj, verifica rol de admin,
   * y carga fichajes desde backend o localStorage.
   */
  constructor() {
    // Cargar historial desde localStorage
    this.loadHistory();

    // Iniciar reloj que se actualiza cada segundo
    this.updateClock();
    this.clockIntervalId = setInterval(() => this.updateClock(), 1000);

    // Verificar si el usuario es administrador
    this.isAdmin = this.auth.rol === 'Admin';
    if (this.isAdmin) {
      this.loadEmpleados(); // Cargar lista de empleados para consulta
    }

    // Si el usuario está autenticado, cargar fichajes desde el backend
    if (this.auth.hasToken()) {
      this.loadRemoteFichajes();
    } else {
      // Si no hay token, usar historial local
      this.updateLastFromHistory();
      this.checkEntradaSinSalida();
    }
  }

  /** Hook de ciclo de vida después de inicializar la vista */
  ngAfterViewInit(): void {}

  /**
   * Hook de ciclo de vida al destruir el componente.
   * Limpia el intervalo del reloj.
   */
  ngOnDestroy(): void {
    if (this.clockIntervalId) clearInterval(this.clockIntervalId);
  }

  /**
   * Actualiza la hora actual mostrada en pantalla.
   * Se ejecuta cada segundo mediante setInterval.
   */
  private updateClock() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * Busca el índice del último fichaje de un tipo específico en el historial.
   * @param kind Tipo de fichaje a buscar ('Entrada' o 'Salida')
   * @returns El índice del último fichaje del tipo indicado, o null si no se encuentra
   */
  private findLastIndex(kind: 'Entrada' | 'Salida'): number | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].type === kind) return i;
    }
    return null;
  }

  /**
   * Aplica el filtro de fechas a los fichajes.
   * Si es admin, puede consultar fichajes de cualquier empleado.
   * Carga los fichajes del rango seleccionado y los agrupa por fecha.
   */
  applyFilter() {
    if (!this.filterStart || !this.filterEnd) {
      this.filteredGroups = [];
      this.filteredTotalMs = 0;
      return;
    }

    const start = new Date(this.filterStart + 'T00:00:00');
    const end = new Date(this.filterEnd + 'T23:59:59.999');

    // Validación: la fecha de fin no puede ser anterior a la de inicio
    if (end < start) {
      this.showDateError = true;
      return;
    }

    // Si es admin, cargar todos los fichajes y luego filtrar
    if (this.isAdmin) {
      this.api.todos().subscribe({
        next: (rows: FichajeDto[]) => {
          // Convertir a HistoryItem
          const allHistory = rows.map((r) => ({
            id: r.id,
            type: r.tipo === 'Entrada' ? 'Entrada' : 'Salida',
            date: new Date(r.fechaHora).toLocaleDateString('es-ES'),
            time: new Date(r.fechaHora).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            ts: r.fechaHora,
            incidence: r.observacion ?? undefined,
            empleadoId: r.empleadoId,
          } as HistoryItem & { empleadoId: number }));

          // Filtrar por empleado seleccionado o por el admin actual
          const targetEmpleadoId = this.selectedEmpleadoId ?? this.auth.empleadoId;

          // Filtrar por rango de fechas y por empleado
          const items = allHistory
            .filter((h) => {
              const t = new Date(h.ts);
              const inRange = t >= start && t <= end;
              const matchesEmpleado = Number((h as any).empleadoId) === Number(targetEmpleadoId);
              return inRange && matchesEmpleado;
            })
            .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

          this.processFilteredItems(items);
        },
        error: () => {
          this.msg.error('Error al cargar fichajes para filtrar');
          this.filteredGroups = [];
          this.filteredTotalMs = 0;
        }
      });
      return;
    }

    // Si no es admin, filtrar desde el historial local (sus propios fichajes)
    const items = this.history
      .filter((h) => {
        const t = new Date(h.ts);
        return t >= start && t <= end;
      })
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    this.processFilteredItems(items);
  }

  /**
   * Procesa los items filtrados del historial.
   * Agrupa los fichajes por fecha y empareja entradas con salidas,
   * calculando la duración de cada par y el total por día.
   * @param items Lista de fichajes a procesar
   */
  private processFilteredItems(items: HistoryItem[]) {

    // Agrupa por fecha local
    const byDate = new Map<string, HistoryItem[]>();
    for (const it of items) {
      const d = new Date(it.ts).toLocaleDateString('es-ES');
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(it);
    }

    const groups: Array<{
      date: string;
      pairs: Array<{ entrada: HistoryItem | null; salida: HistoryItem | null; durationMs: number }>;
      totalMs: number;
    }> = [];
    let overall = 0;

    const orderedDates = Array.from(byDate.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    for (const d of orderedDates) {
      const arr = byDate.get(d)!;

      const pairs: Array<{
        entrada: HistoryItem | null;
        salida: HistoryItem | null;
        durationMs: number;
      }> = [];
      let pendingEntrada: HistoryItem | null = null;

      for (const it of arr) {
        if (it.type === 'Entrada') {
          // si había pendiente sin salida, emparejamos como entrada sin salida
          if (pendingEntrada) {
            pairs.push({ entrada: pendingEntrada, salida: null, durationMs: 0 });
          }
          pendingEntrada = it;
        } else {
          // Salida
          if (pendingEntrada) {
            const dur = new Date(it.ts).getTime() - new Date(pendingEntrada.ts).getTime();
            pairs.push({ entrada: pendingEntrada, salida: it, durationMs: Math.max(dur, 0) });
            pendingEntrada = null;
          } else {
            // Salida sin entrada previa: la registramos como par “huérfano”
            pairs.push({ entrada: null, salida: it, durationMs: 0 });
          }
        }
      }

      // Si quedó una entrada sin salida al final del día
      if (pendingEntrada) {
        pairs.push({ entrada: pendingEntrada, salida: null, durationMs: 0 });
      }

      const totalMs = pairs.reduce((acc, p) => acc + (p.durationMs || 0), 0);
      overall += totalMs;
      groups.push({ date: d, pairs, totalMs });
    }

    this.filteredGroups = groups;
    this.filteredTotalMs = overall;
  }

  /**
   * Carga los fichajes del usuario actual desde el backend.
   * Reemplaza el historial local con los datos del servidor (fuente canónica).
   * Esto asegura el control correcto del estado de los botones Entrada/Salida.
   * @param limit Número máximo de fichajes a cargar (opcional)
   */
  loadRemoteFichajes(limit?: number) {
    // Siempre cargar solo los fichajes del usuario actual para controlar botones correctamente
    this.api.misFichajes(limit).subscribe({
      next: (rows: FichajeDto[]) => {
        this.history = rows.map((r) => ({
          id: r.id,
          type: r.tipo === 'Entrada' ? 'Entrada' : 'Salida',
          date: new Date(r.fechaHora).toLocaleDateString('es-ES'),
          time: new Date(r.fechaHora).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          ts: r.fechaHora,
          incidence: r.observacion ?? undefined,
          empleadoId: r.empleadoId,
        } as HistoryItem));
        this.saveHistory();
        this.updateLastFromHistory();
        // Verificar entrada sin salida después de cargar
        this.checkEntradaSinSalida();
      },
      error: () => this.msg.error('No se pudieron cargar los fichajes desde el servidor'),
    });
  }

  /**
   * Actualiza el estado del componente basándose en el último fichaje del historial.
   * Controla la habilitación/deshabilitación de los botones Entrada/Salida,
   * y verifica si hay entrada sin salida después de 9 horas.
   */
  private updateLastFromHistory() {
    const last = this.history[this.history.length - 1];
    if (last) {
      this.lastType = last.type;
      this.lastDate = last.date;
      this.lastTime = last.time;
      if (last.type === 'Entrada') {
        // Verificar si han pasado más de 9 horas desde la entrada
        const hoursElapsed = this.getHoursElapsed(last.ts);
        if (hoursElapsed > 9) {
          // Han pasado más de 9 horas, resetear a estado de entrada
          this.entradaDisabled = false;
          this.salidaDisabled = true;
          // Mostrar modal de aviso
          this.entradaSinSalidaData = { fecha: last.date, hora: last.time };
          this.isEntradaSinSalidaVisible = true;
        } else {
          this.entradaDisabled = true;
          this.salidaDisabled = false;
        }
      } else {
        this.entradaDisabled = false;
        this.salidaDisabled = true;
      }
    } else {
      // Si no hay historial, habilita solo Entrada (primer fichaje)
      this.entradaDisabled = false;
      this.salidaDisabled = true;
      this.lastType = '—';
      this.lastDate = '';
      this.lastTime = '';
    }
  }

  /**
   * Registra un fichaje de entrada o salida.
   * Actualiza el historial local, controla el estado de los botones,
   * y persiste el fichaje en el backend.
   * @param type Tipo de fichaje ('ENTRADA' o 'SALIDA')
   */
  fichar(type: 'ENTRADA' | 'SALIDA') {
    const now = new Date();
    const date = now.toLocaleDateString('es-ES');
    const time = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const iso = now.toISOString();

    if (type === 'ENTRADA') {
      // 1) Registrar fichaje de entrada en el historial local
      const entry: HistoryItem = { type: 'Entrada', date, time, ts: iso };
      this.history.push(entry);
      this.lastEntryIndex = this.history.length - 1;
      this.lastPressed = 'ENTRADA';

      this.lastType = 'Entrada';
      this.lastDate = date;
      this.lastTime = time;

      this.entradaDisabled = true;
      this.salidaDisabled = false;
      this.saveHistory();

      // 2) Persistir el fichaje de entrada en el backend
      const dto: FichajeCreateDto = { tipo: 'Entrada', fechaHora: iso };
      this.api.crear(dto).subscribe({
        next: (res: FichajeDto) => {
          // Guardar el ID del backend para poder actualizar la observación más tarde
          this.history[this.lastEntryIndex!].id = res.id;
          this.saveHistory();
          // Mostrar modal de confirmación
          this.fichajeConfirmData = { tipo: 'Entrada', fecha: date, hora: time };
          this.isFichajeSuccessVisible = true;
        },
        error: () => this.msg.error('No se pudo registrar la Entrada en servidor'),
      });
    } else {
      // Registrar fichaje de salida
      const exit: HistoryItem = { type: 'Salida', date, time, ts: iso };
      this.history.push(exit);
      this.lastExitIndex = this.history.length - 1;
      this.lastPressed = 'SALIDA';

      this.lastType = 'Salida';
      this.lastDate = date;
      this.lastTime = time;

      this.entradaDisabled = false;
      this.salidaDisabled = true;
      this.saveHistory();

      const dto: FichajeCreateDto = { tipo: 'Salida', fechaHora: iso };
      this.api.crear(dto).subscribe({
        next: (res: FichajeDto) => {
          this.history[this.lastExitIndex!].id = res.id;
          this.saveHistory();
          // Mostrar modal de confirmación
          this.fichajeConfirmData = { tipo: 'Salida', fecha: date, hora: time };
          this.isFichajeSuccessVisible = true;
        },
        error: () => this.msg.error('No se pudo registrar la Salida en servidor'),
      });
    }
  }

  /**
   * Registra una incidencia en el último fichaje realizado.
   * La incidencia se guarda en el campo Observacion del backend.
   * Si no hay conexión, se guarda localmente.
   */
  registerIncidentNow() {
    const text = (this.incidenceText || '').trim();
    if (!text) return;

    let idx: number | null = null;
    if (this.lastPressed === 'ENTRADA') {
      idx = this.lastEntryIndex ?? this.findLastIndex('Entrada');
    } else if (this.lastPressed === 'SALIDA') {
      idx = this.lastExitIndex ?? this.findLastIndex('Salida');
    } else {
      idx = this.findLastIndex('Entrada') ?? this.findLastIndex('Salida');
    }

    if (idx == null || idx < 0) return;

    // Actualizar incidencia en el historial local
    this.history[idx].incidence = text;
    this.saveHistory();
    this.incidenceText = '';

    // Si el fichaje tiene ID del backend, persistir la observación en el servidor
    const id = this.history[idx].id;
    if (id) {
      this.api.actualizarObservacion(id, text).subscribe({
        next: () => {
          this.isIncidenceSuccessVisible = true;
        },
        error: () => this.msg.error('No se pudo guardar la incidencia en el servidor'),
      });
    } else {
      this.msg.warning('Incidencia guardada localmente (pendiente de sincronizar)');
    }
  }

  /** Cierra el modal de éxito de registro de incidencia */
  handleIncidenceSuccessOk(): void {
    this.isIncidenceSuccessVisible = false;
  }

  /** Cierra el modal de éxito de registro de fichaje */
  handleFichajeSuccessOk(): void {
    this.isFichajeSuccessVisible = false;
  }

  /**
   * Verifica si hay una entrada sin salida después de 9 horas.
   * Si es así, resetea el estado de los botones y muestra una advertencia.
   */
  private checkEntradaSinSalida(): void {
    const last = this.history[this.history.length - 1];
    if (last && last.type === 'Entrada') {
      const hoursElapsed = this.getHoursElapsed(last.ts);
      if (hoursElapsed > 9) {
        // Han pasado más de 9 horas: resetear a estado inicial (permitir nueva entrada)
        this.entradaDisabled = false;
        this.salidaDisabled = true;
        // Mostrar modal de advertencia al usuario
        this.entradaSinSalidaData = { fecha: last.date, hora: last.time };
        this.isEntradaSinSalidaVisible = true;
      }
    }
  }

  /**
   * Calcula las horas transcurridas desde un timestamp dado.
   * @param timestamp Timestamp en formato ISO string
   * @returns Número de horas transcurridas
   */
  private getHoursElapsed(timestamp: string): number {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    return diffMs / (1000 * 60 * 60); // Convertir milisegundos a horas
  }

  /** Cierra el modal de advertencia de entrada sin salida */
  handleEntradaSinSalidaOk(): void {
    this.isEntradaSinSalidaVisible = false;
  }

  /** Cierra el modal de error de fechas */
  closeDateError(): void {
    this.showDateError = false;
  }

  /**
   * Carga la lista completa de empleados desde el backend.
   * Solo disponible para usuarios con rol de administrador.
   */
  private loadEmpleados() {
    this.empleadosService.getAll().subscribe({
      next: (data) => {
        this.empleados = data;
      },
      error: () => {
        this.msg.error('Error al cargar la lista de empleados');
      }
    });
  }

  /**
   * Maneja la búsqueda de empleados mientras el admin escribe.
   * Filtra la lista de empleados por nombre, apellidos, DNI o email.
   * @param event Evento del input de búsqueda
   */
  onEmpleadoSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    const query = input.value.toLowerCase().trim();
    this.searchQuery = query;

    if (!query) {
      this.filteredEmpleados = [];
      this.showEmpleadosList = false;
      return;
    }

    this.filteredEmpleados = this.empleados.filter(e =>
      e.nombre.toLowerCase().includes(query) ||
      e.apellidos.toLowerCase().includes(query) ||
      e.dni.toLowerCase().includes(query) ||
      e.email.toLowerCase().includes(query)
    );
    this.showEmpleadosList = this.filteredEmpleados.length > 0;
  }

  /**
   * Selecciona un empleado de la lista de resultados de búsqueda.
   * Aplica automáticamente el filtro si hay fechas seleccionadas.
   * @param emp Empleado seleccionado
   */
  selectEmpleado(emp: EmpleadoDto) {
    this.selectedEmpleadoId = emp.id;
    this.searchQuery = `${emp.nombre} ${emp.apellidos} (${emp.dni})`;
    this.filteredEmpleados = [];
    this.showEmpleadosList = false;
    // Si hay fechas seleccionadas, aplicar el filtro automáticamente
    if (this.filterStart && this.filterEnd) {
      this.applyFilter();
    }
  }

  /**
   * Limpia la selección de empleado y el campo de búsqueda.
   * Aplica automáticamente el filtro si hay fechas seleccionadas.
   */
  clearEmpleadoSelection() {
    this.selectedEmpleadoId = null;
    this.searchQuery = '';
    this.filteredEmpleados = [];
    this.showEmpleadosList = false;
    // Si hay fechas seleccionadas, reaplicar el filtro con todos los empleados
    if (this.filterStart && this.filterEnd) {
      this.applyFilter();
    }
  }

  /**
   * Guarda el historial de fichajes en localStorage.
   * Se ejecuta después de cada modificación del historial.
   */
  private saveHistory() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.history));
    } catch {}
  }

  /**
   * Carga el historial de fichajes desde localStorage.
   * Se ejecuta al iniciar el componente.
   */
  private loadHistory() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      this.history = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    } catch {
      this.history = [];
    }
  }

  /**
   * Convierte milisegundos a formato legible de horas y minutos.
   * @param ms Milisegundos a convertir
   * @returns String en formato "Xh Ym"
   */
  msToHhMm(ms: number) {
    const totalSec = Math.floor((ms || 0) / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}h ${m}m`;
  }
}
