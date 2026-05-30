import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * e2e de integración: arranca la app real (REST + WebSocket sobre el mismo
 * servidor http) contra Postgres y Redis reales, registra usuarios por REST y
 * verifica el round-trip de un mensaje por socket.io.
 */
describe('Chat (e2e REST + WS)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const connect = (token: string): Socket =>
    io(`${baseUrl}/chat`, { auth: { token }, transports: ['websocket'], forceNew: true });
  const once = <T = any>(s: Socket, ev: string) =>
    new Promise<T>((res) => s.once(ev, res));
  const emitAck = (s: Socket, ev: string, data: unknown) =>
    new Promise<any>((res) =>
      s.timeout(4000).emit(ev, data, (err: unknown, ack: unknown) =>
        res(err ? { _timeout: true } : ack),
      ),
    );

  async function register(tag: string) {
    const email = `e2e_${Date.now()}_${tag}@chat.com`;
    const res = await request(httpServer)
      .post('/v1/auth/register')
      .send({ email, username: tag, password: 'password123' })
      .expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  it('register → 409 en email duplicado', async () => {
    const email = `e2e_${Date.now()}_dup@chat.com`;
    await request(httpServer)
      .post('/v1/auth/register')
      .send({ email, username: 'dup', password: 'password123' })
      .expect(201);
    const res = await request(httpServer)
      .post('/v1/auth/register')
      .send({ email, username: 'dup', password: 'password123' })
      .expect(409);
    expect(res.body.error_code).toBe('EMAIL_TAKEN');
  });

  it('crea sala, otro usuario se une y recibe el mensaje por WS', async () => {
    const alice = await register('alice');
    const bob = await register('bob');

    const room = await request(httpServer)
      .post('/v1/rooms')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: `e2e-room-${Date.now()}` })
      .expect(201);
    const roomId = room.body.id as string;

    await request(httpServer)
      .post(`/v1/rooms/${roomId}/join`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);

    const sa = connect(alice.token);
    const sb = connect(bob.token);
    await Promise.all([once(sa, 'connect'), once(sb, 'connect')]);

    await emitAck(sa, 'join_room', { roomId });
    await emitAck(sb, 'join_room', { roomId });

    const received = once<any>(sb, 'message');
    const ack = await emitAck(sa, 'send_message', { roomId, body: 'hola e2e' });
    const msg = await received;

    expect(ack.id).toBeDefined();
    expect(msg.body).toBe('hola e2e');
    expect(msg.senderUsername).toBe('alice');

    // el historial REST refleja el mensaje persistido
    const hist = await request(httpServer)
      .get(`/v1/rooms/${roomId}/messages`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(hist.body.items[0].body).toBe('hola e2e');

    sa.close();
    sb.close();
  }, 20000);

  it('rechaza el handshake WS sin token válido', async () => {
    const bad = io(`${baseUrl}/chat`, {
      auth: { token: 'garbage' },
      transports: ['websocket'],
      forceNew: true,
    });
    const err = await once<any>(bad, 'error');
    expect(err.error_code).toBe('INVALID_TOKEN');
    bad.close();
  }, 10000);
});
