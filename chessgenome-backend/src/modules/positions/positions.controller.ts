import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { PositionsService } from './positions.service';
import { TransitionsService } from './transitions.service';
import { AnalyzeDto } from '../genome/dto/analyze.dto';
import {
  IsOptional,
  IsBoolean,
  IsString,
  IsNumber,
  IsArray,
  IsObject,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Transform } from 'class-transformer';

class AnalyzeWithStoreDto extends AnalyzeDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  storeIfNew?: boolean = false;
}

class TransitionDto {
  @IsString() fromHash!: string;
  @IsString() toHash!: string;
  @IsString() moveUci!: string;
  @IsOptional() @IsNumber() resultado?: number;
}

class BulkAnalyzeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  fens!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sans?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ucis?: string[];

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  storeIfNew?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  saveTransitions?: boolean = true;

  /** PGN completo (para la colección pgns y el récord global) */
  @IsOptional()
  @IsString()
  pgn?: string;
}

@Controller('positions')
export class PositionsController {
  constructor(
    private readonly positionsService: PositionsService,
    private readonly transitions: TransitionsService,
  ) {}

  @Post('analyze')
  async analyze(@Body() dto: AnalyzeWithStoreDto) {
    try {
      return await this.positionsService.analyzeAndLookup(
        dto.fen,
        dto.storeIfNew ?? false,
      );
    } catch (e: any) {
      throw new BadRequestException(e.message || 'FEN inválido');
    }
  }

  @Post('bulk-analyze')
  async bulkAnalyze(@Body() dto: BulkAnalyzeDto) {
    if (!dto?.fens || dto.fens.length === 0) {
      throw new BadRequestException(
        'Se requiere "fens" con al menos 1 posición',
      );
    }
    if (dto.fens.length > 500) {
      throw new BadRequestException('Máximo 500 posiciones por partida');
    }
    return this.positionsService.bulkAnalyzeAndStore(
      dto.fens,
      dto.sans || [],
      dto.ucis || [],
      dto.storeIfNew ?? false,
      dto.saveTransitions ?? true,
      dto.pgn || '',
      dto.headers || {},
    );
  }

  @Get('first-terms')
  async firstTerms(
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    return this.positionsService.getFirstTerms(
      Math.min(parseInt(limit, 10) || 50, 200),
      parseInt(offset, 10) || 0,
    );
  }

  @Get('stats')
  async stats() {
    return this.positionsService.getStats();
  }

  @Get('search')
  async search(@Query('fen') fen: string) {
    if (!fen?.trim()) throw new BadRequestException('Falta query fen');
    try {
      return await this.positionsService.searchByFen(fen);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Búsqueda fallida');
    }
  }

  @Get('search/advanced')
  async searchAdvanced(
    @Query('minL10') minL10?: string,
    @Query('maxL10') maxL10?: string,
    @Query('minPieces') minPieces?: string,
    @Query('maxPieces') maxPieces?: string,
    @Query('minTimesSeen') minTimesSeen?: string,
    @Query('admissibleOnly') admissibleOnly?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.positionsService.searchAdvanced({
      minL10:
        minL10 != null && minL10 !== '' ? parseFloat(minL10) : undefined,
      maxL10:
        maxL10 != null && maxL10 !== '' ? parseFloat(maxL10) : undefined,
      minPieces:
        minPieces != null && minPieces !== ''
          ? parseInt(minPieces, 10)
          : undefined,
      maxPieces:
        maxPieces != null && maxPieces !== ''
          ? parseInt(maxPieces, 10)
          : undefined,
      minTimesSeen:
        minTimesSeen != null && minTimesSeen !== ''
          ? parseInt(minTimesSeen, 10)
          : undefined,
      admissibleOnly: admissibleOnly === 'true',
      sortBy: (sortBy as any) || 'L10',
      order: (order as any) || 'desc',
      limit: limit != null && limit !== '' ? parseInt(limit, 10) : 50,
      offset: offset != null && offset !== '' ? parseInt(offset, 10) : 0,
    });
  }

  @Get('top')
  async top(@Query('limit') limit = '30') {
    return this.positionsService.getTopByFrequency(
      Math.min(parseInt(limit, 10) || 30, 100),
    );
  }

  @Get('top-by-l10')
  async topByL10(@Query('limit') limit = '30') {
    return this.positionsService.getTopByL10(
      Math.min(parseInt(limit, 10) || 30, 100),
    );
  }

  @Post('transitions')
  async saveTransition(@Body() dto: TransitionDto) {
    return this.transitions.saveTransition(
      dto.fromHash,
      dto.toHash,
      dto.moveUci,
      dto.resultado,
    );
  }

  @Get('transitions/:fromHash')
  async transitionsFrom(@Param('fromHash') fromHash: string) {
    return this.transitions.fromPosition(fromHash);
  }

  @Get('best-move/:fromHash')
  async bestMove(@Param('fromHash') fromHash: string) {
    const move = await this.transitions.bestMove(fromHash);
    return { fromHash, bestMoveUci: move };
  }
}
