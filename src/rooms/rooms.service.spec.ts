import { HttpException, HttpStatus } from '@nestjs/common';
import { RoomsService } from './rooms.service';

const codeOf = (e: unknown) =>
  ((e as HttpException).getResponse() as { error_code: string }).error_code;

describe('RoomsService', () => {
  let prisma: {
    room: { findUnique: jest.Mock; create: jest.Mock };
    membership: { findUnique: jest.Mock; upsert: jest.Mock; count: jest.Mock };
  };
  let service: RoomsService;

  beforeEach(() => {
    prisma = {
      room: { findUnique: jest.fn(), create: jest.fn() },
      membership: { findUnique: jest.fn(), upsert: jest.fn(), count: jest.fn() },
    };
    service = new RoomsService(prisma as never);
  });

  it('rechaza nombre de sala duplicado con 409', async () => {
    prisma.room.findUnique.mockResolvedValue({ id: 'r1', name: 'general' });
    await service.create('u1', { name: 'general' }).catch((e) => {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(codeOf(e)).toBe('ROOM_NAME_TAKEN');
    });
  });

  it('assertMember lanza NOT_A_MEMBER si no pertenece', async () => {
    prisma.room.findUnique.mockResolvedValue({ id: 'r1', isPrivate: false });
    prisma.membership.findUnique.mockResolvedValue(null);
    await service.assertMember('u1', 'r1').catch((e) => {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(codeOf(e)).toBe('NOT_A_MEMBER');
    });
  });

  it('no deja auto-join a sala privada (403 ROOM_PRIVATE)', async () => {
    prisma.room.findUnique.mockResolvedValue({ id: 'r1', isPrivate: true });
    prisma.membership.findUnique.mockResolvedValue(null);
    await service.join('u1', 'r1').catch((e) => {
      expect(codeOf(e)).toBe('ROOM_PRIVATE');
    });
  });

  it('assertMember pasa cuando hay membresía', async () => {
    prisma.room.findUnique.mockResolvedValue({ id: 'r1', isPrivate: false });
    prisma.membership.findUnique.mockResolvedValue({ id: 'm1' });
    await expect(service.assertMember('u1', 'r1')).resolves.toBeUndefined();
  });
});
