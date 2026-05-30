import { io } from 'socket.io-client';
const BASE = 'http://localhost:3000';
async function reg(email) {
  let r = await fetch(BASE + '/v1/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, username: email.split('@')[0], password: 'password123' }),
  });
  if (r.status !== 201) r = await fetch(BASE + '/v1/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const b = await r.json();
  return { token: b.accessToken, id: b.user.id };
}
const authHdr = (t) => ({ authorization: 'Bearer ' + t });
const getj = async (path, t) => (await fetch(BASE + path, { headers: authHdr(t) })).json();
const postj = async (path, t, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...authHdr(t) }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json() };
};
const connect = (t) => io(BASE + '/chat', { auth: { token: t }, transports: ['websocket'], forceNew: true });
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const emitAck = (s, ev, d) => new Promise((res) => s.timeout(3000).emit(ev, d, (e, a) => res(e ? { _t: true } : a)));
const race = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r({ timeout: true }), ms))]);

const alice = await reg('m5alice@chat.com');
const bob = await reg('m5bob@chat.com');
const room = (await postj('/v1/rooms', alice.token, { name: 'm5room-' + Date.now() })).body;
await postj(`/v1/rooms/${room.id}/join`, bob.token);

// alice manda 5 mensajes por WS
const sa = connect(alice.token);
await once(sa, 'connect');
await emitAck(sa, 'join_room', { roomId: room.id });
const ids = [];
for (let i = 1; i <= 5; i++) {
  const ack = await emitAck(sa, 'send_message', { roomId: room.id, body: 'msg ' + i });
  ids.push(ack.id);
}
console.log('1) sent 5 messages');

// historial: página de 2 (más nuevos primero) + seguir el cursor
const p1 = await getj(`/v1/rooms/${room.id}/messages?limit=2`, bob.token);
console.log('2) page1:', p1.items.map((m) => m.body), 'nextCursor?', !!p1.nextCursor);
const p2 = await getj(`/v1/rooms/${room.id}/messages?limit=2&cursor=${p1.nextCursor}`, bob.token);
console.log('   page2:', p2.items.map((m) => m.body), 'nextCursor?', !!p2.nextCursor);
const p3 = await getj(`/v1/rooms/${room.id}/messages?limit=2&cursor=${p2.nextCursor}`, bob.token);
console.log('   page3:', p3.items.map((m) => m.body), 'nextCursor (null=fin):', p3.nextCursor);

// read receipt + broadcast en vivo: alice debe recibir evento 'read' cuando bob marca
const readEvt = once(sa, 'read');
const mr = await postj(`/v1/rooms/${room.id}/read`, bob.token, { messageId: ids[2] });
console.log('3) bob marks read up to msg3 -> status', mr.status, '| lastRead set:', mr.body.lastReadMessageId === ids[2]);
const re = await race(readEvt, 3000);
console.log('4) alice receives live "read" event:', JSON.stringify({ user: re.username, lastRead: re.lastReadMessageId === ids[2] }));

const receipts = await getj(`/v1/rooms/${room.id}/receipts`, alice.token);
console.log('5) receipts:', receipts.map((r) => ({ user: r.username, upTo: r.lastReadMessageId === ids[2] ? 'msg3' : r.lastReadMessageId })));

// errores: no-miembro no lee historial; mensaje inexistente al marcar
const carol = await reg('m5carol@chat.com');
const noacc = await fetch(BASE + `/v1/rooms/${room.id}/messages`, { headers: authHdr(carol.token) });
console.log('6) non-member history -> expect 403:', noacc.status);
const badread = await postj(`/v1/rooms/${room.id}/read`, bob.token, { messageId: '00000000-0000-0000-0000-000000000000' });
console.log('7) read missing message -> expect 404:', badread.status, badread.body.error_code);

sa.close();
process.exit(0);
