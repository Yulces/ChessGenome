import { Injectable, Logger } from '@nestjs/common';
import { PositionsService } from '../positions/positions.service';
import { pgnToPlies } from './pgn-parser';

@Injectable()
export class PgnIngestService {
  private readonly logger = new Logger(PgnIngestService.name);

  constructor(private readonly positions: PositionsService) {}

  async ingestPgn(pgn: string) {
    const { headers, fens, sans } = pgnToPlies(pgn);
    if (!fens.length) {
      return { games: 0, stored: 0, updated: 0, skipped: 0, error: 'PGN sin posiciones' };
    }
    const ucis: string[] = [];
    const result = await this.positions.bulkAnalyzeAndStore(
      fens,
      sans,
      ucis,
      true, // storeIfNew
      true, // saveTransitions
      pgn,
      headers,
    );
    return {
      games: 1,
      stored: result.stored,
      updated: result.updated,
      skipped: result.skipped,
      headers,
    };
  }

  async ingestMultiple(pgns: string[]) {
    let games = 0, stored = 0, updated = 0, skipped = 0;
    for (const pgn of pgns) {
      try {
        const r = await this.ingestPgn(pgn);
        games += r.games;
        stored += r.stored;
        updated += r.updated;
        skipped += r.skipped;
      } catch (e: any) {
        this.logger.warn(`ingestPgn failed: ${e.message}`);
      }
    }
    return { games, stored, updated, skipped };
  }
}
