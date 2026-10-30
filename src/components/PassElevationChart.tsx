import React from "react";
import * as d3 from "d3";
import { SatellitePass } from "../types/orbital";
import { formatTime, azimuthLabel } from "../lib/format";

interface PassElevationChartProps {
  pass: SatellitePass;
  path: Array<{ timeMs: number; azimuth: number; elevation: number }>;
  currentPoint: { timeMs: number; azimuth: number; elevation: number } | null;
  use24h: boolean;
  onSeek?: (fraction: number) => void;
  height?: number;
  compact?: boolean;
}

export const PassElevationChart: React.FC<PassElevationChartProps> = ({
  pass,
  path,
  currentPoint,
  use24h,
  onSeek,
  height = 180,
  compact = false,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState<number>(640);
  const [hoveredPoint, setHoveredPoint] = React.useState<{
    timeMs: number;
    azimuth: number;
    elevation: number;
  } | null>(null);

  // Responsive width observation
  React.useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const width = Math.max(300, containerWidth);
  const margin = compact
    ? { top: 22, right: 28, bottom: 26, left: 34 }
    : { top: 28, right: 36, bottom: 32, left: 42 };

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  // Time boundaries
  const timeStart = path.length ? path[0].timeMs : pass.startMs;
  const timeEnd = path.length ? path[path.length - 1].timeMs : pass.endMs;
  const validDuration = Math.max(1000, timeEnd - timeStart);

  // D3 Scales
  const xScale = React.useMemo(() => {
    return d3
      .scaleTime()
      .domain([new Date(timeStart), new Date(timeEnd)])
      .range([margin.left, width - margin.right]);
  }, [timeStart, timeEnd, margin.left, width, margin.right]);

  // Elevation scale from 0° (horizon) to 90° (zenith)
  const yScale = React.useMemo(() => {
    return d3
      .scaleLinear()
      .domain([0, 90])
      .range([height - margin.bottom, margin.top]);
  }, [height, margin.top, margin.bottom]);

  // Find peak point in sampled path
  const peakPoint = React.useMemo(() => {
    if (!path.length) {
      return {
        timeMs: pass.peakMs,
        azimuth: pass.peakAzimuth,
        elevation: pass.peakElevation,
      };
    }
    return path.reduce((best, pt) => (pt.elevation > best.elevation ? pt : best), path[0]);
  }, [path, pass]);

  // D3 Path Generators
  const areaPath = React.useMemo(() => {
    if (!path.length) return "";
    const areaGen = d3
      .area<{ timeMs: number; azimuth: number; elevation: number }>()
      .x((d) => xScale(new Date(d.timeMs)))
      .y0(yScale(0))
      .y1((d) => yScale(Math.max(0, d.elevation)))
      .curve(d3.curveMonotoneX);
    return areaGen(path) || "";
  }, [path, xScale, yScale]);

  const linePath = React.useMemo(() => {
    if (!path.length) return "";
    const lineGen = d3
      .line<{ timeMs: number; azimuth: number; elevation: number }>()
      .x((d) => xScale(new Date(d.timeMs)))
      .y((d) => yScale(Math.max(0, d.elevation)))
      .curve(d3.curveMonotoneX);
    return lineGen(path) || "";
  }, [path, xScale, yScale]);

  // Scrubbing handler
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSeek && !path.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xCoord = e.clientX - rect.left;
    const clampedX = Math.max(margin.left, Math.min(width - margin.right, xCoord));
    const fraction = (clampedX - margin.left) / innerWidth;
    const targetMs = timeStart + fraction * validDuration;

    // Find nearest point for tooltip
    if (path.length > 0) {
      const nearest = path.reduce((prev, curr) =>
        Math.abs(curr.timeMs - targetMs) < Math.abs(prev.timeMs - targetMs) ? curr : prev
      );
      setHoveredPoint(nearest);
    }

    if (e.buttons === 1 && onSeek) {
      onSeek(Math.max(0, Math.min(1, fraction)));
    }
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xCoord = e.clientX - rect.left;
    const clampedX = Math.max(margin.left, Math.min(width - margin.right, xCoord));
    const fraction = (clampedX - margin.left) / innerWidth;
    onSeek(Math.max(0, Math.min(1, fraction)));
  };

  const handlePointerLeave = () => {
    setHoveredPoint(null);
  };

  // Coordinates of key milestones
  const startX = xScale(new Date(timeStart));
  const startY = yScale(path.length ? Math.max(0, path[0].elevation) : 0);

  const endX = xScale(new Date(timeEnd));
  const endY = yScale(path.length ? Math.max(0, path[path.length - 1].elevation) : 0);

  const peakX = xScale(new Date(peakPoint.timeMs));
  const peakY = yScale(Math.max(0, peakPoint.elevation));

  // Current simulation indicator
  const currentX = currentPoint ? xScale(new Date(currentPoint.timeMs)) : null;
  const currentY = currentPoint ? yScale(Math.max(0, currentPoint.elevation)) : null;

  // Active display point (hovered takes precedence over simulation for inspection)
  const inspectPoint = hoveredPoint || currentPoint;
  const inspectX = inspectPoint ? xScale(new Date(inspectPoint.timeMs)) : null;
  const inspectY = inspectPoint ? yScale(Math.max(0, inspectPoint.elevation)) : null;

  // Elevation reference grids
  const elevationGridLevels = [0, 10, 30, 60, 90];

  return (
    <div
      ref={containerRef}
      className="pass-elevation-chart-container"
      style={{ width: "100%", position: "relative" }}
    >
      <div className="elevation-chart-header">
        <div className="elevation-chart-title">
          <span className="eyebrow">PERFIL DE ELEVACIÓN</span>
          <span className="elevation-peak-tag mono">
            Cúspide: <strong>{Math.round(peakPoint.elevation)}°</strong> a las{" "}
            {formatTime(new Date(peakPoint.timeMs), use24h)} ({azimuthLabel(peakPoint.azimuth)})
          </span>
        </div>
        <div className="elevation-legend">
          <span className="legend-item">
            <span className="legend-swatch peak"></span> Cúspide máx.
          </span>
          <span className="legend-item">
            <span className="legend-swatch threshold"></span> Umbral 10°
          </span>
          <span className="legend-item">
            <span className="legend-swatch live"></span> Satélite en vivo
          </span>
        </div>
      </div>

      <svg
        className="pass-elevation-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ cursor: onSeek ? "ew-resize" : "default", display: "block" }}
        role="img"
        aria-label="Gráfica de elevación sobre el horizonte del paso del satélite"
      >
        <defs>
          {/* Area gradient under elevation curve */}
          <linearGradient id="elevationAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f6c453" stopOpacity="0.32" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0.02" />
          </linearGradient>

          {/* Stroke gradient along trajectory */}
          <linearGradient id="elevationLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#f6c453" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>

          {/* Glowing filter */}
          <filter id="elevationGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background panel */}
        <rect
          x={margin.left}
          y={margin.top}
          width={innerWidth}
          height={innerHeight}
          fill="rgba(5, 12, 22, 0.55)"
          stroke="rgba(255, 255, 255, 0.05)"
          rx={6}
        />

        {/* 10° Visibility threshold band (below 10° is harder to view) */}
        <rect
          x={margin.left}
          y={yScale(10)}
          width={innerWidth}
          height={Math.max(0, yScale(0) - yScale(10))}
          fill="rgba(15, 23, 42, 0.35)"
          opacity={0.6}
        />

        {/* Horizontal grid lines and labels */}
        {elevationGridLevels.map((el) => {
          const y = yScale(el);
          const isHorizon = el === 0;
          const isThreshold = el === 10;
          const isZenith = el === 90;

          return (
            <g key={el} className="elevation-grid-line">
              <line
                x1={margin.left}
                y1={y}
                x2={width - margin.right}
                y2={y}
                stroke={
                  isHorizon
                    ? "rgba(196, 216, 240, 0.5)"
                    : isThreshold
                    ? "rgba(246, 196, 83, 0.3)"
                    : "rgba(166, 192, 223, 0.12)"
                }
                strokeWidth={isHorizon ? 1.5 : 1}
                strokeDasharray={isHorizon ? undefined : isThreshold ? "3 4" : "2 6"}
              />
              <text
                x={margin.left - 6}
                y={y + 3.5}
                textAnchor="end"
                className="elevation-axis-label mono"
                fill={isHorizon ? "rgba(255, 255, 255, 0.85)" : isThreshold ? "#f6c453" : "rgba(148, 163, 184, 0.7)"}
                fontSize={isHorizon || isZenith ? 9.5 : 8.5}
              >
                {el}°
              </text>
              {isHorizon && (
                <text
                  x={width - margin.right - 6}
                  y={y - 4}
                  textAnchor="end"
                  fill="rgba(148, 163, 184, 0.6)"
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                >
                  HORIZONTE
                </text>
              )}
              {isThreshold && !compact && (
                <text
                  x={width - margin.right - 6}
                  y={y - 3}
                  textAnchor="end"
                  fill="rgba(246, 196, 83, 0.5)"
                  fontSize={7.5}
                  fontFamily="var(--font-mono)"
                >
                  UMBRAL VISUAL 10°
                </text>
              )}
            </g>
          );
        })}

        {/* Peak vertical drop-line */}
        <line
          x1={peakX}
          y1={peakY}
          x2={peakX}
          y2={yScale(0)}
          stroke="rgba(246, 196, 83, 0.45)"
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />

        {/* Trajectory area fill */}
        {areaPath && (
          <path d={areaPath} fill="url(#elevationAreaGradient)" pointerEvents="none" />
        )}

        {/* Trajectory line stroke */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="url(#elevationLineGradient)"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#elevationGlow)"
            pointerEvents="none"
          />
        )}

        {/* Start point (AOS / Salida) */}
        <g className="elevation-node aos" transform={`translate(${startX}, ${startY})`}>
          <circle r={3.5} fill="#0b1420" stroke="#38bdf8" strokeWidth={1.5} />
        </g>

        {/* End point (LOS / Puesta) */}
        <g className="elevation-node los" transform={`translate(${endX}, ${endY})`}>
          <circle r={3.5} fill="#0b1420" stroke="#38bdf8" strokeWidth={1.5} />
        </g>

        {/* Peak point (Cúspide / Culminación) marker */}
        <g className="elevation-node peak" transform={`translate(${peakX}, ${peakY})`}>
          <circle r={10} fill="rgba(246, 196, 83, 0.15)" className="pulse-ring" />
          <circle r={5} fill="#0b1420" stroke="#f6c453" strokeWidth={2} />
          <circle r={2.2} fill="#f6c453" />

          {/* Peak callout badge */}
          <g transform="translate(0, -14)">
            <rect
              x={-36}
              y={-17}
              width={72}
              height={16}
              rx={4}
              fill="rgba(10, 20, 36, 0.92)"
              stroke="rgba(246, 196, 83, 0.6)"
              strokeWidth={1}
            />
            <text
              x={0}
              y={-6}
              textAnchor="middle"
              fill="#f6c453"
              fontSize={8.5}
              fontWeight="600"
              fontFamily="var(--font-mono)"
            >
              {Math.round(peakPoint.elevation)}° CÚSPIDE
            </text>
          </g>
        </g>

        {/* Simulation / Current position needle and indicator */}
        {currentX !== null && currentY !== null && (
          <g className="elevation-live-cursor" pointerEvents="none">
            {/* Vertical needle */}
            <line
              x1={currentX}
              y1={margin.top}
              x2={currentX}
              y2={yScale(0)}
              stroke="#38bdf8"
              strokeWidth={1.4}
              strokeDasharray="4 2"
              opacity={0.85}
            />

            {/* Orbit core dot */}
            <circle
              cx={currentX}
              cy={currentY}
              r={12}
              fill="rgba(56, 189, 248, 0.2)"
              className="pulse-ring"
            />
            <circle
              cx={currentX}
              cy={currentY}
              r={5}
              fill="#ffffff"
              stroke="#0284c7"
              strokeWidth={2}
              filter="drop-shadow(0 0 5px rgba(56, 189, 248, 0.9))"
            />
          </g>
        )}

        {/* Hover / Tooltip inspection line */}
        {hoveredPoint && inspectX !== null && inspectY !== null && (
          <g className="elevation-inspect-cursor" pointerEvents="none">
            <line
              x1={inspectX}
              y1={margin.top}
              x2={inspectX}
              y2={yScale(0)}
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth={1}
            />
            <circle
              cx={inspectX}
              cy={inspectY}
              r={4}
              fill="#ffffff"
              stroke="#f6c453"
              strokeWidth={1.5}
            />
            {/* Floating tooltip */}
            <g
              transform={`translate(${Math.max(
                margin.left + 45,
                Math.min(width - margin.right - 45, inspectX)
              )}, ${Math.max(margin.top + 20, inspectY - 26)})`}
            >
              <rect
                x={-42}
                y={-14}
                width={84}
                height={26}
                rx={5}
                fill="rgba(4, 9, 18, 0.94)"
                stroke="rgba(56, 189, 248, 0.5)"
                strokeWidth={1}
              />
              <text
                x={0}
                y={-2}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={8.5}
                fontWeight="500"
                fontFamily="var(--font-mono)"
              >
                {formatTime(new Date(hoveredPoint.timeMs), use24h)}
              </text>
              <text
                x={0}
                y={8}
                textAnchor="middle"
                fill="#38bdf8"
                fontSize={8}
                fontFamily="var(--font-mono)"
              >
                EL {Math.round(hoveredPoint.elevation)}° · AZ {Math.round(hoveredPoint.azimuth)}°
              </text>
            </g>
          </g>
        )}

        {/* Time Axis Labels along the bottom */}
        <g className="elevation-time-axis" transform={`translate(0, ${height - margin.bottom + 14})`}>
          {/* Start (Salida) */}
          <text
            x={startX}
            y={0}
            textAnchor="start"
            className="mono"
            fill="rgba(148, 163, 184, 0.85)"
            fontSize={8.5}
          >
            Salida {formatTime(new Date(timeStart), use24h)} ({azimuthLabel(pass.startAzimuth)})
          </text>

          {/* Peak (Cúspide time) */}
          <text
            x={peakX}
            y={0}
            textAnchor="middle"
            className="mono"
            fill="#f6c453"
            fontSize={8.5}
            fontWeight="500"
          >
            {formatTime(new Date(peakPoint.timeMs), use24h)}
          </text>

          {/* End (Puesta) */}
          <text
            x={endX}
            y={0}
            textAnchor="end"
            className="mono"
            fill="rgba(148, 163, 184, 0.85)"
            fontSize={8.5}
          >
            Puesta {formatTime(new Date(timeEnd), use24h)} ({azimuthLabel(pass.endAzimuth)})
          </text>
        </g>
      </svg>
    </div>
  );
};
