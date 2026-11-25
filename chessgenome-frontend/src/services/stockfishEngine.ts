import { normalizeFen, loadChessFen } from '../utils/normalizeFen';
/**
 * Stockfish WASM (browser) via Web Worker.
 * For multipv legal-move evals, NeuralPanel prefers native stockfish.exe via API first.
 */

export interface StockfishAnalysis {
  bestMove: string | null;
  bestMoveSan?: string;
  ponder?: string | null;
  evaluation: {
    type: 'cp' | 'mate';
    value: number;
  } | null;
  depth: number;
  pv?: string;
  raw?: string;
}

export interface MultiPvLine {
  uci: string;
  score: { type: 'cp' | 'mate'; value: number };
  pv: string;
  depth: number;
}

type Listener = (line: string) => void;

class StockfishEngine {
  private worker: Worker | null = null;
  private ready = false;
  private starting: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private depthDefault = 15;

  private readonly workerUrl =
    'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';

  isReady(): boolean {
    return this.ready;
  }

  async init(): Promise<void> {
    if (this.ready && this.worker) return;
    if (this.starting) return this.starting;

    this.starting = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(this.workerUrl);

        const onMessage = (e: MessageEvent) => {
          const line = String(e.data ?? '');
          this.listeners.forEach((fn) => fn(line));
          if (line === 'uciok' || line.startsWith('readyok')) {
            this.ready = true;
          }
        };

        this.worker.onmessage = onMessage;
        this.worker.onerror = (err) => {
          this.ready = false;
          reject(err);
        };

        this.send('uci');
        this.send('isready');

        const timeout = window.setTimeout(() => {
          this.ready = true;
          resolve();
        }, 2500);

        const waitReady: Listener = (line) => {
          if (line === 'uciok' || line.startsWith('readyok')) {
            window.clearTimeout(timeout);
            this.listeners.delete(waitReady);
            this.ready = true;
            resolve();
          }
        };
        this.listeners.add(waitReady);
      } catch (e) {
        this.starting = null;
        reject(e);
      }
    });

    return this.starting;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  stop() {
    this.send('stop');
  }

  quit() {
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.starting = null;
    this.listeners.clear();
  }

  async analyze(fen: string, depth = this.depthDefault): Promise<StockfishAnalysis> {
    await this.init();

    return new Promise((resolve) => {
      let bestMove: string | null = null;
      let ponder: string | null = null;
      let evaluation: StockfishAnalysis['evaluation'] = null;
      let pv: string | undefined;
      let lastDepth = 0;

      const onLine: Listener = (line) => {
        if (line.startsWith('info ')) {
          const d = / depth (\d+)/.exec(line);
          if (d) lastDepth = parseInt(d[1], 10);

          const mate = / score mate (-?\d+)/.exec(line);
          const cp = / score cp (-?\d+)/.exec(line);
          if (mate) {
            evaluation = { type: 'mate', value: parseInt(mate[1], 10) };
          } else if (cp) {
            evaluation = { type: 'cp', value: parseInt(cp[1], 10) };
          }

          const pvMatch = / pv (.+)$/.exec(line);
          if (pvMatch) pv = pvMatch[1];
        }

        if (line.startsWith('bestmove ')) {
          const parts = line.split(/\s+/);
          bestMove = parts[1] === '(none)' ? null : parts[1] ?? null;
          if (parts[2] === 'ponder') ponder = parts[3] ?? null;
          this.listeners.delete(onLine);
          resolve({
            bestMove,
            ponder,
            evaluation,
            depth: lastDepth || depth,
            pv,
            raw: line,
          });
        }
      };

      this.listeners.add(onLine);

      this.send('stop');
      this.send('ucinewgame');
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);

      window.setTimeout(() => {
        if (this.listeners.has(onLine)) {
          this.listeners.delete(onLine);
          this.send('stop');
          resolve({
            bestMove,
            ponder,
            evaluation,
            depth: lastDepth || depth,
            pv,
          });
        }
      }, 60000);
    });
  }

  /** MultiPV (WASM fallback when stockfish.exe is not used). */
  async analyzeMultiPv(
    fen: string,
    multipv: number,
    depth = 12,
  ): Promise<MultiPvLine[]> {
    await this.init();
    const n = Math.max(1, Math.min(multipv, 64));

    return new Promise((resolve) => {
      const lines = new Map<number, MultiPvLine>();

      const onLine: Listener = (line) => {
        if (line.startsWith('info ') && line.includes(' multipv ')) {
          const mp = / multipv (\d+)/.exec(line);
          const d = / depth (\d+)/.exec(line);
          const mate = / score mate (-?\d+)/.exec(line);
          const cp = / score cp (-?\d+)/.exec(line);
          const pvMatch = / pv (.+)$/.exec(line);
          if (!mp || !pvMatch) return;
          const idx = parseInt(mp[1], 10);
          const pvStr = pvMatch[1].trim();
          const uci = pvStr.split(/\s+/)[0] || '';
          if (!uci) return;
          let score: { type: 'cp' | 'mate'; value: number };
          if (mate) score = { type: 'mate', value: parseInt(mate[1], 10) };
          else if (cp) score = { type: 'cp', value: parseInt(cp[1], 10) };
          else return;
          lines.set(idx, {
            uci,
            score,
            pv: pvStr,
            depth: d ? parseInt(d[1], 10) : depth,
          });
        }
        if (line.startsWith('bestmove ')) {
          this.listeners.delete(onLine);
          this.send('setoption name MultiPV value 1');
          const ordered = [...lines.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, v]) => v);
          resolve(ordered);
        }
      };

      this.listeners.add(onLine);
      this.send('stop');
      this.send('ucinewgame');
      this.send(`setoption name MultiPV value ${n}`);
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);

      window.setTimeout(() => {
        if (this.listeners.has(onLine)) {
          this.listeners.delete(onLine);
          this.send('stop');
          this.send('setoption name MultiPV value 1');
          const ordered = [...lines.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, v]) => v);
          resolve(ordered);
        }
      }, 90000);
    });
  }
}

export const stockfishEngine = new StockfishEngine();

export function uciToSan(fen: string, uci: string, Chess: any): string {
  try {
    const g = new Chess();
    if (!loadChessFen(g, fen)) return uci;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const m = g.move({ from, to, promotion });
    return m ? m.san : uci;
  } catch {
    return uci;
  }
}
