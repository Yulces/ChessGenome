import { useState, useCallback } from 'react';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ContributePage } from './pages/ContributePage';
import { AnalyzeGamePage } from './pages/AnalyzeGamePage';
import { SearchPage } from './pages/SearchPage';
import { EditorPage } from './pages/EditorPage';
import { OeisPage } from './pages/OeisPage';
import { SessionPage } from './pages/SessionPage';
import { ExchangePage } from './pages/ExchangePage';
import { SessionProvider } from './context/SessionContext';
import { AuthProvider } from './context/AuthContext';

type Page =
  | 'home'
  | 'contribute'
  | 'analyze'
  | 'search'
  | 'editor'
  | 'oeis'
  | 'session'
  | 'exchange';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  /** FEN to open on Editor */
  const [editorFen, setEditorFen] = useState<string | null>(null);
  /** PGN to auto-analyze on AnalyzeGamePage */
  const [analyzePgn, setAnalyzePgn] = useState<string | null>(null);

  const navigate = useCallback((p: Page) => {
    if (p !== 'editor') setEditorFen(null);
    if (p !== 'analyze') setAnalyzePgn(null);
    setPage(p);
  }, []);

  const openEditorWithFen = useCallback((fen: string) => {
    setEditorFen(fen);
    setPage('editor');
  }, []);

  const openAnalyzeWithPgn = useCallback((pgn: string) => {
    setAnalyzePgn(pgn);
    setPage('analyze');
  }, []);

  return (
    <AuthProvider>
      <SessionProvider>
        <Layout current={page} onNavigate={navigate}>
          {page === 'home' && (
            <HomePage
              onNavigate={navigate as any}
              onOpenPosition={openAnalyzeWithPgn}
            />
          )}
          {page === 'analyze' && (
            <AnalyzeGamePage
              initialPgn={analyzePgn}
              onInitialPgnConsumed={() => setAnalyzePgn(null)}
            />
          )}
          {page === 'search' && <SearchPage />}
          {page === 'editor' && (
            <EditorPage
              initialFen={editorFen}
              onInitialFenConsumed={() => setEditorFen(null)}
            />
          )}
          {page === 'contribute' && <ContributePage />}
          {page === 'oeis' && <OeisPage />}
          {page === 'session' && <SessionPage />}
          {page === 'exchange' && <ExchangePage />}
        </Layout>
      </SessionProvider>
    </AuthProvider>
  );
}
