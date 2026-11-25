import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transition, TransitionDocument } from './schemas/transition.schema';

@Injectable()
export class TransitionsService {
  constructor(
    @InjectModel(Transition.name)
    private transitionModel: Model<TransitionDocument>,
  ) {}

  async saveTransition(
    fromHash: string,
    toHash: string,
    moveUci: string,
    resultado?: number,
  ) {
    const existing = await this.transitionModel
      .findOne({ fromHash, toHash, moveUci })
      .exec();
    if (existing) {
      const freq = existing.frequency + 1;
      if (resultado !== undefined) {
        existing.winrateFromMove =
          (existing.winrateFromMove * existing.frequency + resultado) / freq;
      }
      existing.frequency = freq;
      await existing.save();
      return existing;
    }
    return this.transitionModel.create({
      fromHash,
      toHash,
      moveUci,
      frequency: 1,
      winrateFromMove: resultado ?? 0.5,
    });
  }

  async fromPosition(fromHash: string, limit = 20) {
    return this.transitionModel
      .find({ fromHash })
      .sort({ frequency: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async bestMove(fromHash: string) {
    const row = await this.transitionModel
      .findOne({ fromHash })
      .sort({ winrateFromMove: -1, frequency: -1 })
      .lean()
      .exec();
    return row?.moveUci ?? null;
  }
}
