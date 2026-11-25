import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { LoginModal } from '../components/LoginModal';
import { CommentItem } from '../components/CommentItem';
import { listComments, createComment } from '../services/api';
import type { Comment, CommentTag } from '../types/genome';

const TAGS: CommentTag[] = ['bug', 'suggestion', 'question', 'discussion'];

type FilterTag = 'all' | CommentTag;

export function ExchangePage() {
  const { t } = useTranslation('genome');
  const { user, isAuthenticated, logout } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [newTag, setNewTag] = useState<CommentTag>('discussion');
  const [posting, setPosting] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [filter, setFilter] = useState<FilterTag>('all');

  const load = useCallback(
    async (tag: FilterTag = 'all') => {
      setLoading(true);
      setError(null);
      try {
        const data = await listComments(tag === 'all' ? undefined : tag);
        setComments(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(filter);
  }, [load, filter, user?.id]);

  async function handlePost() {
    if (!newComment.trim()) return;
    if (!isAuthenticated) {
      setLoginOpen(true);
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await createComment(newComment.trim(), null, newTag);
      setNewComment('');
      await load(filter);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPosting(false);
    }
  }

  function changeFilter(f: FilterTag) {
    setFilter(f);
    if (f !== 'all') setNewTag(f);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">
            {t('exchange.title')}
          </h2>
          <p className="text-gray-700 text-base mt-1">
            {t('exchange.subtitle')}
          </p>
        </div>

        {isAuthenticated && user ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-700">
              {t('auth.loggedAs')}:{' '}
              <span className="font-semibold text-genome-orange">
                {user.nick}
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-medium"
            >
              {t('auth.logout')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            className="px-4 py-2 rounded-lg bg-genome-orange text-white text-sm font-semibold"
          >
            {t('auth.loginOrRegister')}
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-300 rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-600 uppercase font-semibold mr-2">
          {t('exchange.filterLabel')}
        </span>
        <button
          type="button"
          onClick={() => changeFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            filter === 'all'
              ? 'bg-genome-orange text-white border-genome-orange'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {t('exchange.filterAll')}
        </button>
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => changeFilter(tag)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              filter === tag
                ? 'bg-genome-orange text-white border-genome-orange'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {t(`exchange.tags.${tag}`)}
          </button>
        ))}
      </div>

      {/* Formulario nuevo comentario */}
      <div className="bg-white border border-gray-300 rounded-xl p-4 space-y-3">
        <h3 className="text-base font-semibold text-gray-800">
          {t('exchange.newComment')}
        </h3>
        {isAuthenticated ? (
          <>
            <div>
              <label className="block text-xs text-gray-600 uppercase font-semibold mb-1">
                {t('exchange.tagLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setNewTag(tag)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      newTag === tag
                        ? 'bg-genome-orange text-white border-genome-orange'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t(`exchange.tags.${tag}`)}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t('exchange.commentPlaceholder')}
              rows={3}
              maxLength={2000}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {newComment.length} / 2000
              </span>
              <button
                type="button"
                onClick={handlePost}
                disabled={posting || !newComment.trim()}
                className="px-5 py-2 rounded-lg bg-genome-orange text-white font-semibold text-sm disabled:opacity-40"
              >
                {posting ? t('common.loading') : t('exchange.post')}
              </button>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-700">
            <p>{t('exchange.loginToPost')}</p>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="mt-2 px-4 py-2 rounded-lg bg-genome-orange text-white font-semibold text-sm"
            >
              {t('auth.loginOrRegister')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-300 p-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading && comments.length === 0 && (
        <p className="text-sm text-gray-600">{t('common.loading')}</p>
      )}

      {!loading && comments.length === 0 && (
        <div className="rounded-xl bg-white border border-gray-300 p-8 text-center text-gray-600">
          {t('exchange.noComments')}
        </div>
      )}

      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              onChanged={() => load(filter)}
              onRequireLogin={() => setLoginOpen(true)}
            />
          ))}
        </div>
      )}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
