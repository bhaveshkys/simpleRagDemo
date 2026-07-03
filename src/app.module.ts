import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentChunk } from './document/document.entity';
@Module({
  imports: [TypeOrmModule.forRoot({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'bhavesh',
    database: 'simple_rag',
    entities: [__dirname + '/**/*.entity.{js,ts}'],
    synchronize: true,
  }),
  TypeOrmModule.forFeature([DocumentChunk])
],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
