import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chessboard } from 'react-chessboard';
import { getFirstTerms, getStats } from '../services/api';

interface Term {
  fen: string;
  L: number;
  L10: number;
  pieceCount: number;
  timesSeen: number;
  hash: string;
}

export function ExplorePage() {
  const { t } = useTranslation('genome');
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Term | null>(null);
  const [copied, setCopied] = useState(false);
  const limit = 25;

  useEffect(() => {
    getStats()
      .then((s) => setTotal(s.admissiblePositions || s.totalPositions || 0))
      .catch(() => setTotal(0));
  }, []);

  const load = (off: number) => {
    setLoading(true);
    setError(null);
    getFirstTerms(limit, off)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        if (list.length === 0) {
          if (off === 0) {
            setTerms([]);
            setOffset(0);
            setHasMore(false);
            setSelected(null);
          } else {
            setHasMore(false);
          }
          return;
        }
        setTerms(list);
        setOffset(off);
        setHasMore(list.length >= limit && off + list.length < (total || Infinity));
        if (selected) {
          const still = list.find((x) => x.hash === selected.hash || x.fen === selected.fen);
          setSelected(still || list[0]);
        }
      })
      .catch(() => {
        if (off === 0 && terms.length === 0) {
          setError(t('explore.loadError'));
        }
        if (off > 0) setHasMore(false);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (total > 0) {
      setHasMore(offset + terms.length < total);
    }
  }, [total, offset, terms.length]);

  const goFirst = () => load(0);
  const goPrev = () => load(Math.max(0, offset - limit));
  const goNext = () => {
    if (!hasMore) return;
    load(offset + limit);
  };
  const goLast = () => {
    if (total <= 0) return;
    const lastOff = Math.max(0, Math.floor((total - 1) / limit) * limit);
    load(lastOff);
  };

  function copyFen(fen: string) {
    void navigator.clipboard?.writeText(fen);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('explore.title')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('explore.subtitle')}</p>
        {total > 0 && (
          <p className="text-xs text-gray-500 mt-1 font-mono">
            {t('explore.totalTerms')}: {total}
          </p>
        )}
      </div>

      {loading && terms.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-genome-card rounded-lg animate-pulse border border-gray-200" />
          ))}
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && terms.length === 0 && (
        <div className="rounded-xl bg-genome-card border border-gray-300 p-8 text-center text-gray-600 text-sm">
          <p>{t('explore.empty')}</p>
        </div>
      )}

      {terms.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 space-y-3">
            <div
              className={`overflow-x-auto rounded-xl border border-gray-300 bg-white ${
                loading ? 'opacity-60' : ''
              }`}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left text-xs text-gray-600 uppercase tracking-wide">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">L</th>
                    <th className="px-4 py-3">L<sub>10</sub></th>
                    <th className="px-4 py-3">{t('explore.pieces')}</th>
                    <th className="px-4 py-3">{t('explore.seen')}</th>
                    <th className="px-4 py-3">FEN</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.map((term, i) => {
                    const active =
                      selected &&
                      (selected.hash === term.hash || selected.fen === term.fen);
                    return (
                      <tr
                        key={term.hash || i}
                        onClick={() => setSelected(term)}
                        className={`border-t border-gray-200 cursor-pointer transition ${
                          active
                            ? 'bg-genome-orange/15'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-2 font-mono text-gray-500">
                          {offset + i + 1}
                        </td>
                        <td className="px-4 py-2 font-mono text-genome-orange">
                          {term.L?.toFixed(4)}
                        </td>
                        <td className="px-4 py-2 font-mono">{term.L10?.toFixed(4)}</td>
                        <td className="px-4 py-2 font-mono">{term.pieceCount}</td>
                        <td className="px-4 py-2 font-mono">{term.timesSeen}</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500 max-w-[12rem] truncate">
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
                disabled={offset === 0 || loading}
                onClick={goFirst}
                title={t('explore.first')}
              >
                ⏮ {t('explore.first')}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                disabled={offset === 0 || loading}
                onClick={goPrev}
              >
                {t('explore.prev')}
              </button>
              <span className="text-xs text-gray-600 font-mono px-2">
                {offset + 1}–{offset + terms.length}
                {total > 0 ? ` / ${total}` : ''}
              </span>
              <button
                className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                disabled={!hasMore || loading}
                onClick={goNext}
              >
                {t('explore.next')}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm disabled:opacity-40"
                disabled={loading || total <= 0 || offset + terms.length >= total}
                onClick={goLast}
                title={t('explore.last')}
              >
                {t('explore.last')} ⏭
              </button>
            </div>
          </div>

          {/* Mini board — CENTRADO en móvil */}
          <div className="rounded-xl border border-gray-300 bg-white p-4 space-y-3 sticky top-4 w-full">
            <p className="text-xs text-gray-600 uppercase tracking-wide text-center">
              {t('explore.preview')}
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
                <div className="text-xs font-mono text-gray-600 space-y-1 text-center">
                  <p>
                    L ={' '}
                    <span className="text-genome-orange">
                      {selected.L?.toFixed(6)}
                    </span>
                  </p>
                  <p>L<sub>10</sub> = {selected.L10?.toFixed(6)}</p>
                </div>
                <p className="font-mono text-[10px] text-gray-500 break-all bg-gray-50 rounded p-2 border border-gray-200">
                  {selected.fen}
                </p>
                <button
                  type="button"
                  onClick={() => copyFen(selected.fen)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-medium"
                >
                  {copied ? t('explore.copied') : t('explore.copyFen')}
                </button>
              </>
            ) : (
              <p className="text-xs text-gray-600 text-center">{t('explore.clickRow')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
