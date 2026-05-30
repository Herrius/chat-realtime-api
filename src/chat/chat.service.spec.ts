import { HttpException } from '@nestjs/common';
import { ChatService } from './chat.service';

const codeOf = (e: unknown) =>
  ((e as HttpException).getResponse() as { error_code: string }).error_code;

const row = (id: string) => ({
  id,
  roomId: 'r1',
  senderId: 'u1',
  body: 'hi ' + id,
  createdAt: new Date(),
  sender: { username: 'ana' },
});

describe('ChatService', () => {
  let prisma: {
    message: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
    readReceipt: { upsert: jest.Mock; findMany: jest.Mock };
  };
  let service: ChatService;

  beforeEach(() => {
    prisma = {
      message: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
      readReceipt: { upsert: jest.fn(), findMany: jest.fn() },
    };
    service = new ChatService(prisma as never);
  });

  it('history devuelve nextCursor cuando hay más (pide limit+1)', async () => {
    // limit=2 → pedimos 3; devolver 3 ⇒ hay más
    prisma.message.findMany.mockResolvedValue([row('m3'), row('m2'), row('m1')]);
    const page = await service.history('r1', 2);
    expect(page.items).toHaveLength(2);
    expect(page.items.map((m) => m.id)).toEqual(['m3', 'm2']);
    expect(page.nextCursor).toBe('m2');
  });

  it('history sin más resultados devuelve nextCursor null', async () => {
    prisma.message.findMany.mockResolvedValue([row('m1')]);
    const page = await service.history('r1', 2);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('markRead lanza 404 si el mensaje no está en la sala', async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    await service.markRead('u1', 'r1', 'mX').catch((e) => {
      expect(codeOf(e)).toBe('MESSAGE_NOT_FOUND');
    });
  });
});
