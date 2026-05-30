import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload';

const BCRYPT_ROUNDS = 10;

export interface AuthResult {
  accessToken: string;
  user: { id: string; email: string; username: string; role: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'EMAIL_TAKEN',
        'Ya existe una cuenta con ese email',
      );
    }
    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, username: dto.username, password: hash },
    });
    return this.buildResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // Mismo error para "no existe" y "password mala": no filtra qué emails existen.
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Email o contraseña incorrectos',
      );
    }
    return this.buildResult(user);
  }

  private buildResult(user: User): AuthResult {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }
}
