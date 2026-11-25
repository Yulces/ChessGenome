import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FenPasteButton } from '../components/FenPasteButton';
import { Chess } from 'chess.js';
import { analyzePosition, analyzeGame } from '../services/api';
import { PgnGameList, splitPgnGamesFast } from '../components/PgnGameList';
import { pgnToPlies } from '../utils/pgn';

type Mode = 'fen' | 'pgn';

export function ContributePage() {
  const { t } = useTranslation('genome');
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('fen');
  const [fen, setFen] = useState(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  );
  const [pgn, setPgn] = useState('');
  const [games, setGames] = useState<string[]>([]);
  const [gameIndex, setGameIndex] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyText(text: string, name?: string) {
    const list = splitPgnGamesFast(text);
    setGames(list);
    setGameIndex(0);
    setPgn(list[0] || text);
    setFileName(name || null);
    setError(null);
    setMessage(null);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      applyText(String(reader.result || ''), file.name);
    };
    reader.onerror = () => setError(t('analyze.fileError'));
    reader.readAsText(file);
  }

  function selectGame(i: number) {
    if (i < 0 || i >= games.length) return;
    setGameIndex(i);
    setPgn(games[i]);
    setError(null);
    setMessage(null);
  }

  async function submitFen() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const g = new Chess(fen.trim());
      const data = await analyzePosition(g.fen(), true);
      setMessage(
        data.existsInDb
          ? t('contribute.alreadyStored')
          : t('contribute.storedOk'),
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function submitPgn() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const text = (pgn || '').trim();
      if (!text) throw new Error(t('analyze.parseError'));

      const { headers, fens, sans } = pgnToPlies(text);
      if (note.trim()) headers.Note = note.trim();
      if (fileName) headers.SourceFile = fileName;
      headers.GameIndex = String(gameIndex + 1);

      await analyzeGame(fens, headers, sans);

      let stored = 0;
      for (const f of fens) {
        try {
          await analyzePosition(f, true);
          stored++;
        } catch {
          /* skip */
        }
      }
      setMessage(t('contribute.pgnStored', { count: stored }));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  /** Store selected game only, or all games one by one (optional). */
  async function submitAllGames() {
    if (games.length === 0) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    let totalStored = 0;
    let ok = 0;
    try {
      for (let i = 0; i < games.length; i++) {
        setGameIndex(i);
        setPgn(games[i]);
        try {
          const { headers, fens, sans } = pgnToPlies(games[i]);
          if (note.trim()) headers.Note = note.trim();
          if (fileName) headers.SourceFile = fileName;
          headers.GameIndex = String(i + 1);
          await analyzeGame(fens, headers, sans);
          for (const f of fens) {
            try {
              await analyzePosition(f, true);
              totalStored++;
            } catch {
              /* */
            }
          }
          ok++;
        } catch {
          /* skip broken game */
        }
      }
      setMessage(t('contribute.allStored', { games: ok, positions: totalStored }));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">{t('contribute.title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('contribute.subtitle')}</p>
      </div>

      <div className="flex gap-2">
        <button
          className={`px-3 py-1.5 rounded-lg text-sm ${
            mode === 'fen' ? 'bg-genome-orange text-black' : 'bg-gray-800'
          }`}
          onClick={() => setMode('fen')}
        >
          FEN
        </button>
        <button
          className={`px-3 py-1.5 rounded-lg text-sm ${
            mode === 'pgn' ? 'bg-genome-orange text-black' : 'bg-gray-800'
          }`}
          onClick={() => setMode('pgn')}
        >
          PGN
        </button>
      </div>

      {mode === 'fen' && (
        <div className="space-y-3 max-w-2xl">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-gray-500 uppercase">{t('common.fen')}</label>
            <FenPasteButton compact onPaste={(v) => setFen(v)} />
          </div>
          <textarea
            className="w-full h-24 bg-black/40 border border-gray-700 rounded-xl p-3 font-mono text-xs"
            value={fen}
            onChange={(e) => setFen(e.target.value)}
          />
          <button
            onClick={submitFen}
            disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-genome-orange text-black font-semibold disabled:opacity-40"
          >
            {loading ? t('common.loading') : t('contribute.submitFen')}
          </button>
        </div>
      )}

      {mode === 'pgn' && (
        <div className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".pgn,.txt,application/x-chess-pgn,text/plain"
            className="hidden"
            onChange={onFileChange}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium"
            >
              {t('contribute.loadFile')}
            </button>
            {fileName && (
              <span className="text-xs text-gray-400 font-mono truncate max-w-xs">
                {fileName}
                {games.length > 0 ? ` · ${games.length} ${t('analyze.games')}` : ''}
              </span>
            )}
          </div>

          {/* Same game list technique as Partida */}
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
              <div className="lg:col-span-2 space-y-3">
                <p className="text-xs text-gray-500">{t('contribute.gameListHint')}</p>
                <label className="text-xs text-gray-500 uppercase">
                  PGN #{gameIndex + 1}
                </label>
                <textarea
                  className="w-full h-36 bg-black/40 border border-gray-700 rounded-xl p-3 font-mono text-xs"
                  value={pgn}
                  onChange={(e) => {
                    setPgn(e.target.value);
                    // manual edit of single game text
                  }}
                />
              </div>
            </div>
          )}

          {games.length === 0 && (
            <>
              <label className="text-xs text-gray-500 uppercase">PGN</label>
              <textarea
                className="w-full h-40 bg-black/40 border border-gray-700 rounded-xl p-3 font-mono text-xs max-w-2xl"
                placeholder={t('analyze.placeholder')}
                value={pgn}
                onChange={(e) => {
                  const text = e.target.value;
                  setPgn(text);
                  setFileName(null);
                  // If user pastes multi-game, split like Partida
                  if (text.includes('[Event') && text.split('[Event').length > 2) {
                    applyText(text);
                  } else {
                    setGames([]);
                  }
                }}
              />
            </>
          )}

          <input
            className="w-full max-w-2xl bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder={t('contribute.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={submitPgn}
              disabled={loading || !pgn.trim()}
              className="px-5 py-2.5 rounded-lg bg-genome-orange text-black font-semibold disabled:opacity-40"
            >
              {loading ? t('common.loading') : t('contribute.submitPgn')}
            </button>
            {games.length > 1 && (
              <button
                onClick={submitAllGames}
                disabled={loading}
                className="px-5 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-40"
              >
                {t('contribute.submitAll', { count: games.length })}
              </button>
            )}
          </div>
        </div>
      )}

      {message && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-4 text-gray-900 text-sm font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-900/40 border border-red-700 p-4 text-red-200 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
