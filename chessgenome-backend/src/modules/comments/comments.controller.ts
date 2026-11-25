import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { CommentsService } from './comments.service';
import { JwtGuard, type AuthedRequest } from '../users/jwt.guard';
import { COMMENT_TAGS } from './schemas/comment.schema';

class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsIn(COMMENT_TAGS)
  tag?: 'bug' | 'suggestion' | 'question' | 'discussion';
}

@Controller('comments')
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly jwt: JwtService,
  ) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('tag') tag?: string,
  ) {
    // Lee el token si viene, pero no exige login
    const auth = req.headers.authorization || '';
    let userId: string | undefined;
    try {
      const [type, token] = auth.split(' ');
      if (type === 'Bearer' && token) {
        const payload = this.jwt.verify(token, {
          secret: process.env.JWT_SECRET || 'change-me',
        });
        userId = payload.sub;
      }
    } catch {
      /* ignorar */
    }
    return this.comments.list(userId, tag);
  }

  @Post()
  @UseGuards(JwtGuard)
  async create(@Req() req: AuthedRequest, @Body() dto: CreateCommentDto) {
    return this.comments.create(
      req.user!.sub,
      req.user!.nick,
      dto.content,
      dto.parentId || null,
      dto.tag,
    );
  }

  @Delete(':id')
  @UseGuards(JwtGuard)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.comments.remove(req.user!.sub, id);
  }
}
