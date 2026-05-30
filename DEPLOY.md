# Despliegue (Railway)

La app se despliega como contenedor Docker. El `Dockerfile` ya hace lo necesario en
el arranque: aplica las migraciones (`prisma migrate deploy`) y levanta el server.

## Pasos

1. **Crear el proyecto** en [railway.app](https://railway.app) → *Deploy from GitHub
   repo* → elegir este repositorio. Railway detecta el `Dockerfile`.

2. **Agregar los servicios gestionados** (botón *+ New* en el proyecto):
   - **PostgreSQL** → expone `DATABASE_URL`.
   - **Redis** → expone `REDIS_URL`.

3. **Variables de entorno** del servicio de la app (*Variables*):
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   REDIS_URL    = ${{Redis.REDIS_URL}}
   JWT_SECRET   = <una cadena larga y aleatoria, ≥16 chars>
   JWT_EXPIRES_IN = 1d
   CORS_ORIGIN  = https://tu-frontend.com
   NODE_ENV     = production
   ```
   Railway inyecta `PORT`; la app ya lo respeta.

4. **Desplegar.** En el primer arranque corre `prisma migrate deploy`. Para cargar
   datos demo, una sola vez desde el shell del servicio: `npx prisma db seed`.

5. **Verificar:** `GET https://<tu-app>.up.railway.app/health` → `{"status":"ok"}`.

## Escalado horizontal

El adapter de Redis está pensado justo para esto: subir las réplicas de la app y que
los mensajes/presencia se propaguen entre ellas por Pub/Sub. Dos avisos para hacerlo
bien con WebSockets:

- **Sticky sessions:** con varias réplicas, el balanceador debe mandar al mismo
  cliente siempre a la misma instancia (el handshake de socket.io usa varias
  requests). En plataformas sin sticky sessions, forzar `transports: ['websocket']`
  en el cliente evita el problema del polling.
- **Redis compartido:** todas las réplicas deben apuntar al mismo `REDIS_URL`.

## Notas

- Las claves de presencia en Redis son efímeras (TTL); no requieren backups.
- Postgres es la fuente de verdad de usuarios, salas, mensajes y recibos de lectura.
