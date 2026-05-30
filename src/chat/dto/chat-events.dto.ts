import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class JoinRoomDto {
  @IsUUID()
  roomId!: string;
}

export class LeaveRoomDto {
  @IsUUID()
  roomId!: string;
}

export class SendMessageDto {
  @IsUUID()
  roomId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class TypingDto {
  @IsUUID()
  roomId!: string;
}
