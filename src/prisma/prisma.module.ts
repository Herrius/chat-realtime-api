import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global: un único PrismaService inyectable en toda la app sin reimportar.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
