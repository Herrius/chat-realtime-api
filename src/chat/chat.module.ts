import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { PresenceService } from './presence.service';

@Module({
  // AuthModule aporta JwtService (verificar el handshake); RoomsModule, la
  // autorización por sala (assertMember). El cliente Redis llega por RedisModule (global).
  imports: [AuthModule, RoomsModule],
  providers: [ChatGateway, ChatService, PresenceService],
  exports: [ChatService],
})
export class ChatModule {}
