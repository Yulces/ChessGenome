import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PgnsService } from './pgns.service';

@Controller('pgns')
export class PgnsController {
  constructor(private readonly pgns: PgnsService) {}

  @Get('top-record')
  async topRecord() {
    return this.pgns.getTopRecord();
  }

  @Get('top')
  async top(@Query('limit') limit = '10') {
    return this.pgns.getTop(parseInt(limit, 10) || 10);
  }

  @Post('check')
  async check(@Body() body: { pgnHashes: string[] }) {
    if (!body?.pgnHashes || !Array.isArray(body.pgnHashes)) {
      return { existing: [], missing: [] };
    }
    return this.pgns.check(body.pgnHashes);
  }

  @Get(':hash/analysis')
  async getAnalysis(@Param('hash') hash: string) {
    return this.pgns.getAnalysis(hash);
  }

  @Post('save-analysis')
  async saveAnalysis(@Body() body: { pgnHash: string; analysisResult: any }) {
    if (!body?.pgnHash) return { ok: false, error: 'pgnHash required' };
    return this.pgns.saveAnalysis(body.pgnHash, body.analysisResult);
  }
}
