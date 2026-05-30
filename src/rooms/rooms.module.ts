import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
  // RoomsService se exporta para que el gateway WS (M3) valide pertenencia.
  exports: [RoomsService],
})
export class RoomsModule {}
