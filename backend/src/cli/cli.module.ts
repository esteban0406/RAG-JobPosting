import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { validate } from '../config/config.schema.js';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { StorageModule } from '../storage/storage.module.js';

// Offline tooling context: no HTTP server, scheduler or request logging.
@Module({
  imports: [
    ConfigModule.forRoot({ validate, isGlobal: true }),
    CacheModule.register({ isGlobal: true }),
    StorageModule,
    EmbeddingModule,
  ],
})
export class CliModule {}
