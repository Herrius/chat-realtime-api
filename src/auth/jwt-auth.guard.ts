import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protege rutas REST: exige un Bearer token válido. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
