import { io } from 'socket.io-client';
const BASE = 'http://localhost:3000';

async function reg(email) {
  let r = await fetch(BASE + '/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, username: email.split('@')[0], password: 'password123' }),
  });
  if (r.status !== 201) {
    r = await fetch(BASE + '/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
  }
  const b = await r.json();
  return { token: b.accessToken, id: b.user.id };
}
const authHdr = (t) => ({ authorization: 'Bearer ' + t });
const connect = (token) => io(BASE + '/chat', { auth: { token }, transports: ['websocket'], forceNew: true });
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const emitAck = (s, ev, data) =>
  new Promise((res) => s.timeout(3000).emit(ev, data, (err, ack) => res(err ? { _timeout: true } : ack)));
const race = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r({ timeout: true }), ms))]);

const alice = await reg('m3alice@chat.com');
const bob = await reg('m3bob@chat.com');

let r = await fetch(BASE + '/v1/rooms', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...authHdr(alice.token) },
  body: JSON.stringify({ name: 'm3room-' + Date.now() }),
});
const room = await r.json();
await fetch(BASE + `/v1/rooms/${room.id}/join`, { method: 'POST', headers: authHdr(bob.token) });

const sa = connect(alice.token);
const sb = connect(bob.token);
await Promise.all([once(sa, 'connect'), once(sb, 'connect')]);
console.log('1) both connected:', sa.connected && sb.connected);

const ja = await emitAck(sa, 'join_room', { roomId: room.id });
await emitAck(sb, 'join_room', { roomId: room.id });
console.log('2) join ack:', JSON.stringify(ja));

const recv = once(sb, 'message');
const ack = await emitAck(sa, 'send_message', { roomId: room.id, body: 'hola bob' });
const msg = await recv;
console.log('3) alice send ack:', JSON.stringify({ id: !!ack.id }), '| bob received:', JSON.stringify({ body: msg.body, from: msg.senderUsername }));

const bad = io(BASE + '/chat', { auth: { token: 'garbage' }, transports: ['websocket'], forceNew: true });
const err = await race(once(bad, 'error'), 3000);
console.log('4) bad token -> error_code:', err.error_code, '| disconnected:', !bad.connected);

let r2 = await fetch(BASE + '/v1/rooms', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...authHdr(alice.token) },
  body: JSON.stringify({ name: 'm3priv-' + Date.now(), isPrivate: true }),
});
const priv = await r2.json();
const errp = once(sb, 'error');
emitAck(sb, 'send_message', { roomId: priv.id, body: 'sneaky' });
const pe = await race(errp, 3000);
console.log('5) non-member send -> error_code:', pe.error_code);

const errv = once(sb, 'error');
emitAck(sb, 'send_message', { roomId: 'not-a-uuid', body: '' });
const ve = await race(errv, 3000);
console.log('6) invalid payload -> error_code:', ve.error_code);

sa.close(); sb.close(); bad.close();
process.exit(0);
