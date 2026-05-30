# B3 Chat Realtime API — Guía para agentes

> Fuente de verdad. `AGENTS.md` es un symlink a este archivo (estándar neutral
> leído por Cursor/Codex/etc.); `CLAUDE.md` lo lee Claude Code. Editar solo este.

Tercera pieza del pivote a desarrollo de Enrique (track Backend). API de **chat en
tiempo real**: REST para auth/salas/historial + **WebSockets** (socket.io) para
mensajería en vivo, escalable horizontalmente con un **adapter de Redis** (Pub/Sub).
Construido **AI-native** siguiendo la skill `desarrollo-backend` (leerla al trabajar aquí).

## Diferenciadores vs B1/B2 (lo que B3 demuestra y ellos no)
1. **WebSockets con socket.io** vía gateway de NestJS: conexión autenticada por JWT
   en el handshake, salas, broadcast en vivo.
2. **Escalado horizontal con Redis Pub/Sub adapter**: varias instancias entregan
   los mensajes de las otras. Es la preocupación de producción nº1 de un chat.
3. **Presencia y "escribiendo…" con estado efímero en Redis** (sets con TTL),
   separado de la verdad persistida en Postgres.
4. **Auth stateful en WebSocket** (token en el handshake) + autorización por sala.

## Stack
- Node 22 · NestJS 11 · TypeScript (strict)
- PostgreSQL 17 · Prisma 6 (migraciones versionadas)
- Redis 7 · ioredis · `@socket.io/redis-adapter`
- socket.io (`@nestjs/platform-socket.io`)
- Auth: `@nestjs/jwt` + Passport (HS256) · bcrypt
- Tests: Jest (unit con Prisma mockeado) + e2e (supertest REST + socket.io-client WS)
- Docker (compose: db + redis + app) · CI en GitHub Actions

## Convenciones (seguir SIEMPRE)
- Arquitectura en capas: controller/gateway → service → repository (Prisma).
- DTOs separados de los modelos Prisma. Nunca exponer el modelo crudo en la API.
- Inyección por constructor.
- Validación con class-validator en los DTOs de entrada (global ValidationPipe).
- Errores REST: formato JSON único vía `AllExceptionsFilter`
  (`error_code` + `message` + `request_id`). Errores WS: `WsException`.
- Prisma es el dueño del esquema. Nunca editar una migración aplicada; crear una nueva.
- Tests como parte del DoD, no opcionales.
- Commits chicos con el porqué.

## Rutas REST (todas bajo `/v1`, salvo `/health`)
- `POST /v1/auth/register`, `POST /v1/auth/login`, `GET /v1/users/me`
- `POST /v1/rooms`, `GET /v1/rooms`, `POST /v1/rooms/:id/join`
- `GET /v1/rooms/:id/messages?cursor=&limit=` (historial, cursor-paginado)
- `POST /v1/rooms/:id/read` (marcar leído)
- `GET /health` · `GET /docs` (Swagger)

## Eventos WebSocket (namespace `/chat`)
- cliente→servidor: `join_room`, `leave_room`, `send_message`, `typing_start`, `typing_stop`
- servidor→cliente: `message`, `presence`, `typing`, `error`

## Comandos
- Levantar todo en Docker:   `docker compose up --build`
- Solo dependencias:         `docker compose up -d db redis`
- App en dev:                `npm run start:dev`
- Migración nueva:           `npx prisma migrate dev --name <nombre>`
- Tests unit:                `npm run test`
- Tests e2e:                 `npm run test:e2e` (requiere db + redis arriba)
- Health:                    `curl localhost:3000/health`

## Verificación de endpoints
El hook PAI bloquea `curl POST` con cuerpo (lo confunde con exfiltración). Usar
**Python `urllib`** o **socket.io-client** (Node) para POSTs y eventos WS.

## Roles
- `USER` — crea/entra salas, envía mensajes (por defecto al registrarse).
- `ADMIN` — además puede listar todo y moderar (reservado para crecimiento).
