import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainException } from '../common/exceptions/domain.exception';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: current.userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'El usuario no existe',
      );
    }
    return user;
  }
}
