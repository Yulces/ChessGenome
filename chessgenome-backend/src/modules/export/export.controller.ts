import {
  Controller, Post, Body, Res, BadRequestException,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { ExportService } from './export.service';

class ExportDocxDto {
  @IsObject()
  session!: any;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  filename?: string;
}

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('docx')
  async exportDocx(@Body() dto: ExportDocxDto, @Res() res: Response): Promise<void> {
    if (!dto?.session || typeof dto.session !== 'object') {
      throw new BadRequestException('Falta "session"');
    }
    const buffer = await this.exportService.sessionToDocx(dto.session);
    const filename =
      dto.filename?.replace(/[^a-zA-Z0-9._-]/g, '_') ||
      `chessgenome-session-${Date.now()}.docx`;
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }
}
