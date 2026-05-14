import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({ origin: origins, credentials: true });

  // Use cookie parser to read cookies from requests
  app.use(cookieParser());

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 4001;
  await app.listen(port);
  console.log(`🛒 QH Backend running on http://localhost:${port}`);
}
bootstrap();
