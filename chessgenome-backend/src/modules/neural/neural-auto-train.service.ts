import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NeuralModel, NeuralModelDocument } from './schemas/neural-model.schema';
import { NeuralTrainingService } from './neural-training.service';
import { TrainingSamplesService } from './training-samples.service';

@Injectable()
export class NeuralAutoTrainService {
  private readonly logger = new Logger(NeuralAutoTrainService.name);
  private running = false;

  constructor(
    @InjectModel(NeuralModel.name)
    private readonly modelModel: Model<NeuralModelDocument>,
    private readonly training: NeuralTrainingService,
    private readonly samples: TrainingSamplesService,
  ) {}

  /** Cron: cada 6 horas comprueba si hay que reentrenar */
  @Cron(CronExpression.EVERY_6_HOURS)
  async autoTrainIfNeeded() {
    if (this.running) return;
    this.running = true;
    try {
      const active = await this.modelModel.findOne({ active: true }).lean();
      const corpus = await this.samples.exportPositionsCorpus(5000, true, 1);
      const corpusSize = corpus.length;
      const lastSize = active?.corpusSizeAtTraining ?? 0;

      const growth = lastSize > 0 ? (corpusSize - lastSize) / lastSize : 1;
      const shouldTrain = !active || growth >= 0.1; // 10% de crecimiento

      this.logger.log(
        `autoTrain check: corpus=${corpusSize} last=${lastSize} growth=${(growth * 100).toFixed(1)}% shouldTrain=${shouldTrain}`,
      );

      if (!shouldTrain) return;

      const result: any = await this.training.train(30, 5000);
      if (!result.ok) {
        this.logger.warn(`autoTrain failed: ${result.error}`);
        return;
      }

      // Guardar el modelo entrenado
      const name = String(result.outDir).split('/').pop();
      const metadata = result.metadata || {};
      const newModel = await this.modelModel.create({
        name,
        outDir: result.outDir,
        metadata,
        active: false,
        corpusSizeAtTraining: corpusSize,
      });

      // Activar si mejora el MAE del modelo activo
      const newMae = metadata.val_mae ?? Infinity;
      const oldMae = active?.metadata?.val_mae ?? Infinity;
      const improve = newMae < oldMae;
      this.logger.log(
        `autoTrain: newMae=${newMae} oldMae=${oldMae} improve=${improve}`,
      );

      if (improve) {
        if (active) {
          await this.modelModel.updateOne({ _id: active._id }, { active: false });
        }
        await this.modelModel.updateOne(
          { _id: newModel._id },
          { active: true, activatedAt: new Date() },
        );
        this.logger.log(`autoTrain: activated ${name}`);
      }
    } catch (e: any) {
      this.logger.error(`autoTrain error: ${e.message}`);
    } finally {
      this.running = false;
    }
  }

  /** Manual: entrenar y activar si mejora */
  async trainAndMaybeActivate(epochs = 30, limit = 5000) {
    const corpus = await this.samples.exportPositionsCorpus(limit, true, 1);
    const corpusSize = corpus.length;
    const result: any = await this.training.train(epochs, limit);
    if (!result.ok) return result;
    const name = String(result.outDir).split('/').pop();
    const metadata = result.metadata || {};
    const active = await this.modelModel.findOne({ active: true }).lean();
    const newMae = metadata.val_mae ?? Infinity;
    const oldMae = active?.metadata?.val_mae ?? Infinity;
    const improve = newMae < oldMae;
    const newModel = await this.modelModel.create({
      name,
      outDir: result.outDir,
      metadata,
      active: improve,
      corpusSizeAtTraining: corpusSize,
      activatedAt: improve ? new Date() : undefined,
    });
    if (improve && active) {
      await this.modelModel.updateOne({ _id: active._id }, { active: false });
    }
    return { ...result, activated: improve, modelId: newModel._id };
  }

  async getActiveModel() {
    return this.modelModel.findOne({ active: true }).lean();
  }

  async listModels() {
    return this.modelModel.find().sort({ createdAt: -1 }).lean();
  }
}
