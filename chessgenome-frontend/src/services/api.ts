import type { AnalyzeResult, Stats, GameAnalysisResult, Author, AuthUser, AuthResponse, Comment } from '../types/genome';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function analyzePosition(
  fen: string,
  storeIfNew = false,
): Promise<AnalyzeResult> {
  const res = await fetch('/api/positions/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen, storeIfNew }),
  });
  return json<AnalyzeResult>(res);
}

// ============================================
// BULK ANALYZE — guarda toda la partida de golpe
// ============================================

export interface BulkAnalyzeResult {
  total: number;
  stored: number;
  updated: number;
  skipped: number;
  transitionsSaved: number;
  results: Array<{
    moveIndex: number;
    hash: string;
    status: 'stored' | 'updated' | 'skipped' | 'error';
    error?: string;
  }>;
}

export async function bulkAnalyzeGame(
  fens: string[],
  sans: string[] = [],
  opts: {
    headers?: Record<string, string>;
    ucis?: string[];
    storeIfNew?: boolean;
    saveTransitions?: boolean;
    pgn?: string;
  } = {},
): Promise<BulkAnalyzeResult> {
  const res = await fetch('/api/positions/bulk-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fens,
      sans,
      ucis: opts.ucis || [],
      headers: opts.headers || {},
      storeIfNew: opts.storeIfNew ?? false,
      saveTransitions: opts.saveTransitions ?? true,
      pgn: opts.pgn || '',
    }),
  });
  return json<BulkAnalyzeResult>(res);
}

export async function getStats(): Promise<Stats> {
  const res = await fetch('/api/positions/stats');
  return json<Stats>(res);
}

export async function getFirstTerms(limit = 50, offset = 0): Promise<any[]> {
  const res = await fetch(
    `/api/positions/first-terms?limit=${limit}&offset=${offset}`,
  );
  return json<any[]>(res);
}

export async function analyzeGame(
  fens: string[],
  headers: Record<string, string> = {},
  sans: string[] = [],
): Promise<GameAnalysisResult> {
  const res = await fetch('/api/analysis/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fens, headers, sans }),
  });
  return json<GameAnalysisResult>(res);
}

export async function searchPosition(fen: string): Promise<any> {
  const res = await fetch(
    `/api/positions/search?fen=${encodeURIComponent(fen)}`,
  );
  return json<any>(res);
}

export async function getTopPositions(limit = 30): Promise<any[]> {
  const res = await fetch(`/api/positions/top?limit=${limit}`);
  return json<any[]>(res);
}

export async function getTopByL10(limit = 30): Promise<any[]> {
  const res = await fetch(`/api/positions/top-by-l10?limit=${limit}`);
  return json<any[]>(res);
}

export async function getTransitions(fromHash: string): Promise<any[]> {
  const res = await fetch(
    `/api/positions/transitions/${encodeURIComponent(fromHash)}`,
  );
  return json<any[]>(res);
}

export async function neuralFeatures(fen: string): Promise<any> {
  const res = await fetch('/api/neural/features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen }),
  });
  return json<any>(res);
}

export async function stockfishStatus(): Promise<any> {
  const res = await fetch('/api/stockfish/status');
  return json<any>(res);
}

export async function neuralModels(): Promise<any> {
  const res = await fetch('/api/neural/models');
  return json<any>(res);
}

export async function neuralPredict(fen: string, model?: string): Promise<any> {
  const res = await fetch('/api/neural/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen, model }),
  });
  return json<any>(res);
}

// ============================================
// Advanced search
// ============================================

export interface AdvancedSearchParams {
  minL10?: number;
  maxL10?: number;
  minPieces?: number;
  maxPieces?: number;
  minTimesSeen?: number;
  admissibleOnly?: boolean;
  sortBy?: 'L10' | 'L' | 'timesSeen' | 'pieceCount';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface AdvancedSearchResult {
  results: any[];
  total: number;
  limit: number;
  offset: number;
}

export async function searchAdvanced(
  params: AdvancedSearchParams,
): Promise<AdvancedSearchResult> {
  const qs = new URLSearchParams();
  if (params.minL10 != null) qs.set('minL10', String(params.minL10));
  if (params.maxL10 != null) qs.set('maxL10', String(params.maxL10));
  if (params.minPieces != null) qs.set('minPieces', String(params.minPieces));
  if (params.maxPieces != null) qs.set('maxPieces', String(params.maxPieces));
  if (params.minTimesSeen != null)
    qs.set('minTimesSeen', String(params.minTimesSeen));
  if (params.admissibleOnly) qs.set('admissibleOnly', 'true');
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.order) qs.set('order', params.order);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));

  const res = await fetch(`/api/positions/search/advanced?${qs.toString()}`);
  return json<AdvancedSearchResult>(res);
}

// ============================================
// Authors
// ============================================

export interface PublicAuthor {
  name: string;
  country: string;
  note: string;
  isRecordHolder: boolean;
  createdAt?: string;
}

export async function getCurrentRecordAuthor(): Promise<{
  found: boolean;
  author: PublicAuthor | null;
}> {
  const res = await fetch('/api/authors/current-record');
  return json<any>(res);
}

export async function getAuthorByPosition(hash: string): Promise<{
  found: boolean;
  author: PublicAuthor | null;
}> {
  const res = await fetch(`/api/authors/position/${encodeURIComponent(hash)}`);
  return json<any>(res);
}

export async function claimAuthorship(dto: {
  positionHash: string;
  fen: string;
  name: string;
  email: string;
  country?: string;
  note?: string;
}): Promise<{ ok: boolean; author: Author }> {
  const res = await fetch('/api/authors/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  return json<any>(res);
}

export async function updateAuthor(
  editToken: string,
  dto: { name?: string; country?: string; note?: string },
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/authors/${encodeURIComponent(editToken)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  return json<any>(res);
}

export async function refreshRecordHolders(): Promise<{ ok: boolean }> {
  const res = await fetch('/api/authors/refresh-record', {
    method: 'POST',
  });
  return json<any>(res);
}

// ============================================
// PGNS (récord global por maxL10)
// ============================================

export interface TopRecordPgn {
  found: boolean;
  pgn: string | null;
  headers: Record<string, string>;
  maxL10: number | null;
  maxL10Fen: string | null;
  maxL10Hash: string | null;
  maxL10PlyIndex: number | null;
  plyCount: number | null;
  timesSeen: number | null;
}

export async function getTopRecordPgn(): Promise<TopRecordPgn> {
  const res = await fetch('/api/pgns/top-record');
  return json<TopRecordPgn>(res);
}

export async function getTopPgns(limit = 10): Promise<any[]> {
  const res = await fetch(`/api/pgns/top?limit=${limit}`);
  return json<any[]>(res);
}

// ============================================
// AUTH (registro / login / me)
// ============================================

const TOKEN_KEY = 'chessgenome-auth-token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function registerUser(
  nick: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick, password }),
  });
  return json<AuthResponse>(res);
}

export async function loginUser(
  nick: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick, password }),
  });
  return json<AuthResponse>(res);
}

export async function getMe(): Promise<AuthUser> {
  const res = await fetch('/api/auth/me', {
    headers: authHeaders(),
  });
  return json<AuthUser>(res);
}

// ============================================
// COMMENTS (Intercambio)
// ============================================

export async function listComments(tag?: string): Promise<Comment[]> {
  const url = tag
    ? `/api/comments?tag=${encodeURIComponent(tag)}`
    : '/api/comments';
  const res = await fetch(url, {
    headers: authHeaders(),
  });
  return json<Comment[]>(res);
}

export async function createComment(
  content: string,
  parentId?: string | null,
  tag?: string,
): Promise<Comment> {
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ content, parentId: parentId || null, tag }),
  });
  return json<Comment>(res);
}

export async function deleteComment(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return json<{ ok: boolean }>(res);
}
