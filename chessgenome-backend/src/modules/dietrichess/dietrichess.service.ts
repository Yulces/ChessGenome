import { Injectable, Logger } from '@nestjs/common';
import { EncodingResult } from '../genome/prime-encoding.service';

export interface DietriChessResult extends EncodingResult {
  engine: string;
}

/**
 * HTTP client for the DietriChess Python microservice.
 *
 * Env:
 *   DIETRICHESS_URL   default http://localhost:5000
 *   DIETRICHESS_TIMEOUT_MS  default 3000
 *   DIETRICHESS_ENABLED     default true (set "false" to force TS encoder only)
 */
@Injectable()
export class DietriChessService {
  private readonly logger = new Logger(DietriChessService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly enabled: boolean;
  private healthy: boolean | null = null;
  private lastHealthCheck = 0;
  private readonly healthTtlMs = 15_000;

  constructor() {
    this.baseUrl = (process.env.DIETRICHESS_URL || 'http://localhost:5000').replace(
      /\/$/,
      '',
    );
    this.timeoutMs = parseInt(process.env.DIETRICHESS_TIMEOUT_MS || '3000', 10);
    this.enabled = (process.env.DIETRICHESS_ENABLED || 'true').toLowerCase() !== 'false';
  }

  isConfigured(): boolean {
    return this.enabled;
  }

  /**
   * Lightweight health probe with short in-memory cache.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;
    const now = Date.now();
    if (this.healthy !== null && now - this.lastHealthCheck < this.healthTtlMs) {
      return this.healthy;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), Math.min(this.timeoutMs, 1500));
      const res = await fetch(`${this.baseUrl}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      this.healthy = res.ok;
    } catch {
      this.healthy = false;
    }
    this.lastHealthCheck = now;
    if (!this.healthy) {
      this.logger.debug('DietriChess unavailable – will use local TS encoder');
    }
    return this.healthy;
  }

  /**
   * Call Python /encode. Throws on network/HTTP errors.
   */
  async encode(fen: string): Promise<DietriChessResult> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/encode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen }),
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`DietriChess HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();
      // Normalize factorization keys to numbers (Python sends string keys)
      const factorization: Record<number, number> = {};
      if (data.factorization && typeof data.factorization === 'object') {
        for (const [k, v] of Object.entries(data.factorization)) {
          factorization[Number(k)] = Number(v);
        }
      }

      return {
        exponents: data.exponents,
        L: data.L,
        L10: data.L10,
        S_exact: data.S_exact ?? data.s_exact ?? '0',
        S_digits: data.S_digits ?? data.s_digits ?? 0,
        S: data.S ?? data.s ?? null,
        factorization,
        hash: data.hash,
        pieceCount: data.pieceCount,
        staticallyAdmissible: data.staticallyAdmissible,
        engine: data.engine || 'dietrichess-python',
      };
    } catch (e) {
      clearTimeout(t);
      this.healthy = false;
      this.lastHealthCheck = Date.now();
      throw e;
    }
  }
}
