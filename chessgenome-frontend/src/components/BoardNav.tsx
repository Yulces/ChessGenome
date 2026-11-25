import { useTranslation } from 'react-i18next';

export interface BoardNavProps {
  index: number;
  total: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  className?: string;
  disabled?: boolean;
}

export function BoardNav({
  index,
  total,
  onFirst,
  onPrev,
  onNext,
  onLast,
  className = '',
  disabled = false,
}: BoardNavProps) {
  const { t } = useTranslation('genome');
  const atStart = index <= 0;
  const atEnd = index >= total - 1 || total <= 0;
  const btn =
    'px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed min-w-[2.5rem]';

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 mt-3 ${className}`}
      role="group"
      aria-label={t('common.boardNav.aria')}
    >
      <button type="button" className={btn} onClick={onFirst} disabled={disabled || atStart} title={t('common.boardNav.first')}>
        ⏮
      </button>
      <button type="button" className={btn} onClick={onPrev} disabled={disabled || atStart} title={t('common.boardNav.prev')}>
        ◀
      </button>
      <span className="text-sm text-gray-400 tabular-nums px-2 min-w-[5rem] text-center">
        {total > 0 ? `${index + 1} / ${total}` : '—'}
      </span>
      <button type="button" className={btn} onClick={onNext} disabled={disabled || atEnd} title={t('common.boardNav.next')}>
        ▶
      </button>
      <button type="button" className={btn} onClick={onLast} disabled={disabled || atEnd} title={t('common.boardNav.last')}>
        ⏭
      </button>
    </div>
  );
}
