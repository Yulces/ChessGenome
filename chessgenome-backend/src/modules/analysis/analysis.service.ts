import { Injectable } from '@nestjs/common';
import { PrimeEncodingService, EncodingResult } from '../genome/prime-encoding.service';

/**
 * Port of DietrichessAnalyzer game analysis.
 *
 * Definitions (L = ln S, L10 = log10 S):
 *   D_k = L_k − L_{k−1}           (= ln(S_k / S_{k−1}))
 *   R_k = S_k / S_{k−1}           = exp(D_k) = 10^(L10_k − L10_{k−1})
 *   (Not L_k/L_{k−1}.)
 */
export interface PlyAnalysis {
  moveIndex: number;
  fen: string;
  san?: string;
  L: number;
  L10: number;
  S_exact: string;
  S_digits: number;
  diff: number | null; // D_k = L_k - L_{k-1}
  ratio: number | null; // R_k = S_k / S_{k-1}
  pieceCount: number;
  hash: string;
  exponents: number[];
}

export interface GameAnalysisResult {
  headers: Record<string, string>;
  plies: PlyAnalysis[];
  moveCount: number;
  engine: string;
}

@Injectable()
export class AnalysisService {
  constructor(private readonly encoding: PrimeEncodingService) {}

  analyzeFenSequence(
    fens: string[],
    headers: Record<string, string> = {},
    sans: string[] = [],
  ): GameAnalysisResult {
    const plies: PlyAnalysis[] = [];
    let prevL: number | null = null;
    let prevL10: number | null = null;

    for (let i = 0; i < fens.length; i++) {
      const enc: EncodingResult = this.encoding.analyze(fens[i]);
      const diff = prevL !== null ? enc.L - prevL : null;

      // True S-ratio: S_k/S_{k-1} = 10^(ΔL10) = exp(ΔL)
      let ratio: number | null = null;
      if (prevL10 !== null) {
        const d10 = enc.L10 - prevL10;
        // Prefer log10 path; clamp to avoid Float overflow in display
        if (d10 > 300) ratio = Number.POSITIVE_INFINITY;
        else if (d10 < -300) ratio = 0;
        else ratio = Math.pow(10, d10);
      }

      plies.push({
        moveIndex: i,
        fen: fens[i],
        san: sans[i],
        L: enc.L,
        L10: enc.L10,
        S_exact: enc.S_exact,
        S_digits: enc.S_digits,
        diff,
        ratio,
        pieceCount: enc.pieceCount,
        hash: enc.hash,
        exponents: enc.exponents,
      });
      prevL = enc.L;
      prevL10 = enc.L10;
    }

    return {
      headers,
      plies,
      moveCount: Math.max(0, fens.length - 1),
      engine: 'typescript-bigint',
    };
  }
}
