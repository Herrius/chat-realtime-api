import { HttpException, HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

const codeOf = (e: unknown) =>
  ((e as HttpException).getResponse() as { error_code: string }).error_code;

describe('AuthService', () => {
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let jwt: { sign: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt') };
    service = new AuthService(prisma as never, jwt as never);
  });

  const dto = { email: 'a@chat.com', username: 'ana', password: 'password123' };
  const stored = {
    id: 'u1',
    email: 'a@chat.com',
    username: 'ana',
    password: 'hash',
    role: 'USER',
  };

  it('registra un usuario nuevo y devuelve token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hash');
    prisma.user.create.mockResolvedValue(stored);

    const res = await service.register(dto);

    expect(res.accessToken).toBe('signed.jwt');
    expect(res.user.email).toBe('a@chat.com');
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('rechaza email duplicado con 409 EMAIL_TAKEN', async () => {
    prisma.user.findUnique.mockResolvedValue(stored);
    await expect(service.register(dto)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    await service.register(dto).catch((e) => expect(codeOf(e)).toBe('EMAIL_TAKEN'));
  });

  it('login correcto devuelve token', async () => {
    prisma.user.findUnique.mockResolvedValue(stored);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const res = await service.login({ email: dto.email, password: dto.password });
    expect(res.accessToken).toBe('signed.jwt');
  });

  it('login con password mala da 401 INVALID_CREDENTIALS', async () => {
    prisma.user.findUnique.mockResolvedValue(stored);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await service
      .login({ email: dto.email, password: 'nope' })
      .catch((e) => {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect(codeOf(e)).toBe('INVALID_CREDENTIALS');
      });
  });
});
