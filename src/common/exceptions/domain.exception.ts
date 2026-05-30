import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Excepción de dominio con un `error_code` máquina-legible estable.
 * El filtro global la serializa al formato de error único de la API.
 *
 * Ej: throw new DomainException(HttpStatus.CONFLICT, 'ROOM_NAME_TAKEN', '...').
 */
export class DomainException extends HttpException {
  constructor(
    status: HttpStatus,
    errorCode: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ error_code: errorCode, message, details }, status);
  }
}
