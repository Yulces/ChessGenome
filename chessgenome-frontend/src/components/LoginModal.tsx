import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Mode = 'login' | 'register';

export function LoginModal({ open, onClose }: Props) {
  const { t } = useTranslation('genome');
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setError(null);

    if (!nick.trim() || !password.trim()) {
      setError(t('auth.requiredFields'));
      return;
    }

    if (mode === 'register') {
      if (password !== password2) {
        setError(t('auth.passwordMismatch'));
        return;
      }
      if (password.length < 6) {
        setError(t('auth.passwordTooShort'));
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(nick.trim(), password);
      } else {
        await register(nick.trim(), password);
      }
      setNick('');
      setPassword('');
      setPassword2('');
      onClose();
    } catch (e: any) {
      // El backend devuelve string JSON o mensaje
      let msg = e?.message || String(e);
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.message) {
          msg = Array.isArray(parsed.message) ? parsed.message.join(' · ') : parsed.message;
        }
      } catch {
        /* ignore */
      }
      setError(msg);
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
            {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
              {t('auth.nick')}
            </label>
            <input
              type="text"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="MiNick123"
              autoComplete="username"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
              {t('auth.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs text-gray-700 uppercase font-semibold mb-1">
                {t('auth.passwordConfirm')}
              </label>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="••••••"
                autoComplete="new-password"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              />
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="flex justify-between items-center pt-2">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            className="text-xs text-genome-orange hover:underline"
          >
            {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
            >
              {t('auth.cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-genome-orange text-white text-sm font-semibold disabled:opacity-40"
            >
              {loading
                ? t('common.loading')
                : mode === 'login'
                  ? t('auth.loginBtn')
                  : t('auth.registerBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
