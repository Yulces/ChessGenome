import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { v4 as uuid } from 'uuid';
import type { AnalyzeResult, GameAnalysisResult } from '../types/genome';

// ============================================
// Types
// ============================================

export type SessionItemType = 'analysis' | 'game' | 'search' | 'chart';

export interface SessionItemBase {
  id: string;
  type: SessionItemType;
  capturedAt: string;
  note?: string;
}

export interface SessionAnalysis extends SessionItemBase {
  type: 'analysis';
  source: 'calculate' | 'editor' | 'analyze';
  title: string;
  fen: string;
  L: number;
  L10: number;
  S_exact?: string;
  S_digits?: number;
  pieceCount: number;
  factorization: Record<string, number>;
  staticallyAdmissible: boolean;
  hash?: string;
  rankApprox?: number;
  timesSeen?: number;
  stockfish?: {
    bestMove: string | null;
    bestMoveSan?: string | null;
    ponder?: string | null;
    evaluation?: { type: 'cp' | 'mate'; value: number } | null;
    depth: number;
    pv?: string;
    engine: string;
  };
  neural?: {
    featureCount: number;
    features: number[];
    modelCount?: number;
    corpusSize?: number;
  };
  chartSvg?: string;
  chartTitle?: string;
  chartContext?: string;
}

export interface SessionGamePly {
  moveIndex: number;
  san: string;
  fen: string;
  hash?: string;
  L: number;
  L10: number;
  S_exact?: string;
  S_digits?: number;
  diff: number | null;
  ratio: number | null;
  exponents?: number[];
}

export interface SessionChartPoint {
  index: number;
  san?: string;
  L: number;
  L10: number;
  S_digits: number;
  diff: number | null;
  ratio: number | null;
}

export interface SessionGame extends SessionItemBase {
  type: 'game';
  pgn: string;
  headers: Record<string, string>;
  plyCount: number;
  plies: SessionGamePly[];
  chartSvg?: string;
  /** SVGs capturados automáticamente, uno por tramo de 30 plies */
  chartSvgs?: string[];
  chartPoints?: SessionChartPoint[];
  chartChunkSize?: number;
}

export interface SessionSearch extends SessionItemBase {
  type: 'search';
  filters: Record<string, any>;
  resultCount: number;
  topResults: any[];
}

export interface SessionChart extends SessionItemBase {
  type: 'chart';
  title: string;
  svgData: string;
  context?: string;
}

export type SessionItem =
  | SessionAnalysis
  | SessionGame
  | SessionSearch
  | SessionChart;

export interface SessionState {
  startedAt: string;
  items: SessionItem[];
  lastExportedAt: string | null;
}

// ============================================
// Hashing para deduplicación
// ============================================

/**
 * djb2 hash — rápido, determinista, suficiente para deduplicar
 * items dentro de una sesión (no criptográfico).
 */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * Devuelve la clave de deduplicación según tipo.
 *  - analysis → hash de la posición (el que da el backend)
 *  - game     → hash del PGN completo
 *  - search   → hash de filtros + resultCount
 *  - chart    → hash del SVG completo (title + svgData)
 */
function dedupKey(item: SessionItem): string | null {
  switch (item.type) {
    case 'analysis': {
      if (item.hash) return `a:${item.hash}`;
      return `a:${item.fen.trim()}`;
    }
    case 'game': {
      return `g:${hashString(item.pgn)}`;
    }
    case 'search': {
      return `s:${hashString(JSON.stringify(item.filters))}:${item.resultCount}`;
    }
    case 'chart': {
      return `c:${hashString(item.title + '|' + item.svgData)}`;
    }
    default:
      return null;
  }
}

/**
 * Merge inteligente: solo añade campos que faltan en `existing`.
 * Nunca sobrescribe un campo ya definido, salvo strings más largos
 * (ej: chartSvg que va creciendo).
 */
function mergeItem(existing: SessionItem, incoming: SessionItem): SessionItem {
  const merged: any = { ...existing };

  for (const k of Object.keys(incoming)) {
    if (k === 'id' || k === 'capturedAt' || k === 'type') continue;
    const v = (incoming as any)[k];
    const cur = (existing as any)[k];
    if (v == null) continue;
    if (cur == null) {
      merged[k] = v;
    } else if (typeof v === 'string' && typeof cur === 'string') {
      if (v.length > cur.length) merged[k] = v;
    } else if (typeof v === 'object' && typeof cur === 'object') {
      merged[k] = { ...cur, ...v };
    }
  }
  return merged as SessionItem;
}

function findItemByKeySync(
  state: SessionState,
  key: string,
): SessionItem | null {
  for (const it of state.items) {
    if (dedupKey(it) === key) return it;
  }
  return null;
}

// ============================================
// Reducer
// ============================================

type Action =
  | { type: 'ADD_ANALYSIS'; payload: Omit<SessionAnalysis, 'id' | 'capturedAt' | 'type'>; id: string }
  | { type: 'ADD_GAME'; payload: Omit<SessionGame, 'id' | 'capturedAt' | 'type'>; id: string }
  | { type: 'ADD_SEARCH'; payload: Omit<SessionSearch, 'id' | 'capturedAt' | 'type'>; id: string }
  | { type: 'ADD_CHART'; payload: Omit<SessionChart, 'id' | 'capturedAt' | 'type'>; id: string }
  | { type: 'UPDATE_ANALYSIS'; id: string; patch: Partial<SessionAnalysis> }
  | { type: 'UPDATE_GAME'; id: string; patch: Partial<SessionGame> }
  | { type: 'REMOVE_ITEM'; id: string }
  | { type: 'UPDATE_NOTE'; id: string; note: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'RESTORE'; state: SessionState };

const initialState: SessionState = {
  startedAt: new Date().toISOString(),
  items: [],
  lastExportedAt: null,
};

function addDeduped(
  state: SessionState,
  item: SessionItem,
): SessionState {
  const key = dedupKey(item);
  if (!key) {
    return { ...state, items: [...state.items, item] };
  }

  const idx = state.items.findIndex((it) => dedupKey(it) === key);
  if (idx >= 0) {
    const merged = mergeItem(state.items[idx], item);
    const newItems = state.items.slice();
    newItems[idx] = merged;
    return { ...state, items: newItems };
  }
  return { ...state, items: [...state.items, item] };
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'ADD_ANALYSIS': {
      const item: SessionAnalysis = {
        ...action.payload,
        id: action.id,
        type: 'analysis',
        capturedAt: new Date().toISOString(),
      };
      return addDeduped(state, item);
    }

    case 'ADD_GAME': {
      const item: SessionGame = {
        ...action.payload,
        id: action.id,
        type: 'game',
        capturedAt: new Date().toISOString(),
      };
      return addDeduped(state, item);
    }

    case 'ADD_SEARCH': {
      const item: SessionSearch = {
        ...action.payload,
        id: action.id,
        type: 'search',
        capturedAt: new Date().toISOString(),
      };
      return addDeduped(state, item);
    }

    case 'ADD_CHART': {
      const item: SessionChart = {
        ...action.payload,
        id: action.id,
        type: 'chart',
        capturedAt: new Date().toISOString(),
      };
      return addDeduped(state, item);
    }

    case 'UPDATE_ANALYSIS':
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id
            ? ({ ...it, ...action.patch } as SessionItem)
            : it,
        ),
      };

    case 'UPDATE_GAME':
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id
            ? ({ ...it, ...action.patch } as SessionItem)
            : it,
        ),
      };

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((it) => it.id !== action.id),
      };

    case 'UPDATE_NOTE':
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id ? { ...it, note: action.note } : it,
        ),
      };

    case 'CLEAR_ALL':
      return {
        ...initialState,
        startedAt: new Date().toISOString(),
      };

    case 'RESTORE':
      return action.state;

    default:
      return state;
  }
}

// ============================================
// Context
// ============================================

const STORAGE_KEY = 'chessgenome-session-v2';

interface SessionContextValue {
  state: SessionState;
  addAnalysis: (
    data: Omit<SessionAnalysis, 'id' | 'capturedAt' | 'type'>,
  ) => string;
  addGame: (data: Omit<SessionGame, 'id' | 'capturedAt' | 'type'>) => string;
  addSearch: (data: Omit<SessionSearch, 'id' | 'capturedAt' | 'type'>) => void;
  addChart: (data: Omit<SessionChart, 'id' | 'capturedAt' | 'type'>) => void;
  updateAnalysis: (id: string, patch: Partial<SessionAnalysis>) => void;
  updateGame: (id: string, patch: Partial<SessionGame>) => void;
  removeItem: (id: string) => void;
  updateNote: (id: string, note: string) => void;
  clearAll: () => void;
  restore: (state: SessionState) => void;
  hasContent: boolean;
  countsByType: Record<SessionItemType, number>;
  /** Devuelve el ID del item existente que ya coincide con esa clave, o null. */
  findItemIdByKey: (key: string) => string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SessionState;
        if (parsed && Array.isArray(parsed.items)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return initialState;
  });

  // Ref sincronizado con el estado actual (para consultas síncronas
  // dentro de add* sin provocar re-render extra).
  const stateRef = useRef<SessionState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Session persistence failed', e);
    }
  }, [state]);

  const addAnalysis = useCallback(
    (data: Omit<SessionAnalysis, 'id' | 'capturedAt' | 'type'>) => {
      const key = data.hash ? `a:${data.hash}` : `a:${data.fen.trim()}`;
      const existing = findItemByKeySync(stateRef.current, key);
      if (existing) return existing.id;

      const id = uuid();
      dispatch({ type: 'ADD_ANALYSIS', payload: data, id });
      return id;
    },
    [],
  );

  const addGame = useCallback(
    (data: Omit<SessionGame, 'id' | 'capturedAt' | 'type'>) => {
      const key = `g:${hashString(data.pgn)}`;
      const existing = findItemByKeySync(stateRef.current, key);
      if (existing) return existing.id;

      const id = uuid();
      dispatch({ type: 'ADD_GAME', payload: data, id });
      return id;
    },
    [],
  );

  const addSearch = useCallback(
    (data: Omit<SessionSearch, 'id' | 'capturedAt' | 'type'>) => {
      const key = `s:${hashString(JSON.stringify(data.filters))}:${data.resultCount}`;
      const existing = findItemByKeySync(stateRef.current, key);
      if (existing) return;
      dispatch({ type: 'ADD_SEARCH', payload: data, id: uuid() });
    },
    [],
  );

  const addChart = useCallback(
    (data: Omit<SessionChart, 'id' | 'capturedAt' | 'type'>) => {
      // Permitir múltiples charts (no deduplicar por contenido).
      // Si quieres deduplicar, comenta la siguiente línea.
      dispatch({ type: 'ADD_CHART', payload: data, id: uuid() });
    },
    [],
  );

  const updateAnalysis = useCallback(
    (id: string, patch: Partial<SessionAnalysis>) =>
      dispatch({ type: 'UPDATE_ANALYSIS', id, patch }),
    [],
  );

  const updateGame = useCallback(
    (id: string, patch: Partial<SessionGame>) =>
      dispatch({ type: 'UPDATE_GAME', id, patch }),
    [],
  );

  const removeItem = useCallback(
    (id: string) => dispatch({ type: 'REMOVE_ITEM', id }),
    [],
  );

  const updateNote = useCallback(
    (id: string, note: string) => dispatch({ type: 'UPDATE_NOTE', id, note }),
    [],
  );

  const clearAll = useCallback(() => dispatch({ type: 'CLEAR_ALL' }), []);

  const restore = useCallback(
    (state: SessionState) => dispatch({ type: 'RESTORE', state }),
    [],
  );

  const findItemIdByKey = useCallback(
    (key: string): string | null => {
      const found = findItemByKeySync(stateRef.current, key);
      return found?.id ?? null;
    },
    [],
  );

  const countsByType: Record<SessionItemType, number> = {
    analysis: state.items.filter((i) => i.type === 'analysis').length,
    game: state.items.filter((i) => i.type === 'game').length,
    search: state.items.filter((i) => i.type === 'search').length,
    chart: state.items.filter((i) => i.type === 'chart').length,
  };

  const value: SessionContextValue = {
    state,
    addAnalysis,
    addGame,
    addSearch,
    addChart,
    updateAnalysis,
    updateGame,
    removeItem,
    updateNote,
    clearAll,
    restore,
    hasContent: state.items.length > 0,
    countsByType,
    findItemIdByKey,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return ctx;
}

// ============================================
// Helpers
// ============================================

export function analyzeResultToAnalysis(
  result: AnalyzeResult,
  fen: string,
  source: SessionAnalysis['source'],
  title: string,
): Omit<SessionAnalysis, 'id' | 'capturedAt' | 'type'> {
  return {
    source,
    title,
    fen,
    L: result.L,
    L10: result.L10,
    S_exact: result.S_exact,
    S_digits: result.S_digits,
    pieceCount: result.pieceCount,
    factorization: result.factorization || {},
    staticallyAdmissible: result.staticallyAdmissible,
    hash: result.hash,
    rankApprox: result.rankApprox,
    timesSeen: result.timesSeen,
  };
}

export function gameResultToGame(
  data: GameAnalysisResult,
  pgn: string,
): Omit<SessionGame, 'id' | 'capturedAt' | 'type'> {
  return {
    pgn,
    headers: data.headers || {},
    plyCount: data.plies.length,
    plies: data.plies.map((p) => ({
      moveIndex: p.moveIndex,
      san: p.san,
      fen: p.fen,
      hash: (p as any).hash,
      L: p.L,
      L10: p.L10,
      S_exact: (p as any).S_exact,
      S_digits: p.S_digits,
      diff: p.diff,
      ratio: p.ratio,
      exponents: p.exponents,
    })),
    chartPoints: data.plies.map((p) => ({
      index: p.moveIndex,
      san: p.san,
      L: p.L,
      L10: p.L10,
      S_digits: p.S_digits ?? 0,
      diff: p.diff,
      ratio: p.ratio ?? null,
    })),
    chartChunkSize: 30,
  };
}
