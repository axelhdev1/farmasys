/**
 * Diagnóstico y reparación del usuario administrador.
 *
 * Úsalo cuando el login rechaza credenciales que deberían ser válidas. A
 * diferencia del seed —que es idempotente y NO toca un admin ya existente—
 * este script sí corrige el usuario: lo reactiva, le repone los roles y le
 * reescribe la contraseña.
 *
 *   docker compose exec api npx ts-node prisma/reset-admin.ts            (solo diagnostica)
 *   docker compose exec api npx ts-node prisma/reset-admin.ts --reparar  (aplica los arreglos)
 *
 * La contraseña sale de SEED_ADMIN_PASSWORD (.env) salvo que pases otra:
 *   ... prisma/reset-admin.ts --reparar --password "NuevaClave123!"
 */
import { PrismaClient, Rol } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const reparar = process.argv.includes('--reparar');
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@farmasys.pe').toLowerCase().trim();
  const password =
    argumento('password') ?? process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

  console.log('─'.repeat(64));
  console.log('DIAGNÓSTICO DE LOGIN');
  console.log('─'.repeat(64));

  const total = await prisma.usuario.count();
  console.log(`Usuarios en la base de datos: ${total}`);

  if (total === 0) {
    console.log('\n⚠  La base está VACÍA. El seed nunca corrió (o corrió contra otra base).');
    console.log('   Solución:  docker compose exec api npm run db:seed');
    return;
  }

  // Panorama completo: a veces el admin existe con OTRO correo.
  const todos = await prisma.usuario.findMany({
    select: { email: true, activo: true, roles: true, ultimoAccesoEn: true },
    orderBy: { creadoEn: 'asc' },
  });
  console.log('\nUsuarios registrados:');
  for (const u of todos) {
    const estado = u.activo ? 'activo  ' : 'INACTIVO';
    const acceso = u.ultimoAccesoEn
      ? u.ultimoAccesoEn.toISOString().slice(0, 16).replace('T', ' ')
      : 'nunca entró';
    console.log(`  · ${u.email.padEnd(30)} ${estado}  [${u.roles.join(', ')}]  último acceso: ${acceso}`);
  }

  const admin = await prisma.usuario.findUnique({ where: { email } });
  console.log(`\nBuscando "${email}"...`);

  if (!admin) {
    console.log('✗ NO EXISTE ese correo. Usa alguno de la lista de arriba, o corre el seed.');
    return;
  }

  // Las tres causas posibles de un 401 con credenciales aparentemente buenas.
  const passwordOk = await bcrypt.compare(password, admin.passwordHash);
  console.log(`  ${admin.activo ? '✓' : '✗'} activo: ${admin.activo}`);
  console.log(`  ${admin.roles.length ? '✓' : '✗'} roles: [${admin.roles.join(', ') || 'ninguno'}]`);
  console.log(`  ${passwordOk ? '✓' : '✗'} la contraseña "${password}" ${passwordOk ? 'COINCIDE' : 'NO coincide'} con el hash guardado`);

  if (admin.activo && passwordOk && admin.roles.length > 0) {
    console.log('\n✓ Este usuario puede iniciar sesión. Si el login sigue fallando, el');
    console.log('  problema no son las credenciales: revisa que el front apunte a la');
    console.log('  misma API que estás consultando aquí (environment.apiUrl).');
    return;
  }

  if (!reparar) {
    console.log('\n⚠  Hay un problema. Vuelve a ejecutar con --reparar para corregirlo:');
    console.log('   docker compose exec api npx ts-node prisma/reset-admin.ts --reparar');
    return;
  }

  const passwordHash = await bcrypt.hash(password, rounds);
  await prisma.usuario.update({
    where: { email },
    data: {
      passwordHash,
      activo: true,
      roles: admin.roles.length ? admin.roles : [Rol.SUPER_ADMIN, Rol.ADMIN],
    },
  });

  console.log('\n✓ Usuario reparado. Ahora puedes entrar con:');
  console.log(`    correo:     ${email}`);
  console.log(`    contraseña: ${password}`);
  console.log('\n  Cámbiala en cuanto entres.');
}

main()
  .catch((e) => {
    console.error('Error ejecutando el diagnóstico:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
