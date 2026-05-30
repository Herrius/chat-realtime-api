import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { AuthUser, JwtPayload } from '../auth/jwt-payload';
import { RoomsService } from '../rooms/rooms.service';
import { ChatService } from './chat.service';
import {
  JoinRoomDto,
  LeaveRoomDto,
  SendMessageDto,
} from './dto/chat-events.dto';
import { extractToken, roomKey } from './socket-user';
import type { AuthedSocket } from './socket-user';
import { WsExceptionsFilter } from './ws-exceptions.filter';

/**
 * Gateway de chat en tiempo real (namespace /chat).
 *
 * - Autentica en el handshake: sin JWT válido, el socket se desconecta.
 * - join_room / leave_room: une el socket a la room interna de socket.io,
 *   previa verificación de pertenencia (autorización por sala).
 * - send_message: persiste y hace broadcast a todos los sockets de la sala.
 *
 * El broadcast usa `server.to(room).emit(...)`; en M4 ese emit se propaga a
 * otras instancias vía el adapter de Redis sin tocar este código.
 */
@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
@UseFilters(new WsExceptionsFilter())
@UsePipes(
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly chat: ChatService,
    private readonly rooms: RoomsService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    const token = extractToken(client);
    if (!token) {
      client.emit('error', {
        error_code: 'UNAUTHENTICATED',
        message: 'Falta el token en el handshake',
      });
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user: AuthUser = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      client.data.user = user;
      // Sala personal: permite notificar a un usuario en todos sus dispositivos.
      await client.join(`user:${user.userId}`);
      this.logger.log(`conectado ${user.email} (${client.id})`);
    } catch {
      client.emit('error', {
        error_code: 'INVALID_TOKEN',
        message: 'Token inválido o expirado',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    const user = client.data?.user;
    if (user) this.logger.log(`desconectado ${user.email} (${client.id})`);
  }

  @SubscribeMessage('join_room')
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const { userId } = client.data.user;
    await this.rooms.assertMember(userId, dto.roomId);
    await client.join(roomKey(dto.roomId));
    // Retorno plano = acknowledgment del socket.io callback (no un WsResponse).
    return { roomId: dto.roomId, joined: true };
  }

  @SubscribeMessage('leave_room')
  async onLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: LeaveRoomDto,
  ) {
    await client.leave(roomKey(dto.roomId));
    return { roomId: dto.roomId, left: true };
  }

  @SubscribeMessage('send_message')
  async onSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const { userId } = client.data.user;
    // Re-verifica pertenencia en cada envío: la membresía pudo revocarse.
    await this.rooms.assertMember(userId, dto.roomId);
    const message = await this.chat.createMessage(userId, dto.roomId, dto.body);
    this.server.to(roomKey(dto.roomId)).emit('message', message);
    return { id: message.id, sentAt: message.createdAt };
  }
}
