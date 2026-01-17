import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Enable shutdown hooks to release resources on restart
  app.enableShutdownHooks();

  // Enable cookie parser
  app.use(cookieParser());

  // Enable CORS for frontend
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global prefix
  const apiVersion =
    (configService.get('appConfig.apiVersion') as string) || 'v1';
  app.setGlobalPrefix(apiVersion);

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger setup
  const apiUrl = configService.get('appConfig.apiUrl') as string;
  const configBuilder = new DocumentBuilder()
    .setTitle(
      (configService.get('appConfig.swaggerTitle') as string) || 'TL;DR API',
    )
    .setDescription(
      (configService.get('appConfig.swaggerDescription') as string) ||
        'API documentation for TL;DR backend',
    )
    .setVersion(
      (configService.get('appConfig.swaggerVersion') as string) || '1.0',
    )
    .addBearerAuth();

  if (apiUrl) {
    configBuilder.addServer(apiUrl, 'Production Server');
  }
  configBuilder.addServer(`http://localhost:${configService.get('appConfig.port')}`, 'Local Development');

  const config = configBuilder.build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = (configService.get('appConfig.port') as number) || 3000;
  const environment =
    (configService.get('appConfig.environment') as string) || 'production';

  // Function to start the application with retry logic for EADDRINUSE
  const startApp = async (retries = 5) => {
    try {
      await app.listen(port);
      const baseUrl = apiUrl || `http://localhost:${port}`;
      Logger.log(`Application is running on: ${baseUrl}`);
      Logger.log(`Environment: ${environment}`);
      Logger.log(`Swagger documentation: ${baseUrl}/api/docs`);
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && retries > 0) {
        Logger.warn(
          `Port ${port} is busy, retrying in 1 second... (${retries} retries left)`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return startApp(retries - 1);
      }
      throw err;
    }
  };

  await startApp();
}
void bootstrap();
