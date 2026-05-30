import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Traduce cualquier excepción lanzada dentro de un handler WS a un evento
 * `error` estructurado para el cliente, reutilizando el `error_code` que ya
 * cargan las DomainException (HttpException) de la capa de servicio.
 */
@Catch()
export class WsExceptionsFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    let errorCode = 'WS_ERROR';
    let message = 'Error en el socket';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        if (Array.isArray(r.message)) {
          errorCode = 'VALIDATION_ERROR';
          message = (r.message as string[]).join(', ');
        } else {
          errorCode = (r.error_code as string) ?? errorCode;
          message = (r.message as string) ?? message;
        }
      }
    } else if (exception instanceof WsException) {
      const err = exception.getError();
      message =
        typeof err === 'string'
          ? err
          : ((err as { message?: string }).message ?? message);
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    client.emit('error', { error_code: errorCode, message });
  }
}
