import { normalizeFen, loadChessFen } from './normalizeFen';

/**
 * Client-side FEN validation (board part + optional side-to-move).
 * Returns null if valid, or an error message string if invalid.
 */
export function validateFen(fen: string): string | null {
  if (typeof fen !== 'string' || !fen.trim()) {
    return 'FEN vacío';
  }

  const normalized = normalizeFen(fen);
  const parts = normalized.split(/\s+/);
  const board = parts[0];

  if (!board || board.length < 15) {
    return 'FEN inválido: parte del tablero demasiado corta';
  }

  const ranks = board.split('/');
  if (ranks.length !== 8) {
    return `FEN inválido: se esperaban 8 filas, se encontraron ${ranks.length}`;
  }

  const pieceChars = new Set([
    'p', 'n', 'b', 'r', 'q', 'k',
    'P', 'N', 'B', 'R', 'Q', 'K',
  ]);

  for (let r = 0; r < 8; r++) {
    const rank = ranks[r];
    if (!rank) {
      return `FEN inválido: la fila ${8 - r} está vacía`;
    }

    let squares = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        squares += parseInt(ch, 10);
      } else if (pieceChars.has(ch)) {
        squares += 1;
      } else {
        return `FEN inválido: carácter '${ch}' no permitido en la fila ${8 - r}`;
      }
      if (squares > 8) {
        return `FEN inválido: la fila ${8 - r} tiene más de 8 casillas`;
      }
    }
    if (squares !== 8) {
      return `FEN inválido: la fila ${8 - r} tiene ${squares} casillas en lugar de 8`;
    }
  }

  if (parts.length >= 2) {
    const side = parts[1];
    if (side !== 'w' && side !== 'b') {
      return `FEN inválido: turno debe ser 'w' o 'b'`;
    }
  }

  return null;
}

/**
 * chess.js layer — uses normalizeFen + skipValidation for study positions.
 */
export function validateFenWithChessJs(fen: string, Chess: any): string | null {
  const basic = validateFen(fen);
  if (basic) return basic;

  const n = normalizeFen(fen);
  try {
    const g = new Chess();
    if (loadChessFen(g, n)) return null;
    return 'FEN inválido según el motor de ajedrez';
  } catch {
    return 'FEN inválido según el motor de ajedrez';
  }
}

export { normalizeFen, loadChessFen };
