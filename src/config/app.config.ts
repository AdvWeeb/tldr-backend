import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', function () {
  return {
    environment: process.env.NODE_ENV || 'production',
    apiVersion: process.env.API_VERSION || 'v1',
    port: parseInt(process.env.PORT || '3000'),
    // Swagger Configuration
    swaggerTitle: process.env.SWAGGER_TITLE || 'TL;DR API',
    swaggerDescription:
      process.env.SWAGGER_DESCRIPTION ||
      'API documentation for TL;DR backend',
    swaggerVersion: process.env.SWAGGER_VERSION || '1.0',
    // Mail Configuration
    mailHost: process.env.MAIL_HOST,
    mailPort: process.env.MAIL_PORT,
    smtpUsername: process.env.SMTP_USERNAME,
    smtpPassword: process.env.SMTP_PASSWORD,
  };
});
