import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { RequestLoggingInterceptor } from "./common/interceptors/request-logging.interceptor";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(requestIdMiddleware);

  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.enableCors({
    origin: [process.env.FRONTEND_URL ?? "http://localhost:3000", "http://127.0.0.1:3001", "http://localhost:3001"],
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  const config = new DocumentBuilder()
    .setTitle("Activity Travel API")
    .setDescription("Multi-tenant travel activity catalogue and booking API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.API_PORT ?? 4006);
  await app.listen(port);

  console.log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
