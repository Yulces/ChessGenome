import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chessboard } from 'react-chessboard';
import { analyzePosition, getStats } from '../services/api';
import { normalizeFen } from '../utils/normalizeFen';
import { FenPasteButton } from '../components/FenPasteButton';
import type { AnalyzeResult } from '../types/genome';

const START =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY_BOARD = '8/8/8/8/8/8/8/8 w - - 0 1';

const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
  73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151,
  157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233,
  239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311,
];

/** Metadata primes beyond the board set (article extended FIDE encoding). */
const P_TURN = 313;
const P_CASTLE = 317;
const P_EP = 331;

const SQUARES = (() => {
  const files = 'abcdefgh';
  const out: string[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      out.push(files[f] + (r + 1));
    }
  }
  return out;
})();

function exponentsFromResult(r: AnalyzeResult): number[] {
  if (r.exponents && r.exponents.length >= 64) return r.exponents.slice(0, 64);
  return Array(64).fill(0);
}

function primePowerTerms(exponents: number[]): string[] {
  return exponents.map((v, i) => {
    if (v === 0) return '1';
    const p = PRIMES[i];
    return v === 1 ? String(p) : `${p}^${v}`;
  });
}

/** Castling rights → small integer code (missing rights → contribute 1 in product). */
function castlingCode(castle: string): number {
  if (!castle || castle === '-') return 0;
  let c = 0;
  if (castle.includes('K')) c |= 1;
  if (castle.includes('Q')) c |= 2;
  if (castle.includes('k')) c |= 4;
  if (castle.includes('q')) c |= 8;
  return c;
}

/** En passant square → 1..64 (a1=1) or 0 if none. */
function epCode(ep: string): number {
  if (!ep || ep === '-') return 0;
  const file = ep.charCodeAt(0) - 97; // a=0
  const rank = parseInt(ep[1], 10) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return 0;
  return rank * 8 + file + 1;
}

/**
 * Extended FIDE sequence b(1..67):
 *  b(1..64) = p_n^{v_n}  (or 1 if empty)
 *  b(65) = 313^{t}     t=1 white to move, t=2 black
 *  b(66) = 317^{c}     c = castling bit-mask (0 → term 1)
 *  b(67) = 331^{e}     e = EP square code (0 → term 1)
 */
function extendedFideTerms(fen: string, boardExp: number[]): {
  terms: string[];
  exponents67: number[];
  turn: string;
  castle: string;
  ep: string;
} {
  const parts = fen.trim().split(/\s+/);
  const turn = parts[1] || 'w';
  const castle = parts[2] || '-';
  const ep = parts[3] || '-';
  const tExp = turn === 'b' ? 2 : 1;
  const cExp = castlingCode(castle);
  const eExp = epCode(ep);

  const exponents67 = [...boardExp, tExp, cExp, eExp];
  const terms = [
    ...primePowerTerms(boardExp),
    tExp === 0 ? '1' : tExp === 1 ? String(P_TURN) : `${P_TURN}^${tExp}`,
    cExp === 0 ? '1' : cExp === 1 ? String(P_CASTLE) : `${P_CASTLE}^${cExp}`,
    eExp === 0 ? '1' : eExp === 1 ? String(P_EP) : `${P_EP}^${eExp}`,
  ];
  return { terms, exponents67, turn, castle, ep };
}

function SeqBlock({
  title,
  explain,
  sequence,
  onCopy,
  copyLabel,
}: {
  title: string;
  explain: string;
  sequence: string;
  onCopy: () => void;
  copyLabel: string;
}) {
  return (
    <section className="rounded-xl border border-gray-700 bg-genome-card p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-genome-orange">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{explain}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="text-[10px] px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 shrink-0"
        >
          {copyLabel}
        </button>
      </div>
      <pre className="font-mono text-xs text-emerald-200/90 whitespace-pre-wrap break-all bg-black/40 rounded-lg p-3 max-h-40 overflow-y-auto border border-gray-800">
        {sequence}
      </pre>
    </section>
  );
}

export function OeisPage() {
  const { t } = useTranslation('genome');
  const [fen, setFen] = useState(START);
  const [boardFen, setBoardFen] = useState(START);
  const [k, setK] = useState(6);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [admissibleTotal, setAdmissibleTotal] = useState<number | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const f = normalizeFen(fen);
      setBoardFen(f);
      const data = await analyzePosition(f, false);
      setResult(data);
      try {
        const st = await getStats();
        if (st?.admissiblePositions != null) {
          setAdmissibleTotal(st.admissiblePositions);
        } else {
          setAdmissibleTotal(null);
        }
      } catch {
        setAdmissibleTotal(null);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function copyText(label: string, text: string) {
    void navigator.clipboard?.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  }

  const exp = result ? exponentsFromResult(result) : null;
  const axxxxxx = exp ? primePowerTerms(exp) : null;
  const axxxxxz = Array(64).fill(0);
  const scaledL =
    result != null ? Math.floor(result.L * Math.pow(10, k)) : null;
  const digitCount = result?.S_digits ?? null;

  const seqV = exp ? exp.join(', ') : '';
  const seqA = axxxxxx ? axxxxxx.join(', ') : '';
  const seqEmpty = axxxxxz.join(', ');

  const extended =
    result && exp ? extendedFideTerms(boardFen, exp) : null;
  const seqExt = extended ? extended.terms.join(', ') : '';
  const seqExtExp = extended ? extended.exponents67.join(', ') : '';

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold">{t('oeis.title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('oeis.subtitle')}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="max-w-sm mx-auto w-full space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide text-center">
            {t('oeis.boardLabel')}
          </p>
          <Chessboard
            position={boardFen}
            arePiecesDraggable={false}
            boardWidth={Math.min(
              360,
              typeof window !== 'undefined' ? window.innerWidth - 48 : 360,
            )}
          />
          {result && (
            <div className="text-xs font-mono text-center text-gray-400 space-y-1">
              <p>
                L ={' '}
                <span className="text-genome-orange">{result.L.toFixed(6)}</span>
                {' · '}
                L<sub>10</sub> = {result.L10.toFixed(6)}
              </p>
              <p>
                S_digits = {result.S_digits ?? '—'} · piezas = {result.pieceCount}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-xs text-gray-500 uppercase">
                {t('common.fen')}
              </label>
              <FenPasteButton
                compact
                onPaste={(v) => {
                  setFen(v);
                  setBoardFen(v);
                }}
              />
            </div>
            <input
              className="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 font-mono text-xs"
              value={fen}
              onChange={(e) => setFen(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-gray-500 uppercase">
                k (⌊L·10^k⌋)
              </label>
              <input
                type="number"
                min={0}
                max={12}
                value={k}
                onChange={(e) => setK(parseInt(e.target.value, 10) || 0)}
                className="w-20 bg-black/40 border border-gray-700 rounded-lg px-2 py-2 text-sm block"
              />
            </div>
            <button
              onClick={run}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-genome-orange text-black font-semibold text-sm disabled:opacity-40"
            >
              {loading ? t('common.loading') : t('oeis.generate')}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-gray-800 text-sm"
              onClick={() => {
                setFen(START);
                setBoardFen(START);
              }}
            >
              {t('oeis.useStart')}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-gray-800 text-sm"
              onClick={() => {
                setFen(EMPTY_BOARD);
                setBoardFen(EMPTY_BOARD);
              }}
            >
              {t('oeis.useEmpty')}
            </button>
          </div>
          {copied && (
            <p className="text-xs text-emerald-400">
              {t('oeis.copied')}: {copied}
            </p>
          )}
          {error && (
            <div className="text-red-300 text-sm rounded-lg border border-red-700 p-3">
              {error}
            </div>
          )}
        </div>
      </div>

      {result && exp && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">
            {t('oeis.realSeqTitle')}
          </h3>

          <SeqBlock
            title="Axxxxxy — v(n) (64 términos)"
            explain={t('oeis.axxxxxy')}
            sequence={seqV}
            copyLabel={t('oeis.copy')}
            onCopy={() => copyText('v(n)', seqV)}
          />

          <SeqBlock
            title="Axxxxxx — p_n^{v_n}"
            explain={t('oeis.axxxxxx')}
            sequence={seqA}
            copyLabel={t('oeis.copy')}
            onCopy={() => copyText('p^v', seqA)}
          />

          {result.S_exact && (
            <SeqBlock
              title="S(B) exacto"
              explain={t('oeis.sExact')}
              sequence={result.S_exact}
              copyLabel={t('oeis.copy')}
              onCopy={() => copyText('S', result.S_exact!)}
            />
          )}

          <section className="rounded-xl border border-gray-700 bg-genome-card p-4 space-y-2">
            <h3 className="font-semibold text-genome-orange">
              {t('oeis.termTable')}
            </h3>
            <p className="text-xs text-gray-400">{t('oeis.termTableHint')}</p>
            <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-gray-800">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-gray-900 text-gray-500">
                  <tr>
                    <th className="px-2 py-1 text-left">n</th>
                    <th className="px-2 py-1 text-left">casilla</th>
                    <th className="px-2 py-1 text-right">p_n</th>
                    <th className="px-2 py-1 text-right">v_n</th>
                    <th className="px-2 py-1 text-left">p_n^v_n</th>
                  </tr>
                </thead>
                <tbody>
                  {exp.map((v, i) => (
                    <tr
                      key={i}
                      className={`border-t border-gray-800 ${
                        v > 0 ? 'text-gray-200' : 'text-gray-600'
                      }`}
                    >
                      <td className="px-2 py-0.5">{i + 1}</td>
                      <td className="px-2 py-0.5">{SQUARES[i]}</td>
                      <td className="px-2 py-0.5 text-right">{PRIMES[i]}</td>
                      <td className="px-2 py-0.5 text-right text-genome-orange">
                        {v}
                      </td>
                      <td className="px-2 py-0.5 text-emerald-300/90">
                        {v === 0
                          ? '1'
                          : v === 1
                            ? String(PRIMES[i])
                            : `${PRIMES[i]}^${v}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <SeqBlock
            title="Axxxxxz — tablero vacío"
            explain={t('oeis.axxxxxz')}
            sequence={seqEmpty}
            copyLabel={t('oeis.copy')}
            onCopy={() => copyText('empty', seqEmpty)}
          />

          {/* Extended FIDE — computed 67 terms */}
          {extended && (
            <>
              <SeqBlock
                title={t('oeis.extendedTitle')}
                explain={t('oeis.extendedExplain')}
                sequence={seqExt}
                copyLabel={t('oeis.copy')}
                onCopy={() => copyText('extended', seqExt)}
              />
              <SeqBlock
                title={t('oeis.extendedExpTitle')}
                explain={t('oeis.extendedExpExplain', {
                  turn: extended.turn,
                  castle: extended.castle,
                  ep: extended.ep,
                })}
                sequence={seqExtExp}
                copyLabel={t('oeis.copy')}
                onCopy={() => copyText('ext-exp', seqExtExp)}
              />
            </>
          )}

          {/* Ordered Genome — only available values */}
          <section className="rounded-xl border border-gray-700 bg-genome-card p-4 space-y-2">
            <h3 className="font-semibold text-genome-orange">
              {t('oeis.orderedTitle')}
            </h3>
            <ul className="text-sm text-gray-300 space-y-2">
              <li>
                ⌊L · 10<sup>{k}</sup>⌋ ={' '}
                <span className="font-mono text-genome-orange">{scaledL}</span>
              </li>
              <li>
                ⌊log₁₀ S⌋ + 1 ={' '}
                <span className="font-mono text-genome-orange">{digitCount}</span>
              </li>
              {admissibleTotal != null && admissibleTotal > 0 && (
                <li>
                  {t('oeis.admissibleTotal')}:{' '}
                  <span className="font-mono text-genome-orange">
                    {admissibleTotal}
                  </span>
                </li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
