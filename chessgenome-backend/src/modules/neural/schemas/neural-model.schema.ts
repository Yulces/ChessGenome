import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NeuralModelDocument = HydratedDocument<NeuralModel>;

@Schema({ timestamps: true, collection: 'neural_models' })
export class NeuralModel {
  @Prop({ required: true, unique: true, index: true })
  name!: string; // e.g. godel_2026-11-01T05-49-59-154Z

  @Prop({ required: true })
  outDir!: string; // /app/models/godel_...

  @Prop({ type: Object, required: true })
  metadata!: Record<string, any>; // samples, val_mae, train_mae, etc.

  @Prop({ default: false, index: true })
  active!: boolean;

  @Prop({ default: 0 })
  corpusSizeAtTraining!: number;

  @Prop()
  activatedAt?: Date;
}

export const NeuralModelSchema = SchemaFactory.createForClass(NeuralModel);
NeuralModelSchema.index({ active: 1 });
NeuralModelSchema.index({ createdAt: -1 });
