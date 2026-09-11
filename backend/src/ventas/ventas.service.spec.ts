import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventarioService } from '../inventario/inventario.service';

describe('VentasService', () => {
  let service: VentasService;

  const prismaMock = {
    venta: { findUnique: jest.fn(), findMany: jest.fn() },
    producto: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const inventarioMock = { consumirFefo: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VentasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: InventarioService, useValue: inventarioMock },
      ],
    }).compile();
    service = module.get<VentasService>(VentasService);
    jest.clearAllMocks();
  });

  const dto = {
    sucursalId: 's1',
    tipoComprobante: 'BOLETA' as never,
    items: [{ productoId: 'p1', presentacionId: 'pr1', cantidad: 2 }],
    pagos: [{ metodo: 'EFECTIVO' as never, monto: 20 }],
  };

  it('idempotencia: devuelve la venta previa sin reprocesar', async () => {
    prismaMock.venta.findUnique.mockResolvedValue({ id: 'v1', numeroComprobante: 'B001-000001' });
    const res = await service.registrar({ ...dto, idempotencyKey: 'k1' }, 'caj1');
    expect(res).toEqual({ id: 'v1', numeroComprobante: 'B001-000001' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza venta si los pagos no cubren el total', async () => {
    prismaMock.producto.findMany.mockResolvedValue([
      {
        id: 'p1',
        nombre: 'Paracetamol',
        activo: true,
        afectacionIgv: 'GRAVADO',
        presentaciones: [{ id: 'pr1', esBase: true, factor: 1, precioVenta: 20 }],
      },
    ]);
    // total = 20 * 2 = 40, pago 20 → insuficiente
    await expect(service.registrar(dto, 'caj1')).rejects.toThrow(BadRequestException);
  });

  it('anular: lanza NotFound si la venta no existe', async () => {
    prismaMock.$transaction.mockImplementation(async (cb: any) =>
      cb({ venta: { findUnique: jest.fn().mockResolvedValue(null) } }),
    );
    await expect(service.anular('nope', { motivo: 'error tipeo' })).rejects.toThrow(NotFoundException);
  });
});
