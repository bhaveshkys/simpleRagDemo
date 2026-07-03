import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function run() {
  console.log('Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const appService = app.get(AppService);

  try {
    await appService.ingestDocuments();
    console.log('Ingestion process completed successfully.');
  } catch (error) {
    console.error('Ingestion process failed:', error);
    process.exit(1);
  } finally {
    await app.close();
    console.log('NestJS application context closed.');
  }
}

run();