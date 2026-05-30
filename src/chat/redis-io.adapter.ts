import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';

/**
 * Adapter de WebSocket que conecta socket.io al Pub/Sub de Redis. Con esto,
 * un `server.to(room).emit(...)` ejecutado en UNA instancia llega también a los
 * clientes conectados a las OTRAS instancias del cluster. Es lo que hace que el
 * chat escale horizontalmente sin sesiones pegadas a un solo nodo.
 *
 * Requiere dos conexiones: una publica y otra se suscribe (un cliente en modo
 * subscribe no puede publicar), de ahí el `duplicate()`.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient = new Redis(this.redisUrl);
    const subClient = pubClient.duplicate();
    this.clients = [pubClient, subClient];
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }

  async close(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.quit()));
  }
}
