import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TrainingSamplesService } from './training-samples.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class NeuralTrainingService {
  private readonly logger = new Logger(NeuralTrainingService.name);

  constructor(private readonly samples: TrainingSamplesService) {}

  async train(epochs = 50, limit = 5000) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join('/app/models', `godel_${ts}`);
    const corpusPath = path.join(os.tmpdir(), `corpus_${ts}.json`);

    const corpus = await this.samples.exportPositionsCorpus(limit, true, 1);
    if (corpus.length < 10) {
      return { ok: false, error: `corpus too small: ${corpus.length}` };
    }
    fs.writeFileSync(corpusPath, JSON.stringify(corpus), 'utf-8');

    const scriptPath = path.join('/app/scripts', 'train_godel.py');
    try {
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, '--corpus', corpusPath, '--out', outDir, '--epochs', String(epochs)],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      if (stderr) this.logger.warn(`train stderr: ${stderr.slice(0, 500)}`);
      const result = JSON.parse(stdout.trim());
      return { ok: true, outDir, ...result };
    } catch (e: any) {
      return { ok: false, error: e.message, stdout: e.stdout, stderr: e.stderr };
    } finally {
      try { fs.unlinkSync(corpusPath); } catch {}
    }
  }

  async predict(modelDir: string, fen: string, top = 3) {
    const scriptPath = path.join('/app/scripts', 'predict_godel.py');
    const fullModelDir = path.join('/app/models', modelDir);
    try {
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, '--model', fullModelDir, '--fen', fen, '--top', String(top)],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      if (stderr) this.logger.warn(`predict stderr: ${stderr.slice(0, 500)}`);
      return JSON.parse(stdout.trim());
    } catch (e: any) {
      return { ok: false, error: e.message, stdout: e.stdout, stderr: e.stderr };
    }
  }

  listModels() {
    const modelsRoot = '/app/models';
    if (!fs.existsSync(modelsRoot)) return [];
    return fs.readdirSync(modelsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const dir = path.join(modelsRoot, e.name);
        const metaPath = path.join(dir, 'godel_model_metadata.json');
        let meta: any = null;
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
        return { name: e.name, metadata: meta };
      });
  }
}
