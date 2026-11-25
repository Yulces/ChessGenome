#!/usr/bin/env python3
import sys, json, io, base64
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def add_hrule(doc, color='666666', size='6'):
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), size)
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), color)
    pBdr.append(bottom)
    pPr.append(pBdr)
    return p

def add_image(doc, dataurl, width_inches=2.2):
    if not dataurl or 'base64,' not in dataurl:
        return False
    try:
        raw = base64.b64decode(dataurl.split('base64,', 1)[1])
        doc.add_picture(io.BytesIO(raw), width=Inches(width_inches))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        return True
    except Exception as e:
        print(f"IMG ERR: {e}", file=sys.stderr)
        return False

def bold_num(doc, label, value):
    p = doc.add_paragraph()
    p.add_run(label).bold = True
    p.add_run(value)
    return p

def clean(s):
    if s is None: return ''
    return str(s).replace('\\', '').replace('\u00d8', '0').replace('\u2014', '-').replace('\u2013', '-')



TRANSLATIONS = {
    'es': {
        'Author': 'Autor',
        'Date': 'Fecha',
        'Summary': 'Resumen',
        'Analyses': 'Análisis',
        'Games': 'Partidas',
        'Searches': 'Búsquedas',
        'Charts': 'Gráficos',
        'Result': 'Resultado',
        'Initial_FEN': 'FEN inicial',
        'Initial_board': 'Tablero inicial',
        'PGN': 'PGN',
        'States': 'Estados',
        'State_0_Initial': 'Estado 0 - Posición inicial',
        'State_N': 'Estado',
        'factors': 'factores',
        'digits_S': 'dígitos S',
        'S_sci': 'Notación científica S~',
        'Notes': 'Notas',
    },
    'en': {
        'Author': 'Author',
        'Date': 'Date',
        'Summary': 'Summary',
        'Analyses': 'Analyses',
        'Games': 'Games',
        'Searches': 'Searches',
        'Charts': 'Charts',
        'Result': 'Result',
        'Initial_FEN': 'Initial FEN',
        'Initial_board': 'Initial board',
        'PGN': 'PGN',
        'States': 'States',
        'State_0_Initial': 'State 0 - Initial position',
        'State_N': 'State',
        'factors': 'factors',
        'digits_S': 'digits S',
        'S_sci': 'Scientific notation S~',
        'Notes': 'Notes',
    },
    'de': {
        'Author': 'Autor',
        'Date': 'Datum',
        'Summary': 'Zusammenfassung',
        'Analyses': 'Analysen',
        'Games': 'Partien',
        'Searches': 'Suchen',
        'Charts': 'Diagramme',
        'Result': 'Ergebnis',
        'Initial_FEN': 'Anfangs-FEN',
        'Initial_board': 'Anfangsbrett',
        'PGN': 'PGN',
        'States': 'Zustände',
        'State_0_Initial': 'Zustand 0 - Anfangsposition',
        'State_N': 'Zustand',
        'factors': 'Faktoren',
        'digits_S': 'Ziffern S',
        'S_sci': 'Wissenschaftliche Notation S~',
        'Notes': 'Notizen',
    },
}

def tr(lang, key):
    return TRANSLATIONS.get(lang, TRANSLATIONS['en']).get(key, TRANSLATIONS['en'].get(key, key))

def factor_text(exp):
    """exp: array de 64 exponentes por posición de primo.
       Primos en orden: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, ..."""
    if not exp:
        return ''
    if isinstance(exp, str):
        return exp

    # Lista de primos hasta 64 posiciones (más que suficiente)
    primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
              53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107,
              109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167,
              173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229,
              233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283,
              293, 307, 311]

    if isinstance(exp, list):
        # Formato 1: array de 64 exponentes (cada pos = primo por índice)
        if len(exp) > 4:
            pairs = []
            for i, e in enumerate(exp):
                if i >= len(primes):
                    break
                if e and int(e) > 0:
                    pairs.append((primes[i], int(e)))
            return ' . '.join(f"{p}^{e}" if e != 1 else f"{p}" for (p, e) in pairs)
        # Formato 2: [p1, e1, p2, e2, ...]
        out = []
        for i in range(0, len(exp) - 1, 2):
            p = int(exp[i]); e = int(exp[i + 1])
            if e == 0 or p <= 1:
                continue
            out.append(f"{p}^{e}" if e != 1 else f"{p}")
        return ' . '.join(out)

    if isinstance(exp, dict):
        return ' . '.join(
            f"{p}^{e}" if int(e) != 1 else f"{p}"
            for p, e in exp.items() if int(e) != 0
        )
    return ''


def build(session, out_path):
    doc = Document()
    opts = session.get('options', {})
    lang = (opts.get('lang') or 'en')[:2]
    items = session.get('items', [])

    doc.add_heading(clean(opts.get('title') or 'ChessGenome'), level=1)
    doc.add_paragraph(f"{tr(lang, 'Author')}: {clean(opts.get('authorName') or '-')}")
    doc.add_paragraph(f"{tr(lang, 'Date')}: {clean(opts.get('date') or '')}")
    add_hrule(doc)

    games = [i for i in items if i.get('type') == 'game']
    analyses = [i for i in items if i.get('type') == 'analysis']
    searches = [i for i in items if i.get('type') == 'search']
    charts = [i for i in items if i.get('type') == 'chart']

    doc.add_heading(tr(lang, 'Summary'), level=2)
    doc.add_paragraph(f"{tr(lang, 'Analyses')}: {len(analyses)}")
    doc.add_paragraph(f"{tr(lang, 'Games')}: {len(games)}")
    doc.add_paragraph(f"{tr(lang, 'Searches')}: {len(searches)}")
    doc.add_paragraph(f"{tr(lang, 'Charts')}: {len(charts)}")

    for gi, g in enumerate(games):
        add_hrule(doc, '333333', '12')
        h = g.get('headers', {}) or {}
        w = clean(h.get('White', '?'))
        b = clean(h.get('Black', '?'))
        r = clean(h.get('Result', '*'))
        doc.add_heading(f"Game {gi+1}: {w} vs {b}", level=1)
        doc.add_paragraph(f"{tr(lang, 'Result')}: {r}")

        plies = g.get('plies', []) or []
        if plies and plies[0].get('fen'):
            doc.add_paragraph(f"{tr(lang, 'Initial_FEN')}: {clean(plies[0]['fen'])}")
            if g.get('initialBoardPng'):
                doc.add_heading(tr(lang, 'Initial_board') + ':', level=2)
                add_image(doc, g['initialBoardPng'], 2.2)

        if g.get('pgn'):
            doc.add_heading('PGN', level=2)
            for line in str(g['pgn']).split('\n'):
                p = doc.add_paragraph(line)
                for run in p.runs:
                    run.font.name = 'Consolas'
                    run.font.size = Pt(9)

        if plies:
            doc.add_heading(f"{tr(lang, 'States')} ({len(plies)})", level=2)
            doc.add_paragraph("State 0 = initial position; State N = after move N.")

            for idx, pl in enumerate(plies):
                add_hrule(doc)
                san = clean(pl.get('san', ''))
                title = tr(lang, 'State_0_Initial') if idx == 0 else f"{tr(lang, 'State_N')} {idx} - {san}"
                doc.add_heading(title, level=3)

                if pl.get('L') is not None:
                    bold_num(doc, f"L({idx}) = ", f"{float(pl['L']):.6f}")
                if pl.get('L10') is not None:
                    bold_num(doc, f"L10({idx}) = ", f"{float(pl['L10']):.6f}")
                if pl.get('diff') is not None:
                    bold_num(doc, f"D({idx}) = ", f"{float(pl['diff']):.6f}")
                if pl.get('ratio') is not None:
                    bold_num(doc, f"R({idx}) = ", f"{float(pl['ratio']):.6f}")
                if pl.get('S_exact'):
                    sd = ''.join(c for c in str(pl['S_exact']) if c.isdigit())
                    p = doc.add_paragraph()
                    p.add_run(f"S({idx}) = ").bold = True
                    run = p.add_run(sd); run.font.name = 'Consolas'; run.font.size = Pt(9)
                    if len(sd) > 1:
                        # Notación científica en formato X.XXXXXXXX × 10^N
                        mantissa = sd[0] + '.' + sd[1:8]
                        exponent = len(sd) - 1
                        sci = f"{mantissa} × 10^{exponent}"
                        bold_num(doc, f"{tr(lang, 'S_sci')} ({idx}) = ", sci)
                    bold_num(doc, f"{tr(lang, 'digits_S')}({idx}) = ", str(len(sd)))
                exp = pl.get('exponents') or pl.get('factors') or pl.get('factorization') or pl.get('S_factors')
                print(f"PLY[{idx}] exponents type={type(exp).__name__} len={len(exp) if hasattr(exp, '__len__') else 'n/a'} val={str(exp)[:80]}", file=sys.stderr)
                if exp:
                    fx = factor_text(exp)
                    print(f"PLY[{idx}] factor_text -> {fx[:80] if fx else 'EMPTY'}", file=sys.stderr)
                    if fx:
                        bold_num(doc, f"{tr(lang, 'factors')}({idx}) = ", fx)
                if pl.get('fen'):
                    p = doc.add_paragraph()
                    p.add_run(f"FEN({idx}) = ").bold = True
                    run = p.add_run(clean(pl['fen'])); run.font.name = 'Consolas'; run.font.size = Pt(9)

    if charts:
        add_hrule(doc, '333333', '12')
        doc.add_heading(f"Charts ({len(charts)})", level=1)
        for ci, c in enumerate(charts):
            doc.add_heading(clean(c.get('title') or f"Chart {ci+1}"), level=2)
            if c.get('context'):
                doc.add_paragraph(clean(c['context']))
            if c.get('pngDataUrl'):
                add_image(doc, c['pngDataUrl'], 5.5)

    doc.save(out_path)

if __name__ == '__main__':
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        session = json.load(f)
    build(session, sys.argv[2])
    print("OK")
