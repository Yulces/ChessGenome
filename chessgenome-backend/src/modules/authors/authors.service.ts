import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { Author, AuthorDocument } from './schemas/author.schema';
import { Position, PositionDocument } from '../positions/schemas/position.schema';

@Injectable()
export class AuthorsService {
  private readonly logger = new Logger(AuthorsService.name);

  constructor(
    @InjectModel(Author.name) private authorModel: Model<AuthorDocument>,
    @InjectModel(Position.name) private positionModel: Model<PositionDocument>,
  ) {}

  async claim(dto: {
    positionHash: string;
    fen: string;
    name: string;
    email: string;
    country?: string;
    note?: string;
  }) {
    if (!dto.positionHash || !dto.fen || !dto.name || !dto.email) {
      throw new BadRequestException('Faltan campos obligatorios');
    }

    const existing = await this.authorModel
      .findOne({ positionHash: dto.positionHash })
      .exec();

    if (existing) {
      throw new BadRequestException('Esta posición ya tiene autor registrado');
    }

    const pos = await this.positionModel
      .findOne({ hash: dto.positionHash })
      .lean()
      .exec();
    if (!pos) {
      throw new NotFoundException('Posición no encontrada');
    }

    const record = await this.positionModel
      .findOne()
      .sort({ L10: -1 })
      .lean()
      .exec();
    const isRecordHolder = record?.hash === dto.positionHash;

    const editToken = randomBytes(24).toString('hex');

    const author = await this.authorModel.create({
      positionHash: dto.positionHash,
      fen: dto.fen,
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      country: (dto.country || '').trim(),
      note: (dto.note || '').trim(),
      editToken,
      isRecordHolder,
    });

    return {
      ok: true,
      author: {
        _id: author._id.toString(),
        positionHash: author.positionHash,
        fen: author.fen,
        name: author.name,
        email: author.email,
        country: author.country,
        note: author.note,
        editToken: author.editToken,
        isRecordHolder: author.isRecordHolder,
        createdAt: (author as any).createdAt,
      },
    };
  }

  async getByPositionHash(hash: string) {
    const author = await this.authorModel
      .findOne({ positionHash: hash })
      .lean()
      .exec();
    if (!author) return { found: false, author: null };

    return {
      found: true,
      author: {
        name: author.name,
        country: author.country || '',
        note: author.note || '',
        isRecordHolder: author.isRecordHolder,
        createdAt: (author as any).createdAt,
      },
    };
  }

  async getCurrentRecordAuthor() {
    const record = await this.positionModel
      .findOne()
      .sort({ L10: -1 })
      .lean()
      .exec();
    if (!record) return { found: false, author: null };

    const author = await this.authorModel
      .findOne({ positionHash: record.hash })
      .lean()
      .exec();
    if (!author) return { found: false, author: null };

    return {
      found: true,
      author: {
        name: author.name,
        country: author.country || '',
        note: author.note || '',
        isRecordHolder: author.isRecordHolder,
        createdAt: (author as any).createdAt,
      },
    };
  }

  async update(
    editToken: string,
    dto: { name?: string; country?: string; note?: string },
  ) {
    const author = await this.authorModel.findOne({ editToken }).exec();
    if (!author) throw new ForbiddenException('Token inválido');

    if (dto.name != null) author.name = dto.name.trim();
    if (dto.country != null) author.country = dto.country.trim();
    if (dto.note != null) author.note = dto.note.trim();

    await author.save();
    return { ok: true };
  }

  async refreshRecordHolders() {
    const record = await this.positionModel
      .findOne()
      .sort({ L10: -1 })
      .select('hash')
      .lean()
      .exec();
    if (!record) return;
    await this.authorModel.updateMany(
      { positionHash: { $ne: record.hash } },
      { $set: { isRecordHolder: false } },
    );
    await this.authorModel.updateMany(
      { positionHash: record.hash },
      { $set: { isRecordHolder: true } },
    );
  }
}
