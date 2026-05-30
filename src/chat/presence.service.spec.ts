import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  let redis: Record<string, jest.Mock>;
  let service: PresenceService;
  const user = { userId: 'u1', username: 'ana' };

  beforeEach(() => {
    redis = {
      sadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      hset: jest.fn().mockResolvedValue(1),
      scard: jest.fn(),
      srem: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      hdel: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn(),
    };
    service = new PresenceService(redis as never);
  });

  it('addSocket: primer socket del usuario ⇒ acaba de ponerse online', async () => {
    redis.sadd.mockResolvedValue(1);
    redis.scard.mockResolvedValue(1);
    await expect(service.addSocket('r1', user, 's1')).resolves.toBe(true);
  });

  it('addSocket: segundo dispositivo ⇒ ya estaba online', async () => {
    redis.sadd.mockResolvedValue(1); // socket nuevo
    redis.scard.mockResolvedValue(2); // ya tenía otro
    await expect(service.addSocket('r1', user, 's2')).resolves.toBe(false);
  });

  it('removeSocket: era el último socket ⇒ queda offline', async () => {
    redis.scard.mockResolvedValue(0);
    await expect(service.removeSocket('r1', 'u1', 's1')).resolves.toBe(true);
    expect(redis.hdel).toHaveBeenCalledWith('presence:r1:online', 'u1');
  });

  it('removeSocket: aún le quedan sockets ⇒ sigue online', async () => {
    redis.scard.mockResolvedValue(1);
    await expect(service.removeSocket('r1', 'u1', 's1')).resolves.toBe(false);
    expect(redis.hdel).not.toHaveBeenCalled();
  });

  it('list mapea el hash de Redis a usuarios online', async () => {
    redis.hgetall.mockResolvedValue({ u1: 'ana', u2: 'bob' });
    const online = await service.list('r1');
    expect(online).toEqual([
      { userId: 'u1', username: 'ana' },
      { userId: 'u2', username: 'bob' },
    ]);
  });
});
