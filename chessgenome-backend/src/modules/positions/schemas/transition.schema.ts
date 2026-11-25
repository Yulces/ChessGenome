import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TransitionDocument = HydratedDocument<Transition>;

@Schema({ timestamps: true, collection: 'transitions' })
export class Transition {
  @Prop({ required: true, index: true })
  fromHash!: string;

  @Prop({ required: true, index: true })
  toHash!: string;

  @Prop({ required: true })
  moveUci!: string;

  @Prop({ default: 1 })
  frequency!: number;

  @Prop({ default: 0.5 })
  winrateFromMove!: number;
}

export const TransitionSchema = SchemaFactory.createForClass(Transition);
TransitionSchema.index({ fromHash: 1, toHash: 1, moveUci: 1 }, { unique: true });
