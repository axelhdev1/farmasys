import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

/** Secretos por defecto: válidos solo en desarrollo, prohibidos en producción. */
const SECRETOS_DEV = ['dev-access-secret', 'dev-refresh-secret', 'dev-access-secret-cambiar', 'dev-refresh-secret-cambiar'];

/**
 * Verifica que en producción NO se usen los secretos de desarrollo.
 * En dev solo advierte; en producción aborta el arranque (fail-fast).
 */
function verificarSecretos(logger: Logger): void {
  const esProd = process.env.NODE_ENV === 'production';
  const access = process.env.JWT_ACCESS_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;
  const inseguro =
    !access || !refresh || SECRETOS_DEV.includes(access) || SECRETOS_DEV.includes(refresh) ||
    access.length < 24 || refresh.length < 24;

  if (inseguro) {
    const msg =
      'Secretos JWT inseguros o ausentes. Define JWT_ACCESS_SECRET y JWT_REFRESH_SECRET ' +
      'fuertes (mínimo 24 caracteres) en el .env.';
    if (esProd) {
      throw new Error(`[SEGURIDAD] ${msg} El arranque se aborta en producción.`);
    }
    logger.warn(`[SEGURIDAD] ${msg} (permitido solo en desarrollo)`);
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  verificarSecretos(logger);

  const app = await NestFactory.create(AppModule);
  const esProd = process.env.NODE_ENV === 'production';

  // Cabeceras de seguridad HTTP. CSP desactivada para no romper Swagger UI.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Prefijo común para todas las rutas: /api/v1/...
  app.setGlobalPrefix('api/v1');

  // Validación automática de DTOs (rechaza datos no esperados)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS: solo el frontend permitido (config por .env)
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });

  // Documentación OpenAPI (Swagger UI en /api/docs) — solo fuera de producción,
  // para no exponer públicamente la superficie de la API.
  if (!esProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FarmaSys API')
      .setDescription('API de gestión de botica — autenticación, usuarios, catálogo, ventas, caja.')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`FarmaSys API escuchando en http://localhost:${port}/api/v1`);
  if (!esProd) {
    logger.log(`Swagger UI en http://localhost:${port}/api/docs`);
  }
}
bootstrap();
