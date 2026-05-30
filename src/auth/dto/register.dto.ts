import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ana@chat.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ana' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  username!: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // límite de bcrypt
  password!: string;
}
