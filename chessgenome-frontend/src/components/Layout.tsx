import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpModal } from './HelpModal';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';

type Page =
  | 'home'
  | 'contribute'
  | 'analyze'
  | 'search'
  | 'editor'
  | 'oeis'
  | 'session'
  | 'exchange';

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

const linkIds: Page[] = [
  'home',
  'editor',
  'analyze',
  'search',
  'contribute',
  'oeis',
  'exchange',
];

const LANGS: { code: string; flag: string; title: string }[] = [
  { code: 'es', flag: 'es', title: 'Español' },
  { code: 'en', flag: 'gb', title: 'English' },
  { code: 'de', flag: 'de', title: 'Deutsch' },
];

export function Layout({ current, onNavigate, children }: Props) {
  const { t, i18n } = useTranslation('genome');
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { state, hasContent } = useSession();
  const { user } = useAuth();

  const changeLang = (lng: string) => {
    void i18n.changeLanguage(lng);
  };

  const go = (id: Page) => {
    onNavigate(id);
    setMenuOpen(false);
  };

  const navBtn = (id: Page) => {
    const isSession = id === 'session';
    const isExchange = id === 'exchange';
    const sessionBadge = isSession && hasContent ? state.items.length : 0;
    const showUserBadge = isExchange && user;

    return (
      <button
        key={id}
        onClick={() => go(id)}
        className={`relative px-3 py-2 rounded-lg text-sm transition w-full md:w-auto text-left md:text-center ${
          current === id
            ? 'bg-genome-orange/20 text-genome-orange font-medium'
            : 'text-gray-800 hover:text-genome-orange hover:bg-gray-100/80'
        }`}
      >
        {t(`nav.${id}`)}
        {sessionBadge > 0 && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-genome-orange text-white text-xs font-bold">
            {sessionBadge}
          </span>
        )}
        {showUserBadge && (
          <span className="ml-1 inline-flex items-center justify-center text-[10px] text-gray-500">
            ({user!.nick})
          </span>
        )}
      </button>
    );
  };

  const currentLang = i18n.language?.slice(0, 2) || 'es';

  return (
    <div className="genome-floor min-h-screen text-gray-900 flex flex-col">
      <div className="genome-stars" aria-hidden="true" />
      <div className="genome-float-layer" aria-hidden="true">
        <span className="genome-float-piece is-white" style={{ left: '2%', top: '38%', animationDuration: '24s', animationDelay: '-2s' }}>♘</span>
        <span className="genome-float-piece is-black" style={{ left: '3%', top: '58%', animationDuration: '28s', animationDelay: '-8s' }}>♜</span>
        <span className="genome-float-piece is-white" style={{ left: '1.5%', top: '78%', animationDuration: '26s', animationDelay: '-14s' }}>♙</span>
        <span className="genome-float-piece is-black" style={{ left: '93%', top: '36%', animationDuration: '22s', animationDelay: '-4s' }}>♞</span>
        <span className="genome-float-piece is-white" style={{ left: '92%', top: '55%', animationDuration: '27s', animationDelay: '-10s' }}>♗</span>
        <span className="genome-float-piece is-black" style={{ left: '94%', top: '76%', animationDuration: '25s', animationDelay: '-16s' }}>♟</span>
        <span className="genome-float-piece is-white" style={{ left: '18%', top: '88%', animationDuration: '30s', animationDelay: '-6s' }}>♖</span>
        <span className="genome-float-piece is-black" style={{ left: '42%', top: '90%', animationDuration: '23s', animationDelay: '-12s' }}>♝</span>
        <span className="genome-float-piece is-white" style={{ left: '65%', top: '87%', animationDuration: '29s', animationDelay: '-3s' }}>♕</span>
        <span className="genome-float-piece is-black" style={{ left: '80%', top: '91%', animationDuration: '31s', animationDelay: '-18s' }}>♚</span>
      </div>

      <header className="genome-header border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="genome-header-overlay">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 relative z-10">
            <button onClick={() => go('home')} className="text-left shrink-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-gray-900 drop-shadow-sm">
                <span className="text-genome-orange">The</span> ChessGenome
              </h1>
            </button>

            <div className="flex items-center gap-2">
              <nav className="genome-nav-desktop hidden md:flex gap-0.5 text-sm flex-wrap justify-end">
                {linkIds.map(navBtn)}
                {navBtn('session')}
                <button
                  type="button"
                  onClick={() => { setHelpOpen(true); setMenuOpen(false); }}
                  className={`px-3 py-2 rounded-lg text-sm transition ${
                    helpOpen
                      ? 'bg-genome-orange/20 text-genome-orange font-medium'
                      : 'text-gray-800 hover:text-genome-orange hover:bg-gray-100/80'
                  }`}
                >
                  {t('nav.help')}
                </button>
              </nav>

              <div className="flex items-center gap-1">
                {LANGS.map((lang) => {
                  const isActive = currentLang === lang.code;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => changeLang(lang.code)}
                      title={lang.title}
                      aria-label={lang.title}
                      className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs font-medium transition border ${
                        isActive
                          ? 'bg-genome-orange text-white border-genome-orange'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <img
                        src={`https://flagcdn.com/24x18/${lang.flag}.png`}
                        srcSet={`https://flagcdn.com/48x36/${lang.flag}.png 2x`}
                        width="16"
                        height="12"
                        alt={lang.code.toUpperCase()}
                        className="inline-block rounded-sm"
                      />
                      <span className="hidden sm:inline">
                        {lang.code.toUpperCase()}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="genome-nav-mobile-btn md:hidden p-2 rounded-lg border-2 border-genome-orange bg-white relative"
                aria-expanded={menuOpen}
                aria-label="Menu"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="block w-6 space-y-1.5">
                  <span className="block h-0.5 bg-genome-orange" />
                  <span className="block h-0.5 bg-genome-orange" />
                  <span className="block h-0.5 bg-genome-orange" />
                </span>
                {hasContent && (
                  <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-genome-orange text-white text-xs font-bold flex items-center justify-center">
                    {state.items.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {menuOpen && (
          <nav className="genome-nav-drawer md:hidden border-t border-gray-200 bg-white/95 backdrop-blur px-3 py-3 flex flex-col gap-1 shadow-lg relative z-10">
            {linkIds.map(navBtn)}
            {navBtn('session')}
            <button
              type="button"
              onClick={() => { setHelpOpen(true); setMenuOpen(false); }}
              className="px-3 py-2 rounded-lg text-sm text-left text-gray-800 hover:text-genome-orange hover:bg-gray-100"
            >
              {t('nav.help')}
            </button>
          </nav>
        )}
        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 py-5 sm:py-8 relative z-10">
        {children}
      </main>

      <footer className="relative z-10 border-t border-gray-200 py-2 text-center text-[10px] text-gray-500 bg-white/60 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4">
          {t('brand.footer')}
        </div>
      </footer>
    </div>
  );
}
