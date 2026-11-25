import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export type ChartSeriesId = 'L10' | 'L' | 'D' | 'R';
export type YLabelDensity = 'auto' | 'all' | 'every2' | 'every5';

export interface ChartPoint {
  index: number;
  san?: string;
  L: number;
  L10: number;
  S_digits: number;
  diff: number | null;
  ratio?: number | null;
}

/** Opciones configurables del chart (controladas por el padre) */
export interface ChartOptions {
  enabled: Record<ChartSeriesId, boolean>;
  tagAngles: Record<ChartSeriesId, number>;
  showGrid: boolean;
  showDots: boolean;
  showTags: boolean;
  showArea: boolean;
  smooth: boolean;
  showYLabels: boolean;
  showXLabels: boolean;
  yLabelAngle: number;
  yLabelDensity: YLabelDensity;
}

export const DEFAULT_CHART_OPTIONS: ChartOptions = {
  enabled: { L10: true, L: true, D: true, R: true },
  tagAngles: { L10: 0, L: 0, D: 0, R: 0 },
  showGrid: true,
  showDots: true,
  showTags: true,
  showArea: false,
  smooth: true,
  showYLabels: true,
  showXLabels: true,
  yLabelAngle: -45,
  yLabelDensity: 'auto',
};

interface Props {
  points: ChartPoint[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  height?: number;
  className?: string;
  sessionTitle?: string;
  sessionContext?: string;
  /** Si se pasa, el chart es controlado por el padre */
  options?: ChartOptions;
  /** Callback al cambiar cualquier opción del chart */
  onOptionsChange?: (opts: ChartOptions) => void;
}

const SERIES_META: {
  id: ChartSeriesId;
  color: string;
  labelKey: string;
  tag: string;
  fromOne: boolean;
}[] = [
  { id: 'L10', color: '#2563eb', labelKey: 'charts.seriesL10', tag: 'L10_', fromOne: false },
  { id: 'L', color: '#ff6b00', labelKey: 'charts.seriesL', tag: 'L', fromOne: false },
  { id: 'D', color: '#db2777', labelKey: 'charts.seriesD', tag: 'D', fromOne: true },
  { id: 'R', color: '#7c3aed', labelKey: 'charts.seriesR', tag: 'R', fromOne: true },
];

const ANGLE_OPTIONS = [0, -30, -45, -90, 90];

function valueOf(p: ChartPoint, id: ChartSeriesId): number | null {
  let v: number | null = null;
  if (id === 'L10') v = p.L10;
  else if (id === 'L') v = p.L;
  else if (id === 'D') v = p.diff;
  else if (id === 'R') v = p.ratio ?? null;
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

function pointTag(id: ChartSeriesId, index: number): string {
  const meta = SERIES_META.find((s) => s.id === id)!;
  if (meta.fromOne) {
    if (index < 1) return '';
    return `${meta.tag}${index}`;
  }
  if (id === 'L10') return `L10:${index}`;
  return `${meta.tag}${index}`;
}

function smoothPath(coords: { x: number; y: number }[], tension = 0.35): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  let d = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension * 3;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension * 3;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension * 3;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension * 3;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function GenomeChart({
  points,
  selectedIndex = 0,
  onSelect,
  height = 300,
  className = '',
  sessionTitle,
  sessionContext,
  options: optionsProp,
  onOptionsChange,
}: Props) {
  const { t } = useTranslation('genome');
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [zoom, setZoom] = useState({ start: 0, end: 1 });
  const [independentY] = useState(true);

  // Estado interno (fallback si no hay `options` controladas)
  const [localOptions, setLocalOptions] = useState<ChartOptions>(
    DEFAULT_CHART_OPTIONS,
  );

  // Las opciones efectivas: del padre si está controlado, locales si no
  const opts = optionsProp ?? localOptions;

  /** Actualiza una opción (controlado o local) */
  const updateOption = <K extends keyof ChartOptions>(
    key: K,
    value: ChartOptions[K],
  ) => {
    const next: ChartOptions = { ...opts, [key]: value };
    if (optionsProp !== undefined && onOptionsChange) {
      onOptionsChange(next);
    } else {
      setLocalOptions(next);
    }
  };

  const {
    enabled,
    tagAngles,
    showGrid,
    showDots,
    showTags,
    showArea,
    smooth,
    showYLabels,
    showXLabels,
    yLabelAngle,
    yLabelDensity,
  } = opts;

  const n = points.length;
  const padLeftBase = 52;
  const padLeftExtra = showYLabels ? (yLabelAngle !== 0 ? 24 : 8) : 0;
  const pad = { top: 28, right: 14, bottom: 40, left: padLeftBase + padLeftExtra };
  const minSlot = 28;
  const width = Math.max(720, pad.left + pad.right + Math.max(n - 1, 1) * minSlot);
  const h = Math.max(220, height);

  const i0 = Math.floor(zoom.start * Math.max(n - 1, 0));
  const i1 = Math.max(i0 + 1, Math.ceil(zoom.end * Math.max(n - 1, 1)));
  const visible = points.slice(i0, i1 + 1);

  const activeSeries = SERIES_META.filter((s) => enabled[s.id]);

  const ranges = useMemo(() => {
    const r: Partial<Record<ChartSeriesId, { min: number; max: number }>> = {};
    for (const s of activeSeries) {
      const vals = visible
        .map((p) => valueOf(p, s.id))
        .filter((v): v is number => v != null && Number.isFinite(v));
      if (!vals.length) continue;
      let min = Math.min(...vals);
      let max = Math.max(...vals);
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
      if (min === max) {
        min -= Math.abs(min) * 0.05 + 0.01;
        max += Math.abs(max) * 0.05 + 0.01;
      }
      const padY = (max - min) * 0.12 || 0.5;
      r[s.id] = { min: min - padY, max: max + padY };
    }
    return r;
  }, [visible, activeSeries]);

  const primary = activeSeries[0]?.id;
  const yRange = (primary && ranges[primary]) || { min: 0, max: 1 };

  const innerW = width - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const xAt = (globalIndex: number) => {
    const firstGlobal = visible[0]?.index ?? 0;
    const lastGlobal = visible[visible.length - 1]?.index ?? firstGlobal;
    const span = Math.max(lastGlobal - firstGlobal, 1);
    return pad.left + ((globalIndex - firstGlobal) / span) * innerW;
  };

  const yAt = (v: number, id: ChartSeriesId) => {
    const rg = independentY ? ranges[id] || yRange : yRange;
    const tt = (v - rg.min) / (rg.max - rg.min || 1);
    return pad.top + innerH * (1 - tt);
  };

  const paths = useMemo(() => {
    const out: { id: ChartSeriesId; color: string; d: string; area?: string }[] = [];
    for (const s of activeSeries) {
      const coords: { x: number; y: number }[] = [];
      for (const p of visible) {
        const v = valueOf(p, s.id);
        if (v == null) continue;
        if (s.fromOne && p.index < 1) continue;
        coords.push({ x: xAt(p.index), y: yAt(v, s.id) });
      }
      if (coords.length < 1) continue;
      const d =
        coords.length === 1
          ? `M ${coords[0].x} ${coords[0].y}`
          : smooth
            ? smoothPath(coords)
            : coords.map((c, i) => `${i ? 'L' : 'M'} ${c.x} ${c.y}`).join(' ');
      let area: string | undefined;
      if (showArea && s.id === 'L' && coords.length > 1) {
        area =
          d +
          ` L ${coords[coords.length - 1].x} ${pad.top + innerH} L ${coords[0].x} ${pad.top + innerH} Z`;
      }
      out.push({ id: s.id, color: s.color, d, area });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, activeSeries, smooth, showArea, i0, i1, ranges]);

  const tipIndex = hover ?? selectedIndex;
  const tip = points[tipIndex];

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || n < 2) return;
      const rect = svg.getBoundingClientRect();
      const clientX =
        'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
      const x = ((clientX - rect.left) / rect.width) * width;
      const firstGlobal = visible[0]?.index ?? 0;
      const lastGlobal = visible[visible.length - 1]?.index ?? firstGlobal;
      const span = Math.max(lastGlobal - firstGlobal, 1);
      const tt = (x - pad.left) / innerW;
      const globalIdx = Math.round(firstGlobal + Math.min(1, Math.max(0, tt)) * span);
      setHover(globalIdx);
    },
    [n, innerW, visible, pad.left, width],
  );

  const toggle = (id: ChartSeriesId) => {
    updateOption('enabled', { ...enabled, [id]: !enabled[id] });
  };

  const setTagAngle = (id: ChartSeriesId, angle: number) => {
    updateOption('tagAngles', { ...tagAngles, [id]: angle });
  };

  const zoomIn = () => {
    const mid = (zoom.start + zoom.end) / 2;
    const half = Math.max(0.05, (zoom.end - zoom.start) / 4);
    setZoom({
      start: Math.max(0, mid - half),
      end: Math.min(1, mid + half),
    });
  };
  const zoomOut = () => setZoom({ start: 0, end: 1 });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!onSelect || n === 0) return;
      if (ev.key === 'ArrowLeft') onSelect(Math.max(0, selectedIndex - 1));
      if (ev.key === 'ArrowRight') onSelect(Math.min(n - 1, selectedIndex + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect, selectedIndex, n]);

  if (!n) {
    return (
      <div
        className={`rounded-xl border border-gray-300 p-6 text-sm text-gray-600 bg-white ${className}`}
      >
        {t('charts.empty')}
      </div>
    );
  }

  const gridLines = 5;
  const gridSeries = primary;

  const yLabelStep = (() => {
    if (yLabelDensity === 'all') return 1;
    if (yLabelDensity === 'every2') return 2;
    if (yLabelDensity === 'every5') return 5;
    const maxLabels = Math.max(3, Math.floor(innerH / 16));
    return Math.max(1, Math.ceil(visible.length / maxLabels));
  })();

  return (
    <div
      className={`rounded-xl border border-gray-300 bg-white p-2 sm:p-4 space-y-2 sm:space-y-3 ${className}`}
    >
      {/* Fila 1: series + ángulos por serie */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
        <span className="text-gray-600 uppercase tracking-wide mr-0.5">
          {t('charts.series')}
        </span>
        {SERIES_META.map((s) => (
          <div key={s.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggle(s.id)}
              className={`px-2 py-1 rounded-lg border transition ${
                enabled[s.id]
                  ? 'border-transparent text-white font-semibold'
                  : 'border-gray-400 text-gray-600'
              }`}
              style={{
                backgroundColor: enabled[s.id] ? s.color : 'transparent',
              }}
            >
              {t(s.labelKey)}
            </button>
            <select
              value={tagAngles[s.id]}
              onChange={(e) => setTagAngle(s.id, Number(e.target.value))}
              disabled={!enabled[s.id]}
              className="px-1 py-0.5 rounded bg-gray-100 border border-gray-300 text-gray-800"
              title={t('charts.pointAngle')}
            >
              {ANGLE_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}°
                </option>
              ))}
            </select>
          </div>
        ))}
        <span className="flex-1 min-w-[0.5rem]" />
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          onClick={() => updateOption('showGrid', !showGrid)}
        >
          {showGrid ? t('charts.gridOn') : t('charts.gridOff')}
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          onClick={() => updateOption('smooth', !smooth)}
        >
          {smooth ? t('charts.smooth') : t('charts.linear')}
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          onClick={() => updateOption('showDots', !showDots)}
        >
          {t('charts.dots')}
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          onClick={() => updateOption('showTags', !showTags)}
        >
          {t('charts.tags')}
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          onClick={zoomIn}
        >
          +
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
          onClick={zoomOut}
        >
          {t('charts.resetZoom')}
        </button>
      </div>

      {/* Fila 2: etiquetas Y/X */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
        <span className="text-gray-600 uppercase tracking-wide mr-0.5">
          {t('charts.labels')}
        </span>

        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showYLabels}
            onChange={(e) => updateOption('showYLabels', e.target.checked)}
          />
          Y
        </label>

        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showXLabels}
            onChange={(e) => updateOption('showXLabels', e.target.checked)}
          />
          X
        </label>

        <label className="flex items-center gap-1 select-none">
          <span className="text-gray-600">∠ Y</span>
          <select
            value={yLabelAngle}
            onChange={(e) => updateOption('yLabelAngle', Number(e.target.value))}
            disabled={!showYLabels}
            className="px-1 py-0.5 rounded bg-gray-100 border border-gray-300 text-gray-800"
          >
            {ANGLE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}°
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1 select-none">
          <span className="text-gray-600">densidad</span>
          <select
            value={yLabelDensity}
            onChange={(e) =>
              updateOption('yLabelDensity', e.target.value as YLabelDensity)
            }
            disabled={!showYLabels}
            className="px-1 py-0.5 rounded bg-gray-100 border border-gray-300 text-gray-800"
          >
            <option value="auto">auto</option>
            <option value="all">todas</option>
            <option value="every2">cada 2</option>
            <option value="every5">cada 5</option>
          </select>
        </label>
      </div>

      <p className="text-[10px] text-gray-600 leading-snug">{t('charts.scaleNote')}</p>

      <div className="relative w-full overflow-x-auto overflow-y-hidden border border-gray-300 rounded-lg">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${h}`}
          width={width}
          height={h}
          className="block min-h-[200px] max-h-[420px] touch-pan-x"
          style={{
            minWidth: width > 720 ? width : '100%',
            width: width > 720 ? width : '100%',
          }}
          onMouseMove={onMove}
          onTouchMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={() => {
            if (hover != null && onSelect) onSelect(hover);
          }}
          role="img"
          aria-label={t('charts.title')}
        >
          <rect x={0} y={0} width={width} height={h} fill="#ffffff" rx={8} />

          {showGrid &&
            gridSeries &&
            Array.from({ length: gridLines + 1 }).map((_, i) => {
              const y = pad.top + (innerH * i) / gridLines;
              const rg = ranges[gridSeries] || { min: 0, max: 1 };
              const val = rg.max - ((rg.max - rg.min) * i) / gridLines;
              const showThis =
                showYLabels &&
                (yLabelDensity === 'all' ||
                  i % Math.max(1, Math.ceil((gridLines + 1) / yLabelStep)) === 0 ||
                  i === gridLines);
              return (
                <g key={i}>
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y}
                    y2={y}
                    stroke="rgba(0,0,0,0.1)"
                    strokeWidth={1}
                  />
                  {showThis && (
                    <text
                      x={pad.left - 6}
                      y={y + 4}
                      textAnchor="end"
                      fill="#111827"
                      fontSize={12}
                      fontWeight={700}
                      fontFamily="ui-monospace, monospace"
                      transform={
                        yLabelAngle !== 0
                          ? `rotate(${yLabelAngle} ${pad.left - 6} ${y + 4})`
                          : undefined
                      }
                    >
                      {val.toFixed(3)}
                    </text>
                  )}
                </g>
              );
            })}

          {selectedIndex >= (visible[0]?.index ?? 0) &&
            selectedIndex <= (visible[visible.length - 1]?.index ?? 0) && (
              <line
                x1={xAt(selectedIndex)}
                x2={xAt(selectedIndex)}
                y1={pad.top}
                y2={pad.top + innerH}
                stroke="#ff6b00"
                strokeOpacity={0.6}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}

          {paths.map((p) => (
            <g key={p.id}>
              {p.area && (
                <path d={p.area} fill={p.color} fillOpacity={0.12} stroke="none" />
              )}
              <path
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {showDots &&
            activeSeries.map((s) =>
              visible.map((pt) => {
                const v = valueOf(pt, s.id);
                if (v == null) return null;
                if (s.fromOne && pt.index < 1) return null;
                const active = pt.index === selectedIndex || pt.index === hover;
                const tag = pointTag(s.id, pt.index);
                const showThisTag = showTags;
                const cx = xAt(pt.index);
                const cy = yAt(v, s.id);
                const angle = tagAngles[s.id] ?? 0;
                const ty = cy - 10;
                return (
                  <g key={`${s.id}-${pt.index}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={active ? 5 : 2.8}
                      fill={s.color}
                      stroke="#ffffff"
                      strokeWidth={active ? 1.5 : 0.5}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(pt.index);
                      }}
                    />
                    {showThisTag && tag && (
                      <text
                        x={cx}
                        y={ty}
                        textAnchor="middle"
                        fill={s.color}
                        fontSize={12}
                        fontFamily="ui-monospace, monospace"
                        fontWeight={700}
                        transform={
                          angle !== 0 ? `rotate(${angle} ${cx} ${ty})` : undefined
                        }
                      >
                        {tag}
                      </text>
                    )}
                  </g>
                );
              }),
            )}

          {showXLabels &&
            visible
              .filter(
                (_, i) =>
                  visible.length <= 40 ||
                  i %
                    Math.max(1, Math.ceil(visible.length / Math.min(visible.length, 40))) ===
                    0 ||
                  i === visible.length - 1,
              )
              .map((pt) => (
                <text
                  key={`x-${pt.index}`}
                  x={xAt(pt.index)}
                  y={h - 10}
                  textAnchor="middle"
                  fill="#111827"
                  fontSize={13}
                  fontWeight={700}
                  fontFamily="ui-monospace, monospace"
                >
                  {pt.index}
                </text>
              ))}
        </svg>

        {tip && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] sm:text-xs font-mono text-gray-700 bg-gray-50 rounded-lg px-2 sm:px-3 py-2 border border-gray-300">
            <span className="text-genome-orange font-semibold">
              #{tip.index} {tip.san || (tip.index === 0 ? 'start' : '')}
            </span>
            <span>L10={tip.L10.toFixed(4)}</span>
            <span>L={tip.L.toFixed(4)}</span>
            <span>D={tip.diff == null ? '—' : tip.diff.toFixed(4)}</span>
            <span>
              R=
              {tip.ratio == null || tip.index < 1
                ? '—'
                : !Number.isFinite(tip.ratio)
                  ? '∞'
                  : tip.ratio >= 1e6 || tip.ratio < 1e-4
                    ? tip.ratio.toExponential(4)
                    : tip.ratio.toPrecision(6)}
            </span>
            <span className="text-gray-500">#digits(S)={tip.S_digits}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-gray-600">
          {t('charts.hint')} · {t('charts.scrollHint')}
        </p>
      </div>
    </div>
  );
}
