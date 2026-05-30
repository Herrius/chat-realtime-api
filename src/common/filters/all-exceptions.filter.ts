import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

/** Mapea códigos HTTP a un error_code estable cuando no se provee uno explícito. */
function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE_ENTITY';
    default:
      return 'INTERNAL_ERROR';
  }
}

/**
 * Filtro global que serializa CUALQUIER excepción al formato de error único:
 *   { error_code, message, request_id, details? }
 * Nunca filtra stack traces al cliente; los errores 500 sí se loguean enteros.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId =
      (req.headers['x-request-id'] as string) ?? randomUUID().slice(0, 8);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'Ocurrió un error inesperado';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        errorCode = defaultCodeForStatus(status);
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // Errores del ValidationPipe traen `message` como array de strings.
        if (Array.isArray(b.message)) {
          message = 'La validación de la entrada falló';
          details = { errors: b.message };
          errorCode = 'VALIDATION_ERROR';
        } else {
          message = (b.message as string) ?? exception.message;
          errorCode =
            (b.error_code as string) ?? defaultCodeForStatus(status);
          details = (b.details as Record<string, unknown>) ?? undefined;
        }
      }
    } else {
      // Excepción no controlada → log completo en servidor, mensaje genérico afuera.
      this.logger.error(
        `Unhandled exception [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res
      .status(status)
      .json({ error_code: errorCode, message, request_id: requestId, details });
  }
}
