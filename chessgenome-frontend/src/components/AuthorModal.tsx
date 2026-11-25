import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { claimAuthorship } from '../services/api';
import type { Author } from '../types/genome';

interface Props {
  open: boolean;
  positionHash: string;
  fen: string;
  onClose: () => void;
  onClaimed: (author: Author) => void;
}

export function AuthorModal({ open, positionHash, fen, onClose, onClaimed }: Props) {
  const { t } = useTranslation('genome');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setError(t('author.requiredFields'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await claimAuthorship({
        positionHash,
        fen,
        name: name.trim(),
        email: email.trim(),
        country: country.trim(),
        note: note.trim(),
      });
      // Save token to localStorage
      try {
        localStorage.setItem(
          `chessgenome-author-${res.author.positionHash}`,
          res.author.editToken,
        );
      } catch {
        /* ignore */
      }
      onClaimed(res.author);
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-300 shadow-2xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-xl font-bold text-gray-900">
            {t('author.claimTitle')}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {t('author.claimSubtitle')}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
              {t('author.name')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
              {t('author.email')} *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              placeholder="john@example.com"
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('author.emailHint')}
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
              {t('author.country')}
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              placeholder="Cuba, Germany, …"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
              {t('author.note')}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              placeholder={t('author.notePlaceholder')}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
          >
            {t('author.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-genome-orange text-white text-sm font-semibold disabled:opacity-40"
          >
            {loading ? t('common.loading') : t('author.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
