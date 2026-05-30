import { Role } from '@prisma/client';

/** Claims que firmamos en el access token y que viajan en el handshake WS. */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  username: string;
  role: Role;
}

/** Forma del usuario autenticado que adjuntamos a la request / al socket. */
export interface AuthUser {
  userId: string;
  email: string;
  username: string;
  role: Role;
}
