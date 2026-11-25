import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalyzeResult } from '../types/genome';

interface Props {
  result: AnalyzeResult | null;
  loading: boolean;
  error: string | null;
}

export function ResultPanel({ result, loading, error }: Props) {
  const { t } = useTranslation('genome');
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(label: string, text: string) {
    void navigator.clipboard?.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-white border border-gray-300 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-300 p-5 text-red-800">
        <p className="font-semibold text-base">{t('common.error')}</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-xl bg-white border border-gray-300 p-6 text-gray-700 text-sm">
        {t('result.empty')}
      </div>
    );
  }

  // Todos los factores con exponente > 0, ordenados de menor a mayor primo
  const allFactors = Object.entries(result.factorization || {})
    .filter(([, exp]) => Number(exp) > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  // Determine save message and rank
  const isStored = result.existsInDb;
  const rank = result.rankApprox;
  const timesSeen = result.timesSeen;

  return (
    <div className="rounded-xl bg-white border border-gray-300 p-5 space-y-4 shadow-sm">
      {/* Save status */}
      <div
        className={`rounded-lg p-3 border-2 ${
          isStored
            ? 'bg-green-50 border-green-400'
            : 'bg-orange-50 border-orange-400'
        }`}
      >
        <p className="text-base font-bold text-gray-900">
          {isStored ? (
            <>
              {t('result.alreadySaved')}{' '}
              {timesSeen != null && timesSeen > 0 && (
                <span className="text-green-700">({timesSeen}×)</span>
              )}
            </>
          ) : (
            <span className="text-orange-700">{t('result.notSaved')}</span>
          )}
        </p>
        {isStored && rank != null && (
          <p className="text-sm text-gray-800 mt-1">
            {t('result.storedAtRank')}:{' '}
            <span className="font-mono font-bold text-genome-orange">
              #{rank}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span
          className={`px-3 py-1 rounded-full text-sm font-semibold ${
            result.staticallyAdmissible
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : 'bg-red-100 text-red-800 border border-red-300'
          }`}
        >
          {t('result.admissible')}:{' '}
          {result.staticallyAdmissible ? t('result.yes') : t('result.no')}
        </span>
      </div>

      {result.message && (
        <p className="text-sm text-gray-800">{result.message}</p>
      )}

      {/* FEN visible directamente */}
      {result.fen && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="flex justify-between items-center mb-1">
            <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">
              FEN
            </p>
            <button
              type="button"
              onClick={() => copyText('fen', result.fen!)}
              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
            >
              {copied === 'fen' ? '✓' : t('oeis.copy')}
            </button>
          </div>
          <p className="text-sm font-mono text-gray-900 break-all">
            {result.fen}
          </p>
        </div>
      )}

      {/* Secuencia de Gödel completa */}
      {result.S_exact && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm text-gray-800 uppercase tracking-wide font-semibold">
              {t('result.sExact')} ({result.S_digits ?? result.S_exact.length}{' '}
              {t('result.digits')})
            </p>
            <button
              type="button"
              onClick={() => copyText('s', result.S_exact!)}
              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
            >
              {copied === 's' ? '✓' : t('oeis.copy')}
            </button>
          </div>
          <p className="text-sm font-mono text-emerald-800 break-all max-h-48 overflow-y-auto bg-white rounded p-2 border border-gray-200">
            {result.S_exact}
          </p>
          {result.engine && (
            <p className="text-xs text-gray-600 mt-1">
              {result.engine === 'typescript-local'
                ? t('result.engineLocal')
                : result.engine}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-sm text-gray-700 uppercase tracking-wide font-semibold">
            L (ln)
          </p>
          <p className="text-xl font-mono text-genome-orange font-bold">
            {result.L.toFixed(6)}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-sm text-gray-700 uppercase tracking-wide font-semibold">
            L<sub>10</sub> (log10)
          </p>
          <p className="text-xl font-mono text-genome-orange font-bold">
            {result.L10.toFixed(6)}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-sm text-gray-700 uppercase tracking-wide font-semibold">
            {t('result.pieces')}
          </p>
          <p className="text-xl font-mono font-bold text-gray-900">
            {result.pieceCount}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-sm text-gray-700 uppercase tracking-wide font-semibold">
            {t('result.rank')}
          </p>
          <p className="text-xl font-mono font-bold text-gray-900">
            {result.rankApprox != null ? `#${result.rankApprox}` : '—'}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm text-gray-800 uppercase tracking-wide font-semibold mb-2">
          {t('result.factorization')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {allFactors.map(([prime, exp]) => (
            <span
              key={prime}
              className="px-2 py-1 rounded bg-gray-100 border border-gray-300 text-sm font-mono text-gray-900"
            >
              {prime}
              <sup>{exp}</sup>
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm text-gray-800 uppercase tracking-wide font-semibold mb-1">
          {t('result.hash')}
        </p>
        <p className="text-sm font-mono text-gray-700 break-all">
          {result.hash}
        </p>
      </div>
    </div>
  );
}
