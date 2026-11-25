import { Injectable } from '@nestjs/common';

/**
 * First 64 primes (OEIS A000040) – square index 0 = a1 … 63 = h8
 * Identical to DietrichessAnalyzer mapeo_casillas.
 */
export const PRIMES: readonly number[] = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53,
  59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131,
  137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223,
  227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311,
] as const;

/** Piece symbol → exponent (identical to valores_piezas) */
export const PIECE_VALUES: Record<string, number> = {
  '': 0,
  P: 1, p: 2,
  R: 3, r: 4,
  N: 5, n: 6,
  B: 7, b: 8,
  Q: 9, q: 10,
  K: 11, k: 12,
};

export interface EncodingResult {
  exponents: number[];
  L: number;
  L10: number;
  S_exact: string;
  S_digits: number;
  S: number | null;
  factorization: Record<number, number>;
  hash: string;
  pieceCount: number;
  staticallyAdmissible: boolean;
  engine: string;
}

@Injectable()
export class PrimeEncodingService {
  private static readonly PIECE_CHARS = new Set([
    'p', 'n', 'b', 'r', 'q', 'k',
    'P', 'N', 'B', 'R', 'Q', 'K',
  ]);

  validateFen(fen: string): void {
    if (typeof fen !== 'string' || !fen.trim()) {
      throw new Error('FEN vacío o no válido');
    }
    const parts = fen.trim().split(/\s+/);
    const boardPart = parts[0];
    if (!boardPart || boardPart.length < 15) {
      throw new Error('FEN inválido: parte del tablero demasiado corta');
    }
    const ranks = boardPart.split('/');
    if (ranks.length !== 8) {
      throw new Error(`FEN inválido: se esperaban 8 filas, se encontraron ${ranks.length}`);
    }
    for (let r = 0; r < 8; r++) {
      const rank = ranks[r];
      if (!rank) {
        throw new Error(`FEN inválido: la fila ${8 - r} está vacía`);
      }
      let squares = 0;
      for (const ch of rank) {
        if (ch >= '1' && ch <= '8') {
          squares += parseInt(ch, 10);
        } else if (PrimeEncodingService.PIECE_CHARS.has(ch)) {
          squares += 1;
        } else {
          throw new Error(`FEN inválido: carácter '${ch}' no permitido en la fila ${8 - r}`);
        }
        if (squares > 8) {
          throw new Error(`FEN inválido: la fila ${8 - r} tiene más de 8 casillas`);
        }
      }
      if (squares !== 8) {
        throw new Error(`FEN inválido: la fila ${8 - r} tiene ${squares} casillas en lugar de 8`);
      }
    }
    if (parts.length >= 2 && parts[1] !== 'w' && parts[1] !== 'b') {
      throw new Error("FEN inválido: turno debe ser 'w' o 'b'");
    }
  }

  fenToExponents(fen: string): number[] {
    this.validateFen(fen);
    const boardPart = fen.trim().split(/\s+/)[0];
    const ranks = boardPart.split('/');
    const exp = new Array(64).fill(0);
    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
      const base = (7 - rankIdx) * 8;
      let fileIdx = 0;
      for (const ch of ranks[rankIdx]) {
        if (ch >= '1' && ch <= '8') {
          fileIdx += parseInt(ch, 10);
        } else {
          exp[base + fileIdx] = PIECE_VALUES[ch] ?? 0;
          fileIdx++;
        }
      }
    }
    return exp;
  }

  computeL(exponents: number[]): { L: number; L10: number } {
    let L = 0;
    let L10 = 0;
    for (let i = 0; i < 64; i++) {
      const v = exponents[i];
      if (v > 0) {
        L += v * Math.log(PRIMES[i]);
        L10 += v * Math.log10(PRIMES[i]);
      }
    }
    return { L, L10 };
  }

  computeSExact(exponents: number[]): { S_exact: string; S_digits: number; S: number | null } {
    let S = 1n;
    for (let i = 0; i < 64; i++) {
      const v = exponents[i];
      if (v > 0) {
        S *= BigInt(PRIMES[i]) ** BigInt(v);
      }
    }
    const S_exact = S.toString();
    const S_digits = S_exact.length;
    let S_float: number | null = null;
    if (S_digits <= 308) {
      const n = Number(S_exact);
      if (Number.isFinite(n)) S_float = n;
    }
    return { S_exact, S_digits, S: S_float };
  }

  getFactorization(exponents: number[]): Record<number, number> {
    const factors: Record<number, number> = {};
    for (let i = 0; i < 64; i++) {
      if (exponents[i] > 0) {
        factors[PRIMES[i]] = exponents[i];
      }
    }
    return factors;
  }

  positionHash(exponents: number[]): string {
    return exponents.join(',');
  }

  /**
   * Static admissibility:
   *  - exactly 1 white king (11) and 1 black king (12)
   *  - kings not adjacent
   *  - material limits per side (FIDE-legal reachable):
   *      pawns ≤ 8, queens ≤ 9, rooks ≤ 10, knights ≤ 10, bishops ≤ 10
   *      total pieces per side ≤ 16
   */
  isStaticallyAdmissible(exponents: number[]): boolean {
    let whiteKingIdx = -1;
    let blackKingIdx = -1;

    // Material counters per side
    let wP = 0, wR = 0, wN = 0, wB = 0, wQ = 0;
    let bP = 0, bR = 0, bN = 0, bB = 0, bQ = 0;

    for (let i = 0; i < 64; i++) {
      const v = exponents[i];
      if (v === 0) continue;

      switch (v) {
        case 1: wP++; break;
        case 2: bP++; break;
        case 3: wR++; break;
        case 4: bR++; break;
        case 5: wN++; break;
        case 6: bN++; break;
        case 7: wB++; break;
        case 8: bB++; break;
        case 9: wQ++; break;
        case 10: bQ++; break;
        case 11:
          if (whiteKingIdx !== -1) return false;
          whiteKingIdx = i;
          break;
        case 12:
          if (blackKingIdx !== -1) return false;
          blackKingIdx = i;
          break;
      }
    }

    if (whiteKingIdx === -1 || blackKingIdx === -1) return false;

    // Kings not adjacent
    const r1 = Math.floor(whiteKingIdx / 8);
    const c1 = whiteKingIdx % 8;
    const r2 = Math.floor(blackKingIdx / 8);
    const c2 = blackKingIdx % 8;
    if (Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)) <= 1) return false;

    // Material limits — FIDE reachable
    if (wP > 8 || bP > 8) return false;
    if (wQ > 9 || bQ > 9) return false;
    if (wR > 10 || bR > 10) return false;
    if (wN > 10 || bN > 10) return false;
    if (wB > 10 || bB > 10) return false;

    // Total pieces per side ≤ 16
    const wTotal = wP + wR + wN + wB + wQ + 1; // +1 for king
    const bTotal = bP + bR + bN + bB + bQ + 1;
    if (wTotal > 16 || bTotal > 16) return false;

    return true;
  }

  analyze(fen: string): EncodingResult {
    const exponents = this.fenToExponents(fen);
    const { L, L10 } = this.computeL(exponents);
    const { S_exact, S_digits, S } = this.computeSExact(exponents);
    const factorization = this.getFactorization(exponents);
    const hash = this.positionHash(exponents);
    const pieceCount = exponents.filter((v) => v > 0).length;
    const staticallyAdmissible = this.isStaticallyAdmissible(exponents);

    return {
      exponents,
      L,
      L10,
      S_exact,
      S_digits,
      S,
      factorization,
      hash,
      pieceCount,
      staticallyAdmissible,
      engine: 'typescript-bigint',
    };
  }
}
