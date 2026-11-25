import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onPaste: (fen: string) => void;
  className?: string;
  /** Compact icon-style button */
  compact?: boolean;
}

/**
 * Reads clipboard and passes text to parent (FEN field).
 */
export function FenPasteButton({ onPaste, className = '', compact }: Props) {
  const { t } = useTranslation('genome');
  const [hint, setHint] = useState<string | null>(null);

  async function handleClick() {
    setHint(null);
    try {
      if (!navigator.clipboard?.readText) {
        setHint(t('fenPaste.unsupported'));
        return;
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setHint(t('fenPaste.empty'));
        return;
      }
      // Use first line if multi-line
      const fen = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) || text;
      onPaste(fen);
      setHint(t('fenPaste.ok'));
      window.setTimeout(() => setHint(null), 1200);
    } catch {
      setHint(t('fenPaste.denied'));
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        title={t('fenPaste.title')}
        className={
          compact
            ? 'px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-xs border border-gray-600'
            : 'px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium border border-gray-600'
        }
      >
        📋 {t('fenPaste.button')}
      </button>
      {hint && (
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{hint}</span>
      )}
    </span>
  );
}
