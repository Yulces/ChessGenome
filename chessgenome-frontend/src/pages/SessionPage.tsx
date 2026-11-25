import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../context/SessionContext';
import { generateSessionPdf, generateSessionDoc } from '../utils/generatePdf';
import type {
  SessionItem,
  SessionAnalysis,
  SessionGame,
  SessionSearch,
  SessionChart,
} from '../context/SessionContext';

export function SessionPage() {
  const { t } = useTranslation('genome');
  const { state, removeItem, updateNote, hasContent, countsByType, clearAll } =
    useSession();
  const [confirmExport, setConfirmExport] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [docExporting, setDocExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docNotes, setDocNotes] = useState('');

  const analyses = state.items.filter(
    (i): i is SessionAnalysis => i.type === 'analysis',
  );
  const games = state.items.filter((i): i is SessionGame => i.type === 'game');
  const searches = state.items.filter(
    (i): i is SessionSearch => i.type === 'search',
  );
  const charts = state.items.filter((i): i is SessionChart => i.type === 'chart');

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await generateSessionPdf(state, {
        t,
        authorName: authorName.trim() || undefined,
        title: docTitle.trim() || undefined,
        notes: docNotes.trim() || undefined,
      });
      clearAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setExporting(false);
      setConfirmExport(false);
    }
  }

  async function handleExportDoc() {
    setDocExporting(true);
    setError(null);
    try {
      await generateSessionDoc(state, {
        t,
        authorName: authorName.trim() || undefined,
        title: docTitle.trim() || undefined,
        notes: docNotes.trim() || undefined,
      });
      clearAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDocExporting(false);
      setConfirmExport(false);
    }
  }

  function renderItem(item: SessionItem) {
    if (item.type === 'analysis') {
      const badges: string[] = [];
      if (item.stockfish) badges.push('SF');
      if (item.neural) badges.push('NN');
      if (item.chartSvg) badges.push('📊');

      return (
        <li
          key={item.id}
          className="rounded-lg border border-gray-300 bg-white p-3 space-y-2"
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 uppercase font-semibold">
                Análisis · {item.source}
                {badges.length > 0 && (
                  <span className="ml-2 text-genome-orange">
                    [{badges.join(' · ')}]
                  </span>
                )}
              </p>
              <p className="text-sm text-gray-900 font-medium">
                {item.title}
              </p>
              <p className="text-sm font-mono text-gray-800 truncate mt-1">
                {item.fen}
              </p>
              <p className="text-sm text-gray-800 mt-1">
                L₁₀ ={' '}
                <span className="text-genome-orange font-bold">
                  {item.L10.toFixed(4)}
                </span>
                {' · '}
                L = {item.L.toFixed(4)}
                {' · '}
                {item.pieceCount} piezas
              </p>
              {item.stockfish && (
                <p className="text-xs text-gray-700 mt-1">
                  Stockfish: {item.stockfish.bestMoveSan || item.stockfish.bestMove || '—'}
                  {item.stockfish.evaluation && (
                    <>
                      {' · '}
                      {item.stockfish.evaluation.type === 'mate'
                        ? `M${item.stockfish.evaluation.value}`
                        : `${(item.stockfish.evaluation.value / 100).toFixed(2)}`}
                    </>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
              title="Eliminar"
            >
              🗑️
            </button>
          </div>
          <input
            type="text"
            value={item.note || ''}
            onChange={(e) => updateNote(item.id, e.target.value)}
            placeholder="Añadir nota…"
            className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-800"
          />
        </li>
      );
    }

    if (item.type === 'game') {
      return (
        <li
          key={item.id}
          className="rounded-lg border border-gray-300 bg-white p-3 space-y-2"
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 uppercase font-semibold">
                Partida
              </p>
              <p className="text-sm text-gray-900 font-medium">
                {item.headers.White || '?'} vs {item.headers.Black || '?'}
              </p>
              <p className="text-xs text-gray-600">
                {item.plyCount} medias jugadas
                {(item.chartSvgs?.length ?? 0) > 0 &&
                  ` · 📊 ${item.chartSvgs!.length} gráficos`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
              title="Eliminar"
            >
              🗑️
            </button>
          </div>
          <input
            type="text"
            value={item.note || ''}
            onChange={(e) => updateNote(item.id, e.target.value)}
            placeholder="Añadir nota…"
            className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-800"
          />
        </li>
      );
    }

    if (item.type === 'search') {
      return (
        <li
          key={item.id}
          className="rounded-lg border border-gray-300 bg-white p-3 space-y-2"
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 uppercase font-semibold">
                Búsqueda
              </p>
              <p className="text-sm text-gray-900">
                Filtros:{' '}
                {Object.entries(item.filters)
                  .filter(([, v]) => v != null && v !== '')
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ') || '—'}
              </p>
              <p className="text-sm text-gray-800">
                Resultados:{' '}
                <span className="font-bold text-genome-orange">
                  {item.resultCount}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
              title="Eliminar"
            >
              🗑️
            </button>
          </div>
        </li>
      );
    }

    if (item.type === 'chart') {
      return (
        <li
          key={item.id}
          className="rounded-lg border border-gray-300 bg-white p-3 space-y-2"
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 uppercase font-semibold">
                Gráfico
              </p>
              <p className="text-sm text-gray-900 font-medium">
                {item.title}
              </p>
              {item.context && (
                <p className="text-xs text-gray-600 mt-1">{item.context}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
              title="Eliminar"
            >
              🗑️
            </button>
          </div>
        </li>
      );
    }

    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">
            {t('session.title')}
          </h2>
          <p className="text-gray-700 text-base mt-1">
            {t('session.subtitle')}
          </p>
        </div>
        {hasContent && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-700">
              {state.items.length} {t('session.items')}
            </p>
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium border border-red-300 transition"
            >
              🗑 {t('session.clearAll')}
            </button>
          </div>
        )}
      </div>

      {!hasContent && (
        <div className="rounded-xl bg-white border border-gray-300 p-8 text-center">
          <p className="text-lg text-gray-700">{t('session.empty')}</p>
          <p className="text-sm text-gray-500 mt-2">
            {t('session.emptyHint')}
          </p>
        </div>
      )}

      {hasContent && (
        <>
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-2xl font-mono text-genome-orange font-bold">
                  {countsByType.analysis}
                </p>
                <p className="text-xs text-gray-600 uppercase font-semibold">
                  Análisis
                </p>
              </div>
              <div>
                <p className="text-2xl font-mono text-genome-orange font-bold">
                  {countsByType.game}
                </p>
                <p className="text-xs text-gray-600 uppercase font-semibold">
                  Partidas
                </p>
              </div>
              <div>
                <p className="text-2xl font-mono text-genome-orange font-bold">
                  {countsByType.search}
                </p>
                <p className="text-xs text-gray-600 uppercase font-semibold">
                  Búsquedas
                </p>
              </div>
              <div>
                <p className="text-2xl font-mono text-genome-orange font-bold">
                  {countsByType.chart}
                </p>
                <p className="text-xs text-gray-600 uppercase font-semibold">
                  Gráficos
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={() => setConfirmExport(true)}
              disabled={exporting || docExporting}
              className="px-5 py-2.5 rounded-lg bg-genome-orange hover:bg-orange-600 text-white font-semibold text-sm disabled:opacity-40"
            >
              {exporting ? t('common.loading') : t('session.exportBtn')}
            </button>
            <button
              type="button"
              onClick={handleExportDoc}
              disabled={exporting || docExporting}
              className="px-5 py-2.5 rounded-lg bg-blue-200 hover:bg-blue-300 text-gray-900 font-semibold text-sm disabled:opacity-40 border border-blue-400"
            >
              {docExporting ? t('common.loading') : t('session.exportDocBtn')}
            </button>
            <p className="text-xs text-gray-600">{t('session.exportHint')}</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-300 p-3 text-red-800 text-sm">
              {error}
            </div>
          )}

          {analyses.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Análisis ({analyses.length})
              </h3>
              <ul className="space-y-2">{analyses.map(renderItem)}</ul>
            </section>
          )}

          {games.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Partidas ({games.length})
              </h3>
              <ul className="space-y-2">{games.map(renderItem)}</ul>
            </section>
          )}

          {searches.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Búsquedas ({searches.length})
              </h3>
              <ul className="space-y-2">{searches.map(renderItem)}</ul>
            </section>
          )}

          {charts.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Gráficos ({charts.length})
              </h3>
              <ul className="space-y-2">{charts.map(renderItem)}</ul>
            </section>
          )}
        </>
      )}

      {clearConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setClearConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-xl border border-gray-300 shadow-2xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-900">
              {t('session.clearConfirmTitle')}
            </h3>
            <p className="text-sm text-gray-700">
              {t('session.clearConfirmBody', { count: state.items.length })}
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
              >
                {t('session.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setClearConfirmOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
              >
                🗑 {t('session.clearConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmExport && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setConfirmExport(false)}
        >
          <div
            className="bg-white rounded-xl border border-gray-300 shadow-2xl max-w-lg w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-900">
              {t('session.confirmTitle')}
            </h3>
            <p className="text-sm text-gray-700">
              {t('session.confirmBody', { count: state.items.length })}
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('session.authorLabel')}
                </label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder={t('session.authorPlaceholder')}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('session.titleLabel')}
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder={t('session.titlePlaceholder')}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                  {t('session.notesLabel')}
                </label>
                <textarea
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  rows={3}
                  placeholder={t('session.notesPlaceholder')}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setConfirmExport(false)}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
              >
                {t('session.cancel')}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="px-4 py-2 rounded-lg bg-genome-orange text-white text-sm font-semibold disabled:opacity-40"
              >
                {exporting ? t('common.loading') : t('session.confirmExport')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
