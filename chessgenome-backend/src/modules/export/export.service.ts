import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import { randomBytes } from 'crypto';

const execFileAsync = promisify(execFile);

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  async sessionToDocx(session: any): Promise<Buffer> {
    if (!session || typeof session !== 'object') {
      throw new BadRequestException('Falta "session" (JSON)');
    }

    // ==== LOG DE DIAGNÓSTICO ====
    const items = session.items || [];
    this.logger.log('=== DIAG ITEMS ===');
    this.logger.log('total items: ' + items.length);
    for (const it of items) {
      if (it.type === 'game') {
        const plies = it.plies || [];
        const p1 = plies[1] || plies[0] || {};
        this.logger.log('GAME plies=' + plies.length
          + ' chartSvgs=' + (it.chartSvgs ? it.chartSvgs.length : 0)
          + ' initialBoardPng=' + (it.initialBoardPng ? 'yes(' + it.initialBoardPng.length + ')' : 'no'));
        this.logger.log('  ply[1] keys: ' + Object.keys(p1).join(','));
        this.logger.log('  ply[1].exponents type: ' + typeof p1.exponents
          + ' value: ' + JSON.stringify(p1.exponents));
        this.logger.log('  ply[1].factors type: ' + typeof p1.factors
          + ' value: ' + JSON.stringify(p1.factors));
        this.logger.log('  ply[1].S_exact: ' + (p1.S_exact ? String(p1.S_exact).slice(0,20) + '...' : 'MISSING'));
      } else if (it.type === 'chart') {
        this.logger.log('CHART title=' + it.title + ' pngDataUrl=' + (it.pngDataUrl ? 'yes(' + it.pngDataUrl.length + ')' : 'NO'));
      }
    }

    const id = randomBytes(8).toString('hex');
    const tmpDir = path.join(os.tmpdir(), `cg-docx-${id}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const inJson = path.join(tmpDir, 'in.json');
    const outDocx = path.join(tmpDir, 'out.docx');

    try {
      await fs.writeFile(inJson, JSON.stringify(session), 'utf-8');

      const { stdout, stderr } = await execFileAsync(
        'python3',
        [path.join('/app/scripts/generate_docx.py'), inJson, outDocx],
        { timeout: 120000, maxBuffer: 200 * 1024 * 1024, cwd: '/app' },
      );
      if (stderr && stderr.trim()) this.logger.warn('py stderr: ' + stderr);
      this.logger.log('python stdout: ' + stdout.trim());

      const stat = await fs.stat(outDocx).catch(() => null);
      if (!stat || stat.size < 1024) throw new Error('docx vacío');
      const buf = await fs.readFile(outDocx);
      this.logger.log('docx generado: ' + buf.length + ' bytes');
      return buf;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
