import { io } from 'socket.io-client';
const A = 'http://localhost:3000'; // instancia 1
const B = 'http://localhost:3001'; // instancia 2

async function reg(email) {
  let r = await fetch(A + '/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, username: email.split('@')[0], password: 'password123' }),
  });
  if (r.status !== 201) {
    r = await fetch(A + '/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
  }
  const b = await r.json();
  return { token: b.accessToken, id: b.user.id };
}
const authHdr = (t) => ({ authorization: 'Bearer ' + t });
const connect = (base, token) => io(base + '/chat', { auth: { token }, transports: ['websocket'], forceNew: true });
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const emitAck = (s, ev, data) =>
  new Promise((res) => s.timeout(3000).emit(ev, data, (err, ack) => res(err ? { _timeout: true } : ack)));
const race = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r({ timeout: true }), ms))]);

const alice = await reg('m4alice@chat.com');
const bob = await reg('m4bob@chat.com');

let r = await fetch(A + '/v1/rooms', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...authHdr(alice.token) },
  body: JSON.stringify({ name: 'm4room-' + Date.now() }),
});
const room = await r.json();
await fetch(A + `/v1/rooms/${room.id}/join`, { method: 'POST', headers: authHdr(bob.token) });

// alice -> instancia A ; bob -> instancia B
const sa = connect(A, alice.token);
const sb = connect(B, bob.token);
await Promise.all([once(sa, 'connect'), once(sb, 'connect')]);
console.log('1) alice@A & bob@B connected:', sa.connected && sb.connected);

const aliceJoin = await emitAck(sa, 'join_room', { roomId: room.id });
console.log('2) alice joined, online snapshot:', JSON.stringify(aliceJoin.online?.map((u) => u.username)));

// alice debe enterarse (vía Redis, otra instancia) de que bob entra
const presenceOnline = once(sa, 'presence');
await emitAck(sb, 'join_room', { roomId: room.id });
const po = await race(presenceOnline, 3000);
console.log('3) CROSS-INSTANCE presence (bob joins B, alice@A notified):', JSON.stringify({ user: po.username, status: po.status }));

// el mensaje de alice@A debe llegar a bob@B
const bobRecv = once(sb, 'message');
await emitAck(sa, 'send_message', { roomId: room.id, body: 'cruzando instancias' });
const msg = await race(bobRecv, 3000);
console.log('4) CROSS-INSTANCE message (alice@A -> bob@B):', JSON.stringify({ body: msg.body, from: msg.senderUsername }));

// typing cruzado
const bobTyping = once(sb, 'typing');
sa.emit('typing_start', { roomId: room.id });
const ty = await race(bobTyping, 3000);
console.log('5) CROSS-INSTANCE typing (alice@A -> bob@B):', JSON.stringify({ user: ty.username, isTyping: ty.isTyping }));

// presence offline cruzado al desconectar bob
const presenceOffline = once(sa, 'presence');
sb.close();
const off = await race(presenceOffline, 4000);
console.log('6) CROSS-INSTANCE presence offline (bob disconnects, alice@A notified):', JSON.stringify({ user: off.username, status: off.status }));

sa.close();
process.exit(0);
