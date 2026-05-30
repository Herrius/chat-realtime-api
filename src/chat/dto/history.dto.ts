import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class HistoryQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'id del último mensaje de la página previa' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class MarkReadDto {
  @IsUUID()
  messageId!: string;
}
