import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PgnEntry, PgnEntryDocument } from './schemas/pgn.schema';

export interface SavePgnInput {
  pgn: string;
  headers: Record<string, string>;
  plies: Array<{
    moveIndex: number;
    fen: string;
    hash: string;
    L10: number;
  }>;
}

@Injectable()
export class PgnsService {
  private readonly logger = new Logger(PgnsService.name);

  constructor(
    @InjectModel(PgnEntry.name)
    private pgnModel: Model<PgnEntryDocument>,
  ) {}

  private hashPgn(pgn: string): string {
    let h = 5381;
    for (let i = 0; i < pgn.length; i++) {
      h = ((h << 5) + h + pgn.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  async saveOrIncrement(input: SavePgnInput) {
    const pgnHash = this.hashPgn(input.pgn);

    let maxIdx = 0;
    let maxL10 = -Infinity;
    for (let i = 0; i < input.plies.length; i++) {
      if (input.plies[i].L10 > maxL10) {
        maxL10 = input.plies[i].L10;
        maxIdx = i;
      }
    }
    const maxPly = input.plies[maxIdx];

    const existing = await this.pgnModel.findOne({ pgnHash }).exec();

    if (existing) {
      existing.timesSeen += 1;
      if (maxL10 > existing.maxL10) {
        existing.maxL10 = maxL10;
        existing.maxL10Fen = maxPly.fen;
        existing.maxL10Hash = maxPly.hash;
        existing.maxL10PlyIndex = maxPly.moveIndex;
      }
      await existing.save();
      return { stored: false, updated: true, pgnHash };
    }

    await this.pgnModel.create({
      pgnHash,
      pgn: input.pgn,
      headers: input.headers || {},
      maxL10,
      maxL10Fen: maxPly.fen,
      maxL10Hash: maxPly.hash,
      maxL10PlyIndex: maxPly.moveIndex,
      plyCount: input.plies.length,
      timesSeen: 1,
    });

    this.logger.log(
      `PGN guardado: hash=${pgnHash} maxL10=${maxL10.toFixed(4)}`,
    );
    return { stored: true, updated: false, pgnHash };
  }

  async getTopRecord() {
    const doc = await this.pgnModel
      .findOne()
      .sort({ maxL10: -1 })
      .lean()
      .exec();

    if (!doc) {
      return {
        found: false,
        pgn: null,
        headers: {},
        maxL10: null,
        maxL10Fen: null,
        maxL10Hash: null,
        maxL10PlyIndex: null,
        plyCount: null,
        timesSeen: null,
      };
    }

    return {
      found: true,
      pgn: doc.pgn,
      headers: doc.headers || {},
      maxL10: doc.maxL10,
      maxL10Fen: doc.maxL10Fen,
      maxL10Hash: doc.maxL10Hash,
      maxL10PlyIndex: doc.maxL10PlyIndex,
      plyCount: doc.plyCount,
      timesSeen: doc.timesSeen,
    };
  }

  async getTop(limit = 10) {
    return this.pgnModel
      .find()
      .sort({ maxL10: -1 })
      .limit(Math.min(limit, 100))
      .select('pgnHash headers maxL10 maxL10Fen plyCount timesSeen createdAt')
      .lean()
      .exec();
  }

  /** Calcula el hash de un PGN (misma función que en el frontend) */
  hashPgnPublic(pgn: string): string {
    return this.hashPgn(pgn);
  }

  /** Dado un array de hashes, devuelve cuáles existen y cuáles no */
  async check(pgnHashes: string[]) {
    const existing = await this.pgnModel
      .find({ pgnHash: { $in: pgnHashes } })
      .select('pgnHash')
      .lean()
      .exec();
    const existingSet = new Set(existing.map((d: any) => d.pgnHash));
    const found = pgnHashes.filter((h) => existingSet.has(h));
    const missing = pgnHashes.filter((h) => !existingSet.has(h));
    return { existing: found, missing };
  }

  /** Devuelve el analysisResult guardado de un PGN */
  async getAnalysis(pgnHash: string) {
    const doc = await this.pgnModel.findOne({ pgnHash }).select('analysisResult pgn headers').lean().exec();
    if (!doc) return null;
    return {
      pgnHash,
      pgn: doc.pgn,
      headers: doc.headers,
      analysisResult: doc.analysisResult ?? null,
    };
  }

  /** Guarda el analysisResult de un PGN ya procesado */
  async saveAnalysis(pgnHash: string, analysisResult: any) {
    const result = await this.pgnModel.updateOne(
      { pgnHash },
      { $set: { analysisResult } },
    );
    return { ok: true, matched: result.matchedCount };
  }
}
