import { Body, Controller, Get, Post, BadRequestException } from '@nestjs/common';
import { StockfishService } from './stockfish.service';
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

class AnalyzeBody {
  @IsString()
  fen!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40)
  depth?: number;
}

class MultiPvBody {
  @IsString()
  fen!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(64)
  multipv?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40)
  depth?: number;
}

@Controller('stockfish')
export class StockfishController {
  constructor(private readonly sf: StockfishService) {}

  @Get('status')
  status() {
    return {
      configured: this.sf.isConfigured(),
      engine: this.sf.isConfigured() ? 'native-exe' : 'unavailable',
      hint: this.sf.isConfigured()
        ? 'stockfish listo'
        : 'Define STOCKFISH_PATH apuntando al binario de stockfish',
    };
  }

  @Post('analyze')
  async analyze(@Body() body: AnalyzeBody) {
    if (!body?.fen?.trim()) {
      throw new BadRequestException('Falta fen');
    }
    return this.sf.analyze(body.fen.trim(), body.depth);
  }

  /** MultiPV — preferred for legal-move tables. */
  @Post('multipv')
  async multipv(@Body() body: MultiPvBody) {
    if (!body?.fen?.trim()) {
      throw new BadRequestException('Falta fen');
    }
    return this.sf.analyzeMultiPv(
      body.fen.trim(),
      body.multipv ?? 16,
      body.depth,
    );
  }
}
