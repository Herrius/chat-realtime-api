import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MessageView {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: Date;
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
}
