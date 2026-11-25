import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Cache key helpers – single place to define naming conventions.
 *
 * Patterns:
 *   genome:pos:v1:{hash}     → full analyze result for a stored/known position
 *   genome:rank:v1:{L10}     → approximate rank bucket (quantized L)
 *   genome:stats:v1          → global stats
 *   genome:terms:v1:{off}:{lim} → first-terms page
 */
export const CacheKeys = {
  pos: (hash: string) => `genome:pos:v1:${hash}`,
  rank: (L: number) => {
    // Quantize L to 4 decimal places to allow rank reuse across near-identical values
    const q = L.toFixed(4);
    return `genome:rank:v1:${q}`;
  },
  stats: () => 'genome:stats:v1',
  terms: (offset: number, limit: number) => `genome:terms:v1:${offset}:${limit}`,
};

/** TTLs in seconds */
export const CacheTTL = {
  /** Known position payload – long lived; invalidated on write */
  POSITION: 6 * 3600, // 6 h
  /** Rank for a given L – medium; ranks shift only when new positions are inserted below */
  RANK: 30 * 60, // 30 min
  /** Global stats – short */
  STATS: 45,
  /** Genome listing pages – short-medium */
  TERMS: 3 * 60, // 3 min
};

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private enabled = false;

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
        lazyConnect: true,
        enableReadyCheck: true,
      });

      this.client.on('ready', () => {
        this.enabled = true;
        this.logger.log(`Redis ready (${url})`);
      });

      this.client.on('error', (err) => {
        this.enabled = false;
        this.logger.warn(`Redis error: ${err.message}`);
      });

      this.client.on('close', () => {
        this.enabled = false;
      });

      this.client.connect().catch(() => {
        this.enabled = false;
        this.logger.warn('Redis unavailable – running without cache');
      });
    } catch (e: any) {
      this.logger.warn(`Redis init failed: ${e.message}`);
      this.client = null;
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isEnabled() || !this.client) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.isEnabled() || !this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // ignore
    }
  }

  /** SET only if key does not exist (simple stampede lock / fill-once) */
  async setNx(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    if (!this.isEnabled() || !this.client) return false;
    try {
      const r = await this.client.set(
        key,
        JSON.stringify(value),
        'EX',
        ttlSeconds,
        'NX',
      );
      return r === 'OK';
    } catch {
      return false;
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isEnabled() || !this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      // ignore
    }
  }

  /**
   * Delete keys matching a prefix using SCAN (non-blocking).
   * Prefer this over KEYS in production.
   */
  async delByPrefix(prefix: string): Promise<number> {
    if (!this.isEnabled() || !this.client) return 0;
    let deleted = 0;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = next;
        if (keys.length > 0) {
          deleted += await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // ignore
    }
    return deleted;
  }

  /**
   * After inserting a new position with value L, ranks of all positions
   * with higher L may shift by +1. We invalidate rank cache entirely
   * (cheap enough at MVP scale) and terms/stats.
   */
  async invalidateOnNewPosition(): Promise<void> {
    await Promise.all([
      this.del(CacheKeys.stats()),
      this.delByPrefix('genome:terms:v1:'),
      this.delByPrefix('genome:rank:v1:'),
    ]);
  }

  /** Invalidate a single position entry (e.g. after timesSeen update) */
  async invalidatePosition(hash: string): Promise<void> {
    await this.del(CacheKeys.pos(hash));
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}
