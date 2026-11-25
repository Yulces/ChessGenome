import { jsPDF } from 'jspdf';
import { sessionToBackend } from './wordDocx';
import { generateWordDocx } from './wordDocx';
import html2canvas from 'html2canvas';
import type {
  SessionState,
  SessionAnalysis,
  SessionGame,
  SessionSearch,
  SessionChart,
} from '../context/SessionContext';

/** Función de traducción compatible con i18next */
export type PdfTranslateFn = (
  key: string,
  opts?: Record<string, any>,
) => string;

interface PdfOptions {
  authorName?: string;
  title?: string;
  notes?: string;
  /** (legacy, ya no se usa) */
  chartShowYLabels?: boolean;
  chartShowXLabels?: boolean;
  chartYLabelAngle?: number;
  chartYLabelDensity?: string;
  chartOnePagePerTramo?: boolean;
  chartTagAngles?: Record<string, number>;
  /** Función de traducción i18next (namespace genome) */
  t?: PdfTranslateFn;
}

function makeT(t?: PdfTranslateFn): PdfTranslateFn {
  if (t) return t;
  return (key: string) => key;
}

function escapeHtml(s: any): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PRIMES_64 = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53,
  59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131,
  137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223,
  227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311,
];
const SUPERS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};
function toSuper(n: number): string {
  return String(n).split('').map((c) => SUPERS[c] || c).join('');
}
function factorizationString(exponents: number[] | undefined): string {
  if (!exponents || exponents.length !== 64) return '';
  const parts: string[] = [];
  for (let i = 0; i < 64; i++) {
    const v = exponents[i];
    if (v > 0) parts.push(`${PRIMES_64[i]}${toSuper(v)}`);
  }
  return parts.join(' · ');
}

function digitsFromL10(l10: number): number {
  if (!Number.isFinite(l10)) return 0;
  return Math.floor(l10) + 1;
}

function sciFromL10(l10: number | null | undefined): string {
  if (l10 == null || !Number.isFinite(l10)) return '—';
  const exp = Math.floor(l10);
  const mant = Math.pow(10, l10 - exp);
  if (mant >= 10) return `${(mant / 10).toFixed(6)}e+${exp + 1}`;
  return `${mant.toFixed(6)}e+${exp}`;
}

// ============================================================
// Tablero en CANVAS
// ============================================================
function fenToBoardPng(fen: string, size = 280): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const boardPart = (fen || '').trim().split(/\s+/)[0] || '8/8/8/8/8/8/8/8';
    const rows = boardPart.split('/');

    const PIECE_UNICODE: Record<string, string> = {
      K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
      k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
    };

    const cell = size / 8;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        ctx.fillStyle = isLight ? '#f0d9b5' : '#b58863';
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }

    ctx.font = `bold ${Math.floor(cell * 0.82)}px "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", "Arial Unicode MS", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < 8; r++) {
      const row = rows[r] || '8';
      let fileIdx = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') {
          fileIdx += parseInt(ch, 10);
        } else {
          const unicode = PIECE_UNICODE[ch];
          if (unicode) {
            const x = fileIdx * cell + cell / 2;
            const y = r * cell + cell / 2 + cell * 0.04;
            const isWhite = ch === ch.toUpperCase();
            ctx.lineWidth = Math.max(1, cell * 0.05);
            ctx.strokeStyle = isWhite ? '#222222' : '#ffffff';
            ctx.strokeText(unicode, x, y);
            ctx.fillStyle = isWhite ? '#ffffff' : '#000000';
            ctx.fillText(unicode, x, y);
          }
          fileIdx++;
        }
      }
    }

    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('fenToBoardPng failed', e);
    return null;
  }
}

// ============================================================
// SVG → PNG
// ============================================================
async function svgToPngDataUrl(
  svgString: string,
  width: number,
  height: number,
  scale = 2,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (!svgString || svgString.length < 30) {
        resolve(null);
        return;
      }
      let svg = svgString;
      if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!svg.match(/<svg[^>]*\swidth=/)) {
        svg = svg.replace('<svg', `<svg width="${width}" height="${height}"`);
      }
      svg = svg
        .replace(/vector-effect="[^"]*"/g, '')
        .replace(/class="[^"]*"/g, '')
        .replace(/dominant-baseline="[^"]*"/g, '');

      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          const png = canvas.toDataURL('image/png');
          resolve(png);
        } catch (err) {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Convierte un SVG del GenomeChart (capturado con width/height definidos)
 * a PNG usando su propio viewBox si lo tiene.
 */
async function chartSvgToPng(svgData: string): Promise<string | null> {
  // Intentar extraer width/height del viewBox
  let w = 900;
  let h = 320;
  const vbMatch = svgData.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (vbMatch) {
    w = parseFloat(vbMatch[1]) || w;
    h = parseFloat(vbMatch[2]) || h;
  }
  const result = await svgToPngDataUrl(svgData, w, h, 1.5);
  return result;
}

// ============================================================
// Renderers de items
// ============================================================

async function renderAnalysis(
  item: SessionAnalysis,
  index: number,
  t: PdfTranslateFn,
): Promise<string> {
  const factors = Object.entries(item.factorization || {}).sort(
    (a, b) => Number(b[0]) - Number(a[0]),
  );
  const factorStr = factors.map(([p, e]) => `${p}<sup>${e}</sup>`).join(' · ');

  const boardPng = fenToBoardPng(item.fen);

  let stockfishHtml = '';
  if (item.stockfish) {
    const sf = item.stockfish;
    const evalStr = sf.evaluation
      ? sf.evaluation.type === 'mate'
        ? `M${sf.evaluation.value}`
        : (sf.evaluation.value / 100).toFixed(2)
      : t('pdf.empty');
    stockfishHtml = `
      <div class="sub-block">
        <div class="sub-title">${escapeHtml(t('pdf.sfTitle'))} (${escapeHtml(sf.engine)})</div>
        <table class="kv-table">
          <tr><td class="k">${escapeHtml(t('pdf.sfBestMove'))}</td><td class="v mono">${escapeHtml(sf.bestMoveSan || sf.bestMove || t('pdf.empty'))}</td></tr>
          <tr><td class="k">${escapeHtml(t('pdf.sfEval'))}</td><td class="v mono">${evalStr}</td></tr>
          <tr><td class="k">${escapeHtml(t('pdf.sfDepth'))}</td><td class="v mono">${sf.depth}</td></tr>
          ${sf.ponder ? `<tr><td class="k">${escapeHtml(t('pdf.sfPonder'))}</td><td class="v mono">${escapeHtml(sf.ponder)}</td></tr>` : ''}
          ${sf.pv ? `<tr><td class="k">${escapeHtml(t('pdf.sfPv'))}</td><td class="v mono small">${escapeHtml(sf.pv)}</td></tr>` : ''}
        </table>
      </div>
    `;
  }

  let neuralHtml = '';
  if (item.neural) {
    const nn = item.neural;
    const featuresPreview = (nn.features || []).slice(0, 32).map((x) => x.toFixed(3)).join(', ');
    neuralHtml = `
      <div class="sub-block">
        <div class="sub-title">${escapeHtml(t('pdf.nnTitle'))}</div>
        <table class="kv-table">
          <tr><td class="k">${escapeHtml(t('pdf.nnFeatures'))}</td><td class="v mono">${nn.featureCount}</td></tr>
          ${nn.modelCount != null ? `<tr><td class="k">${escapeHtml(t('pdf.nnModels'))}</td><td class="v mono">${nn.modelCount}</td></tr>` : ''}
          ${nn.corpusSize != null ? `<tr><td class="k">${escapeHtml(t('pdf.nnCorpus'))}</td><td class="v mono">${nn.corpusSize}</td></tr>` : ''}
          <tr><td class="k">${escapeHtml(t('pdf.nnPreview'))}</td><td class="v mono small">[${escapeHtml(featuresPreview)}…]</td></tr>
        </table>
      </div>
    `;
  }

  let chartHtml = '';
  if (item.chartSvg) {
    const chartPng = await chartSvgToPng(item.chartSvg);
    if (chartPng) {
      chartHtml = `
        <div class="sub-block chart-block">
          <div class="sub-title">${escapeHtml(item.chartTitle || t('pdf.chartTitle'))}</div>
          ${item.chartContext ? `<p class="muted small">${escapeHtml(item.chartContext)}</p>` : ''}
          <div class="chart-container">
            <img src="${chartPng}" alt="chart" class="chart-img" />
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="item">
      <div class="item-title">${index + 1}. ${escapeHtml(item.title)} <span class="tag">[${escapeHtml(item.source)}]</span></div>

      <table class="layout">
        <tr>
          <td class="col-board">
            ${boardPng ? `<img src="${boardPng}" alt="board" class="board-img" />` : ''}
          </td>
          <td class="col-data">
            <p><b>${escapeHtml(t('pdf.fen'))}:</b> <span class="mono">${escapeHtml(item.fen)}</span></p>
            <p><b>${escapeHtml(t('pdf.l'))}:</b> <span class="mono">${(item.L ?? 0).toFixed(6)}</span></p>
            <p><b>${escapeHtml(t('pdf.l10'))}:</b> <span class="mono">${(item.L10 ?? 0).toFixed(6)}</span> <span class="muted">(~${digitsFromL10(item.L10)} ${escapeHtml(t('pdf.cifras'))})</span></p>
            <p><b>${escapeHtml(t('pdf.pieces'))}:</b> <span class="mono">${item.pieceCount ?? 0}</span> — <b>${escapeHtml(t('pdf.admissible'))}:</b> ${item.staticallyAdmissible ? escapeHtml(t('pdf.yes')) : escapeHtml(t('pdf.no'))}</p>
            ${item.rankApprox != null ? `<p><b>${escapeHtml(t('pdf.rankApprox'))}:</b> <span class="mono">#${item.rankApprox}</span></p>` : ''}
            ${item.timesSeen != null ? `<p><b>${escapeHtml(t('pdf.timesSeen'))}:</b> <span class="mono">${item.timesSeen}</span></p>` : ''}
            ${item.S_exact ? `<p><b>${escapeHtml(t('pdf.sGodel'))}:</b></p><div class="s-exact mono">${escapeHtml(item.S_exact)}</div><p class="muted small">(${sciFromL10(item.L10)})</p>` : ''}
            ${item.hash ? `<p class="small"><b>${escapeHtml(t('pdf.hash'))}:</b> <span class="mono">${escapeHtml(item.hash)}</span></p>` : ''}
            ${factorStr ? `<p class="small"><b>${escapeHtml(t('pdf.factorization'))}:</b> <span class="mono">${factorStr}</span></p>` : ''}
          </td>
        </tr>
      </table>

      ${stockfishHtml}
      ${neuralHtml}
      ${chartHtml}
    </div>
  `;
}

async function renderGame(
  item: SessionGame,
  index: number,
  _opts: PdfOptions,
  t: PdfTranslateFn,
): Promise<{ header: string; plyCards: string[]; charts: string[] }> {
  const initialFen = item.plies?.[0]?.fen;
  const boardPng = initialFen ? fenToBoardPng(initialFen) : null;

  // === Gráficos ===
  const charts: string[] = [];
  const svgs = item.chartSvgs || [];
  if (svgs.length > 0) {
    const chartPngs = await Promise.all(svgs.map((s) => chartSvgToPng(s)));
    const validPngs = chartPngs.filter((p): p is string => !!p);
    for (let i = 0; i < validPngs.length; i++) {
      charts.push(`
        <div class="sub-block chart-block">
          <div class="sub-title">${escapeHtml(t('pdf.gameChartsTitle'))} ${i + 1}/${validPngs.length}</div>
          <div class="chart-container">
            <img src="${validPngs[i]}" alt="chart" class="chart-img" width="500" height="280" />
          </div>
        </div>
      `);
    }
  }

  // === PGN ===
  let pgnHtml = '';
  if (item.plies && item.plies.length > 1) {
    const isBlackTurn = (item.plies[0]?.fen || '').split(' ')[1] === 'b';
    const sanList = item.plies.slice(1).map((p) => p.san || '');
    const parts: string[] = [];
    let i = 0;
    let moveNo = 1;
    if (isBlackTurn && sanList.length > 0) {
      parts.push(`${moveNo}... ${sanList[0]}`);
      i = 1;
      moveNo++;
    }
    while (i < sanList.length) {
      const w = sanList[i];
      const b = sanList[i + 1];
      if (b) parts.push(`${moveNo}. ${w} ${b}`);
      else if (w) parts.push(`${moveNo}. ${w}`);
      i += 2;
      moveNo++;
    }
    const movesText = parts.join(' ');
    pgnHtml = `
      <div class="sub-block">
        <div class="sub-title">${escapeHtml(t('pdf.pgnBlock'))}</div>
        <div class="pgn-block">${escapeHtml(movesText)}</div>
      </div>
    `;
  }

  const white = item.headers?.White || '?';
  const black = item.headers?.Black || '?';
  const result = item.headers?.Result || '';
  const event = item.headers?.Event || '';
  const date = item.headers?.Date || '';
  const eventLine = [event, date, result].filter(Boolean).join(' · ');

  // === Cabecera del game ===
  const header = `
    <div class="item game-item">
      <div class="item-title">${index + 1}. ${escapeHtml(white)} vs ${escapeHtml(black)}</div>
      ${eventLine ? `<p class="muted">${escapeHtml(eventLine)}</p>` : ''}
      <p><b>${escapeHtml(t('pdf.halfMoves'))}:</b> <span class="mono">${item.plyCount ?? 0}</span></p>

      <table class="layout">
        <tr>
          <td class="col-board">
            ${boardPng ? `<img src="${boardPng}" alt="initial board" class="board-img" />` : ''}
            <p class="muted small" style="text-align:center;margin-top:4px;">${escapeHtml(t('pdf.initialPosition'))}</p>
          </td>
          <td class="col-data">
            ${initialFen ? `<p><b>${escapeHtml(t('pdf.initialFen'))}:</b> <span class="mono small">${escapeHtml(initialFen)}</span></p>` : ''}
            ${item.plies?.[0]?.L10 != null ? `<p><b>${escapeHtml(t('pdf.initialL10'))}:</b> <span class="mono">${item.plies[0].L10.toFixed(4)}</span></p>` : ''}
            ${item.plies?.[0]?.S_exact ? `<p><b>${escapeHtml(t('pdf.initialS'))}:</b> <span class="mono">${sciFromL10(item.plies[0].L10)}</span></p>` : ''}
          </td>
        </tr>
      </table>

      ${pgnHtml}
    </div>
  `;

  // === Cada ply-card es una unidad individual ===
  const plyCards: string[] = [];
  for (const p of item.plies || []) {
    const d = p.diff == null ? t('pdf.empty') : p.diff.toFixed(4);
    const r =
      p.ratio == null || p.moveIndex < 1
        ? t('pdf.empty')
        : !Number.isFinite(p.ratio)
          ? '∞'
          : p.ratio.toPrecision(6);
    const sci = sciFromL10(p.L10);
    const sFull = p.S_exact || t('pdf.empty');
    const factors = factorizationString(p.exponents, 64);

    plyCards.push(`
      <div class="item game-item ply-wrapper" style="padding:8px 10px;margin:0;">
        <div class="ply-card">
          <div class="ply-head">
            <span class="ply-idx">#${p.moveIndex}</span>
            <span class="ply-san">${escapeHtml(p.san || '—')}</span>
          </div>
          <table class="ply-values-table">
            <thead>
              <tr>
                <th>L</th>
                <th>L₁₀</th>
                <th>D(k)</th>
                <th>R(k)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${p.L.toFixed(4)}</td>
                <td>${p.L10.toFixed(4)}</td>
                <td>${d}</td>
                <td>${r}</td>
              </tr>
            </tbody>
          </table>
          <div class="ply-block">
            <span class="ply-label">S ≈ (sci):</span>
            <span class="ply-mono">${escapeHtml(sci)}</span>
          </div>
          <div class="ply-block">
            <span class="ply-label">FEN:</span>
            <span class="ply-mono">${escapeHtml(p.fen)}</span>
          </div>
          <div class="ply-block">
            <span class="ply-label">S (dígitos):</span>
            <span class="ply-mono">${escapeHtml(sFull)}</span>
          </div>
          ${factors ? `<div class="ply-block">
            <span class="ply-label">S (factores):</span>
            <span class="ply-mono">${escapeHtml(factors)}</span>
          </div>` : ''}
        </div>
      </div>
    `);
  }

  return { header, plyCards, charts };
}

function renderSearch(
  item: SessionSearch,
  index: number,
  t: PdfTranslateFn,
): string {
  const filterStr =
    Object.entries(item.filters || {})
      .filter(([, v]) => v != null && v !== '' && v !== false)
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ') || t('pdf.empty');

  const top = Array.isArray(item.topResults) ? item.topResults.slice(0, 20) : [];

  let tableHtml = '';
  if (top.length > 0) {
    tableHtml = `
      <table class="data-table">
        <thead>
          <tr><th>#</th><th>L₁₀</th><th>${escapeHtml(t('pdf.pieces'))}</th><th>${escapeHtml(t('pdf.fen'))}</th></tr>
        </thead>
        <tbody>
          ${top
            .map((r: any, i: number) => {
              const l10 = typeof r.L10 === 'number' ? r.L10.toFixed(4) : String(r.L10 ?? '?');
              return `<tr><td>${i + 1}</td><td class="mono">${l10}</td><td class="mono">${r.pieceCount ?? '?'}</td><td class="mono small">${escapeHtml(r.fen || '?')}</td></tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }

  return `
    <div class="item">
      <div class="item-title">${index + 1}. ${escapeHtml(t('pdf.search'))}</div>
      <p class="small"><b>${escapeHtml(t('pdf.searchFilters'))}:</b> <span class="mono">${escapeHtml(filterStr)}</span></p>
      <p><b>${escapeHtml(t('pdf.searchResults'))}:</b> <span class="mono">${item.resultCount ?? 0}</span></p>
      ${tableHtml}
    </div>
  `;
}

async function renderChart(
  item: SessionChart,
  index: number,
  t: PdfTranslateFn,
): Promise<string> {
  const chartPng = await chartSvgToPng(item.svgData || '');
  return `
    <div class="item">
      <div class="item-title">${index + 1}. ${escapeHtml(item.title || t('pdf.chartTitle'))}</div>
      ${item.context ? `<p class="muted small">${escapeHtml(item.context)}</p>` : ''}
      ${chartPng ? `<div class="chart-container"><img src="${chartPng}" alt="chart" class="chart-img" /></div>` : ''}
    </div>
  `;
}

const PDF_STYLES = `
  * { box-sizing: border-box; }
  .pdf-doc {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #ffffff;
    padding: 0;
    font-size: 17px;
    line-height: 1.55;
    width: 190mm;
    margin: 0 auto;
  }
  .cover {
    text-align: center;
    padding: 60px 0 40px 0;
    border-bottom: 2px solid #ff6b00;
    margin-bottom: 30px;
    page-break-after: always;
  }
  .cover h1 { font-size: 56px; margin: 0 0 10px 0; color: #ff6b00; }
  .cover h2 { font-size: 28px; margin: 0 0 30px 0; font-weight: normal; color: #333; }
  .cover p { font-size: 18px; color: #555; margin: 4px 0; }
  .cover .summary { margin-top: 30px; font-size: 18px; color: #333; }

  h2.section {
    color: #ff6b00;
    border-bottom: 1px solid #ddd;
    padding-bottom: 4px;
    margin: 20px 0 12px 0;
    font-size: 26px;
    page-break-after: avoid;
  }

  .item {
    margin: 0 0 16px 0;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fafafa;
    page-break-inside: avoid;
  }
  .game-item { page-break-inside: auto; }
  .item-title {
    font-weight: bold;
    font-size: 20px;
    color: #222;
    margin: 0 0 10px 0;
  }
  .item p { margin: 5px 0; font-size: 16px; }
  .tag { color: #888; font-weight: normal; font-size: 14px; }
  .muted { color: #555; font-size: 15px; }
  .small { font-size: 14px; }
  .mono {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 15px;
    word-break: break-all;
  }

  table.layout {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    table-layout: fixed;
  }
  table.layout td { vertical-align: top; padding: 0 8px 0 0; }
  .col-board { width: 180px; }
  .col-board .board-img {
    width: 170px; height: 170px; display: block;
    border-radius: 4px; border: 1px solid #ccc;
  }
  .col-data { padding-left: 8px !important; }

  .s-exact {
    max-height: 180px; overflow: hidden; background: #fff;
    border: 1px solid #eee; padding: 4px; border-radius: 3px;
    margin: 4px 0; font-size: 14px; line-height: 1.4; word-break: break-all;
  }

  .sub-block {
    margin-top: 10px; padding-top: 8px;
    border-top: 1px dashed #ccc;
  }
  .sub-title {
    font-weight: bold; font-size: 18px; color: #ff6b00;
    margin: 0 0 6px 0;
  }
  table.kv-table {
    width: 100%; border-collapse: collapse; font-size: 15px;
    table-layout: fixed;
  }
  table.kv-table td {
    padding: 3px 6px; border-bottom: 1px solid #eee; vertical-align: top;
  }
  table.kv-table td.k { width: 30%; font-weight: bold; color: #555; }
  table.kv-table td.v { color: #111; }

  .chart-block {
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-before: always;
  }
  .chart-block:first-of-type {
    page-break-before: auto;
  }
  .chart-container {
    text-align: center;
    margin: 8px 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .chart-img {
    max-width: 100%; width: 170mm; height: auto; display: block;
    margin: 0 auto; border: 1px solid #ddd; border-radius: 4px;
    page-break-inside: avoid;
  }

  table.data-table {
    width: 100%; border-collapse: collapse; margin-top: 6px;
    font-size: 15px; table-layout: fixed;
    page-break-inside: auto;
  }
  table.data-table thead {
    display: table-header-group;
  }
  table.data-table tr {
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-after: auto;
  }
  table.data-table th,
  table.data-table td {
    border: 1px solid #ccc; padding: 5px 6px;
    text-align: left; vertical-align: top;
  }
  table.data-table th {
    background: #eee; font-weight: bold; font-size: 15px;
  }

  .game-table .col-idx  { width: 12mm; }
  .game-table .col-san  { width: 22mm; }
  .game-table .col-sci  { width: 50mm; }
  .game-table .col-l    { width: 25mm; }
  .game-table .col-d    { width: 25mm; }
  .game-table .col-r    { width: 30mm; }

  /* Grupo atómico por ply (4 filas) */
  table.data-table tbody.ply-group {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: auto;
  }

  /* Filas de detalle (FEN, S, factores) */
  .game-table tr.ply-detail-row td.ply-detail-cell {
    background: #fafafa;
    border-top: none;
    padding: 4px 8px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.4;
    color: #111;
    word-break: break-all;
    overflow-wrap: anywhere;
    vertical-align: top;
  }
  .game-table tr.ply-detail-row .ply-label {
    font-weight: bold;
    color: #ff6b00;
    margin-right: 6px;
  }
  .pgn-block {
    background: #ffffff;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 11.5px;
    line-height: 1.5;
    white-space: normal;
    word-break: break-word;
    color: #111;
  }

  .game-table td.sci-cell {
    font-size: 10.5px;
    color: #ff6b00;
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: Consolas, 'Courier New', monospace;
  }


  /* ============================================================
     PLY CARDS — una tarjeta por jugada (legible en móvil)
     ============================================================ */
  .plies-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
  }

  .ply-card {
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #fff;
    padding: 12px 14px;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .ply-head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    border-bottom: 2px solid #ff6b00;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .ply-idx {
    font-weight: bold;
    color: #ff6b00;
    font-size: 20px;
    font-family: Consolas, 'Courier New', monospace;
  }
  .ply-san {
    font-weight: bold;
    color: #111;
    font-size: 20px;
    font-family: Consolas, 'Courier New', monospace;
  }

  /* Tabla de valores del ply: L | L₁₀ | D | R en una línea */
  .ply-values-table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    table-layout: fixed;
  }
  .ply-values-table thead th {
    background: #f0f0f0;
    color: #555;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: bold;
    padding: 5px 6px;
    border: 1px solid #ddd;
    text-align: center;
  }
  .ply-values-table tbody td {
    background: #fafafa;
    color: #111;
    font-size: 15px;
    font-family: Consolas, 'Courier New', monospace;
    font-weight: bold;
    padding: 8px 6px;
    border: 1px solid #ddd;
    text-align: center;
  }

  .ply-block {
    padding: 6px 0;
    border-top: 1px solid #eee;
    font-size: 15px;
    line-height: 1.5;
  }
  .ply-block:first-of-type {
    border-top: none;
  }
  .ply-label {
    display: inline-block;
    font-weight: bold;
    color: #ff6b00;
    font-size: 14px;
    text-transform: uppercase;
    margin-right: 8px;
  }
  .ply-mono {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 15px;
    color: #111;
    word-break: break-all;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }

  /* Datos de partida en cabecera */
  .game-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    margin: 8px 0 4px 0;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    font-size: 15px;
  }
  .game-meta .k {
    font-weight: bold;
    color: #555;
    margin-right: 4px;
  }

  .footer {
    text-align: center; font-size: 15px; color: #999;
    margin-top: 8px;
    padding: 6px 0 2px 0;
    border-top: 1px solid #ddd;
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-before: avoid;
  }
`;

export async function generateSessionPdf(
  state: SessionState,
  options: PdfOptions = {},
): Promise<void> {
  const t = makeT(options.t);

  const author = options.authorName || '—';
  const title = options.title || t('pdf.coverSubtitle');
  const notes = options.notes || '';

  const analyses = state.items.filter(
    (i): i is SessionAnalysis => i.type === 'analysis',
  );
  const games = state.items.filter((i): i is SessionGame => i.type === 'game');
  const searches = state.items.filter(
    (i): i is SessionSearch => i.type === 'search',
  );
  const charts = state.items.filter((i): i is SessionChart => i.type === 'chart');

  // Estilos
  const styleEl = document.createElement('style');
  styleEl.id = 'chessgenome-pdf-styles';
  styleEl.textContent = PDF_STYLES;
  document.head.appendChild(styleEl);

  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 8;
  const USABLE_W = PAGE_W - MARGIN * 2;
  const BOTTOM = PAGE_H - MARGIN;

  let currentY = MARGIN;
  let hasPage = false;

  // Renderiza HTML a canvas
  async function renderToCanvas(html: string): Promise<HTMLCanvasElement> {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-99999px';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.background = '#ffffff';

    const contentEl = document.createElement('div');
    contentEl.className = 'pdf-doc';
    contentEl.innerHTML = html;
    container.appendChild(contentEl);
    document.body.appendChild(container);

    await new Promise((r) => setTimeout(r, 150));

    try {
      const canvas = await html2canvas(contentEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
      });
      return canvas;
    } finally {
      document.body.removeChild(container);
    }
  }

  // Corta un canvas en tiras que quepan en la página actual / siguientes
  function addCanvasToPdf(canvas: HTMLCanvasElement): void {
    const imgHmm = (canvas.height / canvas.width) * USABLE_W;
    const pxPerMm = canvas.width / USABLE_W;

    let remainingMm = imgHmm;
    let srcY = 0;

    while (remainingMm > 0) {
      const availableMm = BOTTOM - currentY;
      const sliceMm = Math.min(remainingMm, availableMm);
      const slicePx = Math.max(1, Math.round(sliceMm * pxPerMm));

      // Crear tira con canvas temporal
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = slicePx;
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0,
        srcY,
        canvas.width,
        slicePx,
        0,
        0,
        canvas.width,
        slicePx,
      );

      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        MARGIN,
        currentY,
        USABLE_W,
        sliceMm,
      );

      currentY += sliceMm;
      srcY += slicePx;
      remainingMm -= sliceMm;

      if (remainingMm > 0) {
        pdf.addPage();
        currentY = MARGIN;
      }
    }
  }

  // Añade una unidad (con salto de página opcional) y la coloca
  async function addUnit(
    html: string,
    opts: { forceNewPage?: boolean; sectionTitle?: string } = {},
  ): Promise<void> {
    const fullHtml =
      (opts.sectionTitle
        ? `<h2 class="section">${escapeHtml(opts.sectionTitle)}</h2>`
        : '') + html;

    const canvas = await renderToCanvas(fullHtml);
    const imgHmm = (canvas.height / canvas.width) * USABLE_W;

    // Decidir dónde va
    if (opts.forceNewPage || !hasPage) {
      pdf.addPage();
      hasPage = true;
      currentY = MARGIN;
    } else if (currentY + imgHmm > BOTTOM) {
      // No cabe → siempre va a página nueva (sin cortar)
      pdf.addPage();
      currentY = MARGIN;
    }

    addCanvasToPdf(canvas);
  }

  try {
    // ============ 1. PORTADA ============
    const coverHtml = `
      <div class="cover">
        <h1>ChessGenome</h1>
        <h2>${escapeHtml(title)}</h2>
        <p><b>${escapeHtml(t('pdf.coverAuthor'))}:</b> ${escapeHtml(author)}</p>
        <p><b>${escapeHtml(t('pdf.coverDate'))}:</b> ${new Date().toLocaleString()}</p>
        <p class="summary">
          ${escapeHtml(
            t('pdf.coverSummary', {
              analyses: analyses.length,
              games: games.length,
              searches: searches.length,
              charts: charts.length,
            }),
          )}
        </p>
        ${notes ? `<p style="margin-top:20px;">${escapeHtml(notes)}</p>` : ''}
      </div>
    `;
    await addUnit(coverHtml, { forceNewPage: true });

    // ============ 2. ANÁLISIS ============
    if (analyses.length > 0) {
      let first = true;
      for (let i = 0; i < analyses.length; i++) {
        const html = await renderAnalysis(analyses[i], i, t);
        await addUnit(html, {
          forceNewPage: true,
          sectionTitle: first
            ? `1. ${t('pdf.analysisSection')} (${analyses.length})`
            : undefined,
        });
        first = false;
      }
    }

    // ============ 3. PARTIDAS ============
    if (games.length > 0) {
      let firstSection = true;
      for (let g = 0; g < games.length; g++) {
        console.log(`[PDF] Partida ${g + 1}/${games.length}`);
        const { header, plyCards, charts: chartUnits } = await renderGame(
          games[g],
          g,
          options,
          t,
        );

        // Cabecera de la partida (título + tablero + FEN + PGN)
        await addUnit(header, {
          forceNewPage: true,
          sectionTitle: firstSection
            ? `2. ${t('pdf.gamesSection')} (${games.length})`
            : undefined,
        });
        firstSection = false;

        // Cada ply-card como unidad individual
        for (const card of plyCards) {
          await addUnit(card);
        }

        // Gráficos de la partida
        for (const ch of chartUnits) {
          await addUnit(ch, { forceNewPage: true });
        }
      }
    }

    // ============ 4. BÚSQUEDAS ============
    if (searches.length > 0) {
      let first = true;
      for (let i = 0; i < searches.length; i++) {
        await addUnit(renderSearch(searches[i], i, t), {
          forceNewPage: true,
          sectionTitle: first
            ? `3. ${t('pdf.searchSection')} (${searches.length})`
            : undefined,
        });
        first = false;
      }
    }

    // ============ 5. GRÁFICOS SUELTOS ============
    if (charts.length > 0) {
      let first = true;
      for (let i = 0; i < charts.length; i++) {
        const html = await renderChart(charts[i], i, t);
        await addUnit(html, {
          forceNewPage: true,
          sectionTitle: first
            ? `4. ${t('pdf.chartsSection')} (${charts.length})`
            : undefined,
        });
        first = false;
      }
    }

    // ============ 6. FOOTER ============
    await addUnit(
      `<div class="footer">${escapeHtml(
        t('pdf.footer', { date: new Date().toISOString() }),
      )}</div>`,
    );

    const filename = `chessgenome-session-${Date.now()}.pdf`;
    pdf.save(filename);
    console.log('[PDF] PDF generado correctamente');
  } catch (err: any) {
    console.error('[PDF ERROR]', err);
    throw new Error(
      'Error al generar el PDF: ' + (err?.message || String(err)),
    );
  } finally {
    const s = document.getElementById('chessgenome-pdf-styles');
    if (s) s.remove();
  }
}

// ============================================================
// EXPORTACIÓN A WORD (.doc = HTML disfrazado)
// Reutiliza el mismo HTML que el PDF, sin dependencias extra.
// ============================================================

// ============================================================
// HTML SIMPLE para Pandoc/Word (sin clases CSS, solo semántico)
// ============================================================
// ============================================================
// HTML SIMPLE para Pandoc/Word
// ============================================================


/**
 * Markdown con sintaxis de tabla pipe.
 */






/** Escapa para celdas de tabla pipe de markdown. */


/** Factorización a Unicode (11⁵ · 41² · …). Un solo formato, sin LaTeX. */


/**
 * Devuelve MARKDOWN PURO. Cero <html>, cero <table>, cero <center>, cero \(...\).
 */


















/** exponents = [prime1, exp1, prime2, exp2, ...] => "11\u2075 \u00b7 41\u00b2 ..." */


/** "5431...1367" => "5.4314e+84" */


/** FEN -> tablero ASCII con piezas Unicode */




function esc(s: any): string { return s == null ? '' : String(s); }

function mdEsc(s: any): string {
  if (s == null) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function fmtNum(v: any, digits: number): string {
  if (v == null || v === '') return '';
  var n = Number(v);
  if (!isFinite(n)) return String(v);
  return n.toFixed(digits);
}

function sciFromDigits(s: any): string {
  if (!s) return '';
  var t = String(s).replace(/\D/g, '');
  if (t.length < 2) return '';
  return t[0] + '.' + t.slice(1, 8) + 'e+' + (t.length - 1);
}


function cleanS(s: any): string {
  if (!s) return '';
  return String(s).replace(/\D/g, '');
}

function factorText(exp: any): string {
  if (!exp) return '';
  if (typeof exp === 'string') return exp;
  if (!Array.isArray(exp)) return '';
  var out: string[] = [];
  for (var i = 0; i + 1 < exp.length; i += 2) {
    var p = exp[i]; var e = exp[i + 1];
    if (e == null || p == null) continue;
    if (Number(e) === 0) continue;
    if (Number(p) <= 1) continue;
    out.push(Number(e) === 1 ? String(p) : (p + '^' + e));
  }
  return out.join(' . ');
}

function boardAscii(fen: string): string {
  if (!fen) return '';
  var parts = String(fen).split(' ');
  if (!parts[0]) return '';
  var rows = parts[0].split('/');
  if (rows.length !== 8) return '';
  var out: string[] = [];
  out.push('     a   b   c   d   e   f   g   h');
  out.push('   +---+---+---+---+---+---+---+---+');
  for (var r = 0; r < 8; r++) {
    var rank = 8 - r;
    var line = ' ' + rank + ' |';
    var row = rows[r];
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      if (ch >= '1' && ch <= '8') {
        for (var k = 0; k < parseInt(ch, 10); k++) line += '   |';
      } else {
        line += ' ' + ch + ' |';
      }
    }
    out.push(line);
    out.push('   +---+---+---+---+---+---+---+---+');
  }
  out.push('     a   b   c   d   e   f   g   h');
  return out.join('\n');
}

function boardAsPngDataUrl(fen: string): Promise<string> {
  return new Promise(function(resolve){
    try {
      if (!fen) { resolve(''); return; }
      var board = String(fen).split(' ')[0];
      var rows = board.split('/');
      if (rows.length !== 8) { resolve(''); return; }
      var SQ = 60;
      var SIZE = SQ * 8;
      var canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      var ctx = canvas.getContext('2d');
      if (!ctx) { resolve(''); return; }
      var LIGHT = '#f0d9b5', DARK = '#b58863';
      for (var r = 0; r < 8; r++) {
        for (var c = 0; c < 8; c++) {
          var isLight = ((r + c) % 2) === 0;
          ctx.fillStyle = isLight ? LIGHT : DARK;
          ctx.fillRect(c * SQ, r * SQ, SQ, SQ);
        }
      }
      var GLYPH: any = {'k':'\u265A','q':'\u265B','r':'\u265C','b':'\u265D','n':'\u265E','p':'\u265F'};
      ctx.font = '48px "DejaVu Sans", "Arial Unicode MS", "Segoe UI Symbol", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var r2 = 0; r2 < 8; r2++) {
        var row = rows[r2];
        var fileIdx = 0;
        for (var ci = 0; ci < row.length; ci++) {
          var ch = row[ci];
          if (ch >= '1' && ch <= '8') {
            fileIdx += parseInt(ch, 10);
          } else {
            var lower = ch.toLowerCase();
            var glyph = GLYPH[lower] || ch;
            var cx = fileIdx * SQ + SQ / 2;
            var cy = r2 * SQ + SQ / 2;
            var isWhite = (ch === ch.toUpperCase() && ch !== ch.toLowerCase());
            if (isWhite) {
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#000';
              ctx.fillStyle = '#ffffff';
              ctx.fillText(glyph, cx, cy);
              ctx.strokeText(glyph, cx, cy);
            } else {
              ctx.fillStyle = '#000000';
              ctx.fillText(glyph, cx, cy);
            }
            fileIdx += 1;
          }
        }
      }
      resolve(canvas.toDataURL('image/png'));
    } catch (e) { resolve(''); }
  });
}

/** Reemplaza caracteres Unicode problemáticos para Pandoc/Word. */
function sanitizeForPandoc(s: string): string {
  if (!s) return '';
  var out = String(s);
  // 1) Quitar LaTeX inline/math
  out = out.replace(/\\\(([^)]*)\\\)/g, '$1');   // \( ... \)  -> contenido
  out = out.replace(/\\\[([^\]]*)\\\]/g, '$1'); // \[ ... \]  -> contenido
  // 2) Quitar CUALQUIER backslash de escape residual
  out = out.replace(/\\+/g, '');
  // 3) Reemplazar Unicode problemático
  out = out.replace(/\u00d8/g, '0');          // Ø -> 0
  out = out.replace(/\u00f8/g, '0');          // ø -> 0
  out = out.replace(/\u2014/g, '-');          // — -> -
  out = out.replace(/\u2013/g, '-');          // – -> -
  out = out.replace(/[\u2018\u2019]/g, "'");  // ‘ ’ -> '
  out = out.replace(/[\u201c\u201d]/g, '"');  // “ ” -> "
  out = out.replace(/\u00b7/g, '.');          // · -> .
  out = out.replace(/\u00a0/g, ' ');          // NBSP -> espacio
  out = out.replace(/\u2026/g, '...');        // … -> ...
  out = out.replace(/\u00b0/g, '^');          // ° -> ^
  out = out.replace(/\u00b2/g, '^2');         // ² -> ^2
  out = out.replace(/\u00b3/g, '^3');         // ³ -> ^3
  out = out.replace(/\u2070/g, '^0');
  out = out.replace(/\u00b9/g, '^1');
  out = out.replace(/\u2074/g, '^4');
  out = out.replace(/\u2075/g, '^5');
  out = out.replace(/\u2076/g, '^6');
  out = out.replace(/\u2077/g, '^7');
  out = out.replace(/\u2078/g, '^8');
  out = out.replace(/\u2079/g, '^9');
  // 4) Forzar línea en blanco tras encabezados markdown (##, ###)
  out = out.replace(/(^|\n)(#{1,6} [^\n]+)\n(?!\n)/g, '$1$2\n\n');
  // 5) Quitar espacios antes de saltos de línea
  out = out.replace(/[ \t]+\n/g, '\n');
  return out;
}

async function buildWordHtml(
  state: SessionState,
  options: PdfOptions,
  _t: PdfTranslateFn,
): Promise<string> {
  var author = (options.authorName || '-').replace(/[^\x20-\x7E]/g, '-');
  var title  = (options.title || 'ChessGenome').replace(/[^\x20-\x7E]/g, '-');
  var notes  = (options.notes || '').replace(/[^\x20-\x7E\n\r\t]/g, '-');
  var items: any[] = (state.items as any[]) || [];
  var games    = items.filter(function(i){ return i.type === 'game'; });
  var charts   = items.filter(function(i){ return i.type === 'chart'; });

  var out: string[] = [];

  // ---- Encabezado ----
  out.push('# ' + title);
  out.push('');
  out.push('Author: ' + author);
  out.push('');
  out.push('Date: ' + new Date().toISOString().slice(0, 19).replace('T', ' '));
  out.push('');
  out.push('---');
  out.push('');

  // ---- Summary ----
  out.push('## Summary');
  out.push('');
  out.push('- Analyses: ' + items.filter(function(i){ return i.type === 'analysis'; }).length);
  out.push('- Games: ' + games.length);
  out.push('- Searches: ' + items.filter(function(i){ return i.type === 'search'; }).length);
  out.push('- Charts: ' + charts.length);
  out.push('');
  if (notes) { out.push('## Notes'); out.push(''); out.push(notes); out.push(''); }

  // ---- Juegos ----
  for (var gi = 0; gi < games.length; gi++) {
    var g: any = games[gi];
    var h: any = g.headers || {};
    var gWhite = String(h.White || '?').replace(/[^\x20-\x7E]/g, '?');
    var gBlack = String(h.Black || '?').replace(/[^\x20-\x7E]/g, '?');
    var gResult = String(h.Result || '*').replace(/[^\x20-\x7E]/g, '*');

    out.push('---');
    out.push('');
    out.push('# Game ' + (gi + 1) + ': ' + gWhite + ' vs ' + gBlack);
    out.push('');
    out.push('**Result:** ' + gResult);
    out.push('');

    var plies: any[] = Array.isArray(g.plies) ? g.plies : [];

    // Tablero PNG inicial
    if (plies.length && plies[0].fen) {
      var ifn = String(plies[0].fen);
      out.push('**Initial FEN:** ' + ifn);
      out.push('');
      var boardPng = '';
      try { boardPng = await boardAsPngDataUrl(ifn); } catch (e) { boardPng = ''; }
      if (boardPng && boardPng.indexOf('data:image/png;base64,') === 0) {
        out.push('## Initial board');
        out.push('');
        out.push('![](' + boardPng + ')');
        out.push('');
      }
    }

    // PGN
    if (g.pgn) {
      out.push('## PGN');
      out.push('');
      var pgnClean = String(g.pgn).replace(/[^\x20-\x7E\n]/g, '');
      var pgnLines = pgnClean.split('\n');
      for (var li = 0; li < pgnLines.length; li++) {
        out.push(pgnLines[li]);
        out.push('');
      }
    }

    // Estados — SIN tablas, SOLO líneas simples
    if (plies.length) {
      out.push('## States (' + plies.length + ')');
      out.push('');

      for (var pi = 0; pi < plies.length; pi++) {
        var pl: any = plies[pi];
        var idx = pi;
        var san = String(pl.san || '').replace(/[^\x20-\x7E]/g, '');
        var head = (idx === 0) ? 'State 0 - Initial position' : ('State ' + idx + ' - ' + san);

        out.push('### ' + head);
        out.push('');

        if (pl.L != null)   { out.push('L(' + idx + ') = ' + Number(pl.L).toFixed(6)); out.push(''); }
        if (pl.L10 != null) { out.push('L10(' + idx + ') = ' + Number(pl.L10).toFixed(6)); out.push(''); }
        if (pl.diff != null){ out.push('D(' + idx + ') = ' + Number(pl.diff).toFixed(6)); out.push(''); }
        if (pl.ratio != null){ out.push('R(' + idx + ') = ' + Number(pl.ratio).toFixed(6)); out.push(''); }

        if (pl.S_exact) {
          var sClean = String(pl.S_exact).replace(/[^\d]/g, '');
          if (sClean) {
            out.push('S(' + idx + ') = ' + sClean);
            out.push('');
            var sci = sClean[0] + '.' + sClean.slice(1, 8) + 'e+' + (sClean.length - 1);
            out.push('S sci(' + idx + ') = ' + sci);
            out.push('');
            out.push('digits S(' + idx + ') = ' + sClean.length);
            out.push('');
          }
        }

        if (pl.fen) {
          out.push('FEN(' + idx + ') = ' + String(pl.fen).replace(/[^\x20-\x7E]/g, ''));
          out.push('');
        }
      }
    }
  }

  // ---- Charts ----
  for (var ci = 0; ci < charts.length; ci++) {
    var c: any = charts[ci];
    var cTitle = String(c.title || ('Chart ' + (ci + 1))).replace(/[^\x20-\x7E]/g, '');
    out.push('---');
    out.push('');
    out.push('## ' + cTitle);
    out.push('');
    var svg = c.svgData || c.svg || '';
    if (svg) {
      var png = '';
      try { png = await svgToPngDataUrl(svg); } catch (e) { png = ''; }
      if (png && png.indexOf('data:image/png;base64,') === 0) {
        out.push('![](' + png + ')');
        out.push('');
      }
    }
  }

  // Sanitize final: quitar TODO lo no-ASCII excepto newlines
  var final = out.join('\n');
  final = final.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
  return final;
}


export async function generateSessionDoc(
  state: SessionState,
  options: PdfOptions = {},
): Promise<void> {
  const t = makeT(options.t);

  const author = options.authorName || '—';
  const title = options.title || t('pdf.coverSubtitle');
  const notes = options.notes || '';

  const analyses = state.items.filter(
    (i): i is SessionAnalysis => i.type === 'analysis',
  );
  const games = state.items.filter((i): i is SessionGame => i.type === 'game');
  const searches = state.items.filter(
    (i): i is SessionSearch => i.type === 'search',
  );
  const charts = state.items.filter((i): i is SessionChart => i.type === 'chart');

  // === Construir el HTML (mismo contenido que el PDF) ===
  const sections: string[] = [];

  sections.push(`
    <div class="cover">
      <h1>ChessGenome</h1>
      <h2>${escapeHtml(title)}</h2>
      <p><b>${escapeHtml(t('pdf.coverAuthor'))}:</b> ${escapeHtml(author)}</p>
      <p><b>${escapeHtml(t('pdf.coverDate'))}:</b> ${new Date().toLocaleString()}</p>
      <p class="summary">
        ${escapeHtml(
          t('pdf.coverSummary', {
            analyses: analyses.length,
            games: games.length,
            searches: searches.length,
            charts: charts.length,
          }),
        )}
      </p>
      ${notes ? `<p style="margin-top:20px;">${escapeHtml(notes)}</p>` : ''}
    </div>
  `);

  if (analyses.length > 0) {
    sections.push(
      `<h2 class="section">1. ${escapeHtml(t('pdf.analysisSection'))} (${analyses.length})</h2>`,
    );
    const analysisHtml = await Promise.all(
      analyses.map((item, i) => renderAnalysis(item, i, t)),
    );
    sections.push(...analysisHtml);
  }

  if (games.length > 0) {
    sections.push(
      `<h2 class="section">2. ${escapeHtml(t('pdf.gamesSection'))} (${games.length})</h2>`,
    );
    for (let g = 0; g < games.length; g++) {
      const { header, plyCards, charts: chartUnits } = await renderGame(
        games[g],
        g,
        options,
        t,
      );
      sections.push(header);
      sections.push(`<div class="plies-list">${plyCards.join('')}</div>`);
      sections.push(...chartUnits);
    }
  }

  if (searches.length > 0) {
    sections.push(
      `<h2 class="section">3. ${escapeHtml(t('pdf.searchSection'))} (${searches.length})</h2>`,
    );
    const searchHtml = searches.map((item, i) => renderSearch(item, i, t));
    sections.push(...searchHtml);
  }

  if (charts.length > 0) {
    sections.push(
      `<h2 class="section">4. ${escapeHtml(t('pdf.chartsSection'))} (${charts.length})</h2>`,
    );
    const chartHtml = await Promise.all(
      charts.map((item, i) => renderChart(item, i, t)),
    );
    sections.push(...chartHtml);
  }

  sections.push(`
    <div class="footer">
      ${escapeHtml(t('pdf.footer', { date: new Date().toISOString() }))}
    </div>
  `);

  // === Enviar JSON al backend -> python-docx ===
  console.log('[DOCX] Enviando JSON al backend…');
  await sessionToBackend(state, options);
  console.log('[DOCX] Descargado');
}


