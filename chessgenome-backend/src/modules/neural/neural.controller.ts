import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { NeuralService } from './neural.service';
import { TrainingSamplesService } from './training-samples.service';
import { PgnIngestService } from './pgn-ingest.service';
import { NeuralTrainingService } from './neural-training.service';
import { PgnIngestJobService } from './pgn-ingest-job.service';
import { NeuralAutoTrainService } from './neural-auto-train.service';
import { TrainingSample } from './schemas/training-sample.schema';

@Controller('neural')
export class NeuralController {
  constructor(
    private readonly neural: NeuralService,
    private readonly samples: TrainingSamplesService,
    private readonly ingest: PgnIngestService,
    private readonly training: NeuralTrainingService,
    private readonly ingestJob: PgnIngestJobService,
    private readonly autoTrain: NeuralAutoTrainService,
  ) {}

  @Get('models')
  models() { return this.training.listModels(); }

  @Post('features')
  features(@Body() body: { fen: string }) { return this.neural.extractFeatures(body.fen); }

  @Post('predict')
  predict(@Body() body: { fen: string; model?: string }) {
    if (body.model) {
      return this.training.predict(body.model, body.fen, 3);
    }
    return this.neural.predict(body.fen, body.model);
  }

  @Get('corpus/stats')
  corpusStats() { return this.samples.stats(); }

  @Get('corpus/export-positions')
  corpusExportPositions(
    @Query('limit') limit = '5000',
    @Query('onlyLabeled') onlyLabeled = 'true',
    @Query('minTimesSeen') minTimesSeen = '1',
  ) {
    return this.samples.exportPositionsCorpus(
      parseInt(limit, 10) || 5000,
      onlyLabeled !== 'false',
      parseInt(minTimesSeen, 10) || 1,
    );
  }

  @Post('corpus/bulk')
  async corpusBulk(@Body() body: { samples: Partial<TrainingSample>[] }) {
    if (!body?.samples || !Array.isArray(body.samples)) {
      return { inserted: 0, duplicates: 0, error: 'samples array required' };
    }
    return this.samples.createMany(body.samples);
  }

  @Post('ingest-pgn')
  async ingestPgn(@Body() body: { pgn: string }) {
    if (!body?.pgn || typeof body.pgn !== 'string') {
      return { games: 0, stored: 0, updated: 0, skipped: 0, error: 'pgn string required' };
    }
    const parts = body.pgn.split(/(?=\[Event\s+")/g).filter((p) => p.trim());
    if (parts.length <= 1) {
      return this.ingest.ingestPgn(body.pgn);
    }
    return this.ingest.ingestMultiple(parts);
  }

  @Post('train')
  async train(@Body() body: { epochs?: number; limit?: number }) {
    return this.training.train(body?.epochs ?? 50, body?.limit ?? 5000);
  }

  @Post('best-move')
  async bestMove(@Body() body: { fen: string; model?: string }) {
    const model = body.model || this.training.listModels()[0]?.name;
    if (!model) return { ok: false, error: 'no model available' };
    return this.training.predict(model, body.fen, 3);
  }

  @Get('active-model')
  activeModel() {
    return this.autoTrain.getActiveModel();
  }

  @Get('models-history')
  modelsHistory() {
    return this.autoTrain.listModels();
  }

  @Post('train-and-activate')
  async trainAndActivate(@Body() body: { epochs?: number; limit?: number }) {
    return this.autoTrain.trainAndMaybeActivate(body?.epochs ?? 30, body?.limit ?? 5000);
  }

  @Post('ingest-pgn-multi')
  async ingestPgnMulti(@Body() body: { pgns: string[] }) {
    if (!body?.pgns || !Array.isArray(body.pgns) || body.pgns.length === 0) {
      return { ok: false, error: 'pgns array required' };
    }
    return this.ingestJob.start(body.pgns);
  }

  @Get('ingest-status/:jobId')
  ingestStatus(@Param('jobId') jobId: string) {
    const job = this.ingestJob.get(jobId);
    if (!job) return { ok: false, error: 'job not found' };
    return { ok: true, job };
  }

  @Get('ingest-jobs')
  ingestJobs() {
    return { ok: true, jobs: this.ingestJob.list() };
  }
}
