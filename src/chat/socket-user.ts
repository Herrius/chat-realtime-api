import { Socket } from 'socket.io';
import { AuthUser } from '../auth/jwt-payload';

/** Socket con el usuario autenticado y las salas de dominio en las que está. */
export type AuthedSocket = Socket & {
  data: { user: AuthUser; rooms: Set<string> };
};

/** Nombre de la room interna de socket.io para una sala del dominio. */
export function roomKey(roomId: string): string {
  return `room:${roomId}`;
}

/** Token desde `auth.token` (preferido), header Authorization o query `?token=`. */
export function extractToken(client: Socket): string | undefined {
  const fromAuth = client.handshake.auth?.token as string | undefined;
  if (fromAuth) return fromAuth.replace(/^Bearer\s+/i, '');
  const header = client.handshake.headers.authorization;
  if (header) return header.replace(/^Bearer\s+/i, '');
  const q = client.handshake.query?.token;
  if (typeof q === 'string') return q;
  return undefined;
}
