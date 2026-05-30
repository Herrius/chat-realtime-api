import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-payload';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@ApiBearerAuth()
@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  @ApiOperation({ summary: 'Crea una sala (el creador queda como miembro)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoomDto) {
    return this.rooms.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista salas visibles (públicas + privadas propias)' })
  list(@CurrentUser() user: AuthUser) {
    return this.rooms.listVisible(user.userId);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Une al usuario a una sala pública (idempotente)' })
  join(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) roomId: string,
  ) {
    return this.rooms.join(user.userId, roomId);
  }
}
