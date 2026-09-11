import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarClienteDto, CrearClienteDto } from './dto/cliente.dto';
import { documentoValido } from './documento.util';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearClienteDto) {
    if (!documentoValido(dto.tipoDocumento, dto.numeroDocumento)) {
      throw new BadRequestException('Número de documento inválido para el tipo indicado');
    }
    const existe = await this.prisma.cliente.findUnique({
      where: {
        tipoDocumento_numeroDocumento: {
          tipoDocumento: dto.tipoDocumento,
          numeroDocumento: dto.numeroDocumento,
        },
      },
    });
    if (existe) throw new ConflictException('Ya existe un cliente con ese documento');

    return this.prisma.cliente.create({
      data: {
        tipoDocumento: dto.tipoDocumento,
        numeroDocumento: dto.numeroDocumento,
        nombres: dto.nombres.trim(),
        apellidos: dto.apellidos?.trim(),
        razonSocial: dto.razonSocial?.trim(),
        telefono: dto.telefono?.trim(),
        email: dto.email?.trim(),
        direccion: dto.direccion?.trim(),
      },
    });
  }

  /** Búsqueda por número de documento (exacto) o por nombre. */
  async buscar(q: string) {
    const termino = (q ?? '').trim();
    if (!termino) return [];
    return this.prisma.cliente.findMany({
      where: {
        OR: [
          { numeroDocumento: { startsWith: termino } },
          { nombres: { contains: termino, mode: 'insensitive' } },
          { apellidos: { contains: termino, mode: 'insensitive' } },
          { razonSocial: { contains: termino, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { nombres: 'asc' },
    });
  }

  /** Padrón completo de clientes (para la pantalla de Clientes). */
  async listar() {
    return this.prisma.cliente.findMany({
      orderBy: { creadoEn: 'desc' },
      take: 500,
    });
  }

  async porDocumento(tipoDocumento: string, numeroDocumento: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { tipoDocumento_numeroDocumento: { tipoDocumento, numeroDocumento } },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente;
  }

  async obtener(id: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente;
  }

  async actualizar(id: string, dto: ActualizarClienteDto) {
    await this.obtener(id);
    if (dto.tipoDocumento && dto.numeroDocumento) {
      if (!documentoValido(dto.tipoDocumento, dto.numeroDocumento)) {
        throw new BadRequestException('Número de documento inválido para el tipo indicado');
      }
    }
    return this.prisma.cliente.update({
      where: { id },
      data: {
        ...(dto.tipoDocumento !== undefined && { tipoDocumento: dto.tipoDocumento }),
        ...(dto.numeroDocumento !== undefined && { numeroDocumento: dto.numeroDocumento }),
        ...(dto.nombres !== undefined && { nombres: dto.nombres.trim() }),
        ...(dto.apellidos !== undefined && { apellidos: dto.apellidos?.trim() }),
        ...(dto.razonSocial !== undefined && { razonSocial: dto.razonSocial?.trim() }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono?.trim() }),
        ...(dto.email !== undefined && { email: dto.email?.trim() }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion?.trim() }),
      },
    });
  }
}
