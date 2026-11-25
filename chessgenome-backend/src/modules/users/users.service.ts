import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import type { JwtPayload } from './jwt.guard';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly jwt: JwtService,
  ) {}

  async register(nick: string, password: string) {
    const cleanNick = (nick || '').trim();
    const cleanPass = (password || '').trim();

    if (cleanNick.length < 3 || cleanNick.length > 30) {
      throw new BadRequestException('El nick debe tener entre 3 y 30 caracteres');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanNick)) {
      throw new BadRequestException(
        'El nick solo puede contener letras, números, _ . y -',
      );
    }
    if (cleanPass.length < 6) {
      throw new BadRequestException('La contraseña debe tener al menos 6 caracteres');
    }

    const existing = await this.userModel.findOne({ nick: cleanNick }).exec();
    if (existing) {
      throw new BadRequestException('Ese nick ya está en uso');
    }

    const passwordHash = await bcrypt.hash(cleanPass, SALT_ROUNDS);

    const user = await this.userModel.create({
      nick: cleanNick,
      passwordHash,
      deleted: false,
    });

    return this.buildAuthResponse(user);
  }

  async login(nick: string, password: string) {
    const cleanNick = (nick || '').trim();
    const cleanPass = (password || '').trim();

    const user = await this.userModel
      .findOne({ nick: cleanNick, deleted: { $ne: true } })
      .exec();

    if (!user) {
      throw new UnauthorizedException('Nick o contraseña incorrectos');
    }

    const ok = await bcrypt.compare(cleanPass, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Nick o contraseña incorrectos');
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    const user = await this.userModel
      .findOne({ _id: userId, deleted: { $ne: true } })
      .exec();
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    return {
      id: user._id.toString(),
      nick: user.nick,
      createdAt: (user as any).createdAt,
    };
  }

  private async buildAuthResponse(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      nick: user.nick,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
    });
    return {
      ok: true,
      token,
      user: {
        id: user._id.toString(),
        nick: user.nick,
      },
    };
  }
}
