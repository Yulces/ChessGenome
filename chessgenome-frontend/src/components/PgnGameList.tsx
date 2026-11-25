import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export interface PgnGameMeta {
  index: number;
  pgn: string;
  white: string;
  black: string;
  result: string;
  event: string;
  date: string;
  movesApprox: number;
}

function tag(pgn: string, name: string): string {
  const re = new RegExp('\\[' + name + '\\s+"([^"]*)"\\]', 'i');
  const m = pgn.match(re);
  return m ? m[1] : '';
}

export function parseGameMetaFast(pgn: string, index: number): PgnGameMeta {
  const moveNums = pgn.match(/\b\d+\.\s/g);
  const movesApprox = moveNums ? moveNums.length * 2 : 0;
  return {
    index,
    pgn,
    white: tag(pgn, 'White') || '?',
    black: tag(pgn, 'Black') || '?',
    result: tag(pgn, 'Result') || '*',
    event: tag(pgn, 'Event') || '',
    date: tag(pgn, 'Date') || '',
    movesApprox,
  };
}

export function splitPgnGamesFast(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
  if (!normalized) return [];

  const looksLikeGame = (chunk: string) => {
    const c = chunk.trim();
    if (c.length < 20) return false;
    if (/\d+\.\s*\S+/.test(c)) return true;
    if (/\[FEN\s/i.test(c) && /\b[KQRBN]?[a-h][1-8]\b/.test(c.replace(/\[[^\]]*\]/g, ' ')))
      return true;
    return false;
  };

  let parts = normalized.split(/\n(?=\[Event\s)/i).map((p) => p.trim()).filter(Boolean);
  let games = parts.filter(looksLikeGame);
  if (games.length === 0 && parts.length === 1) {
    return [normalized];
  }
  if (games.length >= 1) return games;

  parts = normalized
    .split(/\n\s*\n(?=\[(?:Event|White|Black)\s)/i)
    .map((p) => p.trim())
    .filter(Boolean);
  games = parts.filter(looksLikeGame);
  if (games.length >= 1) return games;

  return [normalized];
}

interface Props {
  games: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  fileName?: string | null;
  className?: string;
}

const PAGE = 80;

export function PgnGameList({
  games,
  selectedIndex,
  onSelect,
  fileName,
  className = '',
}: Props) {
  const { t } = useTranslation('genome');
  const [filter, setFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE);

  const metas = useMemo(
    () => games.map((g, i) => parseGameMetaFast(g, i)),
    [games],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return metas;
    return metas.filter(
      (m) =>
        m.white.toLowerCase().includes(q) ||
        m.black.toLowerCase().includes(q) ||
        m.event.toLowerCase().includes(q) ||
        m.result.includes(q) ||
        String(m.index + 1).includes(q),
    );
  }, [metas, filter]);

  const shown = filtered.slice(0, visibleCount);

  const onFilter = useCallback((v: string) => {
    setFilter(v);
    setVisibleCount(PAGE);
  }, []);

  if (games.length === 0) return null;

  return (
    <div
      className={`rounded-xl border border-gray-300 bg-white shadow-lg flex flex-col max-h-[28rem] ${className}`}
      role="dialog"
      aria-label={t('analyze.gameList')}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-genome-orange truncate">
            {t('analyze.gameList')}
          </p>
          <p className="text-xs text-gray-700 truncate">
            {fileName || t('analyze.games')} · {games.length}
            {filter ? ` · ${filtered.length} ${t('analyze.filterHit')}` : ''}
          </p>
        </div>
      </div>

      <div className="px-2 py-2 border-b border-gray-200">
        <input
          type="search"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder={t('analyze.filterGames')}
          className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
        />
      </div>

      <ul className="overflow-y-auto flex-1 text-sm divide-y divide-gray-200">
        {shown.map((m) => (
          <li key={m.index}>
            <button
              type="button"
              onClick={() => onSelect(m.index)}
              className={`w-full text-left px-3 py-2 transition ${
                m.index === selectedIndex
                  ? 'bg-genome-orange/15 border-l-4 border-genome-orange'
                  : 'hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium text-gray-900 truncate">
                  <span className="text-gray-500 font-mono text-xs mr-1">
                    #{m.index + 1}
                  </span>
                  {m.white} – {m.black}
                </span>
                <span className="font-mono text-sm text-genome-orange font-semibold shrink-0">
                  {m.result}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-0.5 truncate">
                {[m.event, m.date, m.movesApprox ? `~${m.movesApprox}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-4 text-sm text-gray-600 text-center">
            {t('analyze.noGamesMatch')}
          </li>
        )}
      </ul>

      {visibleCount < filtered.length && (
        <button
          type="button"
          className="text-sm py-2 border-t border-gray-200 text-genome-orange font-medium hover:bg-gray-50"
          onClick={() => setVisibleCount((c) => c + PAGE)}
        >
          {t('analyze.showMore')} ({filtered.length - visibleCount})
        </button>
      )}
    </div>
  );
}
