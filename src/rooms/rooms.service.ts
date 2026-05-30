import { HttpStatus, Injectable } from '@nestjs/common';
import { Room } from '@prisma/client';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

export interface RoomView {
  id: string;
  name: string;
  isPrivate: boolean;
  createdById: string;
  createdAt: Date;
  memberCount: number;
}

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea la sala y une al creador en la misma transacción (no hay sala huérfana). */
  async create(userId: string, dto: CreateRoomDto): Promise<RoomView> {
    const existing = await this.prisma.room.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'ROOM_NAME_TAKEN',
        'Ya existe una sala con ese nombre',
      );
    }
    const room = await this.prisma.room.create({
      data: {
        name: dto.name,
        isPrivate: dto.isPrivate ?? false,
        createdById: userId,
        memberships: { create: { userId } },
      },
    });
    return this.toView(room, 1);
  }

  /** Salas visibles para el usuario: las públicas + las privadas donde es miembro. */
  async listVisible(userId: string): Promise<RoomView[]> {
    const rooms = await this.prisma.room.findMany({
      where: {
        OR: [{ isPrivate: false }, { memberships: { some: { userId } } }],
      },
      include: { _count: { select: { memberships: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rooms.map((r) => this.toView(r, r._count.memberships));
  }

  /** Unirse a una sala pública. Las privadas no admiten auto-join (403). */
  async join(userId: string, roomId: string): Promise<RoomView> {
    const room = await this.getOrThrow(roomId);
    if (room.isPrivate) {
      const already = await this.isMember(userId, roomId);
      if (!already) {
        throw new DomainException(
          HttpStatus.FORBIDDEN,
          'ROOM_PRIVATE',
          'No puedes unirte a una sala privada por tu cuenta',
        );
      }
    }
    // upsert por la unique(userId, roomId): unirse es idempotente.
    await this.prisma.membership.upsert({
      where: { userId_roomId: { userId, roomId } },
      create: { userId, roomId },
      update: {},
    });
    const memberCount = await this.prisma.membership.count({ where: { roomId } });
    return this.toView(room, memberCount);
  }

  async getOrThrow(roomId: string): Promise<Room> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'ROOM_NOT_FOUND',
        'La sala no existe',
      );
    }
    return room;
  }

  async isMember(userId: string, roomId: string): Promise<boolean> {
    const m = await this.prisma.membership.findUnique({
      where: { userId_roomId: { userId, roomId } },
      select: { id: true },
    });
    return m !== null;
  }

  /** Usado por el gateway WS: exige pertenencia o lanza (403/404). */
  async assertMember(userId: string, roomId: string): Promise<void> {
    await this.getOrThrow(roomId);
    if (!(await this.isMember(userId, roomId))) {
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        'NOT_A_MEMBER',
        'No perteneces a esta sala',
      );
    }
  }

  private toView(room: Room, memberCount: number): RoomView {
    return {
      id: room.id,
      name: room.name,
      isPrivate: room.isPrivate,
      createdById: room.createdById,
      createdAt: room.createdAt,
      memberCount,
    };
  }
}
