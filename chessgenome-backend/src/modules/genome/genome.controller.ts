import {
  Controller,
  Post,
  Body,
  Get,
  BadRequestException,
} from '@nestjs/common';
import { PrimeEncodingService, EncodingResult } from './prime-encoding.service';
import { AnalyzeDto } from './dto/analyze.dto';

@Controller('genome')
export class GenomeController {
  constructor(private readonly encoding: PrimeEncodingService) {}

  /**
   * POST /api/genome/analyze
   * Body: { "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" }
   */
  @Post('analyze')
  analyze(@Body() dto: AnalyzeDto): EncodingResult & { message: string } {
    try {
      const result = this.encoding.analyze(dto.fen);
      return {
        ...result,
        message: result.staticallyAdmissible
          ? 'Position is statically admissible'
          : 'Position fails basic static checks (kings missing or adjacent)',
      };
    } catch (e: any) {
      throw new BadRequestException(e.message || 'FEN inválido');
    }
  }

  @Get('primes')
  getPrimes() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PRIMES } = require('./prime-encoding.service');
    return { primes: PRIMES, count: 64 };
  }

  @Get('piece-values')
  getPieceValues() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PIECE_VALUES } = require('./prime-encoding.service');
    return PIECE_VALUES;
  }
}
