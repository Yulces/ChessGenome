import { Injectable, Logger } from '@nestjs/common';
import { PgnIngestService } from './pgn-ingest.service';

export interface Job {
  id: string;
  total: number;
  processed: number;
  games: number;
  stored: number;
  updated: number;
  skipped: number;
  errors: string[];
  status: 'pending' | 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
}

@Injectable()
export class PgnIngestJobService {
  private readonly logger = new Logger(PgnIngestJobService.name);
  private jobs = new Map<string, Job>();

  constructor(private readonly ingest: PgnIngestService) {}

  async start(pgns: string[]): Promise<Job> {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: Job = {
      id,
      total: pgns.length,
      processed: 0,
      games: 0,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      status: 'pending',
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(id, job);

    // Lanzar en background
    void this.run(job, pgns);
    return job;
  }

  private async run(job: Job, pgns: string[]) {
    job.status = 'running';
    for (let i = 0; i < pgns.length; i++) {
      try {
        const r = await this.ingest.ingestPgn(pgns[i]);
        job.games += r.games ?? 0;
        job.stored += r.stored ?? 0;
        job.updated += r.updated ?? 0;
        job.skipped += r.skipped ?? 0;
      } catch (e: any) {
        job.errors.push(`PGN ${i}: ${e.message}`);
      }
      job.processed++;
      // Pequeña pausa para no saturar MongoDB
      if (i % 10 === 0) await new Promise((res) => setTimeout(res, 10));
    }
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    this.logger.log(
      `Ingest job ${job.id} done: games=${job.games} stored=${job.stored} updated=${job.updated} skipped=${job.skipped} errors=${job.errors.length}`,
    );
  }

  get(id: string): Job | null {
    return this.jobs.get(id) ?? null;
  }

  list(): Job[] {
    return Array.from(this.jobs.values());
  }
}
