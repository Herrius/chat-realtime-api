import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

export interface OnlineUser {
  userId: string;
  username: string;
}

// Las claves de presencia expiran como red de seguridad: si una instancia muere
// sin limpiar, su rastro desaparece solo en vez de quedar "online" para siempre.
const PRESENCE_TTL_SECONDS = 60 * 60;

/**
 * Presencia ("quién está en la sala") sobre Redis, compartida entre instancias.
 * Es estado EFÍMERO (no se persiste en Postgres). Cuenta sockets por usuario para
 * soportar varios dispositivos: solo está "offline" cuando cierra el último.
 */
@Injectable()
export class PresenceService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private onlineKey = (roomId: string) => `presence:${roomId}:online`;
  private socketsKey = (roomId: string, userId: string) =>
    `presence:${roomId}:sockets:${userId}`;

  /** Registra un socket. Devuelve true si el usuario ACABA de ponerse online. */
  async addSocket(
    roomId: string,
    user: OnlineUser,
    socketId: string,
  ): Promise<boolean> {
    const sk = this.socketsKey(roomId, user.userId);
    const count = await this.redis.sadd(sk, socketId);
    await this.redis.expire(sk, PRESENCE_TTL_SECONDS);
    await this.redis.hset(this.onlineKey(roomId), user.userId, user.username);
    await this.redis.expire(this.onlineKey(roomId), PRESENCE_TTL_SECONDS);
    const total = await this.redis.scard(sk);
    // Primera vez que este usuario tiene un socket en la sala.
    return count === 1 && total === 1;
  }

  /** Quita un socket. Devuelve true si el usuario QUEDÓ offline (sin sockets). */
  async removeSocket(
    roomId: string,
    userId: string,
    socketId: string,
  ): Promise<boolean> {
    const sk = this.socketsKey(roomId, userId);
    await this.redis.srem(sk, socketId);
    const remaining = await this.redis.scard(sk);
    if (remaining === 0) {
      await this.redis.del(sk);
      await this.redis.hdel(this.onlineKey(roomId), userId);
      return true;
    }
    return false;
  }

  /** Snapshot de usuarios online en la sala. */
  async list(roomId: string): Promise<OnlineUser[]> {
    const hash = await this.redis.hgetall(this.onlineKey(roomId));
    return Object.entries(hash).map(([userId, username]) => ({
      userId,
      username,
    }));
  }
}
