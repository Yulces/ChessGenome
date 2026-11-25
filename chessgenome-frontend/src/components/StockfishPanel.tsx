import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chess } from 'chess.js';
import {
  stockfishEngine,
  uciToSan,
  type StockfishAnalysis,
} from '../services/stockfishEngine';

export interface StockfishResultPayload {
  bestMove: string | null;
  bestMoveSan?: string | null;
  ponder?: string | null;
  evaluation?: { type: 'cp' | 'mate'; value: number } | null;
  depth: number;
  pv?: string;
  engine: string;
}

interface Props {
  fen: string;
  depth?: number;
  /** Callback llamado cuando termina el análisis (con el resultado completo) */
  onResult?: (result: StockfishResultPayload) => void;
}

type EngineMode = 'wasm' | 'native';

export function StockfishPanel({ fen, depth = 15, onResult }: Props) {
  const { t } = useTranslation('genome');
  const [mode, setMode] = useState<EngineMode>('wasm');
  const [nativeOk, setNativeOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<StockfishAnalysis | null>(null);
  const [depthUsed, setDepthUsed] = useState(depth);
  const [engineLabel, setEngineLabel] = useState('');

  useEffect(() => {
    fetch('/api/stockfish/status')
      .then((r) => r.json())
      .then((s) => {
        setNativeOk(!!s.configured);
        if (s.configured) setMode('native');
      })
      .catch(() => setNativeOk(false));
  }, []);

  async function runWasm(): Promise<StockfishAnalysis> {
    const r = await stockfishEngine.analyze(fen, depthUsed);
    if (r.bestMove) r.bestMoveSan = uciToSan(fen, r.bestMove, Chess);
    setEngineLabel(t('stockfish.wasm'));
    return r;
  }

  async function runNative(): Promise<StockfishAnalysis> {
    const res = await fetch('/api/stockfish/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, depth: depthUsed }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || res.statusText);
    if (!data.available && data.error) throw new Error(data.error);

    const r: StockfishAnalysis = {
      bestMove: data.bestMove,
      ponder: data.ponder,
      evaluation: data.evaluation,
      depth: data.depth,
      pv: data.pv,
    };
    if (r.bestMove) r.bestMoveSan = uciToSan(fen, r.bestMove, Chess);
    setEngineLabel(t('stockfish.exe'));
    return r;
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = mode === 'native' ? await runNative() : await runWasm();
      setAnalysis(r);

      // Notificar al padre con el resultado completo
      if (onResult) {
        try {
          onResult({
            bestMove: r.bestMove ?? null,
            bestMoveSan: r.bestMoveSan ?? null,
            ponder: r.ponder ?? null,
            evaluation: r.evaluation ?? null,
            depth: r.depth,
            pv: r.pv,
            engine: mode === 'native' ? 'native-exe' : 'wasm',
          });
        } catch (e) {
          console.warn('Stockfish onResult callback failed', e);
        }
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  function formatEval(a: StockfishAnalysis): string {
    if (!a.evaluation) return '—';
    if (a.evaluation.type === 'mate') {
      const m = a.evaluation.value;
      return m > 0 ? `M${m}` : `M${m}`;
    }
    const cp = a.evaluation.value / 100;
    return (cp > 0 ? '+' : '') + cp.toFixed(2);
  }

  return (
    <div className="rounded-xl bg-white border border-gray-300 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">
          {t('stockfish.title')}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as EngineMode)}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800"
          >
            <option value="wasm">{t('stockfish.wasm')}</option>
            <option value="native" disabled={!nativeOk}>
              {t('stockfish.exe')}
              {!nativeOk ? ` (${t('stockfish.notConfigured')})` : ''}
            </option>
          </select>
          <label className="text-gray-700">
            {t('stockfish.depth')}
            <input
              type="number"
              min={5}
              max={30}
              value={depthUsed}
              onChange={(e) => setDepthUsed(parseInt(e.target.value, 10) || 15)}
              className="ml-1 w-14 bg-white border border-gray-300 rounded px-1 py-0.5 text-gray-800"
            />
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-emerald-200 text-gray-900 hover:bg-emerald-300 font-semibold disabled:opacity-50"
          >
            {loading ? t('stockfish.analyzing') : t('stockfish.analyze')}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-xs">{error}</p>}

      {analysis && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
            <p className="text-[10px] text-gray-600 uppercase font-semibold">
              {t('stockfish.bestMove')}
            </p>
            <p className="font-mono text-genome-orange text-lg font-bold">
              {analysis.bestMoveSan || analysis.bestMove || '—'}
            </p>
            {analysis.bestMove && (
              <p className="text-[10px] text-gray-500 font-mono">
                {analysis.bestMove}
              </p>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
            <p className="text-[10px] text-gray-600 uppercase font-semibold">
              {t('stockfish.eval')}
            </p>
            <p className="font-mono text-emerald-700 text-lg font-bold">
              {formatEval(analysis)}
            </p>
            <p className="text-[10px] text-gray-600">
              depth {analysis.depth}
              {engineLabel ? ` · ${engineLabel}` : ''}
            </p>
          </div>
          {analysis.pv && (
            <div className="col-span-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
              <p className="text-[10px] text-gray-600 uppercase font-semibold">
                PV
              </p>
              <p className="font-mono text-xs text-gray-800 break-all">
                {analysis.pv}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
