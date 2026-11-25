import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuthorDocument = HydratedDocument<Author>;

@Schema({ timestamps: true })
export class Author {
  @Prop({ required: true, index: true })
  positionHash!: string;

  @Prop({ required: true })
  fen!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ default: '' })
  country?: string;

  @Prop({ default: '' })
  note?: string;

  @Prop({ required: true, unique: true, index: true })
  editToken!: string;

  @Prop({ default: false })
  isRecordHolder!: boolean;
}

export const AuthorSchema = SchemaFactory.createForClass(Author);
