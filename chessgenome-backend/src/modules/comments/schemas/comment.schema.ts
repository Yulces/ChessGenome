import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;
export type CommentTag = 'bug' | 'suggestion' | 'question' | 'discussion';

export const COMMENT_TAGS: CommentTag[] = [
  'bug',
  'suggestion',
  'question',
  'discussion',
];

@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: 'User' })
  authorId!: Types.ObjectId;

  @Prop({ required: true })
  authorNick!: string;

  @Prop({ required: true, maxlength: 2000 })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null, index: true })
  parentId!: Types.ObjectId | null;

  @Prop({
    required: true,
    enum: COMMENT_TAGS,
    default: 'discussion',
    index: true,
  })
  tag!: CommentTag;

  @Prop({ default: false, index: true })
  deleted!: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ createdAt: -1 });
CommentSchema.index({ tag: 1, createdAt: -1 });
CommentSchema.index({ parentId: 1, createdAt: 1 });
