import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

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
  const config = new DocumentBuilder()
    .setTitle(
      (configService.get('appConfig.swaggerTitle') as string) ||
        'TL;DR API',
    )
    .setDescription(
      (configService.get('appConfig.swaggerDescription') as string) ||
        'API documentation for TL;DR backend',
    )
    .setVersion(
      (configService.get('appConfig.swaggerVersion') as string) || '1.0',
    )
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = (configService.get('appConfig.port') as number) || 3000;
  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}`);
  Logger.log(`Swagger documentation: http://localhost:${port}/api/docs`);
}
void bootstrap();
