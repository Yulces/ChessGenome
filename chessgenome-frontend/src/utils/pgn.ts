import { Chess } from 'chess.js';

/** Parse PGN headers with regex (works for Chess960 / SetUp). */
export function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const tagRe = /\[\s*(\w+)\s+"([^"]*)"\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(pgn)) !== null) {
    headers[m[1]] = m[2];
  }
  return headers;
}

function extractMoveSans(pgn: string): string[] {
  let body = pgn.replace(/\r\n/g, '\n');

  // 1. Eliminar los tags de cabecera [Tag "value"] (pero NO los [%...] dentro de comentarios)
  body = body.replace(/^\[[A-Za-z][^\]]*\]\s*$/gm, ' ');

  // 2. Eliminar comentarios { ... } con anidamiento
  for (let i = 0; i < 5; i++) {
    body = body.replace(/\{[^{}]*\}/g, ' ');
  }

  // 3. Eliminar variantes ( ... ) con anidamiento
  for (let i = 0; i < 5; i++) {
    body = body.replace(/\([^()]*\)/g, ' ');
  }

  // 4. Eliminar anotaciones $n
  body = body.replace(/\$\d+/g, ' ');

  // 5. Eliminar comandos [%...] (por si quedó alguno)
  body = body.replace(/\[%[^\]]*\]/g, ' ');

  // 6. Eliminar resultados
  body = body.replace(/\b(?:1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');

  // 7. Eliminar números de jugada (1., 1..., 1.e4, etc.)
  body = body.replace(/\d+\.(\.\.)?/g, ' ');
  body = body.replace(/\.\.\./g, ' ');

  // 8. Eliminar captura al paso
  body = body.replace(/\b(e\.p\.|ep)\b/gi, ' ');

  // 9. Eliminar símbolos !?, !!, ??, etc.
  body = body.replace(/[!?]+/g, ' ');

  // 10. Eliminar caracteres no válidos (comillas, etc.)
  body = body.replace(/["']/g, ' ');

  // 11. Filtrar tokens
  const raw = body.split(/\s+/).filter(Boolean);
  const sanLike =
    /^(?:O-O-O[\+#]?|O-O[\+#]?|0-0-0[\+#]?|0-0[\+#]?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?[\+#]?|[a-h]x[a-h](?:=?[QRBN])?[\+#]?)$/i;
  return raw.filter((tok) => tok.length > 0 && sanLike.test(tok));
}

/**
 * Build FEN list from PGN including non-standard starts ([FEN] + [SetUp "1"]).
 * Replays SANs from the header FEN (not from the standard starting position).
 */
export function pgnToPlies(pgn: string): {
  headers: Record<string, string>;
  fens: string[];
  sans: string[];
} {
  const headers = parsePgnHeaders(pgn);

  // Si el PGN no trae [Result "..."], intentar extraerlo del cuerpo
  if (!headers.Result) {
    const bodyOnly = pgn.replace(/\[[^\]]*\]/g, ' ');
    const resultMatch = bodyOnly.match(/\b(1-0|0-1|1\/2-1\/2|\*)\b/);
    if (resultMatch) {
      headers.Result = resultMatch[1];
    }
  }

  let startFen =
    (headers.FEN || headers.Fen || '').trim() ||
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Normalizar FEN: si el move number es 0, cambiarlo a 1 (chess.js lo exige)
  const fenParts = startFen.split(' ');
  if (fenParts.length >= 6) {
    const moveNumber = parseInt(fenParts[5], 10);
    if (!isNaN(moveNumber) && moveNumber < 1) {
      fenParts[5] = '1';
      startFen = fenParts.join(' ');
    }
  }
  headers.FEN = startFen;

  const chess = new Chess();
  try {
    const ok = chess.load(startFen) as boolean | void;
    if (ok === false) {
      throw new Error('FEN inválida en PGN');
    }
  } catch (e: any) {
    if (String(e?.message || e).includes('FEN')) throw e;
    throw new Error(e?.message || 'FEN inválida en PGN');
  }

  // Normalizar FEN dentro del PGN antes de loadPgn
  let normalizedPgn = pgn;
  const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/);
  if (fenMatch) {
    const fen = fenMatch[1];
    const parts = fen.split(' ');
    if (parts.length >= 6) {
      const moveNumber = parseInt(parts[5], 10);
      if (!isNaN(moveNumber) && moveNumber < 1) {
        parts[5] = '1';
        const newFen = parts.join(' ');
        normalizedPgn = pgn.replace(fen, newFen);
      }
    }
  }

  // Usar chess.loadPgn para parsear el PGN completo (ignora comentarios y variantes)
  const parser = new Chess();
  try {
    parser.loadPgn(normalizedPgn);
  } catch (e: any) {
    console.warn(`[PGN] Error al cargar PGN: ${e.message}`);
    // Si falla, intentar con el parser manual (fallback)
    const tokens = extractMoveSans(pgn);
    const sans: string[] = [''];
    const fens: string[] = [chess.fen()];
    for (const san of tokens) {
      let mv: ReturnType<Chess['move']> = null;
      try { mv = chess.move(san); } catch { mv = null; }
      if (!mv) {
        try { mv = chess.move(san, { strict: false } as any); } catch { mv = null; }
      }
      if (!mv) {
        try { mv = chess.move(san, { sloppy: true } as any); } catch { mv = null; }
      }
      if (!mv) {
        console.warn(`Jugada inválida: ${san} — se omite y se continúa`);
        continue;
      }
      sans.push(mv.san);
      fens.push(chess.fen());
    }
    return { headers, fens, sans };
  }

  // Extraer la línea principal con chess.js
  const history = parser.history({ verbose: true });
  const sans: string[] = [''];
  const fens: string[] = [chess.fen()];

  for (const move of history) {
    try {
      chess.move(move.san);
      sans.push(move.san);
      fens.push(chess.fen());
    } catch (e: any) {
      console.warn(`[PGN] Error en jugada ${move.san}: ${e.message}`);
    }
  }

  return { headers, fens, sans };
}

