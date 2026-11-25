import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Position, PositionDocument } from './schemas/position.schema';
import {
  PrimeEncodingService,
  EncodingResult,
} from '../genome/prime-encoding.service';
import { RedisService, CacheKeys, CacheTTL } from '../redis/redis.service';
import { DietriChessService } from '../dietrichess/dietrichess.service';
import { TransitionsService } from './transitions.service';
import { PgnsService } from '../pgns/pgns.service';

export type AnalyzeAndStoreResult = EncodingResult & {
  existsInDb: boolean;
  timesSeen: number;
  rankApprox?: number;
  message: string;
  dbId?: string;
  cached?: boolean;
  engine: string;
};

export interface AdvancedSearchParams {
  minL10?: number;
  maxL10?: number;
  minPieces?: number;
  maxPieces?: number;
  minTimesSeen?: number;
  admissibleOnly?: boolean;
  sortBy?: 'L10' | 'L' | 'timesSeen' | 'pieceCount';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface BulkAnalyzeResult {
  total: number;
  stored: number;
  updated: number;
  skipped: number;
  transitionsSaved: number;
  results: Array<{
    moveIndex: number;
    hash: string;
    status: 'stored' | 'updated' | 'skipped' | 'error';
    error?: string;
  }>;
}

@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(
    @InjectModel(Position.name) private positionModel: Model<PositionDocument>,
    private readonly encoding: PrimeEncodingService,
    private readonly redis: RedisService,
    private readonly dietrichess: DietriChessService,
    private readonly transitions: TransitionsService,
    private readonly pgns: PgnsService,
  ) {}

  /**
   * Prefer DietriChess (Python) when available; fall back to local TS encoder.
   */
  private async encode(
    fen: string,
  ): Promise<EncodingResult & { engine: string }> {
    if (
      this.dietrichess.isConfigured() &&
      (await this.dietrichess.isAvailable())
    ) {
      try {
        const r = await this.dietrichess.encode(fen);
        return r;
      } catch (e: any) {
        this.logger.warn(
          `DietriChess encode failed, fallback to TS: ${e.message}`,
        );
      }
    }
    const local = this.encoding.analyze(fen);
    return { ...local, engine: 'typescript-local' };
  }

  async analyzeAndLookup(
    fen: string,
    storeIfNew = false,
  ): Promise<AnalyzeAndStoreResult> {
    const result = await this.encode(fen);
    const posKey = CacheKeys.pos(result.hash);

    if (!storeIfNew) {
      const cached = await this.redis.get<AnalyzeAndStoreResult>(posKey);
      if (cached && cached.existsInDb) {
        this.bumpTimesSeen(result.hash).catch(() => undefined);
        return { ...cached, cached: true };
      }
    }

    const existing = await this.positionModel
      .findOne({ hash: result.hash })
      .exec();

    if (existing) {
      existing.timesSeen += 1;
      await existing.save();
      const rankApprox = await this.getRankApproxCached(existing.L);

      const payload: AnalyzeAndStoreResult = {
        ...result,
        existsInDb: true,
        timesSeen: existing.timesSeen,
        rankApprox,
        message: `Position already known (seen ${existing.timesSeen} times)`,
        dbId: existing._id.toString(),
        cached: false,
        engine: result.engine,
      };

      await this.redis.set(posKey, payload, CacheTTL.POSITION);
      await this.redis.del(CacheKeys.stats());
      return payload;
    }

    if (storeIfNew && result.staticallyAdmissible) {
      const created = await this.positionModel.create({
        hash: result.hash,
        fen: fen.trim(),
        L: result.L,
        L10: result.L10,
        pieceCount: result.pieceCount,
        staticallyAdmissible: result.staticallyAdmissible,
        timesSeen: 1,
        exponents: result.exponents,
        S_exact: (result as any).S_exact,
        S_digits: (result as any).S_digits,
      });

      await this.redis.invalidateOnNewPosition();
      const rankApprox = await this.getRankApproxCached(result.L);

      const payload: AnalyzeAndStoreResult = {
        ...result,
        existsInDb: true,
        timesSeen: 1,
        rankApprox,
        message: 'New position stored in the Genome database',
        dbId: created._id.toString(),
        cached: false,
        engine: result.engine,
      };

      await this.redis.set(posKey, payload, CacheTTL.POSITION);
      return payload;
    }

    return {
      ...result,
      existsInDb: false,
      timesSeen: 0,
      message: result.staticallyAdmissible
        ? 'Position is new (not yet in database)'
        : 'Position fails static checks and was not stored',
      cached: false,
      engine: result.engine,
    };
  }

  /**
   * Bulk analyze + store for a whole game.
   *
   * For each FEN:
   *   - if hash exists       → $inc timesSeen
   *   - if new + admissible  → insert (timesSeen = 1)
   *   - else                 → skipped
   *
   * Optionally persists transitions between consecutive plies.
   */
  async bulkAnalyzeAndStore(
    fens: string[],
    sans: string[] = [],
    ucis: string[] = [],
    storeIfNew = false,
    saveTransitions = true,
    pgn = '',
    headers: Record<string, string> = {},
  ): Promise<BulkAnalyzeResult> {
    // --- Calcular winrateWhite y winrateTurn a partir de headers.Result ---
    const rawResult = (headers?.Result || '*').trim();
    let winrateWhite = 0.5;
    let winrateTurn = 0.5;
    if (rawResult === '1-0') { winrateWhite = 1; winrateTurn = 0.5; }
    else if (rawResult === '0-1') { winrateWhite = 0; winrateTurn = 0.5; }
    else if (rawResult === '1/2-1/2' || rawResult === '1/2') { winrateWhite = 0.5; winrateTurn = 0.5; }
    // winrateTurn depende del lado que mueve: si es blanco, es winrateWhite; si es negro, es 1-winrateWhite
    // Lo calculamos por posición más abajo (necesitamos el FEN para saber el turno)

    this.logger.log(`bulkAnalyzeAndStore: result=${rawResult} winrateWhite=${winrateWhite} headers=${JSON.stringify(headers)}`);

    if (!Array.isArray(fens) || fens.length === 0) {
      return {
        total: 0,
        stored: 0,
        updated: 0,
        skipped: 0,
        transitionsSaved: 0,
        results: [],
      };
    }

    // 1. Encode every FEN once
    type Enc = EncodingResult & {
      engine: string;
      fen: string;
      san?: string;
      uci?: string;
    };
    const encodings: Array<Enc | null> = [];
    for (let i = 0; i < fens.length; i++) {
      try {
        const e = await this.encode(fens[i]);
        encodings.push({
          ...e,
          engine: e.engine,
          fen: fens[i].trim(),
          san: sans[i],
          uci: ucis[i],
        });
      } catch (err: any) {
        this.logger.warn(`bulk: FEN ${i} inválido: ${err.message}`);
        encodings.push(null);
      }
    }

    // 2. Fetch all existing hashes in one query
    const hashes = encodings
      .filter((e): e is Enc => e !== null)
      .map((e) => e.hash);
    const existingDocs = await this.positionModel
      .find({ hash: { $in: hashes } })
      .select('hash timesSeen winrateWhite winrateTurn')
      .lean()
      .exec();
    const existingByHash = new Map(
      existingDocs.map((d) => [d.hash, d] as const),
    );

    // 3. Build bulk operations
    const ops: any[] = [];
    const results: BulkAnalyzeResult['results'] = [];

    let stored = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < encodings.length; i++) {
      const e = encodings[i];
      if (!e) {
        results.push({
          moveIndex: i,
          hash: '',
          status: 'error',
          error: 'invalid fen',
        });
        skipped++;
        continue;
      }

      const existing = existingByHash.get(e.hash);
      if (existing) {
        // Calcular winrateTurn para esta posición (según el turno del FEN)
        const turn = (e.fen.split(' ')[1] || 'w') === 'b' ? 'b' : 'w';
        const wTurn = turn === 'w' ? winrateWhite : (1 - winrateWhite);
        // Media ponderada: nueva = (antigua * n + nueva) / (n + 1)
        const prevSeen = (existing as any).timesSeen || 1;
        const newWhite = (((existing as any).winrateWhite ?? 0.5) * prevSeen + winrateWhite) / (prevSeen + 1);
        const newTurn = (((existing as any).winrateTurn ?? 0.5) * prevSeen + wTurn) / (prevSeen + 1);
        ops.push({
          updateOne: {
            filter: { hash: e.hash },
            update: {
              $inc: { timesSeen: 1 },
              $set: { winrateWhite: newWhite, winrateTurn: newTurn },
            },
          },
        });
        updated++;
        results.push({ moveIndex: i, hash: e.hash, status: 'updated' });
        continue;
      }

      if (!storeIfNew || !e.staticallyAdmissible) {
        skipped++;
        results.push({
          moveIndex: i,
          hash: e.hash,
          status: 'skipped',
          error: !e.staticallyAdmissible
            ? 'not statically admissible'
            : 'storeIfNew=false',
        });
        continue;
      }

      ops.push({
        insertOne: {
          document: {
            hash: e.hash,
            fen: e.fen,
            L: e.L,
            L10: e.L10,
            pieceCount: e.pieceCount,
            staticallyAdmissible: e.staticallyAdmissible,
            timesSeen: 1,
            exponents: e.exponents,
            S_exact: e.S_exact,
            S_digits: e.S_digits,
            winrateWhite,
            winrateTurn: ((e.fen.split(' ')[1] || 'w') === 'b') ? (1 - winrateWhite) : winrateWhite,
          },
        },
      });
      stored++;
      results.push({ moveIndex: i, hash: e.hash, status: 'stored' });
    }

    // 4. Execute bulkWrite (ordered:false → un duplicado no aborta el resto)
    if (ops.length > 0) {
      try {
        const bwResult = await this.positionModel.bulkWrite(ops, { ordered: false });
        this.logger.log(`bulkWrite OK: ops=${ops.length} matched=${bwResult.matchedCount} modified=${bwResult.modifiedCount} upserted=${bwResult.upsertedCount}`);
      } catch (err: any) {
        this.logger.warn(`bulkWrite parcial: ${err.message}`);
      }
    }

    // 5. Transiciones entre plies consecutivos
    let transitionsSaved = 0;
    if (saveTransitions && encodings.length >= 2) {
      for (let i = 0; i < encodings.length - 1; i++) {
        const a = encodings[i];
        const b = encodings[i + 1];
        if (!a || !b) continue;
        // moveUci: usar UCI si existe; fallback a SAN (etiqueta temporal)
        const moveUci = a.uci || a.san || '';
        if (!moveUci) continue;
        try {
          await this.transitions.saveTransition(a.hash, b.hash, moveUci);
          transitionsSaved++;
        } catch (err: any) {
          this.logger.warn(`transición ${i}→${i + 1} falló: ${err.message}`);
        }
      }
    }

    // 6. Invalidar stats si hubo al menos 1 insert
    if (stored > 0) {
      await this.redis.del(CacheKeys.stats());
    }

    this.logger.log(
      `bulkAnalyzeAndStore: total=${encodings.length} stored=${stored} updated=${updated} skipped=${skipped} transitions=${transitionsSaved}`,
    );

    // === Guardar PGN en la colección `pgns` para el récord global ===
    if (pgn && pgn.trim() && encodings.length > 0) {
      try {
        const cleanPlies: Array<{
          moveIndex: number;
          fen: string;
          hash: string;
          L10: number;
        }> = [];
        for (let i = 0; i < encodings.length; i++) {
          const e = encodings[i];
          if (!e) continue;
          cleanPlies.push({
            moveIndex: i,
            fen: e.fen,
            hash: e.hash,
            L10: e.L10,
          });
        }

        await this.pgns.saveOrIncrement({
          pgn,
          headers: headers || {},
          plies: cleanPlies,
        });
      } catch (err: any) {
        this.logger.warn(`No se pudo guardar el PGN: ${err.message}`);
      }
    }

    return {
      total: encodings.length,
      stored,
      updated,
      skipped,
      transitionsSaved,
      results,
    };
  }

  private async getRankApproxCached(L: number): Promise<number> {
    const key = CacheKeys.rank(L);
    const cached = await this.redis.get<number>(key);
    if (typeof cached === 'number') return cached;

    const count = await this.positionModel
      .countDocuments({ L: { $lt: L } })
      .exec();
    const rank = count + 1;
    await this.redis.set(key, rank, CacheTTL.RANK);
    return rank;
  }

  private async bumpTimesSeen(hash: string): Promise<void> {
    await this.positionModel
      .updateOne({ hash }, { $inc: { timesSeen: 1 } })
      .exec();
  }

  async getFirstTerms(limit = 50, offset = 0) {
    const key = CacheKeys.terms(offset, limit);
    const cached = await this.redis.get(key);
    if (cached) return cached;

    const terms = await this.positionModel
      .find({ staticallyAdmissible: true })
      .sort({ L: 1 })
      .skip(offset)
      .limit(limit)
      .select('fen L L10 pieceCount timesSeen hash')
      .lean()
      .exec();

    await this.redis.set(key, terms, CacheTTL.TERMS);
    return terms;
  }

  async getStats() {
    const key = CacheKeys.stats();
    const cached = await this.redis.get(key);
    if (cached) return { ...cached, cached: true };

    const [total, admissible, maxL10Doc] = await Promise.all([
      this.positionModel.countDocuments().exec(),
      this.positionModel.countDocuments({ staticallyAdmissible: true }).exec(),
      this.positionModel
        .findOne()
        .sort({ L10: -1 })
        .select('L L10 fen hash')
        .lean()
        .exec(),
    ]);

    const stats = {
      totalPositions: total,
      admissiblePositions: admissible,
      maxL: maxL10Doc?.L ?? null,
      maxL10: maxL10Doc?.L10 ?? null,
      maxLFen: maxL10Doc?.fen ?? null,
      maxLHash: (maxL10Doc as any)?.hash ?? null,
      redisEnabled: this.redis.isEnabled(),
      dietrichessEnabled: this.dietrichess.isConfigured(),
    };

    await this.redis.set(key, stats, CacheTTL.STATS);
    return { ...stats, cached: false };
  }

  /** Search by exact FEN or board part */
  async searchByFen(fen: string) {
    const board = fen.trim().split(/\s+/)[0];
    const escaped = board.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byFen = await this.positionModel
      .find({ fen: { $regex: '^' + escaped } })
      .limit(20)
      .lean()
      .exec();
    if (byFen.length) return { found: true, positions: byFen };

    const enc = await this.encode(fen);
    const one = await this.positionModel
      .findOne({ hash: enc.hash })
      .lean()
      .exec();
    if (one) return { found: true, positions: [one], encoding: enc };
    return { found: false, positions: [], encoding: enc };
  }

  async getTopByFrequency(limit = 30) {
    return this.positionModel
      .find()
      .sort({ timesSeen: -1 })
      .limit(limit)
      .select('fen L L10 pieceCount timesSeen hash S_digits bestMoveUci')
      .lean()
      .exec();
  }

  async getTopByL10(limit = 30) {
    return this.positionModel
      .find({ staticallyAdmissible: true })
      .sort({ L10: -1 })
      .limit(Math.min(limit, 100))
      .select('fen L L10 pieceCount timesSeen hash S_digits')
      .lean()
      .exec();
  }

  async searchAdvanced(params: AdvancedSearchParams) {
    const filter: any = {};

    if (params.minL10 != null || params.maxL10 != null) {
      filter.L10 = {};
      if (params.minL10 != null) filter.L10.$gte = params.minL10;
      if (params.maxL10 != null) filter.L10.$lte = params.maxL10;
    }

    if (params.minPieces != null || params.maxPieces != null) {
      filter.pieceCount = {};
      if (params.minPieces != null) filter.pieceCount.$gte = params.minPieces;
      if (params.maxPieces != null) filter.pieceCount.$lte = params.maxPieces;
    }

    if (params.minTimesSeen != null) {
      filter.timesSeen = { $gte: params.minTimesSeen };
    }

    if (params.admissibleOnly) {
      filter.staticallyAdmissible = true;
    }

    const sortField = params.sortBy || 'L10';
    const sortOrder = params.order === 'asc' ? 1 : -1;
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const [results, total] = await Promise.all([
      this.positionModel
        .find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(offset)
        .limit(limit)
        .select(
          'fen L L10 pieceCount timesSeen hash S_digits staticallyAdmissible',
        )
        .lean()
        .exec(),
      this.positionModel.countDocuments(filter).exec(),
    ]);

    return { results, total, limit, offset };
  }
}
