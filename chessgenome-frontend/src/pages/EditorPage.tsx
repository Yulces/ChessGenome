import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FenPasteButton } from '../components/FenPasteButton';
import { normalizeFen, loadChessFen } from '../utils/normalizeFen';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { BoardNav } from '../components/BoardNav';
import { validateFenWithChessJs } from '../utils/fen';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY = '8/8/8/8/8/8/8/8 w - - 0 1';

const PALETTE = [
  'wK', 'wQ', 'wR', 'wB', 'wN', 'wP',
  'bK', 'bQ', 'bR', 'bB', 'bN', 'bP',
] as const;

type PalettePiece = (typeof PALETTE)[number] | 'trash';

interface MoveToken {
  n: number;
  white?: string;
  black?: string;
}

/**
 * Genera un PGN completo a partir de un FEN base + lista de SANs.
 */
function buildPgn(baseFen: string, sans: string[]): string {
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

  const headers = [
    `[Event "ChessGenome Editor"]`,
    `[Site "ChessGenome"]`,
    `[Date "${date}"]`,
    `[Round "-"]`,
    `[White "?"]`,
    `[Black "?"]`,
    `[Result "*"]`,
    `[SetUp "1"]`,
    `[FEN "${baseFen}"]`,
  ].join('\n');

  if (sans.length === 0) {
    return `${headers}\n\n*`;
  }

  const isBlackTurn = baseFen.split(' ')[1] === 'b';
  const parts: string[] = [];
  let i = 0;
  let moveNo = 1;

  if (isBlackTurn) {
    parts.push(`${moveNo}... ${sans[0]}`);
    i = 1;
    moveNo++;
  }

  while (i < sans.length) {
    if (i + 1 < sans.length) {
      parts.push(`${moveNo}. ${sans[i]} ${sans[i + 1]}`);
      i += 2;
    } else {
      parts.push(`${moveNo}. ${sans[i]}`);
      i++;
    }
    moveNo++;
  }

  parts.push('*');
  return `${headers}\n\n${parts.join(' ')}`;
}

function buildMoveTokens(baseFen: string, sans: string[]): MoveToken[] {
  const isBlackTurn = baseFen.split(' ')[1] === 'b';
  const tokens: MoveToken[] = [];
  let i = 0;
  let n = 1;

  if (isBlackTurn && sans.length > 0) {
    tokens.push({ n: 1, black: sans[0] });
    i = 1;
    n = 2;
  }

  while (i < sans.length) {
    const white = sans[i];
    const black = i + 1 < sans.length ? sans[i + 1] : undefined;
    tokens.push({ n, white, black });
    i += 2;
    n++;
  }

  return tokens;
}

export function EditorPage({
  initialFen,
  onInitialFenConsumed,
}: {
  initialFen?: string | null;
  onInitialFenConsumed?: () => void;
} = {}) {
  const { t } = useTranslation('genome');

  const [mode, setMode] = useState<'play' | 'edit'>('play');
  const [history, setHistory] = useState<string[]>([START]);
  const [sans, setSans] = useState<string[]>([]); // una entrada por ply jugado
  const [ply, setPly] = useState(0);
  const [selected, setSelected] = useState<PalettePiece | null>(null);
  const [clickFrom, setClickFrom] = useState<string | null>(null);
  const [fenInput, setFenInput] = useState(START);
  const [error, setError] = useState<string | null>(null);
  const [copiedPgn, setCopiedPgn] = useState(false);

  const fen = history[ply] ?? START;
  const baseFen = history[0] ?? START;

  const moveTokens = buildMoveTokens(baseFen, sans);
  const fullPgn = buildPgn(baseFen, sans);

  const goTo = (i: number) => {
    if (i < 0 || i >= history.length) return;
    setPly(i);
    setFenInput(history[i] ?? START);
  };

  /** Cambia la posición base (resetea jugadas) */
  function setBoardFen(next: string) {
    setHistory([next]);
    setPly(0);
    setFenInput(next);
    setSans([]);
  }

  /** Añade una jugada: FEN nuevo + SAN */
  function pushFen(next: string, san: string) {
    const truncatedHist = history.slice(0, ply + 1);
    const truncatedSans = sans.slice(0, ply);
    const newHist = [...truncatedHist, next];
    const newSans = [...truncatedSans, san];
    setHistory(newHist);
    setSans(newSans);
    setPly(newHist.length - 1);
    setFenInput(next);
  }

  /**
   * Convierte el tablero actual a FEN detectando los derechos de enroque
   * según las piezas que estén en las casillas iniciales.
   */
  function boardToFen(g: Chess, side = 'w'): string {
    const parts = g.fen().split(' ');
    const board = parts[0];

    const rows = board.split('/');
    // Devuelve el carácter en (file 0..7 = a..h, rankFromTop 0..7 = 8..1)
    const getSquare = (file: number, rankFromTop: number): string => {
      let c = 0;
      for (const ch of rows[rankFromTop]) {
        if (ch >= '1' && ch <= '8') {
          c += parseInt(ch, 10);
        } else {
          if (c === file) return ch;
          c++;
        }
      }
      return '';
    };

    let rights = '';
    // rankFromTop 7 = rank 1 (blancas), rankFromTop 0 = rank 8 (negras)
    if (getSquare(4, 7) === 'K') {
      if (getSquare(7, 7) === 'R') rights += 'K';
      if (getSquare(0, 7) === 'R') rights += 'Q';
    }
    if (getSquare(4, 0) === 'k') {
      if (getSquare(7, 0) === 'r') rights += 'k';
      if (getSquare(0, 0) === 'r') rights += 'q';
    }
    if (!rights) rights = '-';

    return `${board} ${side} ${rights} - 0 1`;
  }

  // === Drag & drop ===
  function onDrop(src: string, tgt: string, piece?: string) {
    if (mode === 'edit') {
      return onEditDrop(src, tgt, piece || '');
    }
    const g = new Chess(fen);
    try {
      const m = g.move({ from: src, to: tgt, promotion: 'q' });
      if (!m) return false;
      pushFen(g.fen(), m.san); // ← aquí pasamos el SAN
      setError(null);
      return true;
    } catch {
      return false;
    }
  }

  function onEditDrop(src: string, tgt: string, piece: string) {
    try {
      const rebuild = new Chess();
      rebuild.clear();
      const board = fen.split(' ')[0];
      const rows = board.split('/');
      const files = 'abcdefgh';
      for (let r = 0; r < 8; r++) {
        let c = 0;
        for (const ch of rows[r]) {
          if (ch >= '1' && ch <= '8') {
            c += parseInt(ch, 10);
          } else {
            const color = ch === ch.toUpperCase() ? 'w' : 'b';
            const type = ch.toLowerCase() as 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
            const sq = (files[c] + (8 - r)) as any;
            rebuild.put({ type, color }, sq);
            c++;
          }
        }
      }
      if (src && src.length === 2) {
        rebuild.remove(src as any);
      }
      if (piece && tgt) {
        const color = piece[0] === 'w' ? 'w' : 'b';
        const type = piece[1].toLowerCase() as 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
        rebuild.remove(tgt as any);
        rebuild.put({ type, color }, tgt as any);
      }
      setBoardFen(boardToFen(rebuild));
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  function onSquareClickPlay(square: string) {
    if (mode !== 'play') return;

    const g = new Chess(fen);

    // Si no hay origen seleccionado → intentar seleccionar
    if (!clickFrom) {
      const piece = g.get(square as any);
      if (piece && piece.color === g.turn()) {
        setClickFrom(square);
      }
      return;
    }

    // Click en la misma casilla → deseleccionar
    if (clickFrom === square) {
      setClickFrom(null);
      return;
    }

    // Intentar mover
    try {
      const m = g.move({ from: clickFrom, to: square, promotion: 'q' });
      if (m) {
        pushFen(g.fen(), m.san);
        setClickFrom(null);
        setError(null);
        return;
      }
    } catch {
      /* movimiento ilegal */
    }

    // Si falló el movimiento, intentar seleccionar la nueva casilla
    const piece = g.get(square as any);
    if (piece && piece.color === g.turn()) {
      setClickFrom(square);
    } else {
      setClickFrom(null);
    }
  }

  function onSquareClick(square: string) {
    if (mode !== 'edit' || !selected) return;
    try {
      const rebuild = new Chess();
      rebuild.clear();
      const board = fen.split(' ')[0];
      const rows = board.split('/');
      const files = 'abcdefgh';
      for (let r = 0; r < 8; r++) {
        let c = 0;
        for (const ch of rows[r]) {
          if (ch >= '1' && ch <= '8') c += parseInt(ch, 10);
          else {
            const color = ch === ch.toUpperCase() ? 'w' : 'b';
            const type = ch.toLowerCase() as 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
            rebuild.put({ type, color }, (files[c] + (8 - r)) as any);
            c++;
          }
        }
      }
      if (selected === 'trash') {
        rebuild.remove(square as any);
      } else {
        const color = selected[0] === 'w' ? 'w' : 'b';
        const type = selected[1].toLowerCase() as 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
        rebuild.remove(square as any);
        rebuild.put({ type, color }, square as any);
      }
      setBoardFen(boardToFen(rebuild));
    } catch (e) {
      console.warn(e);
    }
  }

  const handleFenApply = useCallback(() => {
    const f0 = normalizeFen(fenInput);
    const msg = validateFenWithChessJs(f0, Chess);
    if (msg) {
      setError(msg);
      return;
    }
    try {
      const g = new Chess();
      if (!loadChessFen(g, f0)) {
        setBoardFen(f0);
        setError(null);
        return;
      }
      const f = g.fen();
      setBoardFen(f);
      setError(null);
    } catch {
      setError(t('calculate.invalidFen'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fenInput]);

  function copyPgnToClipboard() {
    void navigator.clipboard?.writeText(fullPgn);
    setCopiedPgn(true);
    window.setTimeout(() => setCopiedPgn(false), 1500);
  }

  useEffect(() => {
    if (!initialFen) return;
    const raw = normalizeFen(initialFen);
    if (!raw) {
      setError(t('calculate.invalidFen'));
      onInitialFenConsumed?.();
      return;
    }

    let f = normalizeFen(raw);
    try {
      const g = new Chess();
      if (loadChessFen(g, f)) f = g.fen();
    } catch {
      /* keep normalized */
    }

    setHistory([f]);
    setSans([]);
    setPly(0);
    setFenInput(f);
    setError(null);
    setMode('play');
    onInitialFenConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFen]);

  function clearBoard() {
    setBoardFen(EMPTY);
    setSelected(null);
  }

  function reset() {
    setHistory([START]);
    setSans([]);
    setPly(0);
    setFenInput(START);
    setError(null);
    setSelected(null);
    setMode('play');
  }

  const PIECE_GLYPH: Record<string, string> = {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t('editor.title')}</h2>
        <p className="text-base text-gray-700">{t('editor.subtitle')}</p>
      </div>

      {/* === Barra de modo === */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            mode === 'play'
              ? 'bg-genome-orange text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
          onClick={() => {
            setMode('play');
            setSelected(null);
            setClickFrom(null);
          }}
        >
          ♟ {t('editor.play')}
        </button>
        <button
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            mode === 'edit'
              ? 'bg-genome-orange text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
          onClick={() => {
            setMode('edit');
            setClickFrom(null);
          }}
        >
          ✏️ {t('editor.edit')}
        </button>
        <button
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium"
          onClick={clearBoard}
        >
          {t('editor.clear')}
        </button>
        <button
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium"
          onClick={reset}
        >
          {t('common.reset')}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* === Columna izquierda: tablero === */}
        <div className="max-w-md mx-auto w-full space-y-3">
          <Chessboard
            position={fen}
            onPieceDrop={onDrop as any}
            onSquareClick={mode === 'edit' ? onSquareClick : onSquareClickPlay}
            customSquareStyles={
              clickFrom
                ? {
                    [clickFrom]: {
                      background:
                        'radial-gradient(circle, rgba(255,107,0,0.5) 0%, rgba(255,107,0,0.15) 70%, transparent 100%)',
                    },
                  }
                : {}
            }
            boardWidth={Math.min(
              360,
              typeof window !== 'undefined' ? window.innerWidth - 48 : 360,
            )}
            arePiecesDraggable
            boardOrientation="white"
          />

          {mode === 'edit' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-700 text-center">
                {t('editor.paletteHint')}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {PALETTE.map((p, idx) => {
                  const isWhite = p[0] === 'w';
                  const lightSq = idx % 2 === 0;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelected(p)}
                      className={`w-11 h-11 text-3xl leading-none rounded-md border-2 flex items-center justify-center ${
                        selected === p
                          ? 'border-genome-orange ring-2 ring-genome-orange/50'
                          : 'border-gray-300'
                      }`}
                      style={{
                        background: lightSq ? '#f0d9b5' : '#b58863',
                        color: isWhite ? '#f8f8f8' : '#111111',
                        textShadow: isWhite
                          ? '0 0 1px #000, 0 1px 2px #000'
                          : '0 0 1px #fff, 0 1px 1px rgba(255,255,255,0.4)',
                        fontFamily: 'Segoe UI Symbol, DejaVu Sans, serif',
                      }}
                      title={p}
                    >
                      {PIECE_GLYPH[p]}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelected('trash')}
                  className={`w-10 h-10 text-sm rounded-lg border ${
                    selected === 'trash'
                      ? 'border-red-500 bg-red-100'
                      : 'border-gray-300 bg-gray-50'
                  }`}
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            </div>
          )}

          <BoardNav
            index={ply}
            total={history.length}
            onFirst={() => goTo(0)}
            onPrev={() => goTo(ply - 1)}
            onNext={() => goTo(ply + 1)}
            onLast={() => goTo(history.length - 1)}
          />

          <div className="space-y-1">
            <label className="text-xs text-gray-700 uppercase tracking-wide font-semibold">
              {t('common.fen')}
            </label>
            <div className="flex flex-wrap gap-2 items-stretch">
              <input
                type="text"
                value={fenInput}
                onChange={(e) => {
                  setFenInput(e.target.value);
                  setError(null);
                }}
                className={`flex-1 min-w-[180px] bg-white border rounded-lg px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none ${
                  error
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:border-genome-orange'
                }`}
                spellCheck={false}
              />
              <FenPasteButton
                compact
                onPaste={(v) => {
                  setFenInput(v);
                  setError(null);
                }}
              />
              {fenInput.trim() && fenInput.trim() !== fen && (
                <button
                  onClick={handleFenApply}
                  className="px-4 py-2 rounded-lg bg-genome-orange hover:bg-orange-600 text-white text-sm font-medium transition"
                >
                  {t('common.apply')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* === Columna derecha: PGN === */}
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-300 p-3 text-red-800 text-sm">
              {error}
            </div>
          )}

          {/* Cuadro de jugadas automático */}
          <div className="rounded-xl border border-gray-300 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-700 uppercase tracking-wide font-semibold">
                {t('editor.movesLabel')}
              </label>
              <span className="text-xs text-gray-500">
                {sans.length} {t('editor.movesCount')}
              </span>
            </div>

            {moveTokens.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                {t('editor.noMoves')}
              </p>
            ) : (
              <div className="font-mono text-sm max-h-64 overflow-y-auto bg-gray-50 rounded p-2 border border-gray-200">
                {moveTokens.map((tok) => (
                  <div key={tok.n} className="flex gap-3 py-0.5">
                    <span className="text-gray-500 w-8 text-right">
                      {tok.n}.
                    </span>
                    <span className="text-gray-900 w-16">
                      {tok.white || ''}
                    </span>
                    <span className="text-gray-900 w-16">
                      {tok.black || ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={copyPgnToClipboard}
              className="w-full px-3 py-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-gray-900 text-sm font-medium border border-emerald-400 transition"
            >
              {copiedPgn
                ? '✓ ' + t('common.copied')
                : '📋 ' + t('editor.copyPgn')}
            </button>
          </div>

          {/* Preview del PGN */}
          <details className="rounded-xl border border-gray-300 bg-white p-3">
            <summary className="text-xs text-gray-700 uppercase tracking-wide font-semibold cursor-pointer">
              {t('editor.pgnPreview')}
            </summary>
            <textarea
              value={fullPgn}
              readOnly
              rows={10}
              className="mt-2 w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 focus:outline-none"
              spellCheck={false}
            />
          </details>
        </div>
      </div>
    </div>
  );
}
