import { Chess } from 'chess.js';

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
  body = body.replace(/\[[^\]]*\]/g, ' ');
  body = body.replace(/\{[^}]*\}/g, ' ');
  for (let i = 0; i < 5; i++) {
    body = body.replace(/\([^()]*\)/g, ' ');
  }
  body = body.replace(/\$\d+/g, ' ');
  body = body.replace(/\b(?:1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');
  body = body.replace(/\d+\.(\.\.)?/g, ' ');
  body = body.replace(/\.\.\./g, ' ');
  body = body.replace(/\b(e\.p\.|ep)\b/gi, ' ');
  body = body.replace(/[!?]+/g, ' ');

  const raw = body.split(/\s+/).filter(Boolean);
  const sanLike =
    /^(?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?[\+#]?|[a-h]x[a-h](?:=?[QRBN])?[\+#]?)$/i;
  return raw.filter((tok) => sanLike.test(tok));
}

export function pgnToPlies(pgn: string): {
  headers: Record<string, string>;
  fens: string[];
  sans: string[];
} {
  const headers = parsePgnHeaders(pgn);

  if (!headers.Result) {
    const bodyOnly = pgn.replace(/\[[^\]]*\]/g, ' ');
    const resultMatch = bodyOnly.match(/\b(1-0|0-1|1\/2-1\/2|\*)\b/);
    if (resultMatch) {
      headers.Result = resultMatch[1];
    }
  }

  const startFen =
    (headers.FEN || headers.Fen || '').trim() ||
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const chess = new Chess();
  try {
    chess.load(startFen);
  } catch (e: any) {
    throw new Error(`FEN inválida en PGN: ${e?.message || e}`);
  }

  const sans = extractMoveSans(pgn);
  const fens: string[] = [chess.fen()];

  for (const san of sans) {
    try {
      const move = chess.move(san);
      if (!move) break;
      fens.push(chess.fen());
    } catch {
      // jugada ilegal o comentario: parar
      break;
    }
  }

  return { headers, fens, sans };
}
