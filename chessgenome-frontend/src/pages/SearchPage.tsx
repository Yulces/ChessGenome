import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Chessboard } from 'react-chessboard';
import {
  searchAdvanced,
  searchPosition,
  getTopByL10,
  getFirstTerms,
  getTransitions,
  getStats,
  type AdvancedSearchParams,
} from '../services/api';
import { useSession } from '../context/SessionContext';

interface PositionRow {
  fen: string;
  L: number;
  L10: number;
  pieceCount: number;
  timesSeen: number;
  hash: string;
  S_exact?: string;
  S_digits?: number;
  factorization?: Record<string, number>;
  staticallyAdmissible?: boolean;
}

const PAGE_SIZE = 50;
const EXPLORE_PAGE_SIZE = 25;

type Tab = 'search' | 'explore';

export function SearchPage() {
  const { t } = useTranslation('genome');
  const { addSearch, addAnalysis } = useSession();
  const [tab, setTab] = useState<Tab>('search');

  // =====================
  // SEARCH TAB STATE
  // =====================
  const [fenQuery, setFenQuery] = useState('');
  const [minL10, setMinL10] = useState('');
  const [maxL10, setMaxL10] = useState('');
  const [minPieces, setMinPieces] = useState('');
  const [maxPieces, setMaxPieces] = useState('');
  const [minTimesSeen, setMinTimesSeen] = useState('');
  const [admissibleOnly, setAdmissibleOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'L10' | 'L' | 'timesSeen' | 'pieceCount'>('L10');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const [rows, setRows] = useState<PositionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PositionRow | null>(null);
  const [transitions, setTransitions] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  // =====================
  // EXPLORE TAB STATE
  // =====================
  const [exTerms, setExTerms] = useState<PositionRow[]>([]);
  const [exTotal, setExTotal] = useState(0);
  const [exOffset, setExOffset] = useState(0);
  const [exLoading, setExLoading] = useState(false);
  const [exError, setExError] = useState<string | null>(null);
  const [exHasMore, setExHasMore] = useState(true);
  const [exSelected, setExSelected] = useState<PositionRow | null>(null);
  const [exCopied, setExCopied] = useState(false);

  // =====================
  // SEARCH TAB
  // =====================
  const load = useCallback(
    async (newOffset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const params: AdvancedSearchParams = {
          sortBy,
          order,
          limit: PAGE_SIZE,
          offset: newOffset,
          admissibleOnly,
        };
        if (minL10 !== '') params.minL10 = parseFloat(minL10);
        if (maxL10 !== '') params.maxL10 = parseFloat(maxL10);
        if (minPieces !== '') params.minPieces = parseInt(minPieces, 10);
        if (maxPieces !== '') params.maxPieces = parseInt(maxPieces, 10);
        if (minTimesSeen !== '') params.minTimesSeen = parseInt(minTimesSeen, 10);

        const data = await searchAdvanced(params);
        setRows(data.results as PositionRow[]);
        setTotal(data.total);
        setOffset(newOffset);
        if (data.results.length > 0) {
          setSelected(data.results[0] as PositionRow);
        } else {
          setSelected(null);
        }

        if (newOffset === 0) {
          try {
            addSearch({
              filters: {
                minL10: params.minL10 ?? null,
                maxL10: params.maxL10 ?? null,
                minPieces: params.minPieces ?? null,
                maxPieces: params.maxPieces ?? null,
                minTimesSeen: params.minTimesSeen ?? null,
                admissibleOnly: params.admissibleOnly ?? false,
                sortBy: params.sortBy,
                order: params.order,
              },
              resultCount: data.total,
              topResults: (data.results as PositionRow[]).slice(0, 10),
            });
          } catch (e) {
            console.warn('Session capture failed', e);
          }
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    },
    [minL10, maxL10, minPieces, maxPieces, minTimesSeen, admissibleOnly, sortBy, order, addSearch],
  );

  useEffect(() => {
    if (tab !== 'search') return;
    (async () => {
      setLoading(true);
      try {
        const data = await getTopByL10(50);
        setRows(data as PositionRow[]);
        setTotal(data.length);
        setOffset(0);
        if (data.length > 0) setSelected(data[0] as PositionRow);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!selected?.hash) {
      setTransitions([]);
      return;
    }
    getTransitions(selected.hash)
      .then((tr) => setTransitions(Array.isArray(tr) ? tr : []))
      .catch(() => setTransitions([]));
  }, [selected?.hash]);

  async function onSearchFen() {
    if (!fenQuery.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await searchPosition(fenQuery.trim());
      if (r.found && r.positions?.length) {
        setRows(r.positions as PositionRow[]);
        setTotal(r.positions.length);
        setOffset(0);
        setSelected(r.positions[0] as PositionRow);

        try {
          const first = r.positions[0] as PositionRow;
          addAnalysis({
            source: 'search',
            title: 'Posición encontrada por FEN',
            fen: first.fen,
            L: first.L,
            L10: first.L10,
            S_exact: first.S_exact,
            S_digits: first.S_digits,
            pieceCount: first.pieceCount,
            factorization: first.factorization || {},
            staticallyAdmissible: first.staticallyAdmissible ?? true,
            hash: first.hash,
            timesSeen: first.timesSeen,
          });
        } catch (e) {
          console.warn('Session capture failed', e);
        }
      } else {
        setRows([]);
        setTotal(0);
        setSelected(null);
        setError(t('search.notFound'));
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // =====================
  // EXPLORE TAB
  // =====================
  const loadExplore = useCallback(
    async (newOffset = 0) => {
      setExLoading(true);
      setExError(null);
      try {
        const data = await getFirstTerms(EXPLORE_PAGE_SIZE, newOffset);
        const list = Array.isArray(data) ? (data as PositionRow[]) : [];
        if (list.length === 0) {
          if (newOffset === 0) {
            setExTerms([]);
            setExOffset(0);
            setExHasMore(false);
            setExSelected(null);
          } else {
            setExHasMore(false);
          }
          return;
        }
        setExTerms(list);
        setExOffset(newOffset);
        setExHasMore(list.length >= EXPLORE_PAGE_SIZE);
        setExSelected(list[0]);
      } catch (e: any) {
        setExError(e?.message || String(e));
      } finally {
        setExLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (tab !== 'explore') return;
    (async () => {
      try {
        const s = await getStats();
        setExTotal(s.admissiblePositions || s.totalPositions || 0);
      } catch {
        setExTotal(0);
      }
      loadExplore(0);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function goExploreFirst() {
    loadExplore(0);
  }
  function goExplorePrev() {
    loadExplore(Math.max(0, exOffset - EXPLORE_PAGE_SIZE));
  }
  function goExploreNext() {
    if (!exHasMore) return;
    loadExplore(exOffset + EXPLORE_PAGE_SIZE);
  }
  function goExploreLast() {
    if (exTotal <= 0) return;
    const lastOff = Math.max(0, Math.floor((exTotal - 1) / EXPLORE_PAGE_SIZE) * EXPLORE_PAGE_SIZE);
    loadExplore(lastOff);
  }

  function copyFen(fen: string) {
    void navigator.clipboard?.writeText(fen);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  function copyExFen(fen: string) {
    void navigator.clipboard?.writeText(fen);
    setExCopied(true);
    window.setTimeout(() => setExCopied(false), 1500);
  }

  function digitsFromL10(l10: number): number {
    return Math.floor(l10) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">
          {tab === 'search' ? t('search.title') : t('explore.title')}
        </h2>
        <p className="text-gray-700 text-base mt-1">
          {tab === 'search' ? t('search.subtitle') : t('explore.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('search')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
            tab === 'search'
              ? 'border-genome-orange text-genome-orange'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          🔍 {t('search.tabSearch')}
        </button>
        <button
          type="button"
          onClick={() => setTab('explore')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
            tab === 'explore'
              ? 'border-genome-orange text-genome-orange'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          🌐 {t('search.tabExplore')}
        </button>
      </div>

      {/* ============================================ */}
      {/* TAB: BÚSQUEDA AVANZADA                       */}
      {/* ============================================ */}
      {tab === 'search' && (
        <>
          <div className="bg-white border border-gray-300 rounded-xl p-4 space-y-3">
            <h3 className="text-base font-semibold text-gray-800">
              {t('search.byFen')}
            </h3>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={fenQuery}
                onChange={(e) => setFenQuery(e.target.value)}
                placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                className="flex-1 min-w-[280px] bg-white border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm text-gray-900"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={onSearchFen}
                disabled={loading || !fenQuery.trim()}
                className="px-4 py-2 rounded-lg bg-genome-orange text-white font-semibold text-sm disabled:opacity-40"
              >
                {loading ? t('common.loading') : t('search.searchBtn')}
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-300 rounded-xl p-4 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">
              {t('search.advancedTitle')}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('search.minL10')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={minL10}
                  onChange={(e) => setMinL10(e.target.value)}
                  placeholder="0"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('search.maxL10')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={maxL10}
                  onChange={(e) => setMaxL10(e.target.value)}
                  placeholder="250"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('search.minPieces')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={32}
                  value={minPieces}
                  onChange={(e) => setMinPieces(e.target.value)}
                  placeholder="0"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('search.maxPieces')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={32}
                  value={maxPieces}
                  onChange={(e) => setMaxPieces(e.target.value)}
                  placeholder="32"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('search.minTimesSeen')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={minTimesSeen}
                  onChange={(e) => setMinTimesSeen(e.target.value)}
                  placeholder="0"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={admissibleOnly}
                    onChange={(e) => setAdmissibleOnly(e.target.checked)}
                    className="rounded border-gray-400"
                  />
                  {t('search.admissibleOnly')}
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-gray-200">
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('search.sortBy')}
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                >
                  <option value="L10">L₁₀</option>
                  <option value="L">L</option>
                  <option value="timesSeen">{t('search.timesSeen')}</option>
                  <option value="pieceCount">{t('search.pieces')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('search.order')}
                </label>
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value as any)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                >
                  <option value="desc">{t('search.desc')}</option>
                  <option value="asc">{t('search.asc')}</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => load(0)}
                  disabled={loading}
                  className="w-full px-4 py-2 rounded-lg bg-genome-orange text-white font-semibold text-sm disabled:opacity-40"
                >
                  {loading ? t('common.loading') : t('search.applyFilters')}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-300 p-4 text-red-800 text-base">
              {error}
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700">
                  {t('search.results')}: <strong>{total}</strong>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={offset === 0 || loading}
                    onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
                    className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                  >
                    ←
                  </button>
                  <span className="text-sm text-gray-700 font-mono self-center">
                    {offset + 1}–{Math.min(offset + rows.length, total)}
                  </span>
                  <button
                    type="button"
                    disabled={offset + rows.length >= total || loading}
                    onClick={() => load(offset + PAGE_SIZE)}
                    className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-800 text-left">
                    <tr>
                      <th className="p-2 font-semibold">L₁₀</th>
                      <th className="p-2 font-semibold">{t('search.cifras')}</th>
                      <th className="p-2 font-semibold">L</th>
                      <th className="p-2 font-semibold">{t('search.pieces')}</th>
                      <th className="p-2 font-semibold">{t('search.timesSeen')}</th>
                      <th className="p-2 font-semibold">FEN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={r.hash || i}
                        onClick={() => setSelected(r)}
                        className={`border-t border-gray-200 cursor-pointer ${
                          selected?.hash === r.hash ? 'bg-genome-orange/10' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="p-2 font-mono text-genome-orange font-semibold">
                          {r.L10?.toFixed(4)}
                        </td>
                        <td className="p-2 font-mono text-gray-700">
                          ~{digitsFromL10(r.L10)}
                        </td>
                        <td className="p-2 font-mono text-gray-700">{r.L?.toFixed(2)}</td>
                        <td className="p-2 font-mono text-gray-900">{r.pieceCount}</td>
                        <td className="p-2 font-mono text-gray-900">{r.timesSeen}</td>
                        <td className="p-2 font-mono text-xs text-gray-600 max-w-[14rem] truncate">
                          {r.fen}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && !loading && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-gray-600">
                          {t('search.noResults')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-gray-300 bg-white p-4 space-y-3 sticky top-4 w-full">
              <p className="text-xs text-gray-600 uppercase tracking-wide text-center font-semibold">
                {t('search.preview')}
              </p>
              {selected ? (
                <>
                  <div className="mx-auto flex justify-center">
                    <Chessboard
                      position={selected.fen}
                      arePiecesDraggable={false}
                      boardWidth={Math.min(
                        240,
                        typeof window !== 'undefined' ? window.innerWidth - 80 : 240,
                      )}
                    />
                  </div>

                  <div className="text-sm font-mono text-gray-700 space-y-1 text-center">
                    <p>
                      L₁₀ ={' '}
                      <span className="text-genome-orange font-bold">
                        {selected.L10?.toFixed(4)}
                      </span>{' '}
                      <span className="text-gray-500">
                        (~{digitsFromL10(selected.L10)} cifras)
                      </span>
                    </p>
                    <p>L = {selected.L?.toFixed(4)}</p>
                    <p>{t('search.pieces')}: {selected.pieceCount}</p>
                    <p>{t('search.timesSeen')}: {selected.timesSeen}</p>
                  </div>

                  <div className="bg-gray-50 rounded p-2 border border-gray-200">
                    <p className="font-mono text-xs text-gray-700 break-all">
                      {selected.fen}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyFen(selected.fen)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
                  >
                    {copied ? '✓' : t('search.copyFen')}
                  </button>

                  {transitions.length > 0 && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                        {t('search.transitions')} ({transitions.length})
                      </p>
                      <ul className="text-xs font-mono text-gray-700 space-y-0.5 max-h-32 overflow-y-auto">
                        {transitions.slice(0, 20).map((tr, i) => (
                          <li key={i} className="truncate">
                            {tr.moveUci || tr.toHash || JSON.stringify(tr).slice(0, 40)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600 text-center">
                  {t('search.clickRow')}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ============================================ */}
      {/* TAB: EXPLORAR GENOMA                          */}
      {/* ============================================ */}
      {tab === 'explore' && (
        <>
          {exTotal > 0 && (
            <p className="text-sm text-gray-700">
              {t('explore.totalTerms')}: <strong>{exTotal}</strong>
            </p>
          )}

          {exError && (
            <div className="rounded-xl bg-red-50 border border-red-300 p-4 text-red-800 text-base">
              {exError}
            </div>
          )}

          {exTerms.length === 0 && !exLoading && (
            <div className="rounded-xl bg-white border border-gray-300 p-8 text-center text-gray-700">
              {t('explore.empty')}
            </div>
          )}

          {exTerms.length > 0 && (
            <div className="grid lg:grid-cols-3 gap-4 items-start">
              <div className="lg:col-span-2 space-y-3">
                <div className="overflow-x-auto rounded-xl border border-gray-300 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-gray-800 text-left text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">L</th>
                        <th className="px-3 py-2">L₁₀</th>
                        <th className="px-3 py-2">{t('explore.pieces')}</th>
                        <th className="px-3 py-2">{t('explore.seen')}</th>
                        <th className="px-3 py-2">FEN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exTerms.map((term, i) => {
                        const active = exSelected?.hash === term.hash;
                        return (
                          <tr
                            key={term.hash || i}
                            onClick={() => setExSelected(term)}
                            className={`border-t border-gray-200 cursor-pointer ${
                              active ? 'bg-genome-orange/15' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-3 py-2 font-mono text-gray-500">
                              {exOffset + i + 1}
                            </td>
                            <td className="px-3 py-2 font-mono text-genome-orange font-semibold">
                              {term.L?.toFixed(4)}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-800">
                              {term.L10?.toFixed(4)}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-800">
                              {term.pieceCount}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-800">
                              {term.timesSeen}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-600 max-w-[14rem] truncate">
                              {term.fen}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-2 justify-center items-center">
                  <button
                    className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                    disabled={exOffset === 0 || exLoading}
                    onClick={goExploreFirst}
                  >
                    ⏮ {t('explore.first')}
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                    disabled={exOffset === 0 || exLoading}
                    onClick={goExplorePrev}
                  >
                    {t('explore.prev')}
                  </button>
                  <span className="text-xs text-gray-600 font-mono px-2">
                    {exOffset + 1}–{exOffset + exTerms.length}
                    {exTotal > 0 ? ` / ${exTotal}` : ''}
                  </span>
                  <button
                    className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                    disabled={!exHasMore || exLoading}
                    onClick={goExploreNext}
                  >
                    {t('explore.next')}
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                    disabled={exLoading || exTotal <= 0 || exOffset + exTerms.length >= exTotal}
                    onClick={goExploreLast}
                  >
                    {t('explore.last')} ⏭
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-gray-300 bg-white p-4 space-y-3 sticky top-4 w-full">
                <p className="text-xs text-gray-600 uppercase tracking-wide text-center font-semibold">
                  {t('explore.preview')}
                </p>
                {exSelected ? (
                  <>
                    <div className="mx-auto flex justify-center">
                      <Chessboard
                        position={exSelected.fen}
                        arePiecesDraggable={false}
                        boardWidth={Math.min(
                          240,
                          typeof window !== 'undefined' ? window.innerWidth - 80 : 240,
                        )}
                      />
                    </div>

                    <div className="text-sm font-mono text-gray-700 space-y-1 text-center">
                      <p>
                        L ={' '}
                        <span className="text-genome-orange font-bold">
                          {exSelected.L?.toFixed(6)}
                        </span>
                      </p>
                      <p>L₁₀ = {exSelected.L10?.toFixed(6)}</p>
                      <p>{t('explore.pieces')}: {exSelected.pieceCount}</p>
                      <p>{t('explore.seen')}: {exSelected.timesSeen}</p>
                    </div>

                    <div className="bg-gray-50 rounded p-2 border border-gray-200">
                      <p className="font-mono text-xs text-gray-700 break-all">
                        {exSelected.fen}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => copyExFen(exSelected.fen)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
                    >
                      {exCopied ? '✓' : t('explore.copyFen')}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-600 text-center">
                    {t('explore.clickRow')}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
