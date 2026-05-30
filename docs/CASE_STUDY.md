# Case Study — Chat Realtime API (B3)

## El problema

Construir un backend de chat que no sea un juguete: que aguante **más de una
instancia**. Un chat ingenuo guarda las conexiones en memoria del proceso; en cuanto
escalas a dos réplicas detrás de un balanceador, un usuario en la instancia A deja de
ver los mensajes de un usuario en la instancia B. Resolver eso —y la presencia, el
"escribiendo…" y el "visto" en vivo— es el núcleo de esta pieza.

## Decisiones de diseño (lo defendible en entrevista)

**NestJS + socket.io.** NestJS da estructura (módulos, DI, gateways de WebSocket de
primera clase) y socket.io resuelve reconexión, salas y acks sin reinventarlos. El
gateway queda fino: autentica, autoriza y delega en servicios.

**Adapter de Redis para escalar horizontalmente.** Es la decisión central. Sin él,
`server.to(room).emit()` solo alcanza a los sockets de *esa* instancia. Con
`@socket.io/redis-adapter`, ese emit se publica en Redis y las demás instancias lo
reemiten a sus propios sockets. Requiere dos conexiones (una publica, otra se
suscribe: un cliente en modo subscribe no puede publicar) — de ahí el `duplicate()`.
Se cablea con un `IoAdapter` custom sin tocar la lógica del gateway.

**Auth en el handshake.** El JWT viaja en `handshake.auth.token`; se verifica al
conectar y, si falla, el socket se desconecta. El `username` va dentro del token para
mostrar presencia/typing sin pegarle a la base en cada evento. La pertenencia a la
sala se re-verifica en cada `send_message` (la membresía pudo revocarse).

**HS256 en vez de RS256.** La pieza anterior (e-commerce) usa RS256. Aquí el secreto
simétrico simplifica verificar el token en el handshake sin distribuir clave pública,
y para un servicio único es suficiente. Decisión consciente, no descuido.

**Presencia efímera en Redis, no en Postgres.** "Quién está online" es estado
volátil y de alta rotación: vive en Redis (compartido entre instancias), con un
**conteo de sockets por usuario** para soportar varios dispositivos (solo offline al
cerrar el último) y un **TTL** como red de seguridad: si una instancia muere sin
limpiar, su rastro caduca solo en vez de quedar "online" para siempre. Postgres
guarda lo que sí debe persistir: usuarios, salas, mensajes, recibos.

**Paginación por cursor en el historial.** El cursor (id del último mensaje de la
página) es estable aunque entren mensajes nuevos entre requests y no degrada en
profundidad, a diferencia de offset. Se apoya en el índice `(roomId, createdAt)` y
pide `limit + 1` para saber si hay más.

**Prisma 6, no 7.** Prisma 7 (su generador ESM nuevo) daba fricción con NestJS
CommonJS y Jest. Para una pieza de portafolio se priorizó el camino estable y
alineado al mercado: Prisma 6 con el generador clásico.

## Cómo se verificó el escalado (la prueba que importa)

Se levantaron **dos instancias** de la API (puertos 3000 y 3001) contra **un solo
Redis y una sola base**. Un cliente (alice) se conectó a la instancia A y otro (bob)
a la B, ambos en la misma sala. Resultado:

- bob entra en B → **alice (en A) recibe el evento de presencia** "online".
- alice envía en A → **bob (en B) recibe el mensaje**.
- alice escribe en A → **bob (en B) recibe el `typing`**.
- bob se desconecta de B → **alice (en A) recibe la presencia "offline"**.

Todo cruzó de una instancia a la otra por el Pub/Sub de Redis. Eso es el escalado
horizontal funcionando, no una promesa en el README.

## Qué se aprendió / gotchas

- **Acks vs WsResponse en NestJS:** un handler que retorna `{ event, data }` lo
  interpreta Nest como un `WsResponse` y *emite* ese evento; para responder por el
  callback de acknowledgment del cliente hay que retornar **datos planos**. El ack se
  quedaba colgado hasta caer en cuenta de esto.
- **`rootDir` y el `dist/` anidado:** agregar `prisma/seed.ts` (un `.ts` fuera de
  `src/`) hizo que `nest build` desplazara la raíz de compilación y emitiera en
  `dist/src/main.js` en vez de `dist/main.js` — la imagen Docker arrancaba y moría con
  *Cannot find module dist/main.js*. Se arregló excluyendo `prisma` en
  `tsconfig.build.json`. Buen recordatorio de por qué se verifica la imagen de prod,
  no solo `npm run start`.

## Límites conocidos (deuda explícita, no oculta)

- Sin refresh tokens (solo access token con expiración).
- El "visto" es por usuario/sala (último mensaje leído), no por mensaje individual.
- Presencia con TTL de 1h: si una instancia cae, su rastro puede tardar hasta ese
  tiempo en limpiarse del todo en el peor caso.
- Rate limiting de mensajes/typing no incluido (siguiente paso natural).
