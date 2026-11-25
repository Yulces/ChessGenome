import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PgnEntry, PgnEntrySchema } from './schemas/pgn.schema';
import { PgnsService } from './pgns.service';
import { PgnsController } from './pgns.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PgnEntry.name, schema: PgnEntrySchema },
    ]),
  ],
  controllers: [PgnsController],
  providers: [PgnsService],
  exports: [PgnsService],
})
export class PgnsModule {}
