import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PositionDocument = HydratedDocument<Position>;

/**
 * Port of DietrichessAnalyzer PositionDatabase.positions table → MongoDB.
 * S is stored as string (unlimited) + L10 for ordering.
 */
@Schema({
  timestamps: true,
  collection: 'positions',
})
export class Position {
  /** Hash of exponent vector (or SHA of S_exact) – unique key */
  @Prop({ required: true, unique: true, index: true })
  hash!: string;

  /** Full or board FEN */
  @Prop({ required: true, index: true })
  fen!: string;

  /** Exact Gödel number S as decimal string (unlimited) */
  @Prop()
  S_exact?: string;

  @Prop()
  S_digits?: number;

  /** L = Σ v·ln(p) */
  @Prop({ required: true, index: true })
  L!: number;

  /** L10 = Σ v·log10(p) – primary sort key for the Genome */
  @Prop({ required: true, index: true })
  L10!: number;

  @Prop({ required: true, index: true })
  pieceCount!: number;

  @Prop({ required: true, default: false })
  staticallyAdmissible!: boolean;

  /** timesSeen / frecuencia */
  @Prop({ default: 1, index: true })
  timesSeen!: number;

  @Prop({ default: 0.5 })
  winrateWhite?: number;

  @Prop({ default: 0.5 })
  winrateTurn?: number;

  @Prop()
  bestMoveUci?: string;

  @Prop()
  secondBestUci?: string;

  @Prop()
  evalEngine?: number;

  @Prop()
  sfBestMove?: string;

  @Prop()
  sfScore?: number;

  @Prop()
  sfDepth?: number;

  @Prop()
  avgElo?: number;

  @Prop()
  contributedBy?: string;

  @Prop()
  examplePgn?: string;

  @Prop({ type: [Number] })
  exponents?: number[];

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const PositionSchema = SchemaFactory.createForClass(Position);
PositionSchema.index({ L10: 1, pieceCount: 1 });
PositionSchema.index({ timesSeen: -1 });
