import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Prisma BigInt columns (e.g. CoverageTier.liabilityLimitCents) come back as
// native JS `bigint`, which JSON.stringify cannot serialize by default and
// throws on. Every response Nest sends goes through JSON.stringify, so
// without this shim any endpoint touching a BigInt field 500s. Stringifying
// is the standard workaround; consumers should treat these fields as strings.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  // Required for any browser-based frontend (this dashboard, and every real screen
  // after it) to call this API from a different origin/port during local dev.
  // Restrict allowed origins in production rather than using true broadly.
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));

  const config = new DocumentBuilder()
    .setTitle('DriveShare Backend API')
    .setDescription('12-domain backend implementing the DriveShare P2P car rental architecture spec')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`DriveShare backend running on http://localhost:${port}/api/v1`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();