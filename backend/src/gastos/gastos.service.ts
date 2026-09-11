import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearGastoDto } from './dto/crear-gasto.dto';
import { ActualizarGastoDto } from './dto/actualizar-gasto.dto';
import {
  ActualizarGastoRecurrenteDto,
  AplicarRecurrentesDto,
  CrearGastoRecurrenteDto,
} from './dto/gasto-recurrente.dto';

@Injectable()
export class GastosService {
  constructor(private readonly prisma: PrismaService) {}

  private rango(desde?: string, hasta?: string): Prisma.DateTimeFilter | undefined {
    if (!desde && !hasta) return undefined;
    return {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: new Date(hasta) } : {}),
    };
  }

  async crear(dto: CrearGastoDto, registradoPor: string) {
    // La mercadería NO es un gasto: es inventario. Entra por Compras y sale
    // como costo de ventas cuando se vende. Registrarla también aquí la
    // descuenta DOS VECES de la utilidad neta y hunde el resultado del mes
    // sin que nadie entienda por qué. La categoría existe en el enum por
    // compatibilidad con filas antiguas, pero ya no se acepta.
    if (dto.categoria === 'MERCADERIA') {
      throw new BadRequestException(
        'La compra de mercadería se registra en Compras, no como gasto. ' +
          'Si la cargas aquí se descuenta dos veces de la utilidad. ' +
          'Para fletes o comisiones usa TRANSPORTE u OTROS.',
      );
    }

    const fecha = dto.fecha ? new Date(dto.fecha) : new Date();
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException('Fecha del gasto inválida.');
    }
    // Un gasto futuro descuadra el período y no se puede haber pagado todavía.
    // Se tolera el día en curso completo (zona horaria del navegador vs. server).
    const limite = new Date();
    limite.setHours(23, 59, 59, 999);
    if (fecha > limite) {
      throw new BadRequestException('No se puede registrar un gasto con fecha futura.');
    }

    return this.prisma.gasto.create({
      data: {
        sucursalId: dto.sucursalId,
        categoria: dto.categoria,
        descripcion: dto.descripcion.trim(),
        monto: new Prisma.Decimal(dto.monto),
        fecha,
        registradoPor,
      },
      include: { usuario: { select: { nombres: true, apellidos: true } } },
    });
  }

  /**
   * Gastos mal cargados como MERCADERIA que siguen en la base (de antes de
   * bloquear la categoría). El P&L los expone para poder avisar en pantalla:
   * mientras existan, la utilidad neta está descontando esa plata dos veces.
   */
  async totalMercaderia(sucursalId: string, desde?: string, hasta?: string): Promise<Prisma.Decimal> {
    const fecha = this.rango(desde, hasta);
    const r = await this.prisma.gasto.aggregate({
      where: { sucursalId, categoria: 'MERCADERIA', ...(fecha ? { fecha } : {}) },
      _sum: { monto: true },
    });
    return r._sum.monto ?? new Prisma.Decimal(0);
  }

  async listar(sucursalId?: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);
    return this.prisma.gasto.findMany({
      where: {
        ...(sucursalId ? { sucursalId } : {}),
        ...(fecha ? { fecha } : {}),
      },
      include: { usuario: { select: { nombres: true, apellidos: true } } },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
  }

  /** Suma de gastos del período (para el estado de resultados). */
  async total(sucursalId: string, desde?: string, hasta?: string): Promise<Prisma.Decimal> {
    const fecha = this.rango(desde, hasta);
    const r = await this.prisma.gasto.aggregate({
      where: { sucursalId, ...(fecha ? { fecha } : {}) },
      _sum: { monto: true },
    });
    return r._sum.monto ?? new Prisma.Decimal(0);
  }

  /** Gastos agrupados por categoría (para el gráfico). */
  async porCategoria(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);
    const grupos = await this.prisma.gasto.groupBy({
      by: ['categoria'],
      where: { sucursalId, ...(fecha ? { fecha } : {}) },
      _sum: { monto: true },
      orderBy: { _sum: { monto: 'desc' } },
    });
    return grupos.map((g) => ({
      categoria: g.categoria,
      monto: g._sum.monto ?? new Prisma.Decimal(0),
    }));
  }

  /** Un gasto por id (para resolver a qué sucursal pertenece antes de tocarlo). */
  async obtener(id: string) {
    const gasto = await this.prisma.gasto.findUnique({ where: { id } });
    if (!gasto) throw new NotFoundException('Gasto no encontrado');
    return gasto;
  }

  /** Corrige un gasto ya registrado (monto mal tecleado, categoría, fecha). */
  async actualizar(id: string, dto: ActualizarGastoDto) {
    const gasto = await this.prisma.gasto.findUnique({ where: { id } });
    if (!gasto) throw new NotFoundException('Gasto no encontrado');

    if (dto.categoria === 'MERCADERIA') {
      throw new BadRequestException(
        'La compra de mercadería se registra en Compras, no como gasto.',
      );
    }

    let fecha: Date | undefined;
    if (dto.fecha !== undefined) {
      fecha = new Date(dto.fecha);
      if (Number.isNaN(fecha.getTime())) {
        throw new BadRequestException('Fecha del gasto inválida.');
      }
      const limite = new Date();
      limite.setHours(23, 59, 59, 999);
      if (fecha > limite) {
        throw new BadRequestException('No se puede fechar un gasto en el futuro.');
      }
    }

    return this.prisma.gasto.update({
      where: { id },
      data: {
        ...(dto.categoria !== undefined && { categoria: dto.categoria }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion.trim() }),
        ...(dto.monto !== undefined && { monto: new Prisma.Decimal(dto.monto) }),
        ...(fecha !== undefined && { fecha }),
      },
      include: { usuario: { select: { nombres: true, apellidos: true } } },
    });
  }

  async eliminar(id: string) {
    const gasto = await this.prisma.gasto.findUnique({ where: { id } });
    if (!gasto) throw new NotFoundException('Gasto no encontrado');
    await this.prisma.gasto.delete({ where: { id } });
    return { ok: true };
  }

  // ═══════════════ GASTOS FIJOS MENSUALES ═══════════════

  /** Primer día del mes, en UTC. Clave estable de `Gasto.periodo`. */
  private periodoDe(anio: number, mes: number): Date {
    return new Date(Date.UTC(anio, mes, 1, 0, 0, 0));
  }

  /** Fecha de pago dentro del mes, al mediodía de Perú (17:00 UTC). */
  private fechaPago(anio: number, mes: number, dia: number): Date {
    return new Date(Date.UTC(anio, mes, dia, 17, 0, 0));
  }

  private clave(recurrenteId: string, anio: number, mes: number): string {
    return `${recurrenteId}|${anio}-${String(mes + 1).padStart(2, '0')}`;
  }

  async crearRecurrente(dto: CrearGastoRecurrenteDto) {
    if (dto.categoria === 'MERCADERIA') {
      throw new BadRequestException(
        'La mercadería no es un gasto fijo: entra por Compras.',
      );
    }
    return this.prisma.gastoRecurrente.create({
      data: {
        sucursalId: dto.sucursalId,
        categoria: dto.categoria,
        descripcion: dto.descripcion.trim(),
        monto: new Prisma.Decimal(dto.monto),
        diaDelMes: dto.diaDelMes ?? 1,
      },
    });
  }

  async listarRecurrentes(sucursalId: string) {
    return this.prisma.gastoRecurrente.findMany({
      where: { sucursalId },
      orderBy: [{ activo: 'desc' }, { diaDelMes: 'asc' }],
    });
  }

  async actualizarRecurrente(id: string, dto: ActualizarGastoRecurrenteDto) {
    const r = await this.prisma.gastoRecurrente.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Gasto fijo no encontrado');
    if (dto.categoria === 'MERCADERIA') {
      throw new BadRequestException('La mercadería no es un gasto fijo: entra por Compras.');
    }
    return this.prisma.gastoRecurrente.update({
      where: { id },
      data: {
        ...(dto.categoria !== undefined && { categoria: dto.categoria }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion.trim() }),
        ...(dto.monto !== undefined && { monto: new Prisma.Decimal(dto.monto) }),
        ...(dto.diaDelMes !== undefined && { diaDelMes: dto.diaDelMes }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  /**
   * Borra la plantilla. Los gastos ya generados NO se tocan: son hechos
   * consumados del período y borrarlos alteraría meses ya cerrados
   * (la FK es SetNull).
   */
  async eliminarRecurrente(id: string) {
    const r = await this.prisma.gastoRecurrente.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Gasto fijo no encontrado');
    await this.prisma.gastoRecurrente.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Meses de gastos fijos que todavía no se registraron.
   *
   * Solo cuenta los meses cuyo día de pago YA pasó: si hoy es 3 y el alquiler
   * se paga el 5, todavía no se debe nada. Mira como máximo 12 meses atrás,
   * y nunca antes de que se creara la plantilla.
   */
  async pendientesRecurrentes(sucursalId: string) {
    const recurrentes = await this.prisma.gastoRecurrente.findMany({
      where: { sucursalId, activo: true },
    });
    if (recurrentes.length === 0) return { pendientes: [], total: '0' };

    const yaGenerados = await this.prisma.gasto.findMany({
      where: { recurrenteId: { in: recurrentes.map((r) => r.id) }, periodo: { not: null } },
      select: { recurrenteId: true, periodo: true },
    });
    const hechos = new Set(
      yaGenerados.map((g) =>
        this.clave(g.recurrenteId!, g.periodo!.getUTCFullYear(), g.periodo!.getUTCMonth()),
      ),
    );

    const hoy = new Date();
    const pendientes: Array<{
      clave: string;
      recurrenteId: string;
      descripcion: string;
      categoria: string;
      monto: string;
      anio: number;
      mes: number;
      fecha: Date;
    }> = [];
    let total = new Prisma.Decimal(0);

    for (const r of recurrentes) {
      for (let atras = 11; atras >= 0; atras--) {
        const ref = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
        const anio = ref.getFullYear();
        const mes = ref.getMonth();

        const pago = this.fechaPago(anio, mes, r.diaDelMes);
        // El día de pago tiene que haber llegado…
        if (pago > hoy) continue;
        // …y no se inventan pagos anteriores a la creación de la plantilla.
        // Si el alquiler se carga el 10 y se paga el 5, ese mes ya pasó.
        if (pago < r.creadoEn) continue;

        const clave = this.clave(r.id, anio, mes);
        if (hechos.has(clave)) continue;

        pendientes.push({
          clave,
          recurrenteId: r.id,
          descripcion: r.descripcion,
          categoria: r.categoria,
          monto: r.monto.toString(),
          anio,
          mes: mes + 1,
          fecha: pago,
        });
        total = total.plus(r.monto);
      }
    }

    return { pendientes, total: total.toString() };
  }

  /**
   * Registra los meses que el dueño confirmó. No se genera nada sin este paso:
   * un sistema que se inventa gastos solo no es de fiar.
   *
   * `skipDuplicates` cubre el doble clic y las dos pestañas abiertas; el índice
   * único (recurrenteId, periodo) es la red de seguridad real.
   */
  async aplicarRecurrentes(dto: AplicarRecurrentesDto, registradoPor: string) {
    const ids = [...new Set(dto.claves.map((c) => c.split('|')[0]))];
    const recurrentes = await this.prisma.gastoRecurrente.findMany({
      where: { id: { in: ids }, sucursalId: dto.sucursalId },
    });
    const mapa = new Map(recurrentes.map((r) => [r.id, r]));

    const filas: Prisma.GastoCreateManyInput[] = [];
    for (const clave of dto.claves) {
      const [id, periodo] = clave.split('|');
      const r = mapa.get(id);
      if (!r || !periodo) continue;
      const [anioStr, mesStr] = periodo.split('-');
      const anio = Number(anioStr);
      const mes = Number(mesStr) - 1;
      if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 0 || mes > 11) continue;

      filas.push({
        sucursalId: r.sucursalId,
        categoria: r.categoria,
        descripcion: r.descripcion,
        monto: r.monto,
        fecha: this.fechaPago(anio, mes, r.diaDelMes),
        periodo: this.periodoDe(anio, mes),
        recurrenteId: r.id,
        registradoPor,
      });
    }

    if (filas.length === 0) {
      throw new BadRequestException('No hay gastos fijos válidos para registrar.');
    }
    const res = await this.prisma.gasto.createMany({ data: filas, skipDuplicates: true });
    return { registrados: res.count };
  }
}
