import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TrainingSampleDocument = HydratedDocument<TrainingSample>;

@Schema({ timestamps: true, collection: 'training_samples' })
export class TrainingSample {
  @Prop({ required: true, index: true })
  fen!: string;

  @Prop({ required: true })
  hash!: string;

  @Prop({ type: [Number], required: true })
  features!: number[];

  /** '1-0' | '0-1' | '1/2-1/2' */
  @Prop({ required: true, index: true })
  label!: string;

  /** Stockfish eval in centipawns, null if mate */
  @Prop({ type: Number, default: null })
  evalCp?: number | null;

  /** Mate in N (positive = white mates, negative = black mates) */
  @Prop({ type: Number, default: null })
  mateIn?: number | null;

  @Prop({ required: true, index: true })
  source!: string;

  @Prop({ type: String, default: null, index: true })
  sourceId?: string | null;

  @Prop({ type: Number, default: 0 })
  ply!: number;

  @Prop({ type: String, default: 'v1', index: true })
  version!: string;
}

export const TrainingSampleSchema = SchemaFactory.createForClass(TrainingSample);
TrainingSampleSchema.index({ fen: 1, source: 1, sourceId: 1 }, { unique: false });
TrainingSampleSchema.index({ label: 1, version: 1 });
