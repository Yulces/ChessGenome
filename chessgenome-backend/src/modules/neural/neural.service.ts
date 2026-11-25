import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrimeEncodingService } from '../genome/prime-encoding.service';
import { PositionsService } from '../positions/positions.service';

/**
 * Neural bridge for DietrichessAnalyzer models.
 *
 * Env:
 *   NEURAL_MODELS_PATH  e.g. D:\ChessGenome\DietrichessAnalyzer\models
 *
 * Lists .h5 / directories / metadata. Full inference of Keras .h5 in pure
 * Node is not practical; we expose features + model inventory and optional
 * hook for a Python predictor later.
 */
export interface ModelInfo {
  name: string;
  path: string;
  type: 'h5' | 'dir' | 'other';
  sizeBytes?: number;
  mtime?: string;
}

@Injectable()
export class NeuralService implements OnModuleInit {
  private readonly logger = new Logger(NeuralService.name);
  private modelsPath: string | null = null;
  private models: ModelInfo[] = [];

  constructor(
    private readonly encoding: PrimeEncodingService,
    private readonly positions: PositionsService,
  ) {}

  onModuleInit() {
    this.modelsPath = this.resolveModelsPath();
    if (this.modelsPath) {
      this.scanModels();
      this.logger.log(
        `Neural models path: ${this.modelsPath} (${this.models.length} entries)`,
      );
    } else {
      this.logger.warn(
        'NEURAL_MODELS_PATH not set / not found — neural models unavailable',
      );
    }
  }

  private resolveModelsPath(): string | null {
    const candidates = [
      process.env.NEURAL_MODELS_PATH,
      path.join(process.cwd(), '..', 'DietrichessAnalyzer', 'models'),
      path.join(process.cwd(), 'models'),
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  scanModels(): ModelInfo[] {
    this.models = [];
    if (!this.modelsPath) return this.models;

    const entries = fs.readdirSync(this.modelsPath, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(this.modelsPath, e.name);
      if (e.isDirectory()) {
        this.models.push({
          name: e.name,
          path: full,
          type: 'dir',
          mtime: fs.statSync(full).mtime.toISOString(),
        });
      } else if (e.name.endsWith('.h5') || e.name.endsWith('.keras')) {
        const st = fs.statSync(full);
        this.models.push({
          name: e.name,
          path: full,
          type: 'h5',
          sizeBytes: st.size,
          mtime: st.mtime.toISOString(),
        });
      } else {
        const st = fs.statSync(full);
        this.models.push({
          name: e.name,
          path: full,
          type: 'other',
          sizeBytes: st.size,
          mtime: st.mtime.toISOString(),
        });
      }
    }
    return this.models;
  }

  async listModels() {
    let corpusSize = 0;
    try {
      const stats = await this.positions.getStats();
      corpusSize = stats.totalPositions ?? 0;
    } catch {
      corpusSize = 0;
    }
    return {
      configured: !!this.modelsPath,
      modelsPath: this.modelsPath,
      models: this.scanModels(),
      /** Same MongoDB positions DB used by the Genome (training corpus source). */
      corpusSize,
      corpusDb: 'mongodb/chessgenome.positions',
      messageKey: this.modelsPath ? 'neural.msg.modelsDetected' : 'neural.msg.pathMissing',
    };
  }

  extractFeatures(fen: string): {
    features: number[];
    meta: Record<string, number | string | boolean>;
  } {
    const enc = this.encoding.analyze(fen);
    const parts = fen.trim().split(/\s+/);
    const side = parts[1] === 'b' ? 1 : 0;

    const maxExp = 12;
    const normalized = enc.exponents.map((v) => v / maxExp);
    const features = [
      ...normalized,
      enc.pieceCount / 32,
      enc.L10 / 1000,
      side,
      enc.staticallyAdmissible ? 1 : 0,
    ];

    return {
      features,
      meta: {
        pieceCount: enc.pieceCount,
        L10: enc.L10,
        S_digits: enc.S_digits,
        hash: enc.hash,
        sideToMove: parts[1] || 'w',
      },
    };
  }

  async predict(fen: string, modelName?: string) {
    const { features, meta } = this.extractFeatures(fen);
    const models = this.modelsPath ? this.scanModels() : [];
    const chosen =
      (modelName && models.find((m) => m.name === modelName)) ||
      models.find((m) => m.type === 'h5') ||
      models[0];

    return {
      available: false,
      modelsPath: this.modelsPath,
      model: chosen?.name ?? null,
      featuresDim: features.length,
      featuresPreview: features.slice(0, 8),
      meta,
      // messageKey + model for i18n on the client
      messageKey: chosen ? 'neural.msg.modelFoundStub' : 'neural.msg.noModels',
    };
  }
}
