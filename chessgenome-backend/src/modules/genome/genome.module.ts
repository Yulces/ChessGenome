import { Module } from '@nestjs/common';
import { GenomeController } from './genome.controller';
import { PrimeEncodingService } from './prime-encoding.service';

@Module({
  controllers: [GenomeController],
  providers: [PrimeEncodingService],
  exports: [PrimeEncodingService],
})
export class GenomeModule {}
