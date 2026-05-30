import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../prisma/prisma.service';

export interface MessageView {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: Date;
}

export interface MessagePage {
  items: MessageView[];
  nextCursor: string | null;
}

export interface ReceiptView {
  userId: string;
  username: string;
  lastReadMessageId: string;
  readAt: Date;
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /** Persiste un mensaje y lo devuelve listo para broadcast (con el username). */
  async createMessage(
    senderId: string,
    roomId: string,
    body: string,
  ): Promise<MessageView> {
    const msg = await this.prisma.message.create({
      data: { senderId, roomId, body },
      include: { sender: { select: { username: true } } },
    });
    return {
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      senderUsername: msg.sender.username,
      body: msg.body,
      createdAt: msg.createdAt,
    };
  }

  /**
   * Historial paginado por cursor (más nuevos primero). El cursor es el id del
   * último mensaje de la página previa; se prefiere a offset porque es estable
   * aunque entren mensajes nuevos entre requests y no degrada en profundidad.
   */
  async history(
    roomId: string,
    limit: number,
    cursor?: string,
  ): Promise<MessagePage> {
    const rows = await this.prisma.message.findMany({
      where: { roomId },
      include: { sender: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // pedimos uno extra para saber si hay más
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        senderUsername: m.sender.username,
        body: m.body,
        createdAt: m.createdAt,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Marca hasta qué mensaje leyó el usuario en la sala (upsert idempotente). */
  async markRead(
    userId: string,
    roomId: string,
    messageId: string,
  ): Promise<ReceiptView> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, roomId },
      select: { id: true },
    });
    if (!message) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'MESSAGE_NOT_FOUND',
        'El mensaje no existe en esta sala',
      );
    }
    const receipt = await this.prisma.readReceipt.upsert({
      where: { userId_roomId: { userId, roomId } },
      create: { userId, roomId, lastReadMessageId: messageId },
      update: { lastReadMessageId: messageId },
      include: { user: { select: { username: true } } },
    });
    return {
      userId: receipt.userId,
      username: receipt.user.username,
      lastReadMessageId: receipt.lastReadMessageId,
      readAt: receipt.readAt,
    };
  }

  /** Estado de lectura de todos los miembros de la sala. */
  async receipts(roomId: string): Promise<ReceiptView[]> {
    const rows = await this.prisma.readReceipt.findMany({
      where: { roomId },
      include: { user: { select: { username: true } } },
    });
    return rows.map((r) => ({
      userId: r.userId,
      username: r.user.username,
      lastReadMessageId: r.lastReadMessageId,
      readAt: r.readAt,
    }));
  }
}
