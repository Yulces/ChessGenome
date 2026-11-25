import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getStats,
  getCurrentRecordAuthor,
  getTopRecordPgn,
  type PublicAuthor,
  type TopRecordPgn,
} from '../services/api';
import type { Stats } from '../types/genome';
import { AuthorModal } from '../components/AuthorModal';
import { AuthorViewModal } from '../components/AuthorViewModal';

interface Props {
  onNavigate: (page: 'editor' | 'search' | 'contribute' | 'home') => void;
  onOpenPosition?: (pgn: string) => void;
}

export function HomePage({ onNavigate, onOpenPosition }: Props) {
  const { t } = useTranslation('genome');
  const [stats, setStats] = useState<Stats | null>(null);
  const [record, setRecord] = useState<TopRecordPgn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [author, setAuthor] = useState<PublicAuthor | null>(null);
  const [authorChecked, setAuthorChecked] = useState(false);
  const [viewAuthorOpen, setViewAuthorOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => setError(t('home.backend_error')));

    getTopRecordPgn()
      .then(setRecord)
      .catch(() => setRecord(null));

    getCurrentRecordAuthor()
      .then((r) => {
        setAuthor(r.found ? r.author : null);
        setAuthorChecked(true);
      })
      .catch(() => {
        setAuthor(null);
        setAuthorChecked(true);
      });
  }, [t]);

  function digitsFromL10(l10: number): number {
    return Math.floor(l10) + 1;
  }

  const canClaim =
    authorChecked &&
    !author &&
    record?.maxL10 != null &&
    record?.maxL10Fen != null &&
    record?.maxL10Hash != null;

  return (
    <div className="space-y-10">
      <section className="text-center space-y-4 pt-4">
        <div className="flex items-center justify-center gap-3 sm:gap-6">
          <figure className="author-card shrink-0">
            <img
              src="/authors/dietrich-luebbert.jpg"
              alt="Dietrich Lübbert"
              width={68}
              height={68}
            />
            <figcaption className="text-[10px] sm:text-xs text-gray-700 leading-tight text-center">
              Dietrich Lübbert
            </figcaption>
          </figure>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight flex-1 min-w-0 text-gray-900">
            {t('home.title_pre')}{' '}
            <span className="text-genome-orange">{t('home.title_mid')}</span>{' '}
            {t('home.title_post')}
          </h2>
          <figure className="author-card shrink-0">
            <img
              src="/authors/jose-cespedes.jpg"
              alt="José Angel Céspedes Bejerano"
              width={68}
              height={68}
            />
            <figcaption className="text-[10px] sm:text-xs text-gray-700 leading-tight text-center">
              José A. Céspedes
            </figcaption>
          </figure>
        </div>
        <p className="text-gray-700 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
          {t('home.subtitle')}
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            onClick={() => onNavigate('editor')}
            className="px-5 py-2.5 rounded-lg bg-genome-orange hover:bg-orange-600 text-white font-semibold text-sm transition shadow-lg shadow-orange-900/20"
          >
            {t('home.cta_calculate')}
          </button>
          <button
            onClick={() => onNavigate('search')}
            className="px-5 py-2.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm transition"
          >
            {t('home.cta_explore')}
          </button>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white border border-gray-300 p-5 text-center shadow-sm">
          <p className="text-2xl font-mono text-genome-orange font-bold">
            {stats?.totalPositions ?? '—'}
          </p>
          <p className="text-xs text-gray-700 mt-1 uppercase tracking-wide font-semibold">
            {t('home.stat_total')}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-300 p-5 text-center shadow-sm">
          <p className="text-2xl font-mono text-genome-orange font-bold">
            {stats?.admissiblePositions ?? '—'}
          </p>
          <p className="text-xs text-gray-700 mt-1 uppercase tracking-wide font-semibold">
            {t('home.stat_admissible')}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-300 p-5 text-center space-y-2 shadow-sm">
          <p className="text-2xl font-mono text-genome-orange font-bold">
            {record?.maxL10 != null ? record.maxL10.toFixed(4) : '—'}
          </p>
          {record?.maxL10 != null && (
            <p className="text-xs text-gray-600">
              (~{digitsFromL10(record.maxL10)} {t('home.cifras')})
            </p>
          )}
          <p className="text-xs text-gray-700 uppercase tracking-wide font-semibold">
            {t('home.stat_maxL10')}
          </p>

          <div className="flex flex-wrap gap-2 justify-center pt-2">
            {record?.pgn && onOpenPosition && (
              <button
                type="button"
                onClick={() => onOpenPosition(record.pgn!)}
                className="text-xs px-3 py-1.5 rounded-lg bg-genome-orange/20 text-genome-orange border border-genome-orange/40 hover:bg-genome-orange/30 font-semibold"
              >
                {t('home.viewPosition')}
              </button>
            )}

            <button
              type="button"
              onClick={() => setViewAuthorOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200 font-semibold"
            >
              {author ? t('home.viewAuthor') : t('home.claimAuthor')}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="text-center text-sm text-red-600">{error}</p>
      )}

      <section className="rounded-xl bg-white border border-gray-300 p-6 space-y-4 shadow-sm">
        <h3 className="font-semibold text-lg text-gray-900">
          {t('home.how_title')}
        </h3>
        <ol className="space-y-3 text-sm text-gray-800 list-decimal list-inside">
          <li>{t('home.how_1')}</li>
          <li>{t('home.how_2')}</li>
          <li>{t('home.how_3')}</li>
          <li>{t('home.how_4')}</li>
          <li>{t('home.how_5')}</li>
        </ol>
      </section>

      <section className="text-center space-y-3">
        <p className="text-gray-700 text-sm">{t('home.contribute_hint')}</p>
        <button
          onClick={() => onNavigate('contribute')}
          className="px-5 py-2.5 rounded-lg border border-genome-green/60 text-genome-green hover:bg-genome-green/10 text-sm transition font-semibold"
        >
          {t('home.contribute_btn')}
        </button>
      </section>

      {/* View author modal */}
      <AuthorViewModal
        open={viewAuthorOpen}
        author={author}
        onClose={() => setViewAuthorOpen(false)}
        onClaim={canClaim ? () => setClaimOpen(true) : undefined}
      />

      {/* Claim authorship modal — usa el hash real, no el FEN */}
      {record?.maxL10Hash && record?.maxL10Fen && (
        <AuthorModal
          open={claimOpen}
          positionHash={record.maxL10Hash}
          fen={record.maxL10Fen}
          onClose={() => setClaimOpen(false)}
          onClaimed={(a) => {
            setAuthor({
              name: a.name,
              country: a.country || '',
              note: a.note || '',
              isRecordHolder: a.isRecordHolder,
              createdAt: a.createdAt,
            });
          }}
        />
      )}
    </div>
  );
}
