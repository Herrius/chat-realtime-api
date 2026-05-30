# Chat Realtime API

[![CI](https://github.com/Herrius/chat-realtime-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Herrius/chat-realtime-api/actions/workflows/ci.yml)

Backend de **chat en tiempo real** construido con **NestJS + WebSockets (socket.io)**,
con **escalado horizontal vía un adapter de Redis (Pub/Sub)**: varias instancias de
la API entregan los mensajes de las otras, que es la preocupación de producción nº1
de un sistema de chat.

REST para lo transaccional (auth, salas, historial) y WebSockets para lo que es en
vivo (mensajes, presencia, "escribiendo…", "visto"). Tercera pieza del portafolio de
desarrollo (B3); las anteriores son APIs Spring Boot (e-commerce e inventario/POS).

## Lo que demuestra

1. **WebSockets con auth en el handshake** — el JWT se verifica al conectar; sin
   token válido el socket se desconecta. Autorización por sala en cada acción.
2. **Escalado horizontal real** — el adapter de Redis propaga los broadcasts entre
   instancias. Probado con dos instancias y un solo Redis (ver el case study).
3. **Presencia y typing con estado efímero en Redis** — "quién está online" vive en
   Redis (compartido), con conteo de sockets por usuario (multi-dispositivo) y TTL
   anti-fugas; separado de la verdad persistida en Postgres.
4. **Disciplina de backend** — capas (controller/gateway → service → Prisma), DTOs
   validados, formato de error único, migraciones versionadas, tests unit + e2e, CI.

## Arquitectura

```
                 ┌─────────────┐     ┌─────────────┐
   clientes ───► │  API inst.1 │     │  API inst.2 │ ◄─── clientes
   (socket.io)   │  NestJS+ws  │     │  NestJS+ws  │
                 └──────┬──────┘     └──────┬──────┘
                        │  Redis Pub/Sub    │   ← broadcast entre instancias
                        └─────────┬─────────┘   ← presencia / typing efímeros
                                  │
                          ┌───────┴───────┐
                          │   Postgres    │   ← usuarios, salas, mensajes, receipts
                          └───────────────┘
```

## Stack

Node 22 · NestJS 11 · TypeScript (strict) · PostgreSQL 17 · Prisma 6 · Redis 7 ·
socket.io 4 + `@socket.io/redis-adapter` · JWT (HS256) + Passport · bcrypt ·
Jest (unit + e2e) · Docker · GitHub Actions.

## API

### REST (`/v1`, salvo `/health`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/v1/auth/register` | Crea cuenta → access token |
| POST | `/v1/auth/login` | Autentica → access token |
| GET | `/v1/users/me` | Perfil del usuario |
| POST | `/v1/rooms` | Crea sala (creador queda dentro) |
| GET | `/v1/rooms` | Lista salas visibles |
| POST | `/v1/rooms/:id/join` | Unirse a sala pública (idempotente) |
| GET | `/v1/rooms/:id/messages?cursor=&limit=` | Historial paginado por cursor |
| POST | `/v1/rooms/:id/read` | Marca leído + emite "visto" en vivo |
| GET | `/v1/rooms/:id/receipts` | Estado de lectura de la sala |
| GET | `/health` · `/docs` | Health · Swagger UI |

### WebSocket (namespace `/chat`, token en el handshake)
| Dirección | Evento | Payload |
|-----------|--------|---------|
| C→S | `join_room` / `leave_room` | `{ roomId }` |
| C→S | `send_message` | `{ roomId, body }` |
| C→S | `typing_start` / `typing_stop` | `{ roomId }` |
| S→C | `message` | mensaje persistido |
| S→C | `presence` | `{ roomId, userId, username, status }` |
| S→C | `typing` | `{ roomId, userId, username, isTyping }` |
| S→C | `read` | `{ roomId, userId, lastReadMessageId }` |
| S→C | `error` | `{ error_code, message }` |

Conexión del cliente:
```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000/chat', { auth: { token: '<JWT>' } });
socket.emit('join_room', { roomId });
socket.on('message', (m) => console.log(m.senderUsername, m.body));
```

## Correr en local

```bash
cp .env.example .env
docker compose up --build          # db + redis + app (migra al arrancar)
npx prisma db seed                 # datos demo (opcional)
# API en http://localhost:3000  ·  Swagger en /docs
```

Credenciales del seed: `admin@demo.com / admin123` (ADMIN) · `ana@demo.com / demo1234` · `bob@demo.com / demo1234`.

Desarrollo con recarga:
```bash
docker compose up -d db redis
npm install && npx prisma migrate dev
npm run start:dev
```

## Tests

```bash
npm run test        # unit (Prisma/Redis mockeados)
npm run test:e2e    # e2e REST + round-trip WS (requiere db + redis)
```

## Despliegue

Ver [`DEPLOY.md`](./DEPLOY.md) (Railway). El historial completo de decisiones y lo
aprendido está en [`docs/CASE_STUDY.md`](./docs/CASE_STUDY.md).
