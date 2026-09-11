import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoSucursal, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearSucursalDto } from './dto/crear-sucursal.dto';
import { ActualizarSucursalDto } from './dto/actualizar-sucursal.dto';
import { JwtPayload } from '../auth/auth.types';

/**
 * Un ADMIN solo administra SU sucursal; un SUPER_ADMIN, todas.
 * (El @Roles ya restringe a admins; esto evita que un admin toque una botica ajena.)
 */
function verificarAcceso(user: JwtPayload, sucursalId: string): void {
  const esSuper = user.roles.includes('SUPER_ADMIN');
  if (!esSuper && user.sucursalId !== sucursalId) {
    throw new ForbiddenException('No puedes administrar una sucursal que no es la tuya');
  }
}

@Injectable()
export class SucursalesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearSucursalDto) {
    const existe = await this.prisma.sucursal.findFirst({ where: { nombre: dto.nombre.trim() } });
    if (existe) throw new ConflictException('Ya existe una sucursal con ese nombre');

    const serieBoleta = dto.serieBoleta ?? 'B001';
    const serieFactura = dto.serieFactura ?? 'F001';
    const serieTicket = dto.serieTicket ?? 'T001';
    await this.validarSeriesUnicas(serieBoleta, serieFactura, serieTicket, null);

    return this.prisma.sucursal.create({
      data: {
        nombre: dto.nombre.trim(),
        distrito: dto.distrito,
        direccion: dto.direccion,
        telefono: dto.telefono,
        estado: dto.estado ?? EstadoSucursal.ACTIVA,
        serieBoleta,
        serieFactura,
        serieTicket,
        qrYape: dto.qrYape,
        qrPlin: dto.qrPlin,
        responsableId: dto.responsableId ?? null,
        email: dto.email,
        horarioApertura: dto.horarioApertura,
        horarioCierre: dto.horarioCierre,
        metaVentaMensual: dto.metaVentaMensual,
        latitud: dto.latitud,
        longitud: dto.longitud,
      },
    });
  }

  /**
   * Las series de comprobante deben ser ÚNICAS entre sucursales: si dos boticas
   * comparten serie (p.ej. B001) sus correlativos chocan y se rompe el orden
   * fiscal ante SUNAT. Validar antes de crear/editar.
   */
  private async validarSeriesUnicas(
    serieBoleta?: string | null,
    serieFactura?: string | null,
    serieTicket?: string | null,
    exceptoId?: string | null,
  ): Promise<void> {
    const pares: Array<['serieBoleta' | 'serieFactura' | 'serieTicket', string | null | undefined]> = [
      ['serieBoleta', serieBoleta],
      ['serieFactura', serieFactura],
      ['serieTicket', serieTicket],
    ];
    for (const [campo, valor] of pares) {
      if (!valor) continue;
      const otra = await this.prisma.sucursal.findFirst({
        where: { [campo]: valor, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
      });
      if (otra) {
        throw new ConflictException(`La serie ${valor} ya está en uso por otra sucursal`);
      }
    }
  }

  /** Lista sucursales. Por defecto solo las no inactivas. */
  async listar(incluirInactivas = false) {
    const where: Prisma.SucursalWhereInput = incluirInactivas
      ? {}
      : { estado: { not: EstadoSucursal.INACTIVA } };
    return this.prisma.sucursal.findMany({
      where,
      include: { responsable: { select: { nombres: true, apellidos: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async obtener(id: string) {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { id } });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return sucursal;
  }

  async actualizar(id: string, dto: ActualizarSucursalDto, user: JwtPayload) {
    await this.obtener(id);
    verificarAcceso(user, id);

    // Pasar a INACTIVA por edición = baja: aplica la MISMA integridad que
    // desactivar() (caja cerrada y sin stock), si no sería una puerta trasera.
    if (dto.estado === EstadoSucursal.INACTIVA) {
      await this.verificarSinCajaAbierta(id);
      await this.verificarSinStock(id);
    }

    if (dto.nombre) {
      const otra = await this.prisma.sucursal.findFirst({
        where: { nombre: dto.nombre.trim(), NOT: { id } },
      });
      if (otra) throw new ConflictException('Ya existe otra sucursal con ese nombre');
    }
    await this.validarSeriesUnicas(dto.serieBoleta, dto.serieFactura, dto.serieTicket, id);
    // Una serie con correlativo ya consumido no se puede cambiar (rompe la
    // numeración fiscal correlativa que exige SUNAT).
    await this.verificarSeriesNoQuemadas(id, dto);

    return this.prisma.sucursal.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
        ...(dto.distrito !== undefined && { distrito: dto.distrito }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
        ...(dto.estado !== undefined && { estado: dto.estado }),
        ...(dto.serieBoleta !== undefined && { serieBoleta: dto.serieBoleta }),
        ...(dto.serieFactura !== undefined && { serieFactura: dto.serieFactura }),
        ...(dto.serieTicket !== undefined && { serieTicket: dto.serieTicket }),
        ...(dto.qrYape !== undefined && { qrYape: dto.qrYape }),
        ...(dto.qrPlin !== undefined && { qrPlin: dto.qrPlin }),
        ...(dto.responsableId !== undefined && {
          responsable: dto.responsableId
            ? { connect: { id: dto.responsableId } }
            : { disconnect: true },
        }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.horarioApertura !== undefined && { horarioApertura: dto.horarioApertura }),
        ...(dto.horarioCierre !== undefined && { horarioCierre: dto.horarioCierre }),
        ...(dto.metaVentaMensual !== undefined && { metaVentaMensual: dto.metaVentaMensual }),
        ...(dto.latitud !== undefined && { latitud: dto.latitud }),
        ...(dto.longitud !== undefined && { longitud: dto.longitud }),
      },
    });
  }

  /**
   * "Baja" lógica: marca la sucursal como INACTIVA (no se borra para preservar
   * la integridad de ventas, stock y cajas históricas).
   */
  async desactivar(id: string, user: JwtPayload) {
    await this.obtener(id);
    verificarAcceso(user, id);
    await this.verificarSinCajaAbierta(id);
    await this.verificarSinStock(id);

    return this.prisma.sucursal.update({
      where: { id },
      data: { estado: EstadoSucursal.INACTIVA },
    });
  }

  /**
   * Una serie solo puede cambiarse mientras NO se haya emitido ningún
   * comprobante con ella (correlativo siguiente === 1). Cambiarla después
   * rompería la numeración correlativa exigida por SUNAT.
   */
  private async verificarSeriesNoQuemadas(
    id: string,
    dto: ActualizarSucursalDto,
  ): Promise<void> {
    const actual = await this.prisma.sucursal.findUnique({
      where: { id },
      select: {
        serieBoleta: true,
        serieFactura: true,
        serieTicket: true,
        siguienteBoleta: true,
        siguienteFactura: true,
        siguienteTicket: true,
      },
    });
    if (!actual) return;

    const bloquear = (
      nueva: string | undefined,
      vigente: string,
      siguiente: number,
      etiqueta: string,
    ): void => {
      if (nueva === undefined || nueva === vigente) return;
      if (siguiente > 1) {
        throw new BadRequestException(
          `No puedes cambiar la serie de ${etiqueta}: ya se emitieron ${siguiente - 1} comprobante(s) con ${vigente}. ` +
            'Cambiar la serie rompería la numeración correlativa.',
        );
      }
    };

    bloquear(dto.serieBoleta, actual.serieBoleta, actual.siguienteBoleta, 'boleta');
    bloquear(dto.serieFactura, actual.serieFactura, actual.siguienteFactura, 'factura');
    bloquear(dto.serieTicket, actual.serieTicket, actual.siguienteTicket, 'ticket');
  }

  /**
   * Integridad de baja: no se desactiva una botica que todavía tiene mercadería.
   * El stock quedaría inaccesible en un local cerrado.
   */
  private async verificarSinStock(sucursalId: string): Promise<void> {
    const agregado = await this.prisma.stockSucursal.aggregate({
      where: { sucursalId },
      _sum: { cantidadBase: true },
    });
    const total = agregado._sum.cantidadBase ?? 0;
    if (total > 0) {
      throw new BadRequestException(
        `La sucursal aún tiene ${total} unidades en stock. Transfiere el stock primero.`,
      );
    }
  }

  /**
   * Integridad de baja: una botica con caja ABIERTA no puede desactivarse
   * (dejaría una sesión de caja huérfana). Hay que cerrar la caja primero.
   */
  private async verificarSinCajaAbierta(sucursalId: string): Promise<void> {
    const cajaAbierta = await this.prisma.cajaSesion.findFirst({
      where: { sucursalId, estado: 'ABIERTA' },
    });
    if (cajaAbierta) {
      throw new BadRequestException(
        'La sucursal tiene una caja abierta. Ciérrala antes de desactivarla.',
      );
    }
  }
}
