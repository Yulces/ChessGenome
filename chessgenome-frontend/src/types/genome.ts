export interface AnalyzeResult {
  exponents: number[];
  L: number;
  L10: number;
  S_exact?: string;
  S_digits?: number;
  S: number;
  factorization: Record<string, number>;
  hash: string;
  pieceCount: number;
  staticallyAdmissible: boolean;
  engine?: string;
  existsInDb: boolean;
  timesSeen: number;
  rankApprox?: number;
  message: string;
  dbId?: string;
  cached?: boolean;
  fen?: string;
}

export interface Stats {
  totalPositions: number;
  admissiblePositions: number;
  maxL: number | null;
  maxL10: number | null;
  maxLFen: string | null;
  maxLHash: string | null;
  redisEnabled: boolean;
  dietrichessEnabled: boolean;
  cached?: boolean;
}

export interface PlyAnalysis {
  moveIndex: number;
  san: string;
  fen: string;
  L: number;
  L10: number;
  S_exact?: string;
  S_digits?: number;
  diff: number | null;
  ratio: number | null;
  exponents?: number[];
}

export interface GameAnalysisResult {
  moveCount: number;
  engine?: string;
  headers?: Record<string, string>;
  plies: PlyAnalysis[];
}

export interface Author {
  _id?: string;
  positionHash: string;
  fen: string;
  name: string;
  email: string;
  country?: string;
  note?: string;
  editToken: string;
  isRecordHolder: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================
// USERS & COMMENTS (pestaña Intercambio)
// ============================================

export interface AuthUser {
  id: string;
  nick: string;
}

export interface AuthResponse {
  ok: boolean;
  token: string;
  user: AuthUser;
}

export type CommentTag = 'bug' | 'suggestion' | 'question' | 'discussion';

export interface Comment {
  id: string;
  authorNick: string;
  content: string;
  parentId: string | null;
  tag: CommentTag;
  createdAt: string;
  canDelete?: boolean;
  replies?: Comment[];
}
