import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Server-side Stockfish via UCI + stockfish binary (Linux/Docker) or stockfish.exe (Windows).
 *
 * Env:
 *   STOCKFISH_PATH   absolute path to stockfish binary
 *   STOCKFISH_DEPTH  default depth (default 15)
 *
 * Docker/Linux example:
 *   STOCKFISH_PATH=/usr/bin/stockfish
 *
 * Windows example:
 *   STOCKFISH_PATH=D:\ChessGenome\DietrichessAnalyzer\engines\stockfish.exe
 */

export interface StockfishResult {
  bestMove: string | null;
  ponder?: string | null;
  evaluation: {
    type: 'cp' | 'mate';
    value: number;
  } | null;
  depth: number;
  pv?: string;
  fen: string;
  available: boolean;
  engine: 'native-exe' | 'unavailable';
  error?: string;
}

@Injectable()
export class StockfishService implements OnModuleDestroy {
  private readonly logger = new Logger(StockfishService.name);
  private readonly path: string | null;
  private readonly defaultDepth: number;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private pending:
    | {
        resolve: (r: StockfishResult) => void;
        fen: string;
        depth: number;
        bestMove: string | null;
        ponder: string | null;
        evaluation: StockfishResult['evaluation'];
        pv?: string;
        lastDepth: number;
        timer: NodeJS.Timeout;
        multipv?: number;
        multipvLines?: Map<number, { uci: string; score: { type: 'cp' | 'mate'; value: number }; pv: string; depth: number }>;
        resolveMulti?: (lines: any[]) => void;
      }
    | null = null;

  constructor() {
    this.path = this.resolvePath();
    this.defaultDepth = parseInt(process.env.STOCKFISH_DEPTH || '15', 10);
    if (this.path) {
      this.logger.log(`Stockfish binary: ${this.path}`);
    } else {
      this.logger.warn(
        'STOCKFISH_PATH not set or file missing — native engine unavailable',
      );
    }
  }

  private resolvePath(): string | null {
    const candidates = [
      // 1) Explicit env var
      process.env.STOCKFISH_PATH,
      // 2) Linux / Docker standard locations
      '/usr/bin/stockfish',
      '/usr/games/stockfish',
      '/usr/local/bin/stockfish',
      '/usr/games/stockfish-ubuntu-x86-64-avx2',
      // 3) Project-relative (Linux)
      path.join(process.cwd(), '..', 'DietrichessAnalyzer', 'engines', 'stockfish'),
      path.join(process.cwd(), 'DietrichessAnalyzer', 'engines', 'stockfish'),
      path.join(process.cwd(), 'engines', 'stockfish'),
      // 4) Windows fallbacks
      path.join(process.cwd(), '..', 'DietrichessAnalyzer', 'engines', 'stockfish.exe'),
      path.join(process.cwd(), 'engines', 'stockfish.exe'),
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p)) return p;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  isConfigured(): boolean {
    return !!this.path;
  }

  onModuleDestroy() {
    this.killEngine();
  }

  private killEngine() {
    if (this.proc) {
      try {
        this.proc.stdin.write('quit\n');
      } catch {
        /* ignore */
      }
      try {
        this.proc.kill();
      } catch {
        /* ignore */
      }
      this.proc = null;
    }
    this.pending = null;
    this.buffer = '';
  }

  private ensureEngine(): ChildProcessWithoutNullStreams {
    if (this.proc && !this.proc.killed) return this.proc;
    if (!this.path) {
      throw new Error('STOCKFISH_PATH no configurado');
    }

    this.proc = spawn(this.path, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk: string) => this.onData(chunk));
    this.proc.stderr.on('data', (chunk: Buffer) => {
      this.logger.debug(`stockfish stderr: ${chunk.toString()}`);
    });
    this.proc.on('exit', (code) => {
      this.logger.warn(`Stockfish exited with code ${code}`);
      this.proc = null;
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        p.resolve({
          bestMove: p.bestMove,
          ponder: p.ponder,
          evaluation: p.evaluation,
          depth: p.lastDepth || p.depth,
          pv: p.pv,
          fen: p.fen,
          available: false,
          engine: 'unavailable',
          error: `Stockfish terminó (code ${code})`,
        });
      }
    });

    this.write('uci');
    this.write('isready');
    return this.proc;
  }

  private write(cmd: string) {
    if (!this.proc) return;
    this.proc.stdin.write(cmd + '\n');
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      this.handleLine(line.trim());
    }
  }

  private handleLine(line: string) {
    if (!line || !this.pending) return;
    const p = this.pending;

    if (line.startsWith('info ')) {
      const d = / depth (\d+)/.exec(line);
      if (d) p.lastDepth = parseInt(d[1], 10);

      const mate = / score mate (-?\d+)/.exec(line);
      const cp = / score cp (-?\d+)/.exec(line);
      if (mate) {
        p.evaluation = { type: 'mate', value: parseInt(mate[1], 10) };
      } else if (cp) {
        p.evaluation = { type: 'cp', value: parseInt(cp[1], 10) };
      }

      const pvMatch = / pv (.+)$/.exec(line);
      if (pvMatch) p.pv = pvMatch[1];

      if (p.multipv && p.multipvLines && line.includes(' multipv ')) {
        const mp = / multipv (\d+)/.exec(line);
        if (mp && pvMatch) {
          const idx = parseInt(mp[1], 10);
          const pvStr = pvMatch[1].trim();
          const uci = pvStr.split(/\s+/)[0] || '';
          if (uci && (mate || cp)) {
            const score = mate
              ? { type: 'mate' as const, value: parseInt(mate[1], 10) }
              : { type: 'cp' as const, value: parseInt(cp![1], 10) };
            p.multipvLines.set(idx, {
              uci,
              score,
              pv: pvStr,
              depth: p.lastDepth || p.depth,
            });
          }
        }
      }
    }

    if (line.startsWith('bestmove ')) {
      const parts = line.split(/\s+/);
      p.bestMove = parts[1] === '(none)' ? null : parts[1] ?? null;
      if (parts[2] === 'ponder') p.ponder = parts[3] ?? null;

      this.pending = null;
      clearTimeout(p.timer);

      if (p.resolveMulti && p.multipvLines) {
        this.write('setoption name MultiPV value 1');
        const ordered = [...p.multipvLines.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, v]) => v);
        p.resolveMulti(ordered);
        return;
      }

      p.resolve({
        bestMove: p.bestMove,
        ponder: p.ponder,
        evaluation: p.evaluation,
        depth: p.lastDepth || p.depth,
        pv: p.pv,
        fen: p.fen,
        available: true,
        engine: 'native-exe',
      });
    }
  }

  async analyze(fen: string, depth?: number): Promise<StockfishResult> {
    const d = depth ?? this.defaultDepth;

    if (!this.path) {
      return {
        bestMove: null,
        evaluation: null,
        depth: d,
        fen,
        available: false,
        engine: 'unavailable',
        error:
          'STOCKFISH_PATH no definido o stockfish no encontrado. ' +
          'Ejemplo: STOCKFISH_PATH=/usr/bin/stockfish',
      };
    }

    // Cancel previous search if any
    if (this.pending) {
      this.write('stop');
      const old = this.pending;
      this.pending = null;
      clearTimeout(old.timer);
      old.resolve({
        bestMove: null,
        evaluation: null,
        depth: old.depth,
        fen: old.fen,
        available: true,
        engine: 'native-exe',
        error: 'Búsqueda cancelada por una nueva petición',
      });
    }

    try {
      this.ensureEngine();
    } catch (e: any) {
      return {
        bestMove: null,
        evaluation: null,
        depth: d,
        fen,
        available: false,
        engine: 'unavailable',
        error: e.message || String(e),
      };
    }

    return new Promise<StockfishResult>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending) {
          this.write('stop');
          const p = this.pending;
          this.pending = null;
          resolve({
            bestMove: p.bestMove,
            ponder: p.ponder,
            evaluation: p.evaluation,
            depth: p.lastDepth || p.depth,
            pv: p.pv,
            fen: p.fen,
            available: true,
            engine: 'native-exe',
            error: 'Timeout — se devuelve lo calculado hasta ahora',
          });
        }
      }, 90000);

      this.pending = {
        resolve,
        fen,
        depth: d,
        bestMove: null,
        ponder: null,
        evaluation: null,
        lastDepth: 0,
        timer,
      };

      this.write('ucinewgame');
      this.write(`position fen ${fen}`);
      this.write(`go depth ${d}`);
    });
  }

  async analyzeMultiPv(
    fen: string,
    multipv: number,
    depth?: number,
  ): Promise<{
    available: boolean;
    engine: string;
    lines: { uci: string; score: { type: 'cp' | 'mate'; value: number }; pv: string; depth: number }[];
    error?: string;
  }> {
    const d = depth ?? Math.min(this.defaultDepth, 12);
    const n = Math.max(1, Math.min(multipv, 64));

    if (!this.path) {
      return {
        available: false,
        engine: 'unavailable',
        lines: [],
        error: 'STOCKFISH_PATH no configurado',
      };
    }

    if (this.pending) {
      this.write('stop');
      const old = this.pending;
      this.pending = null;
      clearTimeout(old.timer);
      if (old.resolveMulti) old.resolveMulti([]);
      else
        old.resolve({
          bestMove: null,
          evaluation: null,
          depth: old.depth,
          fen: old.fen,
          available: true,
          engine: 'native-exe',
          error: 'cancelado',
        });
    }

    try {
      this.ensureEngine();
    } catch (e: any) {
      return {
        available: false,
        engine: 'unavailable',
        lines: [],
        error: e.message || String(e),
      };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending?.resolveMulti) {
          this.write('stop');
          const p = this.pending;
          this.pending = null;
          this.write('setoption name MultiPV value 1');
          const ordered = p.multipvLines
            ? [...p.multipvLines.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([, v]) => v)
            : [];
          resolve({ available: true, engine: 'native-exe', lines: ordered });
        }
      }, 90000);

      this.pending = {
        resolve: () => undefined,
        resolveMulti: (lines) =>
          resolve({ available: true, engine: 'native-exe', lines }),
        fen,
        depth: d,
        bestMove: null,
        ponder: null,
        evaluation: null,
        lastDepth: 0,
        timer,
        multipv: n,
        multipvLines: new Map(),
      };

      this.write('ucinewgame');
      this.write(`setoption name MultiPV value ${n}`);
      this.write(`position fen ${fen}`);
      this.write(`go depth ${d}`);
    });
  }

}
