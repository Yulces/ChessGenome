import { useEffect, useState } from 'react';

const API = '/api/neural';

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

export function NeuralPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [corpusStats, setCorpusStats] = useState<any>(null);
  const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importJob, setImportJob] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function loadModels() {
    try {
      const r = await fetch(`${API}/models`);
      const data = await r.json();
      setModels(Array.isArray(data) ? data : []);
    } catch (e: any) { setError(e.message); }
  }

  async function loadCorpus() {
    try {
      const r = await fetch(`${API}/corpus/stats`);
      setCorpusStats(await r.json());
    } catch (e: any) { setError(e.message); }
  }

  useEffect(() => {
    void loadModels();
    void loadCorpus();
  }, []);

  async function train() {
    setTraining(true); setError(null); setTrainResult(null);
    try {
      const r = await fetch(`${API}/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epochs: 30, limit: 5000 }),
      });
      const data = await r.json();
      setTrainResult(data);
      await loadModels();
      await loadCorpus();
    } catch (e: any) { setError(e.message); }
    finally { setTraining(false); }
  }

  async function predict() {
    setLoading(true); setError(null); setPrediction(null);
    try {
      const r = await fetch(`${API}/best-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen }),
      });
      setPrediction(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function importPgns() {
    if (!importText.trim()) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      // Dividir por [Event ...]
      const parts = importText
        .split(/(?=\[Event\s+")/g)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length === 0) throw new Error('No se encontraron PGNs');
      const r = await fetch(`${API}/ingest-pgn-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgns: parts }),
      });
      const job = await r.json();
      setImportJob(job);
      // Polling cada 1 segundo
      const jobId = job.id;
      const poll = setInterval(async () => {
        try {
          const sr = await fetch(`${API}/ingest-status/${jobId}`);
          const status = await sr.json();
          if (status.ok) {
            setImportJob(status.job);
            if (status.job.status === 'done' || status.job.status === 'error') {
              clearInterval(poll);
              setImporting(false);
              setImportResult(status.job);
              await loadCorpus();
            }
          }
        } catch (e) {
          clearInterval(poll);
          setImporting(false);
        }
      }, 1000);
    } catch (e: any) {
      setImportError(e.message);
      setImporting(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportText(String(ev.target?.result || ''));
    reader.readAsText(file);
  }

  const activeModel = models.find((m) => m.metadata) || models[0];
  const activeMeta = activeModel?.metadata;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Red Neuronal de Godel</h1>

      {error && <div className="p-3 bg-red-100 border border-red-400 rounded text-sm">{error}</div>}

      <div className="p-4 bg-blue-50 border border-blue-300 rounded">
        <h2 className="text-lg font-semibold mb-2">Modelo activo</h2>
        {activeModel ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><b>Nombre:</b> {activeModel.name}</div>
            <div><b>Samples:</b> {activeMeta?.samples ?? '—'}</div>
            <div><b>MAE val:</b> {activeMeta?.val_mae?.toFixed(4) ?? '—'}</div>
            <div><b>Fecha:</b> {activeMeta?.created_at?.slice(0, 19) ?? '—'}</div>
          </div>
        ) : <p className="text-sm text-gray-600">No hay modelos entrenados.</p>}
      </div>

      <div className="p-4 bg-purple-50 border border-purple-300 rounded">
        <h2 className="text-lg font-semibold mb-2">Corpus de entrenamiento</h2>
        {corpusStats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><b>Total muestras:</b> {corpusStats.total ?? 0}</div>
            <div><b>Versiones:</b> {(corpusStats.byVersion || []).map((v: any) => `${v._id}:${v.count}`).join(', ') || '—'}</div>
            <div><b>Etiquetas:</b> {(corpusStats.byLabel || []).map((l: any) => `${l._id}:${l.count}`).join(', ') || '—'}</div>
          </div>
        ) : <p className="text-sm text-gray-600">Cargando...</p>}
      </div>

      <div className="p-4 bg-green-50 border border-green-300 rounded">
        <h2 className="text-lg font-semibold mb-2">Entrenamiento</h2>
        <button
          type="button"
          onClick={train}
          disabled={training}
          className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {training ? 'Entrenando...' : 'Entrenar modelo'}
        </button>
        {trainResult && (
          <pre className="mt-3 text-xs bg-white p-2 rounded border overflow-auto max-h-64">
            {JSON.stringify(trainResult, null, 2)}
          </pre>
        )}
      </div>

      <div className="p-4 bg-orange-50 border border-orange-300 rounded">
        <h2 className="text-lg font-semibold mb-2">Predecir mejor jugada</h2>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={fen}
            onChange={(e) => setFen(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded font-mono text-xs"
          />
          <button
            type="button"
            onClick={predict}
            disabled={loading}
            className="px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? 'Analizando...' : 'Analizar'}
          </button>
        </div>
        {prediction && prediction.ok && (
          <div className="space-y-2">
            {prediction.best && (
              <div className="p-2 bg-white rounded border">
                <b>Mejor jugada:</b> {prediction.best.san} ({prediction.best.uci}) — winrate: {prediction.best.winrate.toFixed(4)}
              </div>
            )}
            <div className="text-sm">
              <b>Top-3:</b>
              <ul className="mt-1 space-y-1">
                {prediction.top.map((m, i) => (
                  <li key={m.uci} className="font-mono text-xs">
                    {i + 1}. {m.san} ({m.uci}) — {m.winrate.toFixed(4)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-teal-50 border border-teal-300 rounded">
        <h2 className="text-lg font-semibold mb-2">Importar PGNs</h2>
        <div className="space-y-2">
          <input
            type="file"
            accept=".pgn,.txt"
            onChange={onFileChange}
            className="text-xs"
          />
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Pega aquí PGNs (puede contener múltiples partidas)"
            rows={6}
            className="w-full px-2 py-1 border border-gray-300 rounded font-mono text-xs"
          />
          <button
            type="button"
            onClick={importPgns}
            disabled={importing || !importText.trim()}
            className="px-4 py-2 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {importing ? 'Importando…' : 'Importar PGNs'}
          </button>
          {importError && <div className="text-xs text-red-600">{importError}</div>}
          {importJob && (
            <div className="text-xs text-gray-700">
              <b>Progreso:</b> {importJob.processed}/{importJob.total} ·{' '}
              <b>Estado:</b> {importJob.status}
            </div>
          )}
          {importResult && (
            <div className="p-2 bg-white rounded border text-xs space-y-1">
              <div><b>Partidas procesadas:</b> {importResult.games}</div>
              <div><b>Posiciones nuevas:</b> {importResult.stored}</div>
              <div><b>Posiciones actualizadas:</b> {importResult.updated}</div>
              <div><b>Omitidas:</b> {importResult.skipped}</div>
              {importResult.errors?.length > 0 && (
                <div className="text-red-600"><b>Errores:</b> {importResult.errors.length}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-gray-50 border border-gray-300 rounded">
        <h2 className="text-lg font-semibold mb-2">Historial de modelos</h2>
        {models.length === 0 ? (
          <p className="text-sm text-gray-600">No hay modelos.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {models.map((m) => (
              <li key={m.name} className="font-mono">
                <b>{m.name}</b>
                {m.metadata && (
                  <span className="ml-2 text-gray-600">
                    samples={m.metadata.samples} val_mae={m.metadata.val_mae?.toFixed(4)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
