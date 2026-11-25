import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const SECTIONS = [
  'home',
  'editor',
  'analyze',
  'search',
  'explore',
  'contribute',
  'oeis',
  'session',
  'exchange',
  'charts',
  'neural',
  'stockfish',
  'pgns',
] as const;

type SectionId = (typeof SECTIONS)[number];

interface Block {
  type:
    | 'text'
    | 'subtitle'
    | 'list'
    | 'orderedList'
    | 'callout'
    | 'image'
    | 'code'
    | 'table';
  content?: string;
  items?: string[];
  variant?: 'info' | 'warning' | 'success' | 'tip';
  src?: string;
  caption?: string;
  headers?: string[];
  rows?: string[][];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

type Theme = 'light' | 'dark';

interface ThemeColors {
  modalBg: string;
  modalBorder: string;
  modalText: string;
  backdrop: string;
  headerBg: string;
  headerBorder: string;
  headerIconBtn: string;
  headerCloseBtn: string;
  sidebarBg: string;
  sidebarBorder: string;
  navActive: string;
  navInactive: string;
  introText: string;
  sectionBg: string;
  sectionBorder: string;
  sectionTitle: string;
  sectionTitleBorder: string;
  footerText: string;
  text: string;
  listText: string;
  imageBorder: string;
  imageCaption: string;
  code: string;
  tableHeadBorder: string;
  tableHeadText: string;
  tableRowBorder: string;
  tableRowText: string;
  calloutInfo: string;
  calloutWarning: string;
  calloutSuccess: string;
  calloutTip: string;
}

const LIGHT: ThemeColors = {
  modalBg: 'bg-white',
  modalBorder: 'border-gray-200',
  modalText: 'text-gray-900',
  backdrop: 'rgba(0,0,0,0.5)',
  headerBg: 'bg-gray-100',
  headerBorder: 'border-gray-200',
  headerIconBtn: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
  headerCloseBtn: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
  sidebarBg: 'bg-gray-50',
  sidebarBorder: 'border-gray-200',
  navActive: 'bg-genome-orange/15 text-genome-orange font-semibold',
  navInactive: 'text-gray-700 hover:bg-gray-200 hover:text-gray-900',
  introText: 'text-gray-700',
  sectionBg: 'bg-white',
  sectionBorder: 'border-gray-200',
  sectionTitle: 'text-gray-900',
  sectionTitleBorder: 'border-gray-200',
  footerText: 'text-gray-400',
  text: 'text-gray-700',
  listText: 'text-gray-700',
  imageBorder: 'border-gray-200',
  imageCaption: 'text-gray-500',
  code: 'bg-gray-100 border-gray-300 text-gray-800',
  tableHeadBorder: 'border-gray-300',
  tableHeadText: 'text-gray-700',
  tableRowBorder: 'border-gray-200',
  tableRowText: 'text-gray-700',
  calloutInfo: 'border-blue-500 bg-blue-50 text-blue-900',
  calloutWarning: 'border-yellow-500 bg-yellow-50 text-yellow-900',
  calloutSuccess: 'border-emerald-500 bg-emerald-50 text-emerald-900',
  calloutTip: 'border-purple-500 bg-purple-50 text-purple-900',
};

const DARK: ThemeColors = {
  modalBg: 'bg-[#0a0e0c]',
  modalBorder: 'border-gray-700',
  modalText: 'text-gray-200',
  backdrop: 'rgba(0,0,0,0.85)',
  headerBg: 'bg-[#0e1512]',
  headerBorder: 'border-gray-700',
  headerIconBtn: 'bg-gray-800 hover:bg-gray-700 text-gray-200',
  headerCloseBtn: 'bg-gray-800 hover:bg-gray-700 text-white',
  sidebarBg: 'bg-[#0e1512]',
  sidebarBorder: 'border-gray-700',
  navActive: 'bg-genome-orange/20 text-genome-orange font-semibold',
  navInactive: 'text-gray-300 hover:bg-gray-800 hover:text-white',
  introText: 'text-gray-300',
  sectionBg: 'bg-[#121a16]',
  sectionBorder: 'border-gray-700',
  sectionTitle: 'text-white',
  sectionTitleBorder: 'border-gray-700',
  footerText: 'text-gray-500',
  text: 'text-gray-200',
  listText: 'text-gray-200',
  imageBorder: 'border-gray-700',
  imageCaption: 'text-gray-400',
  code: 'bg-black/40 border-gray-700 text-emerald-200',
  tableHeadBorder: 'border-gray-600',
  tableHeadText: 'text-gray-300',
  tableRowBorder: 'border-gray-800',
  tableRowText: 'text-gray-200',
  calloutInfo: 'border-blue-500 bg-blue-500/10 text-blue-100',
  calloutWarning: 'border-yellow-500 bg-yellow-500/10 text-yellow-100',
  calloutSuccess: 'border-emerald-500 bg-emerald-500/10 text-emerald-100',
  calloutTip: 'border-purple-500 bg-purple-500/10 text-purple-100',
};

function renderBlock(b: Block, idx: number, C: ThemeColors) {
  switch (b.type) {
    case 'text':
      return (
        <p key={idx} className={`${C.text} text-sm leading-relaxed mb-3`}>
          {b.content}
        </p>
      );

    case 'subtitle':
      return (
        <h4
          key={idx}
          className="text-base font-bold text-genome-orange mt-5 mb-2"
        >
          {b.content}
        </h4>
      );

    case 'list':
      return (
        <ul
          key={idx}
          className={`list-disc list-inside space-y-1.5 text-sm ${C.listText} mb-3 pl-2`}
        >
          {b.items?.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );

    case 'orderedList':
      return (
        <ol
          key={idx}
          className={`list-decimal list-inside space-y-1.5 text-sm ${C.listText} mb-3 pl-2`}
        >
          {b.items?.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      );

    case 'callout': {
      const variants: Record<string, string> = {
        info: C.calloutInfo,
        warning: C.calloutWarning,
        success: C.calloutSuccess,
        tip: C.calloutTip,
      };
      const icons: Record<string, string> = {
        info: 'ℹ️',
        warning: '⚠️',
        success: '✅',
        tip: '💡',
      };
      const cls = variants[b.variant || 'info'];
      const icon = icons[b.variant || 'info'];
      return (
        <div
          key={idx}
          className={`border-l-4 ${cls} rounded-r-lg px-3 py-2 my-3 text-sm`}
        >
          <span className="mr-2">{icon}</span>
          {b.content}
        </div>
      );
    }

    case 'image':
      return (
        <figure key={idx} className="my-4">
          <img
            src={b.src}
            alt={b.caption || ''}
            className={`w-full rounded-lg border ${C.imageBorder} bg-white`}
          />
          {b.caption && (
            <figcaption
              className={`text-xs ${C.imageCaption} text-center mt-2 italic`}
            >
              {b.caption}
            </figcaption>
          )}
        </figure>
      );

    case 'code':
      return (
        <pre
          key={idx}
          className={`${C.code} border rounded-lg p-3 text-xs font-mono overflow-x-auto mb-3`}
        >
          {b.content}
        </pre>
      );

    case 'table':
      return (
        <div key={idx} className="overflow-x-auto mb-3">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={`border-b ${C.tableHeadBorder}`}>
                {b.headers?.map((h, i) => (
                  <th
                    key={i}
                    className={`text-left p-2 ${C.tableHeadText} font-semibold`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows?.map((row, i) => (
                <tr key={i} className={`border-b ${C.tableRowBorder}`}>
                  {row.map((cell, j) => (
                    <td key={j} className={`p-2 ${C.tableRowText}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}

const THEME_KEY = 'chessgenome-help-theme';

export function HelpModal({ open, onClose }: Props) {
  const { t } = useTranslation('genome');
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Persistir tema
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Detectar sección activa al hacer scroll
  useEffect(() => {
    if (!open) return;
    const container = contentRef.current;
    if (!container) return;

    const onScroll = () => {
      const scrollTop = container.scrollTop;
      let current: SectionId = 'home';
      for (const id of SECTIONS) {
        const el = sectionRefs.current[id];
        if (el && el.offsetTop - 100 <= scrollTop) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [open]);

  const scrollToSection = (id: SectionId) => {
    const el = sectionRefs.current[id];
    const container = contentRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset =
        elRect.top - containerRect.top + container.scrollTop - 16;
      container.scrollTo({ top: offset, behavior: 'smooth' });
      setSidebarOpen(false);
    }
  };

  if (!open) return null;

  const C = theme === 'light' ? LIGHT : DARK;

  const modal = (
    <div
      className="help-modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t('help.close')}
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          border: 'none',
          margin: 0,
          padding: 0,
          background: C.backdrop,
          cursor: 'pointer',
        }}
      />

      {/* Modal container */}
      <div
        className={`relative z-[1] flex flex-col w-full max-w-5xl h-[100dvh] mx-auto ${C.modalBg} border-l ${C.modalBorder} border-r ${C.modalBorder} ${C.modalText}`}
        style={{ boxShadow: '0 0 40px rgba(0,0,0,0.4)' }}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${C.headerBorder} ${C.headerBg} shrink-0`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((s) => !s)}
              className={`md:hidden px-2 py-1 rounded text-sm ${C.headerIconBtn}`}
              aria-label="Menú"
            >
              ☰
            </button>
            <h2
              id="help-modal-title"
              className="m-0 text-xl font-bold text-genome-orange"
            >
              {t('help.title')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setTheme((th) => (th === 'light' ? 'dark' : 'light'))
              }
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${C.headerIconBtn}`}
              title={
                theme === 'light'
                  ? t('help.switchToDark')
                  : t('help.switchToLight')
              }
              aria-label={
                theme === 'light'
                  ? t('help.switchToDark')
                  : t('help.switchToLight')
              }
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${C.headerCloseBtn}`}
            >
              {t('help.close')}
            </button>
          </div>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Sidebar */}
          <aside
            className={`
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
              md:translate-x-0
              absolute md:relative
              z-10 md:z-auto
              w-56 shrink-0
              h-full
              ${C.sidebarBg} border-r ${C.sidebarBorder}
              overflow-y-auto
              transition-transform
            `}
          >
            <nav className="p-3 space-y-1">
              {SECTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => scrollToSection(id)}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    activeSection === id ? C.navActive : C.navInactive
                  }`}
                >
                  {t(`help.sections.${id}.title`)}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto px-5 py-4 scroll-smooth"
            style={{ position: 'relative' }}
          >
            <p className={`${C.introText} text-sm leading-relaxed mb-6`}>
              {t('help.intro')}
            </p>

            {SECTIONS.map((id) => {
              const blocksRaw = t(`help.sections.${id}.blocks`, {
                returnObjects: true,
                defaultValue: [],
              });
              const blocks: Block[] = Array.isArray(blocksRaw)
                ? blocksRaw
                : [];

              return (
                <section
                  key={id}
                  ref={(el) => {
                    sectionRefs.current[id] = el;
                  }}
                  className={`rounded-xl border ${C.sectionBorder} ${C.sectionBg} p-4 mb-4`}
                >
                  <h3
                    className={`text-lg font-bold ${C.sectionTitle} mb-3 pb-2 border-b ${C.sectionTitleBorder}`}
                  >
                    {t(`help.sections.${id}.title`)}
                  </h3>
                  {blocks.map((b, i) => renderBlock(b, i, C))}
                </section>
              );
            })}

            <p className={`text-xs ${C.footerText} pb-6 text-center`}>
              {t('help.footer')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
