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
  TypingDto,
} from './dto/chat-events.dto';
import { PresenceService } from './presence.service';
import { extractToken, roomKey } from './socket-user';
import type { AuthedSocket } from './socket-user';
import { WsExceptionsFilter } from './ws-exceptions.filter';

/**
 * Gateway de chat en tiempo real (namespace /chat).
 *
 * - Autentica en el handshake: sin JWT válido, el socket se desconecta.
 * - join/leave_room: une el socket a la room de socket.io previa verificación de
 *   pertenencia y actualiza la presencia (compartida en Redis entre instancias).
 * - send_message: persiste y hace broadcast a la sala.
 * - typing_start/stop: señal efímera, broadcast al resto de la sala.
 *
 * Todo broadcast usa `server.to(room).emit(...)`; el adapter de Redis (M4) lo
 * propaga a las demás instancias sin que este código lo note.
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
    private readonly presence: PresenceService,
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
        username: payload.username,
        role: payload.role,
      };
      client.data.user = user;
      client.data.rooms = new Set<string>();
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

  /** Al desconectar, sale de todas sus salas y actualiza presencia. */
  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const user = client.data?.user;
    if (!user) return;
    for (const roomId of client.data.rooms ?? []) {
      await this.markLeave(client, roomId);
    }
    this.logger.log(`desconectado ${user.email} (${client.id})`);
  }

  @SubscribeMessage('join_room')
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const user = client.data.user;
    await this.rooms.assertMember(user.userId, dto.roomId);
    await client.join(roomKey(dto.roomId));
    client.data.rooms.add(dto.roomId);

    const cameOnline = await this.presence.addSocket(
      dto.roomId,
      { userId: user.userId, username: user.username },
      client.id,
    );
    if (cameOnline) {
      this.server.to(roomKey(dto.roomId)).emit('presence', {
        roomId: dto.roomId,
        userId: user.userId,
        username: user.username,
        status: 'online',
      });
    }
    // El que entra recibe el snapshot de quién ya estaba.
    const online = await this.presence.list(dto.roomId);
    return { roomId: dto.roomId, joined: true, online };
  }

  @SubscribeMessage('leave_room')
  async onLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: LeaveRoomDto,
  ) {
    await this.markLeave(client, dto.roomId);
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

  @SubscribeMessage('typing_start')
  onTypingStart(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: TypingDto,
  ): void {
    this.emitTyping(client, dto.roomId, true);
  }

  @SubscribeMessage('typing_stop')
  onTypingStop(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: TypingDto,
  ): void {
    this.emitTyping(client, dto.roomId, false);
  }

  /** Typing es alta frecuencia: sin DB, solo si el socket ya está en la sala. */
  private emitTyping(
    client: AuthedSocket,
    roomId: string,
    isTyping: boolean,
  ): void {
    if (!client.data.rooms?.has(roomId)) return;
    const user = client.data.user;
    client.to(roomKey(roomId)).emit('typing', {
      roomId,
      userId: user.userId,
      username: user.username,
      isTyping,
    });
  }

  private async markLeave(
    client: AuthedSocket,
    roomId: string,
  ): Promise<void> {
    const user = client.data.user;
    await client.leave(roomKey(roomId));
    client.data.rooms?.delete(roomId);
    const wentOffline = await this.presence.removeSocket(
      roomId,
      user.userId,
      client.id,
    );
    if (wentOffline) {
      this.server.to(roomKey(roomId)).emit('presence', {
        roomId,
        userId: user.userId,
        username: user.username,
        status: 'offline',
      });
    }
  }
}
