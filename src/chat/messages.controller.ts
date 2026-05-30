import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-payload';
import { RoomsService } from '../rooms/rooms.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { HistoryQueryDto, MarkReadDto } from './dto/history.dto';

const DEFAULT_LIMIT = 30;

@ApiTags('messages')
@ApiBearerAuth()
@Controller('rooms/:roomId')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly chat: ChatService,
    private readonly rooms: RoomsService,
    private readonly gateway: ChatGateway,
  ) {}

  @Get('messages')
  @ApiOperation({ summary: 'Historial paginado por cursor (más nuevos primero)' })
  async history(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Query() q: HistoryQueryDto,
  ) {
    await this.rooms.assertMember(user.userId, roomId);
    return this.chat.history(roomId, q.limit ?? DEFAULT_LIMIT, q.cursor);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca leído hasta un mensaje y avisa a la sala' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: MarkReadDto,
  ) {
    await this.rooms.assertMember(user.userId, roomId);
    const receipt = await this.chat.markRead(user.userId, roomId, dto.messageId);
    this.gateway.emitRead(roomId, receipt); // "visto" en vivo
    return receipt;
  }

  @Get('receipts')
  @ApiOperation({ summary: 'Estado de lectura de los miembros de la sala' })
  async receipts(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    await this.rooms.assertMember(user.userId, roomId);
    return this.chat.receipts(roomId);
  }
}
