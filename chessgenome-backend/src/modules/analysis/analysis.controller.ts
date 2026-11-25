import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import {
  IsArray,
  IsOptional,
  IsString,
  IsObject,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { AnalysisService } from './analysis.service';

class AnalyzeGameDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  fens!: string[];

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sans?: string[];
}

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('game')
  analyzeGame(@Body() body: AnalyzeGameDto) {
    if (!body?.fens || !Array.isArray(body.fens) || body.fens.length === 0) {
      throw new BadRequestException(
        'Se requiere un array "fens" con al menos una posición',
      );
    }
    if (body.fens.length > 500) {
      throw new BadRequestException('Máximo 500 posiciones por partida');
    }
    return this.analysis.analyzeFenSequence(
      body.fens,
      body.headers || {},
      body.sans || [],
    );
  }
}
