import { PrismaClient, Rol } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Seed base: crea la Botica Central y un usuario admin real (SUPER_ADMIN)
 * con contraseña hasheada con bcrypt. Idempotente: no duplica si ya existen.
 *
 * Credenciales tomadas de .env (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) con
 * valores por defecto seguros para desarrollo local.
 */
async function main() {
  // 1) Sucursal principal
  let central = await prisma.sucursal.findFirst({ where: { nombre: 'Botica Central' } });
  if (!central) {
    central = await prisma.sucursal.create({
      data: {
        nombre: 'Botica Central',
        distrito: 'Lima',
        direccion: 'Av. Principal 123',
        telefono: '(01) 234-5678',
        estado: 'ACTIVA',
        serieBoleta: 'B001',
        serieFactura: 'F001',
      },
    });
    console.log('✓ Sucursal "Botica Central" creada.');
  } else {
    console.log('• La sucursal ya existe, no se crea de nuevo.');
  }

  // 2) Usuario admin real
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@farmasys.pe').toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

  // Nombre del admin, configurable: en una instalación real es una persona
  // concreta, no "Administrador FarmaSys" — ese nombre aparece en el kardex,
  // en los cierres de caja y en la auditoría de accesos.
  const nombres = process.env.SEED_ADMIN_NOMBRES ?? 'Axel';
  const apellidos = process.env.SEED_ADMIN_APELLIDOS ?? 'Huatuco Bravo';

  const adminExiste = await prisma.usuario.findUnique({ where: { email } });
  if (!adminExiste) {
    const passwordHash = await bcrypt.hash(password, rounds);
    await prisma.usuario.create({
      data: {
        nombres,
        apellidos,
        email,
        passwordHash,
        roles: [Rol.SUPER_ADMIN, Rol.ADMIN],
        sucursalId: central.id,
      },
    });
    console.log(`✓ Usuario admin creado: ${email} (cambia la contraseña tras el primer login).`);
  } else {
    console.log(`• El usuario admin (${email}) ya existe, no se crea de nuevo.`);
  }

  // 3) Catálogo demo (coherente con el front): productos con presentaciones,
  //    stock y un lote vigente por producto en la Botica Central. Idempotente
  //    por código de producto.
  const demo: Array<{
    codigo: string;
    nombre: string;
    principioActivo: string;
    concentracion: string;
    categoria: string;
    esGenerico: boolean;
    requiereReceta?: boolean;
    presentaciones: Array<{ nombre: string; factor: number; precioVenta: number; esBase?: boolean }>;
    stock: number;
  }> = [
    {
      codigo: 'PARA500', nombre: 'Paracetamol 500mg', principioActivo: 'Paracetamol',
      concentracion: '500mg', categoria: 'Analgésicos', esGenerico: true,
      presentaciones: [
        { nombre: 'Caja x 100', factor: 100, precioVenta: 18 },
        { nombre: 'Blíster x 10', factor: 10, precioVenta: 2.5 },
        { nombre: 'Unidad', factor: 1, precioVenta: 0.3, esBase: true },
      ],
      stock: 1000,
    },
    {
      codigo: 'PANA500', nombre: 'Panadol 500mg', principioActivo: 'Paracetamol',
      concentracion: '500mg', categoria: 'Analgésicos', esGenerico: false,
      presentaciones: [
        { nombre: 'Caja x 100', factor: 100, precioVenta: 35 },
        { nombre: 'Blíster x 10', factor: 10, precioVenta: 4.5 },
        { nombre: 'Unidad', factor: 1, precioVenta: 0.5, esBase: true },
      ],
      stock: 600,
    },
    {
      codigo: 'AMOX500', nombre: 'Amoxicilina 500mg', principioActivo: 'Amoxicilina',
      concentracion: '500mg', categoria: 'Antibióticos', esGenerico: true, requiereReceta: true,
      presentaciones: [
        { nombre: 'Caja x 100', factor: 100, precioVenta: 45 },
        { nombre: 'Blíster x 10', factor: 10, precioVenta: 5.5 },
        { nombre: 'Unidad', factor: 1, precioVenta: 0.6, esBase: true },
      ],
      stock: 500,
    },
    {
      codigo: 'IBU400', nombre: 'Ibuprofeno 400mg', principioActivo: 'Ibuprofeno',
      concentracion: '400mg', categoria: 'Antiinflamatorios', esGenerico: true,
      presentaciones: [
        { nombre: 'Caja x 100', factor: 100, precioVenta: 22 },
        { nombre: 'Blíster x 10', factor: 10, precioVenta: 3 },
        { nombre: 'Unidad', factor: 1, precioVenta: 0.35, esBase: true },
      ],
      stock: 800,
    },
    {
      codigo: 'DEXA4', nombre: 'Dexametasona 4mg/mL ampolla', principioActivo: 'Dexametasona',
      concentracion: '4mg/mL', categoria: 'Corticoides', esGenerico: true, requiereReceta: true,
      presentaciones: [
        { nombre: 'Caja x 25', factor: 25, precioVenta: 30 },
        { nombre: 'Unidad', factor: 1, precioVenta: 1.5, esBase: true },
      ],
      stock: 200,
    },
  ];

  const vencimiento = new Date();
  vencimiento.setMonth(vencimiento.getMonth() + 18); // 18 meses

  for (const p of demo) {
    const existe = await prisma.producto.findUnique({ where: { codigo: p.codigo } });
    if (existe) continue;
    const producto = await prisma.producto.create({
      data: {
        codigo: p.codigo,
        nombre: p.nombre,
        principioActivo: p.principioActivo,
        concentracion: p.concentracion,
        categoria: p.categoria,
        esGenerico: p.esGenerico,
        requiereReceta: p.requiereReceta ?? false,
        afectacionIgv: 'GRAVADO',
        unidadBase: 'unidad',
        presentaciones: { create: p.presentaciones },
      },
    });
    await prisma.stockSucursal.create({
      data: {
        productoId: producto.id,
        sucursalId: central.id,
        cantidadBase: p.stock,
        stockMinimo: Math.round(p.stock * 0.1),
        costoPromedio: Number((p.presentaciones.find((x) => x.esBase)?.precioVenta ?? 0.3) * 0.6),
      },
    });
    await prisma.lote.create({
      data: {
        productoId: producto.id,
        sucursalId: central.id,
        lote: `L-${p.codigo}`,
        vencimiento,
        cantidadBase: p.stock,
      },
    });
  }
  console.log('✓ Catálogo demo verificado/creado (productos, stock y lotes).');

  // 4) Terminales: toda sucursal necesita al menos un cajón físico para poder
  //    abrir caja. Se crea "CAJA-01" en las que no tengan ninguno, para no
  //    romper las boticas ya existentes al catalogar los terminales.
  const sucursales = await prisma.sucursal.findMany({ select: { id: true, nombre: true } });
  for (const s of sucursales) {
    const tiene = await prisma.terminal.count({ where: { sucursalId: s.id } });
    if (tiene === 0) {
      await prisma.terminal.create({ data: { sucursalId: s.id, nombre: 'CAJA-01' } });
      console.log(`✓ Terminal "CAJA-01" creado en ${s.nombre}.`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
