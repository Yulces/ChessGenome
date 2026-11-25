/**
 * Normalize a FEN or board-only string so chess.js / the API accept it.
 * Fixes common missing fields (castling, ep, clocks).
 */
export function normalizeFen(raw: string): string {
  let s = (raw || '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return '';

  const parts = s.split(' ');
  const board = parts[0];

  // board only
  if (parts.length === 1) {
    return `${board} w - - 0 1`;
  }
  // board turn
  if (parts.length === 2) {
    return `${board} ${parts[1]} - - 0 1`;
  }
  // board turn castling
  if (parts.length === 3) {
    return `${board} ${parts[1]} ${parts[2]} - 0 1`;
  }
  // board turn castling ? ?
  // Often missing EP: "b - 0 1" → turn, castling, half, full
  if (parts.length === 4) {
    // board turn castling ep  OR board turn castling half (ambiguous)
    // if 4th looks like clock (digits only) → missing ep
    if (/^\d+$/.test(parts[3])) {
      return `${board} ${parts[1]} ${parts[2]} - ${parts[3]} 1`;
    }
    return `${board} ${parts[1]} ${parts[2]} ${parts[3]} 0 1`;
  }
  if (parts.length === 5) {
    // Missing EP is the common case: board side castle half full
    // e.g. qqqq…/8 b - 0 1
    if (/^\d+$/.test(parts[3]) && /^\d+$/.test(parts[4])) {
      return `${board} ${parts[1]} ${parts[2]} - ${parts[3]} ${parts[4]}`;
    }
    // board side castle ep half → append fullmove
    return `${board} ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} 1`;
  }
  // 6+ standard
  return parts.slice(0, 6).join(' ');
}

/** Board part only (8 ranks). */
export function boardPart(fen: string): string {
  return normalizeFen(fen).split(' ')[0] || '';
}

/**
 * Load FEN into chess.js, allowing non-standard material (skipValidation when supported).
 */
export function loadChessFen(chess: { load: (fen: string, opts?: any) => any }, fen: string): boolean {
  const n = normalizeFen(fen);
  try {
    const ok = chess.load(n, { skipValidation: true });
    if (ok === false) {
      const ok2 = chess.load(n);
      return ok2 !== false;
    }
    return true;
  } catch {
    try {
      chess.load(n);
      return true;
    } catch {
      return false;
    }
  }
}
