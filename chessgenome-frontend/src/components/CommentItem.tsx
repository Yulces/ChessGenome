import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { createComment, deleteComment } from '../services/api';
import type { Comment, CommentTag } from '../types/genome';

interface Props {
  comment: Comment;
  onChanged: () => void;
  onRequireLogin: () => void;
}

const TAG_STYLES: Record<CommentTag, string> = {
  bug: 'bg-red-100 text-red-800 border-red-300',
  suggestion: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  question: 'bg-blue-100 text-blue-800 border-blue-300',
  discussion: 'bg-gray-100 text-gray-700 border-gray-300',
};

export function CommentItem({ comment, onChanged, onRequireLogin }: Props) {
  const { t } = useTranslation('genome');
  const { isAuthenticated } = useAuth();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitReply() {
    if (!replyText.trim()) return;
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createComment(replyText, comment.id, comment.tag);
      setReplyText('');
      setReplyOpen(false);
      onChanged();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('exchange.confirmDelete'))) return;
    setLoading(true);
    try {
      await deleteComment(comment.id);
      onChanged();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function renderTagBadge(tag: CommentTag) {
    const style = TAG_STYLES[tag] || TAG_STYLES.discussion;
    return (
      <span
        className={`inline-block text-[10px] px-2 py-0.5 rounded border font-semibold ${style}`}
      >
        {t(`exchange.tags.${tag}`)}
      </span>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-3 space-y-2">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {renderTagBadge(comment.tag)}
            <span className="text-xs text-gray-600">
              <span className="font-semibold text-genome-orange">
                {comment.authorNick}
              </span>
              <span className="text-gray-400 ml-2">
                {formatDate(comment.createdAt)}
              </span>
            </span>
          </div>
          <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
            {comment.content}
          </p>
        </div>

        <div className="flex gap-1 shrink-0">
          {comment.canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50 disabled:opacity-40"
              title={t('exchange.delete')}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setReplyOpen((v) => !v)}
          className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          {replyOpen ? t('exchange.cancelReply') : t('exchange.reply')}
        </button>
      </div>

      {replyOpen && (
        <div className="pl-4 border-l-2 border-genome-orange/40 space-y-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t('exchange.replyPlaceholder')}
            rows={2}
            maxLength={2000}
            className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={submitReply}
              disabled={loading || !replyText.trim()}
              className="px-3 py-1 rounded-lg bg-genome-orange text-white text-xs font-semibold disabled:opacity-40"
            >
              {loading ? t('common.loading') : t('exchange.sendReply')}
            </button>
          </div>
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="pl-4 border-l-2 border-gray-200 space-y-2 mt-2">
          {comment.replies.map((r) => (
            <div key={r.id} className="bg-gray-50 rounded p-2">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600">
                    <span className="font-semibold text-genome-orange">
                      {r.authorNick}
                    </span>
                    <span className="text-gray-400 ml-2">
                      {formatDate(r.createdAt)}
                    </span>
                  </p>
                  <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap break-words">
                    {r.content}
                  </p>
                </div>
                {r.canDelete && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(t('exchange.confirmDelete'))) return;
                      try {
                        await deleteComment(r.id);
                        onChanged();
                      } catch (e: any) {
                        setError(e?.message || String(e));
                      }
                    }}
                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
