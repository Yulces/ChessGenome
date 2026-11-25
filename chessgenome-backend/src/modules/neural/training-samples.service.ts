import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TrainingSample, TrainingSampleDocument } from './schemas/training-sample.schema';
import { Position, PositionDocument } from '../positions/schemas/position.schema';

@Injectable()
export class TrainingSamplesService {
  private readonly logger = new Logger(TrainingSamplesService.name);

  constructor(
    @InjectModel(TrainingSample.name)
    private readonly model: Model<TrainingSampleDocument>,
    @InjectModel(Position.name)
    private readonly positionModel: Model<PositionDocument>,
  ) {}

  async stats() {
    const total = await this.model.countDocuments().exec();
    const byLabel = await this.model.aggregate([
      { $group: { _id: '$label', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).exec();
    const byVersion = await this.model.aggregate([
      { $group: { _id: '$version', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).exec();
    const latest = await this.model.find().sort({ createdAt: -1 }).limit(1).exec();
    return { total, byLabel, byVersion, latest: latest[0] ?? null };
  }

  async createMany(samples: Partial<TrainingSample>[]) {
    if (!samples.length) return { inserted: 0, duplicates: 0 };
    try {
      const docs = await this.model.insertMany(samples, { ordered: false });
      return { inserted: docs.length, duplicates: 0 };
    } catch (e: any) {
      const inserted = e.insertedDocs?.length ?? 0;
      const duplicates = e.writeErrors?.filter((w: any) => w.code === 11000).length ?? 0;
      this.logger.warn(`insertMany partial: inserted=${inserted} dup=${duplicates} msg=${e.message}`);
      return { inserted, duplicates };
    }
  }

  async exportForTraining(version = 'v1', limit = 0) {
    const q = this.model.find({ version }).select('fen features label evalCp mateIn -_id').lean();
    if (limit > 0) q.limit(limit);
    return q.exec();
  }

  async exportPositionsCorpus(limit = 5000, onlyLabeled = true, minTimesSeen = 1) {
    const filter: any = {
      staticallyAdmissible: true,
      timesSeen: { $gte: minTimesSeen },
    };
    if (onlyLabeled) {
      filter.$or = [
        { winrateWhite: { $ne: 0.5 } },
        { winrateTurn: { $ne: 0.5 } },
      ];
    }
    const q = this.positionModel
      .find(filter)
      .select(
        'fen L L10 pieceCount timesSeen exponents S_digits ' +
          'winrateWhite winrateTurn evalEngine -_id',
      )
      .sort({ timesSeen: -1 })
      .limit(limit)
      .lean();
    const docs = await q.exec();
    return docs.map((d: any) => ({
      fen: d.fen,
      L: d.L,
      L10: d.L10,
      pieceCount: d.pieceCount,
      timesSeen: d.timesSeen,
      exponents: d.exponents,
      S_digits: d.S_digits,
      winrateWhite: d.winrateWhite,
      winrateTurn: d.winrateTurn,
      evalEngine: d.evalEngine ?? null,
      turn: (String(d.fen).split(' ')[1] || 'w') === 'b' ? 'b' : 'w',
    }));
  }
}
