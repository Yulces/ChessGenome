import {
  Document, Packer, Paragraph, TextRun, ImageRun,
  HeadingLevel, AlignmentType, BorderStyle,
} from 'docx';

// Cambia a false si Word vuelve a fallar — desactiva todas las imágenes.
const ENABLE_IMAGES = true;
const BOARD_PX = 400;
const CHART_PX = 480;

function dataUrlToUint8(dataUrl: string): Uint8Array | null {
  if (!dataUrl || dataUrl.indexOf('data:') !== 0) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    // Forzar un ArrayBuffer "limpio" (evita subarray issues)
    return new Uint8Array(arr.buffer.slice(0));
  } catch (e) { return null; }
}

function cleanText(s: any): string {
  if (s == null) return '';
  return String(s)
    .replace(/\\+/g, '')
    .replace(/\u00d8/g, '0')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00b7/g, '.')
    .replace(/\u00a0/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim();
}

function fmtNum(v: any, d: number): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return isFinite(n) ? n.toFixed(d) : String(v);
}

function sciFromDigits(s: string): string {
  const t = String(s).replace(/\D/g, '');
  if (t.length < 2) return '';
  return t[0] + '.' + t.slice(1, 8) + 'e+' + (t.length - 1);
}

function boardAsPngDataUrl(fen: string): string {
  if (!fen) return '';
  const rows = String(fen).split(' ')[0].split('/');
  if (rows.length !== 8) return '';
  const SQ = BOARD_PX / 8;
  const canvas = document.createElement('canvas');
  canvas.width = BOARD_PX;
  canvas.height = BOARD_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const LIGHT = '#f0d9b5', DARK = '#b58863';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = ((r + c) % 2 === 0) ? LIGHT : DARK;
      ctx.fillRect(c * SQ, r * SQ, SQ, SQ);
    }
  }
  const GLYPH: any = {
    'k':'\u265A','q':'\u265B','r':'\u265C','b':'\u265D','n':'\u265E','p':'\u265F',
  };
  ctx.font = (SQ * 0.8) + 'px "DejaVu Sans", "Arial Unicode MS", "Segoe UI Symbol", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < 8; r++) {
    const row = rows[r];
    let fileIdx = 0;
    for (let ci = 0; ci < row.length; ci++) {
      const ch = row[ci];
      if (ch >= '1' && ch <= '8') {
        fileIdx += parseInt(ch, 10);
      } else {
        const lower = ch.toLowerCase();
        const glyph = GLYPH[lower] || ch;
        const cx = fileIdx * SQ + SQ / 2;
        const cy = r * SQ + SQ / 2;
        const isWhite = ch === ch.toUpperCase() && ch !== ch.toLowerCase();
        if (isWhite) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#000';
          ctx.fillStyle = '#fff';
          ctx.fillText(glyph, cx, cy);
          ctx.strokeText(glyph, cx, cy);
        } else {
          ctx.fillStyle = '#000';
          ctx.fillText(glyph, cx, cy);
        }
        fileIdx++;
      }
    }
  }
  return canvas.toDataURL('image/png');
}

function svgToPngDataUrl(svgStr: string): Promise<string> {
  return new Promise(function(resolve){
    try {
      let svg = String(svgStr);
      if (svg.indexOf('xmlns=') === -1) {
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const img = new Image();
      img.onload = function() {
        try {
          const w = CHART_PX;
          const h = Math.round(CHART_PX * (img.height || 300) / (img.width || 600));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(''); return; }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) { resolve(''); }
      };
      img.onerror = function() { resolve(''); };
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      img.src = URL.createObjectURL(blob);
    } catch (e) { resolve(''); }
  });
}

function hRule(color: string, size: number): Paragraph {
  return new Paragraph({
    text: '',
    border: { bottom: { color, style: BorderStyle.SINGLE, size, space: 1 } },
  });
}

export async function generateWordDocx(
  state: any,
  options: any,
  _t: any,
): Promise<void> {
  const items: any[] = (state.items as any[]) || [];
  const games = items.filter(i => i.type === 'game');
  const analyses = items.filter(i => i.type === 'analysis');
  const searches = items.filter(i => i.type === 'search');
  const charts = items.filter(i => i.type === 'chart');

  const author = cleanText(options.authorName || '-');
  const title  = cleanText(options.title || 'ChessGenome');
  const notes  = cleanText(options.notes || '');

  const children: Paragraph[] = [];

  // ---- Portada ----
  children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }));
  children.push(new Paragraph({ text: 'Author: ' + author }));
  children.push(new Paragraph({ text: 'Date: ' + new Date().toISOString().slice(0,19).replace('T',' ') }));
  children.push(hRule('999999', 6));

  // ---- Summary ----
  children.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }));
  children.push(new Paragraph({ text: 'Analyses: ' + analyses.length, bullet: { level: 0 } }));
  children.push(new Paragraph({ text: 'Games: ' + games.length, bullet: { level: 0 } }));
  children.push(new Paragraph({ text: 'Searches: ' + searches.length, bullet: { level: 0 } }));
  children.push(new Paragraph({ text: 'Charts: ' + charts.length, bullet: { level: 0 } }));
  if (notes) {
    children.push(new Paragraph({ text: 'Notes', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: notes }));
  }

  // ---- Partidas ----
  for (let gi = 0; gi < games.length; gi++) {
    const g: any = games[gi];
    const h: any = g.headers || {};
    const gWhite  = cleanText(h.White || '?');
    const gBlack  = cleanText(h.Black || '?');
    const gResult = cleanText(h.Result || '*');
    const meta = [h.Event, h.Site, h.Date].filter(Boolean).map(cleanText).join(' - ');

    children.push(hRule('333333', 12));
    children.push(new Paragraph({ text: '', spacing: { before: 200 } }));
    children.push(new Paragraph({ text: 'Game ' + (gi+1) + ': ' + gWhite + ' vs ' + gBlack, heading: HeadingLevel.HEADING_1 }));
    if (meta) children.push(new Paragraph({ text: meta, italics: true } as any));
    children.push(new Paragraph({ text: 'Result: ' + gResult }));

    const plies: any[] = Array.isArray(g.plies) ? g.plies : [];

    // Tablero inicial PNG
    if (plies.length && plies[0].fen) {
      const ifn = String(plies[0].fen);
      children.push(new Paragraph({ text: 'Initial FEN: ' + ifn }));
      if (ENABLE_IMAGES) {
        const boardPng = boardAsPngDataUrl(ifn);
        const arr = dataUrlToUint8(boardPng);
        if (arr) {
          children.push(new Paragraph({ text: 'Initial board:', heading: HeadingLevel.HEADING_2 }));
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({
              type: 'png',
              data: arr,
              transformation: { width: 400, height: 400 },
            })],
          }));
        }
      }
    }

    // PGN
    if (g.pgn) {
      children.push(new Paragraph({ text: 'PGN', heading: HeadingLevel.HEADING_2 }));
      const pgnLines = String(g.pgn).split('\n');
      for (const pl of pgnLines) {
        children.push(new Paragraph({
          children: [new TextRun({ text: cleanText(pl), font: 'Consolas', size: 18 })],
        }));
      }
    }

    // Estados
    if (plies.length) {
      children.push(new Paragraph({ text: 'States (' + plies.length + ')', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: 'State 0 = initial position; State N = after move N.', italics: true } as any));

      for (let pi = 0; pi < plies.length; pi++) {
        const pl: any = plies[pi];
        const idx = pi;
        const san = cleanText(pl.san || '');

        // Separador grande entre estados
        children.push(new Paragraph({ text: '' }));
        children.push(hRule('666666', 6));
        children.push(new Paragraph({ text: '' }));
        children.push(new Paragraph({
          text: (idx === 0) ? 'State 0 - Initial position' : ('State ' + idx + ' - ' + san),
          heading: HeadingLevel.HEADING_3,
        }));

        if (pl.L != null)    children.push(new Paragraph({ children: [new TextRun({ text: 'L(' + idx + ') = ', bold: true }), new TextRun({ text: fmtNum(pl.L, 6) })] }));
        if (pl.L10 != null)  children.push(new Paragraph({ children: [new TextRun({ text: 'L10(' + idx + ') = ', bold: true }), new TextRun({ text: fmtNum(pl.L10, 6) })] }));
        if (pl.diff != null) children.push(new Paragraph({ children: [new TextRun({ text: 'D(' + idx + ') = ', bold: true }), new TextRun({ text: fmtNum(pl.diff, 6) })] }));
        if (pl.ratio != null)children.push(new Paragraph({ children: [new TextRun({ text: 'R(' + idx + ') = ', bold: true }), new TextRun({ text: fmtNum(pl.ratio, 6) })] }));

        if (pl.S_exact) {
          const sDig = String(pl.S_exact).replace(/\D/g, '');
          children.push(new Paragraph({ children: [new TextRun({ text: 'S(' + idx + ') = ', bold: true }), new TextRun({ text: sDig, font: 'Consolas', size: 18 })] }));
          const sci = sciFromDigits(sDig);
          if (sci) children.push(new Paragraph({ children: [new TextRun({ text: 'S sci(' + idx + ') = ', bold: true }), new TextRun({ text: sci })] }));
          if (pl.S_digits != null) children.push(new Paragraph({ children: [new TextRun({ text: 'digits S(' + idx + ') = ', bold: true }), new TextRun({ text: String(pl.S_digits) })] }));
        } else if (pl.S_digits != null) {
          children.push(new Paragraph({ children: [new TextRun({ text: 'digits S(' + idx + ') = ', bold: true }), new TextRun({ text: String(pl.S_digits) })] }));
        }

        if (pl.fen) children.push(new Paragraph({ children: [new TextRun({ text: 'FEN(' + idx + ') = ', bold: true }), new TextRun({ text: cleanText(pl.fen), font: 'Consolas', size: 18 })] }));
      }
    }
  }

  // ---- Análisis ----
  if (analyses.length) {
    children.push(hRule('333333', 12));
    children.push(new Paragraph({ text: 'Analyses', heading: HeadingLevel.HEADING_1 }));
    for (const a of analyses as any[]) {
      children.push(new Paragraph({ text: a.title || 'Analysis', heading: HeadingLevel.HEADING_2 }));
      if (a.fen) children.push(new Paragraph({ text: 'FEN: ' + a.fen }));
      if (a.comment) children.push(new Paragraph({ text: cleanText(a.comment) }));
    }
  }

  // ---- Búsquedas ----
  if (searches.length) {
    children.push(hRule('333333', 12));
    children.push(new Paragraph({ text: 'Searches', heading: HeadingLevel.HEADING_1 }));
    for (const s of searches as any[]) {
      children.push(new Paragraph({ text: s.query || 'Search', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: 'Results: ' + (s.resultCount || 0) }));
    }
  }

  // ---- Gráficos ----
  if (charts.length) {
    children.push(hRule('333333', 12));
    children.push(new Paragraph({ text: 'Charts (' + charts.length + ')', heading: HeadingLevel.HEADING_1 }));
    for (let ci = 0; ci < charts.length; ci++) {
      const c: any = charts[ci];
      children.push(new Paragraph({ text: cleanText(c.title || ('Chart ' + (ci + 1))), heading: HeadingLevel.HEADING_2 }));
      if (c.context) children.push(new Paragraph({ text: cleanText(c.context), italics: true } as any));

      if (ENABLE_IMAGES) {
        const svg = c.svgData || c.svg || '';
        if (svg) {
          const png = await svgToPngDataUrl(svg);
          const arr = dataUrlToUint8(png);
          if (arr) {
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({
                type: 'png',
                data: arr,
                transformation: { width: 480, height: 288 },
              })],
            }));
          }
        }
      }
    }
  }

  // ---- Generar y descargar ----
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chessgenome-session-' + Date.now() + '.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==== Envía el JSON de la sesión al backend (python-docx) ====
export async function sessionToBackend(state: any, options: any): Promise<void> {
  const items: any[] = (state.items as any[]) || [];

  // 1) Charts globales de la sesión (type: 'chart')
  const charts: any[] = [];
  for (const it of items) {
    if (it.type === 'chart') {
      const c: any = { ...it };
      const svg = it.svgData || it.svg || '';
      if (svg) {
        try {
          const png = await svgToPngDataUrl(svg);
          if (png) c.pngDataUrl = png;
        } catch (e) { /* skip */ }
      }
      charts.push(c);
    }
  }

  // 2) Charts auto-capturados dentro de cada partida (game.chartSvgs)
  const games = items.filter(i => i.type === 'game');
  for (const g of games) {
    const svgs: string[] = Array.isArray(g.chartSvgs) ? g.chartSvgs : [];
    for (let i = 0; i < svgs.length; i++) {
      try {
        const png = await svgToPngDataUrl(svgs[i]);
        if (png) {
          charts.push({
            type: 'chart',
            title: (g.headers?.White || 'Game') + ' vs ' + (g.headers?.Black || '') + ' - Chart ' + (i + 1),
            context: 'Auto-captured from game analysis',
            pngDataUrl: png,
          });
        }
      } catch (e) { /* skip */ }
    }
  }

  // 3) Enriquecer cada game con su board PNG inicial
  const enriched = [];
  for (const it of items) {
    if (it.type === 'game') {
      const g: any = { ...it };
      const plies = Array.isArray(g.plies) ? g.plies : [];
      if (plies.length && plies[0].fen) {
        const dataUrl = boardAsPngDataUrl(plies[0].fen);
        if (dataUrl && dataUrl.indexOf('data:image/png;base64,') === 0) {
          g.initialBoardPng = dataUrl;
        }
      }
      // no mandar los SVG crudos, ya los convertimos a png arriba
      delete g.chartSvgs;
      enriched.push(g);
    } else if (it.type !== 'chart') {
      enriched.push(it);
    }
  }

  // Añadir todos los charts (globales + auto) a items
  enriched.push(...charts);

  // Detectar idioma activo (i18next lo guarda en localStorage)
  let lang = 'en';
  try {
    const stored = localStorage.getItem('i18nextLng') || localStorage.getItem('lang');
    if (stored) lang = stored.slice(0, 2);
  } catch (e) { /* ignore */ }

  const payload = {
    options: {
      title: options.title || 'ChessGenome',
      authorName: options.authorName || '-',
      date: new Date().toISOString().slice(0, 19).replace('T', ' '),
      notes: options.notes || '',
      lang,
    },
    items: enriched,
  };

  console.log('[DOCX] Enviando ' + enriched.length + ' items (' + charts.length + ' charts)');

  const res = await fetch('/api/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: payload,
      filename: 'chessgenome-session-' + Date.now() + '.docx',
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('[DOCX] Backend error:', res.status, txt);
    throw new Error('Error del backend: ' + res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chessgenome-session-' + Date.now() + '.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
