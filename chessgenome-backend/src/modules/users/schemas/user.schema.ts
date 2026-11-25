import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  /** Nick único del usuario (inmutable) */
  @Prop({ required: true, unique: true, index: true, trim: true })
  nick!: string;

  /** Hash bcrypt de la password */
  @Prop({ required: true })
  passwordHash!: string;

  /** Si es true, la cuenta fue eliminada (soft-delete) */
  @Prop({ default: false, index: true })
  deleted!: boolean;

  /** Último login (informativo) */
  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ nick: 1 }, { unique: true });
