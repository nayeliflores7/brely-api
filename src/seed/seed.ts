import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { SeederService } from './seeder.service.js';

// npm run seed: permisos del catálogo y roles base de todos los negocios
const app = await NestFactory.createApplicationContext(AppModule);
try {
  const { tenants } = await app.get(SeederService).run();
  console.log(`Seeder terminado. Negocios revisados: ${tenants}`);
} finally {
  await app.close();
}
