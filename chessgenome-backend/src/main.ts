import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // lo configuramos manualmente abajo
  });

  // Body parser con límite grande (HTML del PDF puede pesar MB)
  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ extended: true, limit: '100mb' }));

  // Global prefix so all routes are under /api
  app.setGlobalPrefix('api');

  // Enable CORS for the React frontend
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Validation of DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`ChessGenome backend running on http://localhost:${port}/api`);
}

bootstrap();
