/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { MovimientoCajaDto } from './dto/movimiento-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';

/** Umbral de diferencia de efectivo que exige motivo al cerrar. */
const UMBRAL_DIFERENCIA = new Prisma.Decimal(20);
const D0 = new Prisma.Decimal(0);

@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Abre una caja aplicando las tres reglas del modelo serio:
   *
   *  1. (C10) El cajero no puede tener NINGUNA caja abierta, ni siquiera en
   *     otra botica. Su responsabilidad sobre el efectivo es una a la vez.
   *  2. (C8) El terminal debe existir en el catálogo y estar activo.
   *  3. (C8) Un cajón físico = una sesión: si el terminal ya tiene caja
   *     abierta, se rechaza indicando QUIÉN lo ocupa.
   */
  async abrir(dto: AbrirCajaDto, cajeroId: string) {
    // 1) Caja abierta del cajero en CUALQUIER sucursal.
    const propiaAbierta = await this.prisma.cajaSesion.findFirst({
      where: { cajeroId, estado: 'ABIERTA' },
      include: { sucursal: { select: { nombre: true } } },
    });
    if (propiaAbierta) {
      throw new ConflictException(
        `Ya tienes una caja abierta en ${propiaAbierta.sucursal.nombre}; ciérrala primero`,
      );
    }

    // 2) El terminal debe estar catalogado y activo en esa sucursal.
    const terminal = await this.prisma.terminal.findUnique({
      where: { sucursalId_nombre: { sucursalId: dto.sucursalId, nombre: dto.terminal } },
    });
    if (!terminal || !terminal.activo) {
      throw new BadRequestException(
        `El terminal ${dto.terminal} no existe o está inactivo en esta sucursal`,
      );
    }

    // 3) Un cajón físico no puede tener dos sesiones abiertas.
    const terminalOcupado = await this.prisma.cajaSesion.findFirst({
      where: { sucursalId: dto.sucursalId, terminal: dto.terminal, estado: 'ABIERTA' },
      include: { cajero: { select: { nombres: true, apellidos: true } } },
    });
    if (terminalOcupado) {
      const quien = `${terminalOcupado.cajero.nombres} ${terminalOcupado.cajero.apellidos ?? ''}`.trim();
      throw new ConflictException(
        `El terminal ${dto.terminal} ya tiene una caja abierta (${quien})`,
      );
    }

    return this.prisma.cajaSesion.create({
      data: {
        sucursalId: dto.sucursalId,
        cajeroId,
        terminal: dto.terminal,
        montoInicial: new Prisma.Decimal(dto.montoInicial),
      },
    });
  }

  /**
   * (C9) Relevo de turno: último cierre de ESTE terminal en ESTA sucursal.
   * El front lo usa para sugerir el fondo inicial y encadenar turnos, en vez
   * de que cada cajero invente un monto.
   */
  async ultimoCierreDeTerminal(sucursalId: string, terminal: string) {
    const ultima = await this.prisma.cajaSesion.findFirst({
      where: { sucursalId, terminal, estado: 'CERRADA', cerradaEn: { not: null } },
      orderBy: { cerradaEn: 'desc' },
      include: { cajero: { select: { nombres: true, apellidos: true } } },
    });
    if (!ultima) return null;
    return {
      cerradaEn: ultima.cerradaEn,
      cajeroAnterior: `${ultima.cajero.nombres} ${ultima.cajero.apellidos ?? ''}`.trim(),
      efectivoContado: ultima.efectivoContado,
    };
  }

  /**
   * Terminales de una sucursal con su estado de ocupación y el último cierre
   * de cada uno. Alimenta el selector de apertura del front (C8 + C9).
   */
  async terminalesDeSucursal(sucursalId: string) {
    const terminales = await this.prisma.terminal.findMany({
      where: { sucursalId, activo: true },
      orderBy: { nombre: 'asc' },
    });

    const abiertas = await this.prisma.cajaSesion.findMany({
      where: { sucursalId, estado: 'ABIERTA' },
      include: { cajero: { select: { nombres: true, apellidos: true } } },
    });
    // Se guarda también DESDE CUÁNDO: un terminal "ocupado desde hace 18 días"
    // no es que esté en uso, es una caja que nadie cerró.
    const ocupacion = new Map(
      abiertas.map((c) => [
        c.terminal,
        {
          por: `${c.cajero.nombres} ${c.cajero.apellidos ?? ''}`.trim(),
          desde: c.aperturaEn,
          dias: this.diasDesde(c.aperturaEn),
        },
      ]),
    );

    return Promise.all(
      terminales.map(async (t) => {
        const ocup = ocupacion.get(t.nombre);
        return {
          id: t.id,
          nombre: t.nombre,
          ocupado: !!ocup,
          ocupadoPor: ocup?.por ?? null,
          ocupadoDesde: ocup?.desde ?? null,
          diasOcupado: ocup?.dias ?? 0,
          ultimoCierre: await this.ultimoCierreDeTerminal(sucursalId, t.nombre),
        };
      }),
    );
  }

  // ── CRUD de terminales (solo ADMIN desde el controller) ────────────────
  async crearTerminal(sucursalId: string, nombre: string) {
    const limpio = nombre.trim().toUpperCase();
    const existe = await this.prisma.terminal.findUnique({
      where: { sucursalId_nombre: { sucursalId, nombre: limpio } },
    });
    if (existe) throw new ConflictException(`El terminal ${limpio} ya existe en esta sucursal`);
    return this.prisma.terminal.create({ data: { sucursalId, nombre: limpio } });
  }

  async actualizarTerminal(id: string, datos: { nombre?: string; activo?: boolean }) {
    const terminal = await this.prisma.terminal.findUnique({ where: { id } });
    if (!terminal) throw new NotFoundException('Terminal no encontrado');

    // No se desactiva ni se renombra un terminal con caja abierta: dejaría la
    // sesión huérfana respecto del catálogo.
    if (datos.activo === false || (datos.nombre && datos.nombre.trim().toUpperCase() !== terminal.nombre)) {
      const enUso = await this.prisma.cajaSesion.findFirst({
        where: { sucursalId: terminal.sucursalId, terminal: terminal.nombre, estado: 'ABIERTA' },
      });
      if (enUso) {
        throw new BadRequestException(
          `El terminal ${terminal.nombre} tiene una caja abierta. Ciérrala antes de modificarlo.`,
        );
      }
    }

    return this.prisma.terminal.update({
      where: { id },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre.trim().toUpperCase() }),
        ...(datos.activo !== undefined && { activo: datos.activo }),
      },
    });
  }

  /**
   * Caja ABIERTA del cajero en CUALQUIER sucursal (o null).
   *
   * Necesario porque solo puede tener una a la vez: si quedó abierta en otra
   * botica, la pantalla debe mostrársela para que pueda cerrarla, en vez de
   * bloquearla con un error sin salida.
   */
  async miCajaAbierta(cajeroId: string) {
    const caja = await this.prisma.cajaSesion.findFirst({
      where: { cajeroId, estado: 'ABIERTA' },
      include: { sucursal: { select: { id: true, nombre: true } } },
    });
    if (!caja) return null;
    return {
      id: caja.id,
      sucursalId: caja.sucursalId,
      sucursalNombre: caja.sucursal.nombre,
      terminal: caja.terminal,
      montoInicial: caja.montoInicial,
      aperturaEn: caja.aperturaEn,
      diasAbierta: this.diasDesde(caja.aperturaEn),
    };
  }

  /** Devuelve la caja ABIERTA del cajero en la sucursal (o null). */
  async cajaAbierta(cajeroId: string, sucursalId: string) {
    return this.prisma.cajaSesion.findFirst({
      where: { cajeroId, sucursalId, estado: 'ABIERTA' },
    });
  }

  /**
   * Sesión de caja por id (abierta o cerrada). La usa el controller para saber
   * a qué sucursal pertenece y validar el scope antes de exponer el arqueo.
   */
  async obtenerSesion(id: string) {
    const caja = await this.prisma.cajaSesion.findUnique({ where: { id } });
    if (!caja) throw new NotFoundException('Caja no encontrada');
    return caja;
  }

  private async obtenerAbierta(id: string) {
    const caja = await this.prisma.cajaSesion.findUnique({ where: { id } });
    if (!caja) throw new NotFoundException('Caja no encontrada');
    if (caja.estado !== 'ABIERTA') {
      throw new BadRequestException('La caja ya está cerrada');
    }
    return caja;
  }

  /**
   * Registra un movimiento manual de caja (INGRESO/EGRESO) con motivo obligatorio.
   * `registradoPorId` sale del JWT (no del body): un retiro sin responsable no
   * sirve para auditar.
   */
  async registrarMovimiento(cajaId: string, dto: MovimientoCajaDto, registradoPorId?: string) {
    await this.obtenerAbierta(cajaId);
    return this.prisma.movimientoCaja.create({
      data: {
        cajaSesionId: cajaId,
        tipo: dto.tipo,
        categoria: dto.categoria,
        monto: new Prisma.Decimal(dto.monto),
        motivo: dto.motivo,
        registradoPorId,
      },
    });
  }

  /** Umbral de descuadre configurable (Configuracion.umbralDescuadreCaja). */
  private async umbralDescuadre(): Promise<Prisma.Decimal> {
    const cfg = await this.prisma.configuracion.findUnique({ where: { id: 'global' } });
    return cfg?.umbralDescuadreCaja ?? UMBRAL_DIFERENCIA;
  }

  /**
   * (C6) Vista de control del ADMIN: quién abrió, en qué terminal, si sigue
   * abierta y cómo cerró.
   *
   * IMPORTANTE: incluye TODAS las cajas ABIERTAS sin importar su fecha de
   * apertura, no solo las de hoy. Una caja olvidada hace días es precisamente
   * el caso que hay que poder ver y forzar a cerrar; si se filtrara por fecha,
   * quedaría invisible para siempre y su terminal bloqueado.
   */
  async cajasDelDia(sucursalId: string) {
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);
    const sesiones = await this.prisma.cajaSesion.findMany({
      where: {
        sucursalId,
        OR: [
          { estado: 'ABIERTA' },                 // abiertas: siempre, sin importar cuándo
          { aperturaEn: { gte: desde } },        // cerradas: solo las de hoy
        ],
      },
      orderBy: { aperturaEn: 'desc' },
      include: {
        cajero: { select: { nombres: true, apellidos: true } },
        cerradaPor: { select: { nombres: true, apellidos: true } },
      },
    });

    // Se marca cuántos días lleva abierta para que la UI destaque las huérfanas.
    return sesiones.map((s) => ({
      ...s,
      diasAbierta: s.estado === 'ABIERTA' ? this.diasDesde(s.aperturaEn) : 0,
      huerfana: s.estado === 'ABIERTA' && this.diasDesde(s.aperturaEn) >= 1,
    }));
  }

  /** Días completos transcurridos desde una fecha (0 = hoy mismo). */
  private diasDesde(fecha: Date): number {
    return Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
  }

  /**
   * Cajas abiertas con más de N horas (por defecto 24): candidatas a olvido.
   * Alimenta la alerta del dashboard del administrador.
   */
  async cajasOlvidadas(sucursalId?: string, horas = 24) {
    const limite = new Date(Date.now() - horas * 3_600_000);
    const sesiones = await this.prisma.cajaSesion.findMany({
      where: {
        estado: 'ABIERTA',
        aperturaEn: { lt: limite },
        ...(sucursalId ? { sucursalId } : {}),
      },
      orderBy: { aperturaEn: 'asc' },
      include: {
        cajero: { select: { nombres: true, apellidos: true } },
        sucursal: { select: { nombre: true } },
      },
    });
    return sesiones.map((s) => ({
      id: s.id,
      sucursalId: s.sucursalId,
      sucursal: s.sucursal.nombre,
      terminal: s.terminal,
      cajero: `${s.cajero.nombres} ${s.cajero.apellidos ?? ''}`.trim(),
      aperturaEn: s.aperturaEn,
      diasAbierta: this.diasDesde(s.aperturaEn),
    }));
  }

  /**
   * Resumen vivo / arqueo de la caja: agrega ventas reales por método de pago,
   * movimientos manuales y calcula el efectivo esperado.
   *   efectivoEsperado = montoInicial + ventasEfectivo + ingresos − egresos
   * Yape/Plin y Tarjeta son informativos (no afectan el arqueo de efectivo).
   */
  async resumen(cajaId: string) {
    const caja = await this.prisma.cajaSesion.findUnique({
      where: { id: cajaId },
      include: { movimientos: true },
    });
    if (!caja) throw new NotFoundException('Caja no encontrada');

    // Pagos de las ventas COMPLETADAS de esta sesión, agrupados por método.
    const pagos = await this.prisma.pago.findMany({
      where: { venta: { cajaSesionId: cajaId, estado: 'COMPLETADA' } },
      select: { metodo: true, monto: true },
    });

    const porMetodo = {
      EFECTIVO: D0,
      TARJETA: D0,
      YAPE_PLIN: D0,
      TRANSFERENCIA: D0,
      MIXTO: D0,
    } as Record<string, Prisma.Decimal>;
    for (const p of pagos) {
      porMetodo[p.metodo] = (porMetodo[p.metodo] ?? D0).plus(p.monto);
    }
    const totalVendido = pagos.reduce((acc, p) => acc.plus(p.monto), D0);

    let ingresos = D0;
    let egresos = D0;
    for (const m of caja.movimientos) {
      if (m.tipo === 'INGRESO') ingresos = ingresos.plus(m.monto);
      else egresos = egresos.plus(m.monto);
    }

    const efectivoEsperado = new Prisma.Decimal(caja.montoInicial)
      .plus(porMetodo.EFECTIVO)
      .plus(ingresos)
      .minus(egresos);

    const ventasCount = await this.prisma.venta.count({
      where: { cajaSesionId: cajaId, estado: 'COMPLETADA' },
    });

    return {
      cajaId,
      estado: caja.estado,
      montoInicial: caja.montoInicial,
      porMetodo,
      totalVendido,
      ingresos,
      egresos,
      efectivoEsperado,
      tickets: ventasCount,
      movimientos: caja.movimientos,
    };
  }

  /**
   * Cierra la caja con arqueo. Calcula la diferencia (solo efectivo) y exige
   * motivo si supera el umbral. Persiste efectivoEsperado/Contado/diferencia.
   */
  /**
   * Cierra la caja con arqueo.
   * @param cerradaPorId  Quién cierra (JWT). Puede ser un ADMIN forzando el
   *                      cierre de una caja olvidada: queda registrado.
   */
  async cerrar(cajaId: string, dto: CerrarCajaDto, cerradaPorId?: string) {
    await this.obtenerAbierta(cajaId);
    const resumen = await this.resumen(cajaId);

    const contado = new Prisma.Decimal(dto.efectivoContado);
    const diferencia = contado.minus(resumen.efectivoEsperado);

    // Umbral configurable por botica (Configuracion.umbralDescuadreCaja).
    const umbral = await this.umbralDescuadre();
    if (diferencia.abs().greaterThan(umbral) && !dto.motivoDiferencia) {
      throw new BadRequestException(
        `La diferencia (S/.${diferencia.toFixed(2)}) supera el umbral de S/.${umbral.toFixed(2)}; indica un motivo`,
      );
    }

    return this.prisma.cajaSesion.update({
      where: { id: cajaId },
      data: {
        estado: 'CERRADA',
        efectivoEsperado: resumen.efectivoEsperado,
        efectivoContado: contado,
        diferencia,
        cerradaEn: new Date(),
        cerradaPorId,
        motivoDescuadre: dto.motivoDiferencia ?? null,
      },
    });
  }

  /**
   * Reporte de cierre Z imprimible: resumen final con desglose por método,
   * movimientos y arqueo. Disponible para cajas abiertas (preliminar) o cerradas.
   */
  async reporteZ(cajaId: string) {
    const caja = await this.prisma.cajaSesion.findUnique({
      where: { id: cajaId },
      include: { sucursal: true, cajero: { select: { nombres: true, apellidos: true } } },
    });
    if (!caja) throw new NotFoundException('Caja no encontrada');
    const resumen = await this.resumen(cajaId);
    const anuladas = await this.prisma.venta.count({
      where: { cajaSesionId: cajaId, estado: 'ANULADA' },
    });
    return {
      sucursal: caja.sucursal.nombre,
      cajero: `${caja.cajero.nombres} ${caja.cajero.apellidos}`,
      terminal: caja.terminal,
      aperturaEn: caja.aperturaEn,
      cerradaEn: caja.cerradaEn,
      ...resumen,
      anuladas,
      efectivoContado: caja.efectivoContado,
      diferencia: caja.diferencia,
    };
  }

  /** Histórico de cajas de una sucursal. */
  async historico(sucursalId: string) {
    const sesiones = await this.prisma.cajaSesion.findMany({
      // Solo CERRADAS: la pantalla se llama "Cierres recientes". Una sesión
      // abierta no tiene arqueo, y aparecía con importes y diferencia en 0
      // como si hubiera cuadrado.
      where: { sucursalId, estado: 'CERRADA' },
      orderBy: { cerradaEn: 'desc' },
      take: 60,
      // Sin esto el front no sabe QUIÉN abrió ni quién cerró cada sesión. Es el
      // dato que convierte el histórico en una pista de auditoría; faltaba, y
      // la pantalla terminaba mostrando el nombre del usuario conectado.
      include: {
        cajero: { select: { nombres: true, apellidos: true } },
        cerradaPor: { select: { nombres: true, apellidos: true } },
      },
    });

    if (sesiones.length === 0) return [];

    // Vendido y tickets por sesión.
    //
    // Antes no se enviaban y el front los rellenaba con CEROS a mano: el
    // histórico mostraba "S/. 0.00 · 0 tickets" en todas las filas, incluso en
    // turnos con decenas de ventas. Se veía como si nadie hubiera vendido nunca.
    //
    // Se resuelve en DOS consultas para todas las sesiones, no una por fila.
    const ids = sesiones.map((s) => s.id);

    const [tickets, cobros] = await Promise.all([
      this.prisma.venta.groupBy({
        by: ['cajaSesionId'],
        where: { cajaSesionId: { in: ids }, estado: 'COMPLETADA' },
        _count: { _all: true },
      }),
      this.prisma.pago.findMany({
        where: { venta: { cajaSesionId: { in: ids }, estado: 'COMPLETADA' } },
        select: { monto: true, venta: { select: { cajaSesionId: true } } },
      }),
    ]);

    // Tipo explícito: `array.map()` que devuelve pares infiere
    // `(string | objeto)[][]`, no una tupla, y `new Map()` lo rechaza.
    const porSesion = new Map<string, { tickets: number; total: Prisma.Decimal }>();
    for (const t of tickets) {
      porSesion.set(t.cajaSesionId ?? '', { tickets: t._count._all, total: D0 });
    }
    for (const p of cobros) {
      const clave = p.venta.cajaSesionId ?? '';
      const acc = porSesion.get(clave);
      if (acc) acc.total = acc.total.plus(p.monto);
    }

    return sesiones.map((s) => {
      const r = porSesion.get(s.id);
      return {
        ...s,
        totalVentas: (r?.total ?? D0).toDecimalPlaces(2),
        cantidadTickets: r?.tickets ?? 0,
      };
    });
  }
}
