import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthorsService } from './authors.service';

class ClaimDto {
  @IsString()
  @MinLength(1)
  positionHash!: string;

  @IsString()
  @MinLength(1)
  fen!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class UpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

@Controller('authors')
export class AuthorsController {
  constructor(private readonly authors: AuthorsService) {}

  @Post('claim')
  async claim(@Body() dto: ClaimDto) {
    return this.authors.claim(dto);
  }

  @Post('refresh-record')
  async refreshRecord() {
    await this.authors.refreshRecordHolders();
    return { ok: true };
  }

  @Get('current-record')
  async currentRecord() {
    return this.authors.getCurrentRecordAuthor();
  }

  @Get('position/:hash')
  async byPosition(@Param('hash') hash: string) {
    return this.authors.getByPositionHash(hash);
  }

  @Patch(':editToken')
  async update(@Param('editToken') editToken: string, @Body() dto: UpdateDto) {
    return this.authors.update(editToken, dto);
  }
}
