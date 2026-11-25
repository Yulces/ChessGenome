import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GenomeModule } from '../genome/genome.module';
import { PositionsModule } from '../positions/positions.module';
import { NeuralService } from './neural.service';
import { NeuralController } from './neural.controller';
import { TrainingSamplesService } from './training-samples.service';
import { PgnIngestService } from './pgn-ingest.service';
import { NeuralTrainingService } from './neural-training.service';
import { PgnIngestJobService } from './pgn-ingest-job.service';
import { NeuralAutoTrainService } from './neural-auto-train.service';
import {
  TrainingSample,
  TrainingSampleSchema,
} from './schemas/training-sample.schema';
import { Position, PositionSchema } from '../positions/schemas/position.schema';
import { NeuralModel, NeuralModelSchema } from './schemas/neural-model.schema';

@Module({
  imports: [
    GenomeModule,
    PositionsModule,
    MongooseModule.forFeature([
      { name: TrainingSample.name, schema: TrainingSampleSchema },
      { name: Position.name, schema: PositionSchema },
      { name: NeuralModel.name, schema: NeuralModelSchema },
    ]),
  ],
  controllers: [NeuralController],
  providers: [
    NeuralService,
    TrainingSamplesService,
    PgnIngestService,
    NeuralTrainingService,
    PgnIngestJobService,
    NeuralAutoTrainService,
  ],
  exports: [
    NeuralService,
    TrainingSamplesService,
    PgnIngestService,
    NeuralTrainingService,
    PgnIngestJobService,
    NeuralAutoTrainService,
  ],
})
export class NeuralModule {}
