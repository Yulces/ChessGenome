import { useTranslation } from 'react-i18next';
import type { PublicAuthor } from '../services/api';

interface Props {
  open: boolean;
  author: PublicAuthor | null;
  onClose: () => void;
  onClaim?: () => void;
}

export function AuthorViewModal({ open, author, onClose, onClaim }: Props) {
  const { t } = useTranslation('genome');

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-300 shadow-2xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {author
                ? author.isRecordHolder
                  ? t('author.recordHolderTitle')
                  : t('author.authorTitle')
                : t('author.noAuthorTitle')}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {author
                ? t('author.discoveredBy')
                : t('author.noAuthorYet')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {author ? (
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-600 uppercase font-semibold">
                {t('author.name')}
              </p>
              <p className="text-base text-gray-900 font-medium">
                {author.name}
              </p>
            </div>

            {author.country && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-600 uppercase font-semibold">
                  {t('author.country')}
                </p>
                <p className="text-base text-gray-900">{author.country}</p>
              </div>
            )}

            {author.note && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-600 uppercase font-semibold">
                  {t('author.note')}
                </p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {author.note}
                </p>
              </div>
            )}

            {author.createdAt && (
              <p className="text-xs text-gray-500 text-center">
                {t('author.registeredOn')}:{' '}
                {new Date(author.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm text-gray-700">
              {t('author.beTheFirst')}
            </p>
            {onClaim && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onClaim();
                }}
                className="px-5 py-2.5 rounded-lg bg-genome-orange text-white font-semibold text-sm"
              >
                {t('author.claimBtn')}
              </button>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
          >
            {t('author.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
