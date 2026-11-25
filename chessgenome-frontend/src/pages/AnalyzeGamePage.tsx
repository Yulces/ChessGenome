import { useState, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { analyzeGame, analyzePosition, bulkAnalyzeGame } from '../services/api';
import type { BulkAnalyzeResult } from '../services/api';
import { BoardNav } from '../components/BoardNav';
import { GenomeChart, DEFAULT_CHART_OPTIONS } from '../components/GenomeChart';
import type { ChartOptions } from '../components/GenomeChart';
import { PgnGameList, splitPgnGamesFast } from '../components/PgnGameList';
import { ResultPanel } from '../components/ResultPanel';
import { StockfishPanel } from '../components/StockfishPanel';
import { NeuralPanel } from '../components/NeuralPanel';
import { FenPasteButton } from '../components/FenPasteButton';
import { normalizeFen, loadChessFen } from '../utils/normalizeFen';
import { validateFenWithChessJs } from '../utils/fen';
import type {
  GameAnalysisResult,
  PlyAnalysis,
  AnalyzeResult,
} from '../types/genome';
import { pgnToPlies } from '../utils/pgn';
import {
  useSession,
  gameResultToGame,
  analyzeResultToAnalysis,
} from '../context/SessionContext';

const CHUNK_SIZE = 30;

function abbreviateS(s: string | undefined, digits?: number): string {
  if (!s) return '—';
  if (s.length <= 24) return s;
  const d = digits ?? s.length;
  return `${s.slice(0, 10)}…${s.slice(-8)} (${d} díg)`;
}

function formatRatio(r: number | null | undefined): string {
  if (r == null || Number.isNaN(r)) return '—';
  if (!Number.isFinite(r)) return r > 0 ? '∞' : '0';
  if (r >= 1e6 || (r > 0 && r < 1e-4)) return r.toExponential(4);
  return r.toPrecision(6);
}

const PRIMES_64 = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53,
  59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131,
  137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223,
  227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311,
];
const SUPERS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};
function toSuper(n: number): string {
  return String(n).split('').map((c) => SUPERS[c] || c).join('');
}
function factorizationString(exponents: number[] | undefined): string {
  if (!exponents || exponents.length !== 64) return '';
  const parts: string[] = [];
  for (let i = 0; i < 64; i++) {
    const v = exponents[i];
    if (v > 0) parts.push(`${PRIMES_64[i]}${toSuper(v)}`);
  }
  return parts.join(' · ');
}

function sciNotation(s: string | undefined, sigDigits = 6): string {
  if (!s) return '—';
  const trimmed = s.replace(/^0+/, '');
  if (!trimmed || trimmed === '0') return '0';
  const mantissa =
    trimmed[0] + '.' + (trimmed.slice(1, 1 + sigDigits) || '0');
  const exp = trimmed.length - 1;
  return `${mantissa} × 10^${exp}`;
}

export function AnalyzeGamePage({
  initialPgn,
  onInitialPgnConsumed,
}: {
  initialPgn?: string | null;
  onInitialPgnConsumed?: () => void;
} = {}) {
  const { t } = useTranslation('genome');
  const { addGame, addAnalysis, updateGame, addChart } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);

  // === FEN suelto ===
  const [fenInput, setFenInput] = useState('');
  const [fenResult, setFenResult] = useState<AnalyzeResult | null>(null);
  const [fenLoading, setFenLoading] = useState(false);
  const [fenError, setFenError] = useState<string | null>(null);
  const [fenCopied, setFenCopied] = useState(false);
  const [fenStoreIfNew, setFenStoreIfNew] = useState(false);
  const [fenPreview, setFenPreview] = useState(
    '8/8/8/8/8/8/8/8 w - - 0 1',
  );

  // === Análisis puntual de la posición seleccionada en PGN ===
  const [plyAnalysis, setPlyAnalysis] = useState<AnalyzeResult | null>(null);
  const [plyLoading, setPlyLoading] = useState(false);
  const [plyError, setPlyError] = useState<string | null>(null);

  // === Auto-guardar ===
  const [autoSave, setAutoSave] = useState(true);
  const [autoSaveMsg, setAutoSaveMsg] = useState<string | null>(null);

  // === PGN ===
  const [pgn, setPgn] = useState('');
  const [games, setGames] = useState<string[]>([]);
  const [gameIndex, setGameIndex] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nnPredictions, setNnPredictions] = useState<Record<number, { uci: string; san: string; winrate: number }>>({});
  const [nnLoading, setNnLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GameAnalysisResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const [chunkMode, setChunkMode] = useState<'all' | number>('all');
  const [chunkMenuOpen, setChunkMenuOpen] = useState(false);
  const [pgnPasted, setPgnPasted] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pgnSource, setPgnSource] = useState<'user' | 'external' | null>(null);
  const [neuralActive, setNeuralActive] = useState(false);

  // === Captura de gráficos (bajo demanda, al guardar partida) ===
  const [captureQueue, setCaptureQueue] = useState<number[]>([]);
  const [capturedSvgs, setCapturedSvgs] = useState<string[]>([]);
  const [gameIdForCharts, setGameIdForCharts] = useState<string | null>(null);
  const [captureActive, setCaptureActive] = useState(false);

  // === Opciones del gráfico (configuradas por el usuario en pantalla) ===
  const [chartOptions, setChartOptions] =
    useState<ChartOptions>(DEFAULT_CHART_OPTIONS);

  // === Bulk save state ===
  const [bulkStoreIfNew, setBulkStoreIfNew] = useState(true);
  const [bulkSaveTransitions, setBulkSaveTransitions] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkAnalyzeResult | null>(null);

  // Consumir initialPgn (de HomePage)
  useEffect(() => {
    if (!initialPgn || !initialPgn.trim()) return;
    setPgn(initialPgn);
    setPgnSource('external');
    setGames([]);
    setFileName(null);
    onInitialPgnConsumed?.();
    // Auto-analizar
    void analyzePgnText(initialPgn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPgn]);

  // Validar el FEN cada vez que cambia el input y actualizar el preview
  useEffect(() => {
    if (!fenInput.trim()) {
      setFenPreview('8/8/8/8/8/8/8/8 w - - 0 1');
      return;
    }
    try {
      const norm = normalizeFen(fenInput);
      const g = new Chess();
      if (loadChessFen(g, norm)) {
        setFenPreview(g.fen());
      } else {
        setFenPreview('8/8/8/8/8/8/8/8 w - - 0 1');
      }
    } catch {
      setFenPreview('8/8/8/8/8/8/8/8 w - - 0 1');
    }
  }, [fenInput]);

  // ============================
  // FEN suelto: análisis
  // ============================
  async function analyzeSingleFen() {
    setFenError(null);
    setFenResult(null);

    // Validar y normalizar
    let f = fenInput.trim();
    const msg = validateFenWithChessJs(normalizeFen(f), Chess);
    if (msg) {
      setFenError(msg);
      return;
    }
    try {
      const g = new Chess();
      const norm = normalizeFen(f);
      if (loadChessFen(g, norm)) {
        f = g.fen();
      } else {
        f = norm;
      }
    } catch {
      setFenError(t('calculate.invalidFen'));
      return;
    }

    setFenInput(f);
    setFenLoading(true);
    try {
      const r = await analyzePosition(f, fenStoreIfNew);
      setFenResult(r);

      try {
        const title = `Posición analizada (${t('analyze.fenTitle')})`;
        addAnalysis(analyzeResultToAnalysis(r, f, 'analyze', title));
      } catch (e) {
        console.warn('Session capture failed', e);
      }
    } catch (e: any) {
      setFenError(e.message || String(e));
    } finally {
      setFenLoading(false);
    }
  }

  async function pastePgnFromClipboard() {
    setPasteError(null);
    try {
      // Comprobar si el API está disponible
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setPasteError(t('analyze.pasteUnsupported'));
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text) {
        setPasteError(t('analyze.pasteEmpty'));
        return;
      }
      setPgn(text);
      setPgnSource('user');
      setGames([]);
      setFileName(null);
      setPgnPasted(true);
      window.setTimeout(() => setPgnPasted(false), 1500);
    } catch (e: any) {
      console.warn('No se pudo leer el portapapeles', e);
      setPasteError(t('analyze.pasteFailed'));
    }
  }

  function copyFenInput() {
    void navigator.clipboard?.writeText(fenInput);
    setFenCopied(true);
    window.setTimeout(() => setFenCopied(false), 1500);
  }

  // ============================
  // PGN: análisis
  // ============================

  /** Hash DJB2 del PGN (misma función que en el backend) */
  function hashPgn(pgn: string): string {
    let h = 5381;
    for (let i = 0; i < pgn.length; i++) {
      h = ((h << 5) + h + pgn.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  /** Analiza todas las partidas del PGN en background.
   *  - Si el PGN ya está en la BD, reutiliza su analysisResult (sin recalcular).
   *  - Si no, lo analiza y lo guarda.
   *  - Deja la PRIMERA partida marcada en la UI (gráfico + análisis). */
  async function analyzeAllGames(gamesList: string[]) {
    if (!gamesList.length) return;
    setError(null);
    setLoading(true);
    let totalStored = 0, totalUpdated = 0, totalSkipped = 0, totalGames = 0, totalReused = 0, errors = 0;

    // 1. Calcular hashes y consultar cuáles ya existen
    const hashes = gamesList.map((g) => hashPgn(g));
    let existing: string[] = [];
    try {
      const r = await fetch('/api/pgns/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgnHashes: hashes }),
      });
      const data = await r.json();
      existing = data.existing || [];
    } catch (e) {
      console.warn('pgns/check failed', e);
    }
    const existingSet = new Set(existing);

    for (let i = 0; i < gamesList.length; i++) {
      const text = gamesList[i];
      const hash = hashes[i];
      setAutoSaveMsg(`Analizando ${i + 1}/${gamesList.length}...`);
      try {
        // 2a. Si ya existe, reutilizar analysisResult
        if (existingSet.has(hash)) {
          try {
            const r = await fetch(`/api/pgns/${hash}/analysis`);
            const saved = await r.json();
            if (saved?.analysisResult) {
              totalReused++;
              totalGames++;
              if (i === 0) {
                setResult(saved.analysisResult);
                setSelected(0);
                try {
                  const gamePayload = gameResultToGame(saved.analysisResult, text);
                  const id = addGame(gamePayload);
                  setGameIdForCharts(id);
                } catch (e) { console.warn('Session capture failed', e); }
              }
              continue;
            }
          } catch (e) {
            console.warn('getAnalysis failed, fallback to recompute', e);
          }
        }

        // 2b. Si no existe (o no hay analysisResult), analizar y guardar
        const { headers, fens, sans } = pgnToPlies(text);
        if (fens.length < 1) { errors++; continue; }
        const data = await analyzeGame(fens, headers, sans);
        if (autoSave) {
          const fensList = data.plies.map((p) => p.fen);
          const sansList = data.plies.map((p) => p.san || '');
          const bulkData = await bulkAnalyzeGame(fensList, sansList, {
            headers: data.headers || {},
            storeIfNew: true,
            saveTransitions: true,
            pgn: text,
          });
          totalStored += bulkData.stored ?? 0;
          totalUpdated += bulkData.updated ?? 0;
          totalSkipped += bulkData.skipped ?? 0;
        }
        // Guardar el analysisResult para no recalcular la próxima vez
        try {
          await fetch('/api/pgns/save-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgnHash: hash, analysisResult: data }),
          });
        } catch (e) {
          console.warn('saveAnalysis failed', e);
        }
        totalGames++;
        if (i === 0) {
          setResult(data);
          setSelected(0);
          try {
            const gamePayload = gameResultToGame(data, text);
            const id = addGame(gamePayload);
            setGameIdForCharts(id);
          } catch (e) { console.warn('Session capture failed', e); }
        }
      } catch (e: any) {
        console.warn(`Game ${i} failed:`, e);
        errors++;
      }
    }

    setAutoSaveMsg(
      `✅ ${totalGames}/${gamesList.length} partidas · ${totalReused} reutilizadas · ${totalStored} nuevas · ${totalUpdated} actualizadas · ${totalSkipped} omitidas${errors ? ` · ${errors} errores` : ''}`
    );
    window.setTimeout(() => setAutoSaveMsg(null), 8000);
    setLoading(false);
  }

  async function analyzeWithNN() {
    if (!result || !result.plies.length) return;
    setNnLoading(true);
    setNnPredictions({});
    const plies = result.plies;
    // Concurrencia limitada: 3 a la vez
    const concurrency = 3;
    let idx = 0;
    const results: Record<number, { uci: string; san: string; winrate: number }> = {};
    async function worker() {
      while (idx < plies.length) {
        const i = idx++;
        const ply = plies[i];
        try {
          const r = await fetch('/api/neural/best-move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen: ply.fen }),
          });
          const data = await r.json();
          if (data.ok && data.best) {
            results[i] = { uci: data.best.uci, san: data.best.san, winrate: data.best.winrate };
          }
        } catch (e) {
          // ignorar errores individuales
        }
        // Actualizar progreso cada 5 plies
        if (i % 5 === 0) {
          setNnPredictions({ ...results });
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    setNnPredictions({ ...results });
    setNnLoading(false);
  }

  function applyText(text: string, name?: string) {
    const list = splitPgnGamesFast(text);
    setGames(list);
    setGameIndex(0);
    setPgn(list[0] || text);
    setPgnSource('user');
    setFileName(name || null);
    setResult(null);
    setBulkResult(null);
    setError(null);
    setChunkMode('all');
    setCaptureQueue([]);
    setCapturedSvgs([]);
    setGameIdForCharts(null);

    // Si hay más de una partida, analizarlas todas en background.
    // La primera queda marcada en la UI.
    if (list.length > 1) {
      void analyzeAllGames(list);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      applyText(text, file.name);
    };
    reader.onerror = () => setError(t('analyze.fileError'));
    reader.readAsText(file);
  }

  const chunks = useMemo(() => {
    if (!result) return [];
    const total = result.plies.length;
    const out: { start: number; end: number; label: string }[] = [];
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE - 1, total - 1);
      out.push({ start: i, end, label: `${i}–${end}` });
    }
    return out;
  }, [result]);

  const chartPoints = useMemo(() => {
    if (!result) return [];
    const all = result.plies.map((p) => ({
      index: p.moveIndex,
      san: p.san,
      L: p.L,
      L10: p.L10,
      S_digits: p.S_digits ?? 0,
      diff: p.diff,
      ratio: p.ratio ?? null,
    }));
    if (chunkMode === 'all') return all;
    const c = chunks[chunkMode];
    if (!c) return all;
    return all.slice(c.start, c.end + 1);
  }, [result, chunkMode, chunks]);

  async function analyzePgnText(text: string) {
    setError(null);
    setResult(null);
    setBulkResult(null);
    setChunkMode('all');
    setCaptureQueue([]);
    setCapturedSvgs([]);
    setGameIdForCharts(null);
    setCaptureActive(false);
    setChartOptions(DEFAULT_CHART_OPTIONS);
    setLoading(true);
    try {
      const { headers, fens, sans } = pgnToPlies(text);
      console.log('[PGN] fens:', fens.length, 'sans:', sans.length, 'sans:', sans);
      if (fens.length < 1) {
        throw new Error(t('analyze.parseError'));
      }
      const data = await analyzeGame(fens, headers, sans);
      setResult(data);
      setSelected(0);

      try {
        const gamePayload = gameResultToGame(data, text);
        const id = addGame(gamePayload);
        setGameIdForCharts(id);

        // (Auto-captura del gráfico full eliminada: solo se capturan los tramos)
      } catch (e) {
        console.warn('Session capture failed', e);
      }

      // === Auto-guardar en DB (positions + pgns) ===
      if (autoSave) {
        try {
          setAutoSaveMsg(t('analyze.autoSaving'));
          const fensList = data.plies.map((p) => p.fen);
          const sansList = data.plies.map((p) => p.san || '');
          const bulkData = await bulkAnalyzeGame(fensList, sansList, {
            headers: data.headers || {},
            storeIfNew: true,
            saveTransitions: true,
            pgn: text,
          });
          setBulkResult(bulkData);
          setAutoSaveMsg(
            t('analyze.autoSaved', {
              stored: bulkData.stored,
              updated: bulkData.updated,
            }),
          );
          window.setTimeout(() => setAutoSaveMsg(null), 4000);
        } catch (e: any) {
          console.warn('Auto-save failed', e);
          setAutoSaveMsg(null);
        }
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // ===== Auto-captura de tramos al analizar la partida =====
  const autoChunkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!result || !gameIdForCharts) return;
    const key = gameIdForCharts + '|' + result.plies.length;
    if (autoChunkedRef.current === key) return;
    autoChunkedRef.current = key;
    const timer = window.setTimeout(() => {
      void refreshCharts();
    }, 1800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, gameIdForCharts]);

  // ===== Captura de charts: espera que TODA la cola termine =====
  useEffect(() => {
    if (!captureActive) return;
    if (captureQueue.length === 0) return;
    if (!chartWrapperRef.current) return;

    const current = captureQueue[0];

    if (chunkMode !== current) {
      setChunkMode(current);
      return;
    }

    let raf1 = 0, raf2 = 0;
    const timer = window.setTimeout(() => {
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          try {
            const svgEl = chartWrapperRef.current?.querySelector(
              'svg',
            ) as SVGSVGElement | null;
            if (svgEl) {
              const clone = svgEl.cloneNode(true) as SVGSVGElement;
              clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
              const svgData = new XMLSerializer().serializeToString(clone);
              setCapturedSvgs((prev) => {
                // Dedup por longitud + primeros 200 chars (evita el mismo SVG 4 veces)
                const sig = svgData.length + '|' + svgData.slice(0, 200);
                const prevSig = prev.map(s => s.length + '|' + s.slice(0, 200));
                if (prevSig.indexOf(sig) !== -1) {
                  console.log('[CHART] SVG duplicado, skip');
                  return prev;
                }
                console.log('[CHART] Capturado SVG ' + svgData.length + ' bytes');
                return [...prev, svgData];
              });
            } else {
              console.warn('[CHART] No se encontró <svg> en el wrapper');
            }
          } catch (e) {
            console.warn('Auto chart capture failed', e);
          }
          setCaptureQueue((prev) => prev.slice(1));
        });
      });
    }, 700);

    return () => {
      window.clearTimeout(timer);
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureQueue, chunkMode, captureActive]);

  // ===== Persistencia: cada vez que capturedSvgs cambie, guarda en el game =====
  useEffect(() => {
    if (!gameIdForCharts) return;
    if (capturedSvgs.length === 0) return;
    try {
      console.log('[CHART] Persistiendo ' + capturedSvgs.length + ' charts al game ' + gameIdForCharts);
      updateGame(gameIdForCharts, { chartSvgs: capturedSvgs });
    } catch (e) {
      console.warn('Failed to attach chartSvgs to game', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedSvgs, gameIdForCharts]);

  // ===== Cerrar el modo captura cuando la cola termina =====
  useEffect(() => {
    if (!captureActive) return;
    if (captureQueue.length > 0) return;
    // Toda la cola terminó → desactivar captura
    setCaptureActive(false);
    setChunkMode('all');
    setSelected(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureQueue.length, captureActive]);

  function selectGame(i: number) {
    if (i < 0 || i >= games.length) return;
    setGameIndex(i);
    const text = games[i];
    setPgn(text);
    setSelected(0);
    void analyzePgnText(text);
  }

  async function runAnalysis() {
    await analyzePgnText(pgn);
  }

  async function analyzePlyPosition() {
    setPlyError(null);
    setPlyAnalysis(null);
    setPlyLoading(true);
    try {
      const data = await analyzePosition(boardFen, false);
      setPlyAnalysis(data);
    } catch (e: any) {
      setPlyError(e?.message || String(e));
    } finally {
      setPlyLoading(false);
    }
  }

  async function saveWholeGame() {
    if (!result || !result.plies.length) return;
    setBulkSaving(true);
    setError(null);
    setBulkResult(null);
    try {
      // 1. Guardar las posiciones en DB (bulk)
      const fens = result.plies.map((p) => p.fen);
      const sans = result.plies.map((p) => p.san || '');
      const data = await bulkAnalyzeGame(fens, sans, {
        headers: result.headers || {},
        storeIfNew: bulkStoreIfNew,
        saveTransitions: bulkSaveTransitions,
      });
      setBulkResult(data);

      // 2. Capturar los gráficos de cada tramo con la config actual del usuario
      // Auto-captura del chart completo tras guardar
      setTimeout(() => {
        if (!chartWrapperRef.current) return;
        const svgEl = chartWrapperRef.current.querySelector('svg') as SVGSVGElement | null;
        if (!svgEl) return;
        const clone = svgEl.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const svg = new XMLSerializer().serializeToString(clone);
        addChart({
          title: 'Chart L10+L+D+R (full)',
          svgData: svg,
          context: 'Auto-capturado tras guardar',
        });
      }, 1200);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBulkSaving(false);
    }
  }

  // Captura el SVG que está ahora mismo en pantalla
  function captureCurrentSvg(): string | null {
    const svgEl = chartWrapperRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl) return null;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(clone);
  }

  // Lista legible de las series activas
  function seriesLabel(): string {
    const parts: string[] = [];
    if (chartOptions.enabled.L)   parts.push('L');
    if (chartOptions.enabled.L10) parts.push('L10');
    if (chartOptions.enabled.D)   parts.push('D');
    if (chartOptions.enabled.R)   parts.push('R');
    return parts.length ? parts.join('+') : 'sin series';
  }

  // BOTÓN "Añadir gráfico actual": guarda 1 item con las curvas activas
  function addCurrentChartToSession() {
    if (!result) return;
    const svg = captureCurrentSvg();
    if (!svg) {
      console.warn('[CHART] no hay SVG para capturar');
      return;
    }
    const label = seriesLabel();
    const range = chunkMode === 'all' ? 'full' : ('chunk ' + chunkMode);
    const title = 'Chart ' + label + ' (' + range + ')';
    addChart({
      title,
      svgData: svg,
      context: 'Snapshot capturado por el usuario',
    });
    console.log('[CHART] añadido a la sesión: ' + title + ' (' + svg.length + ' bytes)');
  }

  // BOTÓN "Refresh": parte en chunks y guarda CADA tramo como item de sesión
  async function refreshCharts() {
    if (!result) return;
    setCaptureActive(true);
    const total = result.plies.length;
    const numChunks = Math.max(1, Math.ceil(total / CHUNK_SIZE));

    // Guardar opciones actuales y forzar solo L10 para los tramos
    const savedOptions = { ...chartOptions };
    const l10Only = {
      ...chartOptions,
      enabled: {
        ...chartOptions.enabled,
        L: false,
        L10: true,
        D: false,
        R: false,
      },
    };
    setChartOptions(l10Only);
    await new Promise((res) => setTimeout(res, 300));

    const label = 'L10';

    console.log('[CHART] refreshCharts: ' + numChunks + ' chunks, series=' + label);

    // Forzar un cambio de estado para que el primer chunk se renderice de nuevo
    setChunkMode('all');
    await new Promise((res) => setTimeout(res, 300));

    for (let i = 0; i < numChunks; i++) {
      setChunkMode(i);
      await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
      await new Promise((res) => setTimeout(res, 900));

      const svg = captureCurrentSvg();
      if (!svg) {
        console.warn('[CHART] chunk ' + i + ' sin SVG');
        continue;
      }
      const c = chunks[i];
      const rng = c ? (c.start + '-' + c.end) : String(i);
      addChart({
        title: 'Chart ' + label + ' (' + rng + ')',
        svgData: svg,
        context: 'Tramo ' + (i + 1) + '/' + numChunks,
      });
      console.log('[CHART] chunk ' + i + ' añadido a sesión (' + svg.length + ' bytes)');
    }

    setChunkMode('all');
    setChartOptions(savedOptions);
    setCaptureActive(false);
  }

  // Nuevo análisis → resetear estado neuronal
  useEffect(() => {
    setNeuralActive(false);
    setPlyAnalysis(null);
    setPlyError(null);
  }, [result]);

  // Análisis neuronal persistente: se re-ejecuta al cambiar de ply si está activo
  useEffect(() => {
    if (!neuralActive || !result) return;
    void analyzePlyPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, neuralActive]);

  function copyFen(fen: string) {
    void navigator.clipboard?.writeText(fen);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const ply: PlyAnalysis | undefined = result?.plies[selected];
  const boardFen =
    ply?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const total = result?.plies.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">
          {t('analyze.title')}
        </h2>
        <p className="text-gray-700 text-base mt-1">{t('analyze.subtitle')}</p>
      </div>

      {/* ========================================== */}
      {/* PANEL FEN SUELTO                            */}
      {/* ========================================== */}
      <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 space-y-3">
        <h3 className="text-lg font-semibold text-blue-900">
          🔍 {t('analyze.fenTitle')}
        </h3>
        <p className="text-xs text-blue-800">{t('analyze.fenHint')}</p>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Tablero pequeño de preview */}
          <div className="shrink-0 mx-auto sm:mx-0">
            <Chessboard
              position={fenPreview}
              arePiecesDraggable={false}
              boardWidth={220}
            />
          </div>

          {/* Controles + resultados */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap gap-2 items-stretch">
              <input
                type="text"
                value={fenInput}
                onChange={(e) => {
                  setFenInput(e.target.value);
                  setFenError(null);
                }}
                className={`flex-1 min-w-[180px] bg-white border rounded-lg px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none ${
                  fenError
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:border-blue-500'
                }`}
                spellCheck={false}
              />
              <FenPasteButton
                compact
                onPaste={(v) => {
                  setFenInput(v);
                  setFenError(null);
                }}
              />
              <button
                type="button"
                onClick={copyFenInput}
                className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium transition"
                title={t('common.copy')}
              >
                {fenCopied ? '✓' : '📋'}
              </button>
              <button
                type="button"
                onClick={analyzeSingleFen}
                disabled={fenLoading || !fenInput.trim()}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-40"
              >
                {fenLoading
                  ? t('common.analyzing')
                  : `🔍 ${t('analyze.analyzeFenBtn')}`}
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={fenStoreIfNew}
                onChange={(e) => setFenStoreIfNew(e.target.checked)}
              />
              {t('common.saveIfNew')}
            </label>

            {fenError && (
              <div className="rounded-lg bg-red-50 border border-red-300 p-3 text-red-800 text-sm">
                {fenError}
              </div>
            )}

            {fenResult && (
              <div className="space-y-3">
                <ResultPanel result={fenResult} loading={false} error={null} />

                {fenResult.S_exact && (
                  <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 space-y-2">
                    <span className="text-xs text-blue-800 uppercase font-semibold">
                      {t('states.sciLabel', { n: 0 })}
                    </span>
                    <p className="font-mono font-bold text-base text-gray-900 break-all">
                      {sciNotation(fenResult.S_exact, 6)}
                    </p>
                    {fenResult.S_digits != null && (
                      <p className="text-xs text-blue-700">
                        {fenResult.S_digits} dígitos totales
                      </p>
                    )}
                  </div>
                )}

                <StockfishPanel fen={fenPreview} onResult={() => {}} />
                <NeuralPanel fen={fenPreview} onResult={() => {}} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* PANEL PGN                                   */}
      {/* ========================================== */}
      <div className="rounded-xl border border-genome-orange/40 bg-orange-50/40 p-4 space-y-4">
        <h3 className="text-lg font-semibold text-genome-orange">
          📜 {t('analyze.pgnTitle')}
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pgn,.txt,application/x-chess-pgn,text/plain"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-base font-medium"
          >
            {t('analyze.loadFile')}
          </button>
          {fileName && (
            <span className="text-sm text-gray-700 font-mono truncate max-w-xs">
              {fileName}
              {games.length > 1
                ? ` · ${games.length} ${t('analyze.games')}`
                : ''}
            </span>
          )}
        </div>

        {games.length >= 1 && (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <PgnGameList
                games={games}
                selectedIndex={gameIndex}
                onSelect={selectGame}
                fileName={fileName}
              />
            </div>
            <div className="lg:col-span-2 text-sm text-gray-700 self-start">
              {t('analyze.gameListHint')}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => setAutoSave(e.target.checked)}
            className="rounded border-gray-400 text-genome-orange focus:ring-genome-orange"
          />
          {t('analyze.autoSaveLabel')}
        </label>

        {autoSaveMsg && (
          <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-2">
            {autoSaveMsg}
          </div>
        )}

        {pasteError && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
            ⚠️ {pasteError}
          </div>
        )}

        <div className="relative">
          <textarea
            className="w-full h-40 bg-white border border-gray-300 rounded-xl p-3 pr-28 font-mono text-base text-gray-900"
            placeholder={t('analyze.placeholder')}
            value={pgn}
            onChange={(e) => {
              setPgn(e.target.value);
              setGames([]);
              setFileName(null);
            }}
          />
          <button
            type="button"
            onClick={pastePgnFromClipboard}
            className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-medium border border-gray-300 transition"
            title={t('analyze.pastePgn')}
          >
            {pgnPasted ? '✓' : '📋 ' + t('analyze.pastePgn')}
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={runAnalysis}
            disabled={loading || !pgn.trim() || pgnSource === 'external'}
            className="px-5 py-2.5 rounded-lg bg-genome-orange text-white font-semibold text-base disabled:opacity-40"
          >
            {loading ? t('common.analyzing') : t('analyze.btn')}
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-300 p-4 text-red-800 text-base">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* ... (todo el bloque de resultado PGN igual que antes) ... */}
            <div className="flex flex-wrap gap-3 text-base text-gray-800">
              <span>
                {result.moveCount} {t('analyze.halfMoves')}
              </span>
              {result.engine &&
                !String(result.engine).startsWith('typescript') && (
                  <span>{result.engine}</span>
                )}
              {result.headers?.White && (
                <span>
                  {result.headers.White} vs {result.headers.Black || '?'}
                </span>
              )}
            </div>

            {!autoSave && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={saveWholeGame}
                  disabled={bulkSaving || !result.plies.length}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base disabled:opacity-40"
                >
                  {bulkSaving
                    ? t('analyze.bulkSaveSaving')
                    : t('analyze.bulkSaveBtn')}
                </button>

                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bulkStoreIfNew}
                    onChange={(e) => setBulkStoreIfNew(e.target.checked)}
                    className="rounded border-gray-400 text-emerald-600 focus:ring-emerald-600"
                  />
                  {t('analyze.bulkSaveStoreNew')}
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bulkSaveTransitions}
                    onChange={(e) => setBulkSaveTransitions(e.target.checked)}
                    className="rounded border-gray-400 text-emerald-600 focus:ring-emerald-600"
                  />
                  {t('analyze.bulkSaveTransitions')}
                </label>
              </div>

              {bulkResult && (
                <div className="text-sm text-gray-900 bg-white rounded-lg border border-emerald-200 p-3">
                  <p className="font-semibold text-emerald-800">
                    ✅{' '}
                    {t('analyze.bulkResultTitle', { total: bulkResult.total })}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-center">
                    <div className="bg-emerald-50 rounded p-2">
                      <div className="text-xs text-gray-600 uppercase font-semibold">
                        {t('analyze.bulkResultStored')}
                      </div>
                      <div className="font-mono font-bold text-emerald-700 text-lg">
                        {bulkResult.stored}
                      </div>
                    </div>
                    <div className="bg-blue-50 rounded p-2">
                      <div className="text-xs text-gray-600 uppercase font-semibold">
                        {t('analyze.bulkResultUpdated')}
                      </div>
                      <div className="font-mono font-bold text-blue-700 text-lg">
                        {bulkResult.updated}
                      </div>
                    </div>
                    <div className="bg-gray-100 rounded p-2">
                      <div className="text-xs text-gray-600 uppercase font-semibold">
                        {t('analyze.bulkResultSkipped')}
                      </div>
                      <div className="font-mono font-bold text-gray-700 text-lg">
                        {bulkResult.skipped}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded p-2">
                      <div className="text-xs text-gray-600 uppercase font-semibold">
                        {t('analyze.bulkResultTransitions')}
                      </div>
                      <div className="font-mono font-bold text-purple-700 text-lg">
                        {bulkResult.transitionsSaved}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="max-w-md mx-auto w-full">
                <Chessboard
                  position={boardFen}
                  arePiecesDraggable={false}
                  boardWidth={Math.min(
                    400,
                    typeof window !== 'undefined'
                      ? window.innerWidth - 48
                      : 400,
                  )}
                />
                <BoardNav
                  index={selected}
                  total={total}
                  onFirst={() => setSelected(0)}
                  onPrev={() => setSelected((s) => Math.max(0, s - 1))}
                  onNext={() => setSelected((s) => Math.min(total - 1, s + 1))}
                  onLast={() => setSelected(total - 1)}
                />

                {ply && (
                  <div className="mt-3 space-y-2">
                    <p className="text-center text-base text-gray-900 font-mono">
                      {ply.san || (selected === 0 ? t('analyze.startPos') : '')}
                      {ply.L != null && (
                        <span className="ml-2 text-genome-orange font-bold">
                          L={ply.L.toFixed(4)}
                        </span>
                      )}
                    </p>

                    <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-600 uppercase font-semibold">
                          FEN
                        </span>
                        <button
                          type="button"
                          onClick={() => copyFen(boardFen)}
                          className="text-xs px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
                        >
                          {copied ? '✓' : 'copiar'}
                        </button>
                      </div>
                      <p className="text-sm font-mono text-gray-800 break-all">
                        {boardFen}
                      </p>
                    </div>

                  </div>
                )}
              </div>

              <div className="space-y-3">
              {ply?.S_exact && (
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm text-gray-800 uppercase tracking-wide font-semibold">
                        S (Gödel) — {ply.S_digits} dígitos
                      </p>
                      <button
                        type="button"
                        onClick={() => copyFen(ply.S_exact!)}
                        className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
                      >
                        {copied ? '✓' : t('common.copy')}
                      </button>
                    </div>
                    <p className="text-sm font-mono text-emerald-800 break-all max-h-64 overflow-y-auto bg-white rounded p-2 border border-gray-200">
                      {ply.S_exact}
                    </p>

                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                        {t('states.sciLabel', { n: selected })}
                      </p>
                      <p className="text-base font-mono font-bold text-gray-900 break-all">
                        {sciNotation(ply.S_exact, 6)}
                      </p>
                    </div>

                    {ply.exponents && ply.exponents.length === 64 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                          S = ∏ pᵢ^eᵢ (solo casillas con pieza)
                        </p>
                        <p className="text-xs font-mono text-gray-800 break-all max-h-32 overflow-y-auto bg-white rounded p-2 border border-gray-200">
                          {factorizationString(ply.exponents)}
                        </p>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="bg-white rounded p-2 border border-gray-200">
                        <div className="text-xs text-gray-600 uppercase font-semibold">
                          L
                        </div>
                        <div className="font-mono font-bold text-base text-genome-orange">
                          {ply.L?.toFixed(4) ?? '—'}
                        </div>
                      </div>
                      <div className="bg-white rounded p-2 border border-gray-200">
                        <div className="text-xs text-gray-600 uppercase font-semibold">
                          L<sub>10</sub>
                        </div>
                        <div className="font-mono font-bold text-base text-gray-900">
                          {ply.L10?.toFixed(4) ?? '—'}
                        </div>
                      </div>
                      <div className="bg-white rounded p-2 border border-gray-200">
                        <div className="text-xs text-gray-600 uppercase font-semibold">
                          D(k)
                        </div>
                        <div
                          className={`font-mono font-bold text-base ${
                            ply.diff == null
                              ? 'text-gray-900'
                              : ply.diff > 0
                              ? 'text-genome-orange'
                              : ply.diff < 0
                              ? 'text-blue-700'
                              : 'text-gray-900'
                          }`}
                        >
                          {ply.diff == null ? '—' : ply.diff.toFixed(4)}
                        </div>
                      </div>
                      <div className="bg-white rounded p-2 border border-gray-200">
                        <div className="text-xs text-gray-600 uppercase font-semibold">
                          R(k)
                        </div>
                        <div className="font-mono font-bold text-base text-gray-900">
                          {formatRatio(ply.ratio)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* === Análisis puntual de la posición seleccionada === */}
              <button
                type="button"
                onClick={() =>
                  setNeuralActive((v) => {
                    const next = !v;
                    if (!next) {
                      setPlyAnalysis(null);
                      setPlyError(null);
                    }
                    return next;
                  })
                }
                disabled={plyLoading}
                className={`w-full px-4 py-2 rounded-lg font-semibold text-sm border transition disabled:opacity-40 ${
                  neuralActive
                    ? 'bg-purple-300 hover:bg-purple-400 text-purple-900 border-purple-500'
                    : 'bg-purple-100 hover:bg-purple-200 text-purple-900 border-purple-400'
                }`}
              >
                {plyLoading
                  ? `⏳ ${t('common.analyzing')}`
                  : neuralActive
                  ? `✓ ${t('analyze.analyzePlyActive')}`
                  : `🔬 ${t('analyze.analyzePlyBtn')}`}
              </button>

              {plyError && (
                <div className="text-sm text-red-800 bg-red-50 border border-red-300 rounded-lg px-3 py-2">
                  {plyError}
                </div>
              )}

              {plyAnalysis && (
                <div className="space-y-3">
                  <ResultPanel
                    result={plyAnalysis}
                    loading={false}
                    error={null}
                  />
                  <StockfishPanel fen={boardFen} onResult={() => {}} />
                  <NeuralPanel fen={boardFen} onResult={() => {}} />
                </div>
              )}
              </div>
            </div>

            {chunks.length > 1 && (
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setChunkMenuOpen((v) => !v)}
                    className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
                  >
                    📊{' '}
                    {chunkMode === 'all'
                      ? t('analyze.chunkMenuFull')
                      : `${t('analyze.chunkMenuTramos')}: ${
                          chunks[chunkMode]?.label || ''
                        }`}{' '}
                    ▾
                  </button>
                  {chunkMenuOpen && (
                    <div className="absolute left-0 mt-1 z-20 bg-white border border-gray-300 rounded-lg shadow-lg py-1 min-w-[200px] max-h-80 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setChunkMode('all');
                          setChunkMenuOpen(false);
                          setSelected(0);
                        }}
                        className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                          chunkMode === 'all'
                            ? 'font-bold text-genome-orange'
                            : 'text-gray-800'
                        }`}
                      >
                        {t('analyze.chunkFullItem', {
                          count: result.plies.length,
                        })}
                      </button>
                      {chunks.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setChunkMode(i);
                            setChunkMenuOpen(false);
                            setSelected(c.start);
                          }}
                          className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                            chunkMode === i
                              ? 'font-bold text-genome-orange'
                              : 'text-gray-800'
                          }`}
                        >
                          {t('analyze.chunkItem', {
                            n: i + 2,
                            label: c.label,
                          })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-600">
                  {chunkMode === 'all'
                    ? t('analyze.chunkShowingAll')
                    : t('analyze.chunkShowing', {
                        start: chunks[chunkMode]?.start,
                        end: chunks[chunkMode]?.end,
                      })}
                </span>
              </div>
            )}

            <div ref={chartWrapperRef} key={`w-${chunkMode}`}>
              <GenomeChart
                key={`chart-${chunkMode}`}
                points={chartPoints}
                selectedIndex={selected}
                onSelect={setSelected}
                height={320}
                options={chartOptions}
                onOptionsChange={setChartOptions}
              />
            </div>
            <div className="flex justify-end">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addCurrentChartToSession}
                  disabled={!result || captureActive}
                  className="px-4 py-2 rounded-lg bg-orange-100 hover:bg-orange-200 text-gray-900 text-sm font-medium border border-orange-400 transition disabled:opacity-40"
                >
                  {t('analyze.addCurrentChart')}
                </button>
                <button
                  type="button"
                  onClick={refreshCharts}
                  disabled={!result || captureActive}
                  className="px-4 py-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-gray-900 text-sm font-medium border border-emerald-400 transition disabled:opacity-40"
                >
                  {captureActive ? t('analyze.capturing') : t('analyze.splitIntoChunks')}
                </button>
              </div>
            </div>

            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={analyzeWithNN}
                disabled={nnLoading || !result}
                className="px-4 py-2 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-gray-900 text-sm font-medium border border-indigo-400 transition disabled:opacity-40"
              >
                {nnLoading ? 'Analizando con NN…' : 'Analizar con NN'}
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-gray-800 text-left text-sm">
                  <tr>
                    <th className="p-2 font-semibold">#</th>
                    <th className="p-2 font-semibold">SAN</th>
                    <th className="p-2 font-semibold">L</th>
                    <th className="p-2 font-semibold">
                      L<sub>10</sub>
                    </th>
                    <th className="p-2 font-semibold">D(k)</th>
                    <th className="p-2 font-semibold">R(k)</th>
                    <th className="p-2 font-semibold">NN</th>
                  </tr>
                </thead>
                <tbody>
                  {result.plies.map((p) => (
                    <tr
                      key={p.moveIndex}
                      onClick={() => setSelected(p.moveIndex)}
                      className={`border-t border-gray-200 cursor-pointer ${
                        p.moveIndex === selected
                          ? 'bg-genome-orange/10'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="p-2 font-mono text-gray-900">
                        {p.moveIndex}
                      </td>
                      <td className="p-2 text-gray-900">
                        {p.san ||
                          (p.moveIndex === 0 ? t('analyze.startPos') : '')}
                      </td>
                      <td className="p-2 font-mono text-genome-orange font-semibold">
                        {p.L.toFixed(4)}
                      </td>
                      <td className="p-2 font-mono text-gray-900">
                        {p.L10.toFixed(4)}
                      </td>
                      <td className="p-2 font-mono text-gray-900">
                        {p.diff === null || p.diff === undefined
                          ? '—'
                          : p.diff.toFixed(4)}
                      </td>
                      <td className="p-2 font-mono text-gray-900">
                        {formatRatio(p.ratio)}
                      </td>
                      <td className="p-2 font-mono text-xs text-gray-700">
                        {nnPredictions[p.moveIndex] ? (
                          <span title={`winrate: ${nnPredictions[p.moveIndex].winrate.toFixed(4)}`}>
                            {nnPredictions[p.moveIndex].san}{' '}
                            <span className="text-gray-500">
                              ({nnPredictions[p.moveIndex].winrate.toFixed(2)})
                            </span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.plies.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {t('states.sExactByState', 'S completo por State')}
                  </h3>
                  <button
                    type="button"
                    onClick={async () => {
                      const { Document, Packer, Paragraph, TextRun } = await import('docx');
                      const children: any[] = [];
                      const h: any = result.headers || {};

                      children.push(new Paragraph({ text: 'ChessGenome', heading: 'Heading1' as any }));
                      children.push(new Paragraph({
                        children: [
                          new TextRun({ text: 'Partida: ', bold: true }),
                          new TextRun({ text: `${h.White || '?'} vs ${h.Black || '?'}` }),
                        ],
                      }));
                      children.push(new Paragraph({
                        children: [
                          new TextRun({ text: 'Resultado: ', bold: true }),
                          new TextRun({ text: String(h.Result || '*') }),
                        ],
                      }));
                      const meta = [h.Event, h.Site, h.Date].filter(Boolean).join(' - ');
                      if (meta) {
                        children.push(new Paragraph({
                          children: [
                            new TextRun({ text: 'Evento: ', bold: true }),
                            new TextRun({ text: meta }),
                          ],
                        }));
                      }
                      const firstFen = result.plies[0]?.fen;
                      if (firstFen) {
                        children.push(new Paragraph({
                          children: [
                            new TextRun({ text: 'FEN inicial: ', bold: true }),
                            new TextRun({ text: firstFen, font: 'Consolas', size: 18 }),
                          ],
                        }));
                      }

                      if (result.pgn) {
                        children.push(new Paragraph({ text: 'PGN', heading: 'Heading2' as any }));
                        const pgnLines = String(result.pgn).split('\n');
                        for (const line of pgnLines) {
                          children.push(new Paragraph({
                            children: [
                              new TextRun({ text: line, font: 'Consolas', size: 18 }),
                            ],
                          }));
                        }
                      }

                      children.push(new Paragraph({ text: 'S completo por State', heading: 'Heading2' as any }));
                      for (const p of result.plies) {
                        children.push(new Paragraph({
                          children: [
                            new TextRun({ text: `State ${p.moveIndex}: `, bold: true }),
                            new TextRun({ text: String(p.S_exact || '').replace(/\D/g, ''), font: 'Consolas', size: 18 }),
                          ],
                        }));
                      }
                      const doc = new Document({ sections: [{ children }] });
                      const blob = await Packer.toBlob(doc);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'chessgenome-S-' + Date.now() + '.docx';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="text-xs px-3 py-1 rounded bg-genome-orange text-white hover:opacity-90"
                  >
                    {t('states.downloadDocx', 'Descargar S (.docx)')}
                  </button>
                </div>
                <div className="rounded-xl border border-gray-300 bg-white p-3 space-y-2 max-h-96 overflow-y-auto">
                  {result.plies.map((p) => (
                    <div key={p.moveIndex} className="border-b border-gray-100 pb-2 last:border-0">
                      <p className="text-xs font-semibold text-gray-600 mb-1">
                        State {p.moveIndex} — {p.san || t('analyze.startPos')}
                        {p.S_digits != null && (
                          <span className="ml-2 text-gray-400 font-normal">
                            ({p.S_digits} {t('states.digits', 'dígitos')})
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-gray-900 break-all whitespace-pre-wrap">
                        {p.S_exact || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.plies.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {t('states.sciNotationByState', 'Notación científica S~ por State')}
                  </h3>
                  <button
                    type="button"
                    onClick={async () => {
                      const { Document, Packer, Paragraph, TextRun } = await import('docx');
                      const children: any[] = [];
                      const h: any = result.headers || {};

                      children.push(new Paragraph({ text: 'ChessGenome — Notación científica S~', heading: 'Heading1' as any }));
                      children.push(new Paragraph({
                        children: [
                          new TextRun({ text: 'Partida: ', bold: true }),
                          new TextRun({ text: `${h.White || '?'} vs ${h.Black || '?'}` }),
                        ],
                      }));
                      children.push(new Paragraph({
                        children: [
                          new TextRun({ text: 'Resultado: ', bold: true }),
                          new TextRun({ text: String(h.Result || '*') }),
                        ],
                      }));
                      const meta = [h.Event, h.Site, h.Date].filter(Boolean).join(' - ');
                      if (meta) {
                        children.push(new Paragraph({
                          children: [
                            new TextRun({ text: 'Evento: ', bold: true }),
                            new TextRun({ text: meta }),
                          ],
                        }));
                      }
                      const firstFen = result.plies[0]?.fen;
                      if (firstFen) {
                        children.push(new Paragraph({
                          children: [
                            new TextRun({ text: 'FEN inicial: ', bold: true }),
                            new TextRun({ text: firstFen, font: 'Consolas', size: 18 }),
                          ],
                        }));
                      }

                      if (result.pgn) {
                        children.push(new Paragraph({ text: 'PGN', heading: 'Heading2' as any }));
                        const pgnLines = String(result.pgn).split('\n');
                        for (const line of pgnLines) {
                          children.push(new Paragraph({
                            children: [
                              new TextRun({ text: line, font: 'Consolas', size: 18 }),
                            ],
                          }));
                        }
                      }

                      children.push(new Paragraph({ text: 'Notación científica S~ por State', heading: 'Heading2' as any }));
                      for (const p of result.plies) {
                        children.push(new Paragraph({
                          children: [
                            new TextRun({ text: `State ${p.moveIndex}: `, bold: true }),
                            new TextRun({ text: sciNotation(p.S_exact, 7), font: 'Consolas', size: 18 }),
                          ],
                        }));
                      }
                      const doc = new Document({ sections: [{ children }] });
                      const blob = await Packer.toBlob(doc);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'chessgenome-S-sci-' + Date.now() + '.docx';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:opacity-90"
                  >
                    {t('states.downloadSciDocx', 'Descargar S~ (.docx)')}
                  </button>
                </div>
                <div className="rounded-xl border border-gray-300 bg-white p-3 space-y-2 max-h-96 overflow-y-auto">
                  {result.plies.map((p) => (
                    <div key={p.moveIndex} className="border-b border-gray-100 pb-2 last:border-0">
                      <p className="text-xs font-semibold text-gray-600 mb-1">
                        State {p.moveIndex} — {p.san || t('analyze.startPos')}
                        {p.S_digits != null && (
                          <span className="ml-2 text-gray-400 font-normal">
                            ({p.S_digits} {t('states.digits', 'dígitos')})
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-gray-900 break-all whitespace-pre-wrap">
                        {sciNotation(p.S_exact, 7)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
