import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { PresentacionDto } from './dto/presentacion.dto';
import { FilaImportacionDto, ImportarCatalogoDto } from './dto/importar-catalogo.dto';

/** Incluye presentaciones ordenadas por factor (unidad → caja). */
const INCLUDE_PRESENTACIONES = {
  presentaciones: { orderBy: { factor: 'asc' } },
} satisfies Prisma.ProductoInclude;

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Valida que haya exactamente una presentación base. */
  private validarBase(presentaciones: PresentacionDto[]): void {
    const bases = presentaciones.filter((p) => p.esBase);
    if (bases.length > 1) {
      throw new BadRequestException('Solo una presentación puede ser la base');
    }
    // La base ES la unidad atómica: por definición contiene 1 de sí misma.
    //
    // Sin esta regla se podía marcar "Caja x 3" como base, y entonces TODO el
    // stock del sistema pasaba a contarse en cajas mientras la pantalla decía
    // "unidades". Peor: al añadir después "Unidad" con factor 1 quedaba una
    // presentación MÁS PEQUEÑA que la base, y el fraccionamiento dejaba de
    // tener sentido — el POS descontaría 1 unidad base por cada pastilla, que
    // en realidad son tres.
    if (bases.length === 1 && bases[0].factor !== 1) {
      throw new BadRequestException(
        `La presentación base ("${bases[0].nombre}") debe tener factor 1: es la unidad ` +
          'mínima en la que se guarda todo el stock. Si la caja trae 3 unidades, la base ' +
          'es "Unidad" (factor 1) y la caja es otra presentación con factor 3.',
      );
    }
  }

  /**
   * Busca productos que podrían ser el MISMO medicamento cargado dos veces.
   *
   * Solo `codigo` es único, así que nada impedía crear "Cetirizina 10mg" con
   * los códigos CETI10 y CETI-10. El daño es silencioso: el stock queda partido
   * entre dos fichas, una marca "sin stock" mientras la otra tiene 40, y los
   * reportes de rotación mienten sobre ambas.
   *
   * Se compara nombre + concentración normalizados (sin tildes, sin espacios
   * de más, en minúsculas).
   */
  async posiblesDuplicados(nombre: string, concentracion?: string) {
    const normalizar = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

    const objetivo = normalizar(`${nombre} ${concentracion ?? ''}`);
    if (objetivo.length < 4) return [];

    // Primera palabra significativa: acota la búsqueda sin depender del orden.
    const clave = normalizar(nombre).split(' ')[0];
    if (!clave || clave.length < 3) return [];

    const candidatos = await this.prisma.producto.findMany({
      where: { activo: true, nombre: { contains: clave, mode: 'insensitive' } },
      select: { id: true, codigo: true, nombre: true, concentracion: true },
      take: 25,
    });

    return candidatos.filter(
      (c) => normalizar(`${c.nombre} ${c.concentracion ?? ''}`) === objetivo,
    );
  }

  async crear(dto: CrearProductoDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    const existe = await this.prisma.producto.findUnique({ where: { codigo } });
    if (existe) throw new ConflictException('Ya existe un producto con ese código');

    // Duplicado con OTRO código: se bloquea con un mensaje que nombra la ficha
    // existente, para que el usuario le sume stock en vez de crear una gemela.
    const gemelos = await this.posiblesDuplicados(dto.nombre, dto.concentracion);
    if (gemelos.length > 0) {
      const g = gemelos[0];
      throw new ConflictException(
        `Ya existe "${g.nombre}${g.concentracion ? ' ' + g.concentracion : ''}" ` +
          `con el código ${g.codigo}. Registra el ingreso sobre ese producto en vez ` +
          'de crear uno nuevo, o cambia el nombre si de verdad es distinto.',
      );
    }

    this.validarBase(dto.presentaciones);

    return this.prisma.producto.create({
      data: {
        codigo,
        nombre: dto.nombre.trim(),
        principioActivo: dto.principioActivo,
        concentracion: dto.concentracion,
        formaFarmaceutica: dto.formaFarmaceutica ?? null,
        stockMinimo: dto.stockMinimo ?? 0,
        categoria: dto.categoria.trim(),
        laboratorio: dto.laboratorio,
        ubicacion: dto.ubicacion,
        registroSanitario: dto.registroSanitario,
        esGenerico: dto.esGenerico ?? false,
        requiereReceta: dto.requiereReceta ?? false,
        controlado: dto.controlado ?? false,
        afectacionIgv: dto.afectacionIgv ?? 'GRAVADO',
        unidadBase: dto.unidadBase ?? 'unidad',
        presentaciones: {
          create: dto.presentaciones.map((p) => ({
            nombre: p.nombre,
            factor: p.factor,
            precioVenta: p.precioVenta,
            codigoBarras: p.codigoBarras,
            esBase: p.esBase ?? false,
          })),
        },
      },
      include: INCLUDE_PRESENTACIONES,
    });
  }

  /**
   * Catálogo LIVIANO del POS. Agrega por producto (en el servidor):
   *  - vendible: unidades base en lotes vigentes (vencimiento >= hoy)
   *  - fefoVencimiento: vencimiento del lote que se despacharía (FEFO)
   *  - vencidas: unidades bloqueadas en lotes vencidos
   * Así el front no recibe miles de filas de lotes: solo un resumen por
   * producto. `productoIds` limita la respuesta (refresh parcial post-venta).
   */
  async posCatalogo(sucursalId: string, productoIds?: string[]) {
    if (!sucursalId) throw new BadRequestException('sucursalId es requerido');

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    const whereProducto: Prisma.ProductoWhereInput = {
      activo: true,
      ...(productoIds?.length ? { id: { in: productoIds } } : {}),
    };
    const whereLote: Prisma.LoteWhereInput = {
      sucursalId,
      cantidadBase: { gt: 0 },
      ...(productoIds?.length ? { productoId: { in: productoIds } } : {}),
    };

    const [productos, stock, lotesVigentes, vencidosPorProducto] =
      await this.prisma.$transaction([
        this.prisma.producto.findMany({
          where: whereProducto,
          include: INCLUDE_PRESENTACIONES,
          orderBy: { nombre: 'asc' },
        }),
        this.prisma.stockSucursal.findMany({
          where: {
            sucursalId,
            ...(productoIds?.length ? { productoId: { in: productoIds } } : {}),
          },
        }),
        this.prisma.lote.findMany({
          where: { ...whereLote, vencimiento: { gte: hoy } },
          orderBy: { vencimiento: 'asc' },
          select: { productoId: true, vencimiento: true, cantidadBase: true },
        }),
        this.prisma.lote.groupBy({
          by: ['productoId'],
          where: { ...whereLote, vencimiento: { lt: hoy } },
          _sum: { cantidadBase: true },
          // Requerido por el tipado de groupBy dentro de $transaction.
          orderBy: { productoId: 'asc' },
        }),
      ]);

    // Agregación por producto (los lotes vienen ordenados FEFO).
    const resumen = new Map<
      string,
      { vendible: number; fefoVencimiento: Date | null }
    >();
    for (const l of lotesVigentes) {
      const r = resumen.get(l.productoId);
      if (r) {
        r.vendible += l.cantidadBase;
      } else {
        resumen.set(l.productoId, {
          vendible: l.cantidadBase,
          fefoVencimiento: l.vencimiento,
        });
      }
    }
    const vencidasMap = new Map(
      vencidosPorProducto.map((v) => [v.productoId, v._sum?.cantidadBase ?? 0]),
    );
    const stockMap = new Map(stock.map((s) => [s.productoId, s]));

    return productos.map((p) => {
      const r = resumen.get(p.id);
      const s = stockMap.get(p.id);
      return {
        ...p,
        stock: {
          cantidadBase: s?.cantidadBase ?? 0,
          stockMinimo: s?.stockMinimo ?? 0,
        },
        vendible: r?.vendible ?? 0,
        fefoVencimiento: r?.fefoVencimiento
          ? r.fefoVencimiento.toISOString().slice(0, 10)
          : null,
        vencidas: vencidasMap.get(p.id) ?? 0,
      };
    });
  }

  /**
   * Importador masivo de catálogo (Excel/CSV parseado por el front).
   * Agrupa filas por código (varias filas = varias presentaciones),
   * valida TODO primero y reporta errores fila a fila. Con simular=true
   * no escribe nada; con simular=false crea SOLO los productos válidos
   * (los que ya existen en BD se reportan y se saltan, nunca se pisan).
   */
  async importarCatalogo(dto: ImportarCatalogoDto) {
    type Grupo = { filas: FilaImportacionDto[] };
    const errores: { fila: number; codigo: string; error: string }[] = [];
    const grupos = new Map<string, Grupo>();

    // 1) Agrupar por código y validar campos por fila.
    dto.filas.forEach((f, i) => {
      const nFila = f.filaArchivo ?? i + 2; // +2: cabecera + índice 0
      const codigo = (f.codigo ?? '').trim().toUpperCase();
      if (!codigo) {
        errores.push({ fila: nFila, codigo: '—', error: 'Código vacío' });
        return;
      }
      if (!(f.nombre ?? '').trim()) {
        errores.push({ fila: nFila, codigo, error: 'Nombre vacío' });
        return;
      }
      if (!(f.categoria ?? '').trim()) {
        errores.push({ fila: nFila, codigo, error: 'Categoría vacía' });
        return;
      }
      if (!Number.isInteger(f.factor) || f.factor < 1) {
        errores.push({ fila: nFila, codigo, error: `Factor inválido (${f.factor}): entero ≥ 1` });
        return;
      }
      if (!(f.precioVenta > 0)) {
        errores.push({ fila: nFila, codigo, error: `Precio inválido (${f.precioVenta})` });
        return;
      }
      if (!(f.presentacionNombre ?? '').trim()) {
        errores.push({ fila: nFila, codigo, error: 'Nombre de presentación vacío' });
        return;
      }
      const g = grupos.get(codigo) ?? { filas: [] };
      g.filas.push({ ...f, codigo, filaArchivo: nFila });
      grupos.set(codigo, g);
    });

    // 2) Validación por producto: base única, presentaciones no duplicadas.
    for (const [codigo, g] of grupos) {
      const bases = g.filas.filter((f) => f.esBase).length;
      if (bases > 1) {
        errores.push({
          fila: g.filas[0].filaArchivo!,
          codigo,
          error: 'Más de una presentación marcada como base',
        });
        grupos.delete(codigo);
        continue;
      }
      const nombres = new Set<string>();
      for (const f of g.filas) {
        const n = f.presentacionNombre.trim().toLowerCase();
        if (nombres.has(n)) {
          errores.push({
            fila: f.filaArchivo!,
            codigo,
            error: `Presentación duplicada: ${f.presentacionNombre}`,
          });
          grupos.delete(codigo);
          break;
        }
        nombres.add(n);
      }
    }

    // 3) Códigos que ya existen en la BD → se reportan y se saltan.
    const codigos = [...grupos.keys()];
    if (codigos.length) {
      const existentes = await this.prisma.producto.findMany({
        where: { codigo: { in: codigos } },
        select: { codigo: true },
      });
      for (const e of existentes) {
        const g = grupos.get(e.codigo);
        errores.push({
          fila: g?.filas[0].filaArchivo ?? 0,
          codigo: e.codigo,
          error: 'Ya existe en el catálogo (no se modifica)',
        });
        grupos.delete(e.codigo);
      }
    }

    const resumen = {
      filasRecibidas: dto.filas.length,
      productosValidos: grupos.size,
      errores,
      creados: 0,
      simulacion: dto.simular,
    };
    if (dto.simular || grupos.size === 0) return resumen;

    // 4) Crear en transacción: o entra todo lo válido, o nada.
    await this.prisma.$transaction(async (tx) => {
      for (const [codigo, g] of grupos) {
        const f0 = g.filas[0];
        // Base: la marcada; si ninguna, la de factor 1; si tampoco, la menor.
        const base =
          g.filas.find((f) => f.esBase) ??
          g.filas.find((f) => f.factor === 1) ??
          g.filas.reduce((a, b) => (a.factor <= b.factor ? a : b));
        await tx.producto.create({
          data: {
            codigo,
            nombre: f0.nombre.trim(),
            principioActivo: f0.principioActivo?.trim() || null,
            concentracion: f0.concentracion?.trim() || null,
            categoria: f0.categoria.trim(),
            laboratorio: f0.laboratorio?.trim() || null,
            ubicacion: f0.ubicacion?.trim() || null,
            registroSanitario: f0.registroSanitario?.trim() || null,
            esGenerico: f0.esGenerico ?? false,
            requiereReceta: f0.requiereReceta ?? false,
            controlado: f0.controlado ?? false,
            unidadBase: f0.unidadBase?.trim() || 'unidad',
            presentaciones: {
              create: g.filas.map((f) => ({
                nombre: f.presentacionNombre.trim(),
                factor: f.factor,
                precioVenta: f.precioVenta,
                codigoBarras: f.codigoBarras?.trim() || null,
                esBase: f === base,
              })),
            },
          },
        });
        resumen.creados++;
      }
    });

    return resumen;
  }

  /** Listado paginado con filtros opcionales por categoría y estado. */
  async listar(params: {
    categoria?: string;
    incluirInactivos?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const where: Prisma.ProductoWhereInput = {
      ...(params.incluirInactivos ? {} : { activo: true }),
      ...(params.categoria ? { categoria: params.categoria } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.producto.findMany({
        where,
        include: INCLUDE_PRESENTACIONES,
        orderBy: { nombre: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.producto.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Búsqueda para el POS: por código exacto, nombre o principio activo.
   * Usa índices B-tree; para coincidencias parciales rápidas en producción,
   * crear índices GIN pg_trgm (ver nota en schema.prisma).
   */
  async buscar(q: string, limit = 20) {
    const termino = (q ?? '').trim();
    if (!termino) return [];

    return this.prisma.producto.findMany({
      where: {
        activo: true,
        OR: [
          { codigo: { equals: termino.toUpperCase() } },
          { nombre: { contains: termino, mode: 'insensitive' } },
          { principioActivo: { contains: termino, mode: 'insensitive' } },
          { presentaciones: { some: { codigoBarras: termino } } },
        ],
      },
      include: INCLUDE_PRESENTACIONES,
      orderBy: { nombre: 'asc' },
      take: Math.min(50, limit),
    });
  }

  /**
   * Agrupa los resultados por principio activo (vista genérico/marca del POS).
   * Devuelve grupos { principioActivo, productos[] }.
   */
  async buscarAgrupado(q: string) {
    const productos = await this.buscar(q, 50);
    const grupos = new Map<string, typeof productos>();

    for (const p of productos) {
      const clave = p.principioActivo?.trim() || p.nombre;
      const lista = grupos.get(clave) ?? [];
      lista.push(p);
      grupos.set(clave, lista);
    }

    return Array.from(grupos.entries()).map(([principioActivo, items]) => ({
      principioActivo,
      productos: items,
    }));
  }

  async obtener(id: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      include: INCLUDE_PRESENTACIONES,
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  async actualizar(id: string, dto: ActualizarProductoDto) {
    await this.obtener(id);

    if (dto.codigo) {
      const codigo = dto.codigo.trim().toUpperCase();
      const otro = await this.prisma.producto.findUnique({ where: { codigo } });
      if (otro && otro.id !== id) {
        throw new ConflictException('Ya existe otro producto con ese código');
      }
    }

    const data: Prisma.ProductoUpdateInput = {};
    if (dto.codigo !== undefined) data.codigo = dto.codigo.trim().toUpperCase();
    if (dto.nombre !== undefined) data.nombre = dto.nombre.trim();
    if (dto.principioActivo !== undefined) data.principioActivo = dto.principioActivo;
    if (dto.concentracion !== undefined) data.concentracion = dto.concentracion;
    if (dto.formaFarmaceutica !== undefined) data.formaFarmaceutica = dto.formaFarmaceutica;
    if (dto.categoria !== undefined) data.categoria = dto.categoria.trim();
    if (dto.laboratorio !== undefined) data.laboratorio = dto.laboratorio;
    if (dto.ubicacion !== undefined) data.ubicacion = dto.ubicacion;
    if (dto.registroSanitario !== undefined) data.registroSanitario = dto.registroSanitario;
    if (dto.esGenerico !== undefined) data.esGenerico = dto.esGenerico;
    if (dto.requiereReceta !== undefined) data.requiereReceta = dto.requiereReceta;
    if (dto.controlado !== undefined) data.controlado = dto.controlado;
    if (dto.afectacionIgv !== undefined) data.afectacionIgv = dto.afectacionIgv;
    if (dto.unidadBase !== undefined) data.unidadBase = dto.unidadBase;

    return this.prisma.producto.update({
      where: { id },
      data,
      include: INCLUDE_PRESENTACIONES,
    });
  }

  /** Soft-delete: marca activo=false (preserva referencias en ventas/stock). */
  async desactivar(id: string) {
    await this.obtener(id);
    return this.prisma.producto.update({
      where: { id },
      data: { activo: false },
      include: INCLUDE_PRESENTACIONES,
    });
  }

  /** Reactiva un producto desactivado. */
  async reactivar(id: string) {
    await this.obtener(id);
    return this.prisma.producto.update({
      where: { id },
      data: { activo: true },
      include: INCLUDE_PRESENTACIONES,
    });
  }

  /**
   * Borrado DEFINITIVO. Solo permitido si el producto nunca se usó: sin ventas,
   * sin stock, sin lotes y sin movimientos. Pensado para corregir un producto
   * creado por error. Si tiene historial, lanza 409 (usar desactivar).
   */
  async eliminarPermanente(id: string) {
    await this.obtener(id);

    const [ventaItems, movimientos, lotes, stock, compraItems] = await Promise.all([
      this.prisma.ventaItem.count({ where: { productoId: id } }),
      this.prisma.movimientoStock.count({ where: { productoId: id } }),
      this.prisma.lote.count({ where: { productoId: id } }),
      this.prisma.stockSucursal.count({ where: { productoId: id, cantidadBase: { gt: 0 } } }),
      this.prisma.compraItem.count({ where: { productoId: id } }),
    ]);

    if (ventaItems + movimientos + lotes + stock + compraItems > 0) {
      throw new ConflictException(
        'No se puede eliminar: el producto tiene historial (ventas, compras o stock). Usa "Desactivar".',
      );
    }

    // Sin referencias: borrar presentaciones y filas de stock vacías, luego el producto.
    await this.prisma.$transaction([
      this.prisma.stockSucursal.deleteMany({ where: { productoId: id } }),
      this.prisma.presentacion.deleteMany({ where: { productoId: id } }),
      this.prisma.producto.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  // ── Gestión de presentaciones ───────────────────────────────────────────

  async agregarPresentacion(productoId: string, dto: PresentacionDto) {
    await this.obtener(productoId);
    if (dto.esBase) {
      const yaHayBase = await this.prisma.presentacion.findFirst({
        where: { productoId, esBase: true },
      });
      if (yaHayBase) {
        throw new ConflictException('El producto ya tiene una presentación base');
      }
      this.validarBase([dto]);
    }

    // No se admiten dos formas con el mismo contenido: "Caja x 10" y
    // "Blíster x 10" serían indistinguibles para el cajero en el POS.
    const mismoFactor = await this.prisma.presentacion.findFirst({
      where: { productoId, factor: dto.factor },
    });
    if (mismoFactor) {
      throw new ConflictException(
        `Ya existe "${mismoFactor.nombre}" con ${dto.factor} unidad(es). ` +
          'Dos presentaciones del mismo tamaño confunden al vender.',
      );
    }
    return this.prisma.presentacion.create({
      data: {
        productoId,
        nombre: dto.nombre,
        factor: dto.factor,
        precioVenta: dto.precioVenta,
        codigoBarras: dto.codigoBarras,
        esBase: dto.esBase ?? false,
      },
    });
  }

  async actualizarPresentacion(
    productoId: string,
    presentacionId: string,
    dto: PresentacionDto,
  ) {
    const pres = await this.prisma.presentacion.findFirst({
      where: { id: presentacionId, productoId },
    });
    if (!pres) throw new NotFoundException('Presentación no encontrada en este producto');

    // `esBase` NO se toca por aquí: cambiar la base reinterpreta todo el stock
    // y tiene su propio endpoint con las comprobaciones que hacen falta.
    // Antes este PATCH la aceptaba y podía dejar el producto con dos bases,
    // o con ninguna.
    if (dto.esBase !== undefined && dto.esBase !== pres.esBase) {
      throw new BadRequestException(
        'Para cambiar cuál es la presentación base usa PATCH ' +
          `/productos/${productoId}/presentaciones/${presentacionId}/base`,
      );
    }
    // El factor de la base es 1 por definición.
    if (pres.esBase && dto.factor !== 1) {
      throw new BadRequestException(
        'La presentación base debe tener factor 1: es la unidad del stock.',
      );
    }

    return this.prisma.presentacion.update({
      where: { id: presentacionId },
      data: {
        nombre: dto.nombre,
        factor: dto.factor,
        precioVenta: dto.precioVenta,
        codigoBarras: dto.codigoBarras,
      },
    });
  }

  /**
   * Cambia CUÁL presentación es la base del producto.
   *
   * La base define la unidad en la que está contado TODO el stock, todo el
   * kardex y todos los costos. Cambiarla no reescribe esos números: los
   * reinterpreta. Si un producto tiene 30 en stock con base "Caja x3" y se
   * pasa la base a "Unidad", esos 30 pasan a leerse como 30 pastillas cuando
   * en realidad eran 30 cajas — 90 pastillas. El inventario se falsea solo.
   *
   * Por eso solo se permite mientras el producto está "virgen": sin stock en
   * ninguna botica y sin ninguna venta. Es el caso real —corregir un producto
   * recién cargado, antes de operar con él— y es el único seguro.
   */
  async cambiarBase(productoId: string, presentacionId: string) {
    const nueva = await this.prisma.presentacion.findFirst({
      where: { id: presentacionId, productoId },
    });
    if (!nueva) throw new NotFoundException('Presentación no encontrada en este producto');
    if (nueva.esBase) return nueva;

    const [conStock, vendida] = await Promise.all([
      this.prisma.stockSucursal.findFirst({
        where: { productoId, cantidadBase: { gt: 0 } },
      }),
      this.prisma.ventaItem.findFirst({ where: { productoId } }),
    ]);

    if (vendida) {
      throw new ConflictException(
        'Este producto ya tiene ventas registradas. Cambiar la unidad base ahora ' +
          'reinterpretaría el historial y falsearía los márgenes. Crea un producto ' +
          'nuevo con la base correcta y desactiva este.',
      );
    }
    if (conStock) {
      throw new ConflictException(
        'Este producto tiene stock. Cambiar la unidad base reinterpretaría las ' +
          'cantidades guardadas (30 cajas pasarían a leerse como 30 unidades). ' +
          'Deja el stock en cero, cambia la base y vuelve a ingresar la mercadería.',
      );
    }

    // La base siempre vale 1 de sí misma; si venía con otro factor, se corrige.
    return this.prisma.$transaction(async (tx) => {
      await tx.presentacion.updateMany({
        where: { productoId, esBase: true },
        data: { esBase: false },
      });
      return tx.presentacion.update({
        where: { id: presentacionId },
        data: { esBase: true, factor: 1 },
      });
    });
  }

  async eliminarPresentacion(productoId: string, presentacionId: string) {
    const pres = await this.prisma.presentacion.findFirst({
      where: { id: presentacionId, productoId },
    });
    if (!pres) throw new NotFoundException('Presentación no encontrada en este producto');

    const total = await this.prisma.presentacion.count({ where: { productoId } });
    if (total <= 1) {
      throw new BadRequestException('El producto debe conservar al menos una presentación');
    }

    // La relación VentaItem→Presentacion es OPCIONAL y sin `onDelete`, así que
    // Prisma aplica SetNull: borrar una presentación vendida dejaba las ventas
    // históricas sin saber QUÉ se vendió (caja, blíster o unidad), en silencio.
    // Mejor conservar la presentación: el histórico de ventas es contabilidad.
    const vendida = await this.prisma.ventaItem.count({ where: { presentacionId } });
    if (vendida > 0) {
      throw new BadRequestException(
        `No se puede eliminar "${pres.nombre}": tiene ${vendida} venta(s) registrada(s). ` +
          'Borrarla dejaría esas ventas sin presentación. Ajusta su precio si ya no la usas.',
      );
    }

    await this.prisma.presentacion.delete({ where: { id: presentacionId } });
    return { ok: true };
  }
}
