import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  // AuthModule aporta JwtService (verificar el handshake); RoomsModule, la
  // autorización por sala (assertMember).
  imports: [AuthModule, RoomsModule],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
