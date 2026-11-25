import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Comment,
  CommentDocument,
  CommentTag,
  COMMENT_TAGS,
} from './schemas/comment.schema';

export interface CommentPublic {
  id: string;
  authorNick: string;
  content: string;
  parentId: string | null;
  tag: CommentTag;
  createdAt: string;
  canDelete?: boolean;
  replies?: CommentPublic[];
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
  ) {}

  /** Lista comentarios (opcionalmente filtrados por tag) en árbol de 1 nivel. */
  async list(currentUserId?: string, tag?: string): Promise<CommentPublic[]> {
    const filter: any = { deleted: { $ne: true } };
    if (tag && COMMENT_TAGS.includes(tag as CommentTag)) {
      filter.tag = tag;
    }

    const all = await this.commentModel
      .find(filter)
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    const roots: CommentPublic[] = [];
    const byId: Record<string, CommentPublic> = {};

    for (const c of all) {
      const item: CommentPublic = {
        id: (c._id as any).toString(),
        authorNick: c.authorNick,
        content: c.content,
        parentId: c.parentId ? String(c.parentId) : null,
        tag: (c.tag as CommentTag) || 'discussion',
        createdAt: (c as any).createdAt?.toISOString?.() || '',
        canDelete: currentUserId ? String(c.authorId) === currentUserId : false,
        replies: [],
      };
      byId[item.id] = item;
      if (!c.parentId) {
        roots.push(item);
      }
    }

    for (const c of all) {
      if (!c.parentId) continue;
      const parent = byId[String(c.parentId)];
      if (!parent) continue;
      parent.replies!.push({
        id: (c._id as any).toString(),
        authorNick: c.authorNick,
        content: c.content,
        parentId: String(c.parentId),
        tag: (c.tag as CommentTag) || 'discussion',
        createdAt: (c as any).createdAt?.toISOString?.() || '',
        canDelete: currentUserId ? String(c.authorId) === currentUserId : false,
      });
    }

    return roots;
  }

  /** Crea un comentario raíz o respuesta. Las respuestas heredan el tag del padre. */
  async create(
    userId: string,
    nick: string,
    content: string,
    parentId: string | null,
    tag?: string,
  ): Promise<CommentPublic> {
    const clean = (content || '').trim();
    if (!clean) throw new BadRequestException('El comentario está vacío');
    if (clean.length > 2000) {
      throw new BadRequestException('Máximo 2000 caracteres');
    }

    let parent: Types.ObjectId | null = null;
    let finalTag: CommentTag = 'discussion';

    if (parentId) {
      if (!Types.ObjectId.isValid(parentId)) {
        throw new BadRequestException('parentId inválido');
      }
      const parentDoc = await this.commentModel
        .findOne({ _id: parentId, deleted: { $ne: true } })
        .lean()
        .exec();
      if (!parentDoc) throw new NotFoundException('Comentario padre no encontrado');
      if (parentDoc.parentId) {
        throw new BadRequestException(
          'No se pueden anidar respuestas más de un nivel',
        );
      }
      parent = new Types.ObjectId(parentId);
      finalTag = (parentDoc.tag as CommentTag) || 'discussion';
    } else {
      // Comentario raíz: usar el tag enviado o 'discussion'
      if (tag && COMMENT_TAGS.includes(tag as CommentTag)) {
        finalTag = tag as CommentTag;
      }
    }

    const doc = await this.commentModel.create({
      authorId: new Types.ObjectId(userId),
      authorNick: nick,
      content: clean,
      parentId: parent,
      tag: finalTag,
      deleted: false,
    });

    return {
      id: doc._id.toString(),
      authorNick: doc.authorNick,
      content: doc.content,
      parentId: parent ? parent.toString() : null,
      tag: finalTag,
      createdAt:
        (doc as any).createdAt?.toISOString?.() || new Date().toISOString(),
      canDelete: true,
    };
  }

  async remove(userId: string, commentId: string) {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new BadRequestException('ID inválido');
    }
    const doc = await this.commentModel.findById(commentId).exec();
    if (!doc || doc.deleted) throw new NotFoundException('Comentario no encontrado');
    if (String(doc.authorId) !== userId) {
      throw new ForbiddenException('Solo puedes borrar tus propios comentarios');
    }
    doc.deleted = true;
    await doc.save();
    return { ok: true };
  }
}
