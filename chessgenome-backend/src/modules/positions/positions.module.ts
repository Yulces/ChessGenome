import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Position, PositionSchema } from './schemas/position.schema';
import { Transition, TransitionSchema } from './schemas/transition.schema';
import { PositionsService } from './positions.service';
import { TransitionsService } from './transitions.service';
import { PositionsController } from './positions.controller';
import { GenomeModule } from '../genome/genome.module';
import { PgnsModule } from '../pgns/pgns.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Position.name, schema: PositionSchema },
      { name: Transition.name, schema: TransitionSchema },
    ]),
    GenomeModule,
    PgnsModule,
  ],
  controllers: [PositionsController],
  providers: [TransitionsService, PositionsService],
  exports: [PositionsService, TransitionsService],
})
export class PositionsModule {}
