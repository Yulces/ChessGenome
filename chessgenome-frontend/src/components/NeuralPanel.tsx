import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chess } from 'chess.js';
import { stockfishEngine } from '../services/stockfishEngine';

export interface NeuralResultPayload {
  featureCount: number;
  features: number[];
  modelCount?: number;
  corpusSize?: number;
}

interface Props {
  fen: string;
  onPlayMove?: (from: string, to: string, promotion?: string) => void;
  onResult?: (result: NeuralResultPayload) => void;
}

interface LegalRow {
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion?: string;
  capture: boolean;
  check: boolean;
  evalLabel?: string;
  evalCp?: number;
}

interface ModelInfo {
  name: string;
  metadata: any;
}

interface Prediction {
  ok: boolean;
  fen: string;
  turn: string;
  best: { uci: string; san: string; winrate: number } | null;
  top: { uci: string; san: string; winrate: number }[];
}

function formatScore(s: { type: 'cp' | 'mate'; value: number }): string {
  if (s.type === 'mate') return s.value > 0 ? `M${s.value}` : `-M${Math.abs(s.value)}`;
  const v = s.value / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

export function NeuralPanel({ fen, onPlayMove, onResult }: Props) {
  const { t } = useTranslation('genome');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [sfBest, setSfBest] = useState<{ uci: string; score: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMoves, setShowMoves] = useState(true);
  const [evals, setEvals] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/neural/models')
      .then((r) => r.json())
      .then((data) => setModels(Array.isArray(data) ? data : []))
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    setEvals({});
    setPrediction(null);
    setSfBest(null);
  }, [fen]);

  const legalMoves: LegalRow[] = useMemo(() => {
    try {
      const g = new Chess(fen);
      const moves = g.moves({ verbose: true });
      return moves.map((m: any) => {
        const uci = `${m.from}${m.to}${m.promotion || ''}`;
        return {
          san: m.san,
          uci,
          from: m.from,
          to: m.to,
          promotion: m.promotion,
          capture: !!m.captured,
          check: m.san.includes('+') || m.san.includes('#'),
          evalLabel: evals[uci],
        };
      });
    } catch {
      return [];
    }
  }, [fen, evals]);

  const sortedMoves = useMemo(() => {
    const list = [...legalMoves];
    list.sort((a, b) => {
      const ea = evals[a.uci];
      const eb = evals[b.uci];
      if (ea && eb) {
        const parse = (s: string) => {
          if (s.startsWith('M')) return 10000 - parseInt(s.slice(1), 10);
          if (s.startsWith('-M')) return -10000 + parseInt(s.slice(2), 10);
          return parseFloat(s) * 100;
        };
        return parse(eb) - parse(ea);
      }
      if (ea) return -1;
      if (eb) return 1;
      return a.san.localeCompare(b.san);
    });
    return list;
  }, [legalMoves, evals]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/neural/best-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen }),
      });
      const data = await r.json();
      setPrediction(data);
      if (onResult && data?.top) {
        try {
          onResult({
            featureCount: 69,
            features: [],
            modelCount: models.length,
          });
        } catch (e) {
          console.warn('Neural onResult callback failed', e);
        }
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function evaluateMoves() {
    setEvalLoading(true);
    setError(null);
    try {
      const n = Math.min(Math.max(legalMoves.length, 1), 40);
      const depth = legalMoves.length > 25 ? 8 : 12;
      let lines: { uci: string; score: { type: 'cp' | 'mate'; value: number } }[] = [];

      try {
        const res = await fetch('/api/stockfish/multipv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen, multipv: n, depth }),
        });
        const data = await res.json();
        if (res.ok && data.available && Array.isArray(data.lines) && data.lines.length) {
          lines = data.lines;
        }
      } catch {
        /* fall through to WASM */
      }

      if (!lines.length) {
        lines = await stockfishEngine.analyzeMultiPv(fen, n, depth);
      }

      const map: Record<string, string> = {};
      for (const line of lines) {
        map[line.uci] = formatScore(line.score);
      }
      setEvals(map);
      if (lines.length > 0) {
        setSfBest({ uci: lines[0].uci, score: formatScore(lines[0].score) });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setEvalLoading(false);
    }
  }

  async function train() {
    setTraining(true);
    setError(null);
    setTrainResult(null);
    try {
      const r = await fetch('/api/neural/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epochs: 30, limit: 5000 }),
      });
      const data = await r.json();
      setTrainResult(data);
      const modelsR = await fetch('/api/neural/models');
      const modelsData = await modelsR.json();
      setModels(Array.isArray(modelsData) ? modelsData : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setTraining(false);
    }
  }

  const activeModel = models.find((m) => m.metadata) || models[0];
  const activeMeta = activeModel?.metadata;
  const netBest = prediction?.best;
  const sfBestSan = sfBest ? legalMoves.find((m) => m.uci === sfBest.uci)?.san : null;
  const match = netBest && sfBest ? netBest.uci === sfBest.uci : null;

  return (
    <div className="rounded-xl bg-white border border-gray-300 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">{t('neural.title')}</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowMoves((v) => !v)}
            className="px-2.5 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs"
          >
            {showMoves ? t('neural.hideMoves') : t('neural.showMoves')}
          </button>
          <button
            type="button"
            onClick={evaluateMoves}
            disabled={evalLoading || legalMoves.length === 0}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-200 text-gray-900 hover:bg-emerald-300 text-xs font-semibold disabled:opacity-40"
          >
            {evalLoading ? t('common.loading') : t('neural.evalMoves')}
          </button>
          <button
            type="button"
            onClick={train}
            disabled={training}
            className="px-2.5 py-1.5 rounded-lg bg-purple-200 text-gray-900 hover:bg-purple-300 text-xs font-semibold disabled:opacity-40"
          >
            {training ? 'Entrenando…' : 'Entrenar'}
          </button>
          <button
            onClick={run}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-indigo-200 hover:bg-indigo-300 text-gray-900 text-xs font-semibold disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('neural.run')}
          </button>
        </div>
      </div>

      {/* Estado del modelo */}
      <div className="text-xs text-gray-600">
        {activeModel ? (
          <>
            <b>Modelo:</b> {activeModel.name} · <b>Samples:</b> {activeMeta?.samples ?? '—'} ·{' '}
            <b>MAE:</b> {activeMeta?.val_mae?.toFixed(4) ?? '—'} ·{' '}
            <b>Fecha:</b> {activeMeta?.created_at?.slice(0, 19) ?? '—'}
          </>
        ) : (
          'No hay modelos entrenados.'
        )}
      </div>

      {/* Predicción de la red */}
      {prediction && prediction.ok && (
        <div className="p-3 bg-indigo-50 border border-indigo-300 rounded text-sm space-y-1">
          <div className="font-semibold text-indigo-900">Red Neuronal (Gödel)</div>
          {prediction.best && (
            <div>
              <b>Mejor jugada:</b> {prediction.best.san} ({prediction.best.uci}) —{' '}
              winrate: {prediction.best.winrate.toFixed(4)}
            </div>
          )}
          <div>
            <b>Top-3:</b>
            <ul className="mt-1 space-y-0.5 font-mono text-xs">
              {prediction.top.map((m, i) => (
                <li key={m.uci}>
                  {i + 1}. {m.san} ({m.uci}) — {m.winrate.toFixed(4)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Stockfish */}
      {sfBest && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded text-sm space-y-1">
          <div className="font-semibold text-emerald-900">Stockfish</div>
          <div>
            <b>Mejor jugada:</b> {sfBestSan} ({sfBest.uci}) — score: {sfBest.score}
          </div>
        </div>
      )}

      {/* Comparación */}
      {netBest && sfBest && (
        <div
          className={`p-2 rounded text-xs font-semibold ${
            match
              ? 'bg-green-100 border border-green-400 text-green-800'
              : 'bg-yellow-100 border border-yellow-400 text-yellow-800'
          }`}
        >
          {match
            ? '✅ Red y Stockfish coinciden en la mejor jugada'
            : `⚠️ Red: ${netBest.san} · Stockfish: ${sfBestSan}`}
        </div>
      )}

      {/* Resultado del entrenamiento */}
      {trainResult && (
        <div className="p-3 bg-purple-50 border border-purple-300 rounded text-xs space-y-1">
          <div className="font-semibold text-purple-900">
            {trainResult.ok ? '✅ Entrenamiento completado' : '❌ Error en el entrenamiento'}
          </div>
          {trainResult.ok && trainResult.metadata && (
            <>
              <div><b>Muestras:</b> {trainResult.metadata.samples ?? '—'}</div>
              <div><b>Épocas:</b> {trainResult.metadata.epochs ?? '—'}</div>
              <div><b>MAE validación:</b> {trainResult.metadata.val_mae?.toFixed(4) ?? '—'}</div>
              <div><b>Fecha:</b> {trainResult.metadata.created_at?.slice(0, 19) ?? '—'}</div>
            </>
          )}
          {!trainResult.ok && (
            <div className="text-red-700">{trainResult.error || 'Error desconocido'}</div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Tabla de jugadas legales */}
      {showMoves && (
        <div className="rounded-lg border border-gray-300 bg-white overflow-hidden">
          <div className="px-2 py-1.5 border-b border-gray-200 flex justify-between text-[10px] uppercase text-gray-500">
            <span>{t('neural.legalMoves')}</span>
            <span className="font-mono">{legalMoves.length}</span>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-100 text-gray-600">
                <tr>
                  <th className="text-left px-2 py-1">SAN</th>
                  <th className="text-left px-2 py-1">UCI</th>
                  <th className="text-right px-2 py-1">{t('neural.eval')}</th>
                  <th className="text-left px-2 py-1"> </th>
                </tr>
              </thead>
              <tbody>
                {sortedMoves.map((m) => (
                  <tr
                    key={m.uci}
                    className="border-t border-gray-200 hover:bg-indigo-50 cursor-pointer"
                    onClick={() => onPlayMove?.(m.from, m.to, m.promotion)}
                  >
                    <td className="px-2 py-1 font-mono text-genome-orange">{m.san}</td>
                    <td className="px-2 py-1 font-mono text-gray-600">{m.uci}</td>
                    <td className="px-2 py-1 font-mono text-right text-emerald-700 font-semibold">
                      {m.evalLabel || '—'}
                    </td>
                    <td className="px-2 py-1 text-gray-500">{m.capture ? '×' : ''}</td>
                  </tr>
                ))}
                {sortedMoves.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-gray-500 text-center">
                      {t('neural.noMoves')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
