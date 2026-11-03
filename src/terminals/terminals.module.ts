import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Terminal, TerminalSchema } from './schemas/terminal.schema.js';
import { TerminalsController } from './terminals.controller.js';
import { TerminalsService } from './terminals.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Terminal.name, schema: TerminalSchema }]),
    AuthModule, // para JwtService
  ],
  controllers: [TerminalsController],
  providers: [TerminalsService],
  exports: [TerminalsService],
})
export class TerminalsModule {}