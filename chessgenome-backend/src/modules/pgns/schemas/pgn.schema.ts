import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PgnEntryDocument = HydratedDocument<PgnEntry>;

@Schema({ timestamps: true, collection: 'pgns' })
export class PgnEntry {
  @Prop({ required: true, unique: true, index: true })
  pgnHash!: string;

  @Prop({ required: true })
  pgn!: string;

  @Prop({ type: Object, default: {} })
  headers!: Record<string, string>;

  @Prop({ required: true, index: true })
  maxL10!: number;

  @Prop({ required: true })
  maxL10Fen!: string;

  @Prop({ required: true, index: true })
  maxL10Hash!: string;

  @Prop({ required: true })
  maxL10PlyIndex!: number;

  @Prop({ required: true })
  plyCount!: number;

  @Prop({ default: 1, index: true })
  timesSeen!: number;

  /** Análisis completo guardado para no recalcular */
  @Prop({ type: Object })
  analysisResult?: Record<string, any>;
}

export const PgnEntrySchema = SchemaFactory.createForClass(PgnEntry);
PgnEntrySchema.index({ maxL10: -1 });
