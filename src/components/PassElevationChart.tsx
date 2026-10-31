import React from "react";
import * as d3 from "d3";
import { SatellitePass } from "../types/orbital";
import { formatTime, formatClock, azimuthLabel, compassDirection, formatDuration } from "../lib/format";

interface PassElevationChartProps {
  pass: SatellitePass;
  path: Array<{ timeMs: number; azimuth: number; elevation: number }>;
  currentPoint: { timeMs: number; azimuth: number; elevation: number } | null;
  use24h: boolean;
  onSeek?: (fraction: number) => void;
  onHoverPoint?: (pt: { timeMs: number; azimuth: number; elevation: number } | null) => void;
  height?: number;
  compact?: boolean;
}

/**
 * Continuous time-based trajectory interpolation.
 * Produces smooth exact coordinates, azimuth (with 360 wrap-around support),
 * and elevation for any target timestamp along the satellite pass.
 */
function interpolatePathByTime(
  path: Array<{ timeMs: number; azimuth: number; elevation: number }>,
  targetMs: number
): { timeMs: number; azimuth: number; elevation: number } {
  if (!path.length) {
    return { timeMs: targetMs, azimuth: 0, elevation: 0 };
  }
  if (path.length === 1 || targetMs <= path[0].timeMs) {
    return { ...path[0], timeMs: targetMs };
  }
  if (targetMs >= path[path.length - 1].timeMs) {
    return { ...path[path.length - 1], timeMs: targetMs };
  }

  let i = 0;
  while (i < path.length - 1 && path[i + 1].timeMs < targetMs) {
    i++;
  }
  const p1 = path[i];
  const p2 = path[i + 1];
  const span = Math.max(1, p2.timeMs - p1.timeMs);
  const t = Math.max(0, Math.min(1, (targetMs - p1.timeMs) / span));

  let azDelta = p2.azimuth - p1.azimuth;
  if (azDelta > 180) azDelta -= 360;
  if (azDelta < -180) azDelta += 360;

  return {
    timeMs: targetMs,
    azimuth: (p1.azimuth + azDelta * t + 360) % 360,
    elevation: Math.max(0, Math.min(90, p1.elevation + (p2.elevation - p1.elevation) * t)),
  };
}

export const PassElevationChart: React.FC<PassElevationChartProps> = ({
  pass,
  path,
  currentPoint,
  use24h,
  onSeek,
  onHoverPoint,
  height = 180,
  compact = false,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
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
    ? { top: 22, right: 28, bottom: 28, left: 38 }
    : { top: 28, right: 38, bottom: 34, left: 46 };

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

  // Handle pointer tracking along the trajectory curve
  const updateHoverFromClientX = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xCoord = clientX - rect.left;
    const clampedX = Math.max(margin.left, Math.min(width - margin.right, xCoord));
    const fraction = (clampedX - margin.left) / innerWidth;
    const targetMs = timeStart + fraction * validDuration;

    if (path.length > 0) {
      const interpolated = interpolatePathByTime(path, targetMs);
      setHoveredPoint(interpolated);
      if (onHoverPoint) onHoverPoint(interpolated);
    }
    return fraction;
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const fraction = updateHoverFromClientX(e.clientX);
    if (e.buttons === 1 && onSeek && fraction !== undefined) {
      onSeek(Math.max(0, Math.min(1, fraction)));
    }
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const fraction = updateHoverFromClientX(e.clientX);
    if (onSeek && fraction !== undefined) {
      onSeek(Math.max(0, Math.min(1, fraction)));
    }
  };

  const handlePointerLeave = () => {
    setHoveredPoint(null);
    if (onHoverPoint) onHoverPoint(null);
  };

  // Coordinates of milestones
  const startX = xScale(new Date(timeStart));
  const startY = yScale(path.length ? Math.max(0, path[0].elevation) : 0);

  const endX = xScale(new Date(timeEnd));
  const endY = yScale(path.length ? Math.max(0, path[path.length - 1].elevation) : 0);

  const peakX = xScale(new Date(peakPoint.timeMs));
  const peakY = yScale(Math.max(0, peakPoint.elevation));

  // Current simulation indicator
  const currentX = currentPoint ? xScale(new Date(currentPoint.timeMs)) : null;
  const currentY = currentPoint ? yScale(Math.max(0, currentPoint.elevation)) : null;

  // Active display point for trajectory inspection
  const activeAnnotationPoint = hoveredPoint || null;
  const inspectX = activeAnnotationPoint ? xScale(new Date(activeAnnotationPoint.timeMs)) : null;
  const inspectY = activeAnnotationPoint ? yScale(Math.max(0, activeAnnotationPoint.elevation)) : null;

  // Elevation reference grid levels
  const elevationGridLevels = [0, 10, 30, 60, 90];

  // Dynamic annotation card positioning
  const cardWidth = compact ? 162 : 184;
  const cardHeight = compact ? 72 : 78;

  let cardX = 0;
  let cardY = 0;
  let leaderX1 = 0;
  let leaderY1 = 0;
  let leaderX2 = 0;
  let leaderY2 = 0;

  if (inspectX !== null && inspectY !== null) {
    const spaceRight = width - margin.right - inspectX;
    const spaceLeft = inspectX - margin.left;
    const placeRight = spaceRight >= cardWidth + 16 || spaceRight >= spaceLeft;

    if (placeRight) {
      cardX = Math.min(width - margin.right - cardWidth, inspectX + 16);
      leaderX1 = inspectX + 5;
      leaderX2 = cardX;
    } else {
      cardX = Math.max(margin.left, inspectX - cardWidth - 16);
      leaderX1 = inspectX - 5;
      leaderX2 = cardX + cardWidth;
    }

    const midY = inspectY - cardHeight / 2;
    cardY = Math.max(margin.top + 4, Math.min(height - margin.bottom - cardHeight - 4, midY));
    leaderY1 = inspectY;
    leaderY2 = cardY + cardHeight / 2;
  }

  // Clamped X-axis time badge position
  const timeBadgeWidth = 64;
  const timeBadgeX =
    inspectX !== null
      ? Math.max(
          margin.left + timeBadgeWidth / 2,
          Math.min(width - margin.right - timeBadgeWidth / 2, inspectX)
        )
      : 0;

  return (
    <div
      ref={containerRef}
      className="pass-elevation-chart-container"
      style={{ width: "100%", position: "relative" }}
    >
      <div className="elevation-chart-header">
        <div className="elevation-chart-title">
          <span className="eyebrow">PERFIL DE ELEVACIÓN</span>
          {activeAnnotationPoint ? (
            <span className="elevation-peak-tag mono dynamic-active">
              <span className="elevation-tag-dot pulse"></span>
              <strong>{formatClock(new Date(activeAnnotationPoint.timeMs), use24h, true)}</strong>
              <span className="tag-sep">·</span>
              <span>AZ: {activeAnnotationPoint.azimuth.toFixed(1)}° ({compassDirection(activeAnnotationPoint.azimuth)})</span>
              <span className="tag-sep">·</span>
              <span>EL: {activeAnnotationPoint.elevation.toFixed(1)}°</span>
            </span>
          ) : (
            <span className="elevation-peak-tag mono">
              Cúspide: <strong>{Math.round(peakPoint.elevation)}°</strong> a las{" "}
              {formatTime(new Date(peakPoint.timeMs), use24h)} ({azimuthLabel(peakPoint.azimuth)})
            </span>
          )}
        </div>
        <div className="elevation-legend">
          <span className="legend-item">
            <span className="legend-swatch peak"></span> Cúspide {Math.round(peakPoint.elevation)}°
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
        ref={svgRef}
        className="pass-elevation-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ cursor: "crosshair", display: "block" }}
        role="img"
        aria-label="Gráfica interactiva D3 con anotaciones dinámicas de la trayectoria"
      >
        <defs>
          {/* Area gradient under elevation curve */}
          <linearGradient id="elevationAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f6c453" stopOpacity="0.35" />
            <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0.02" />
          </linearGradient>

          {/* Stroke gradient along trajectory */}
          <linearGradient id="elevationLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#f6c453" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="elevationGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Card shadow */}
          <filter id="elevationCardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#000000" floodOpacity="0.75" />
          </filter>

          {/* Vertical drop gradient for hovered height indicator */}
          <linearGradient id="heightDropGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f6c453" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Background panel */}
        <rect
          x={margin.left}
          y={margin.top}
          width={innerWidth}
          height={innerHeight}
          fill="rgba(5, 12, 22, 0.65)"
          stroke="rgba(255, 255, 255, 0.06)"
          rx={6}
        />

        {/* 10° Visibility threshold band */}
        <rect
          x={margin.left}
          y={yScale(10)}
          width={innerWidth}
          height={Math.max(0, yScale(0) - yScale(10))}
          fill="rgba(15, 23, 42, 0.35)"
          opacity={0.65}
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
                    ? "rgba(196, 216, 240, 0.55)"
                    : isThreshold
                    ? "rgba(246, 196, 83, 0.3)"
                    : "rgba(166, 192, 223, 0.12)"
                }
                strokeWidth={isHorizon ? 1.5 : 1}
                strokeDasharray={isHorizon ? undefined : isThreshold ? "3 4" : "2 6"}
              />
              <text
                x={margin.left - 7}
                y={y + 3.5}
                textAnchor="end"
                className="elevation-axis-label mono"
                fill={
                  isHorizon
                    ? "rgba(255, 255, 255, 0.9)"
                    : isThreshold
                    ? "#f6c453"
                    : "rgba(148, 163, 184, 0.7)"
                }
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
                  fill="rgba(246, 196, 83, 0.55)"
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

          {/* Peak callout badge (hidden while actively hovering near peak to avoid overlap) */}
          {(!inspectX || Math.abs(inspectX - peakX) > 42) && (
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
          )}
        </g>

        {/* Live Simulation indicator */}
        {currentX !== null && currentY !== null && !hoveredPoint && (
          <g className="elevation-live-cursor" pointerEvents="none">
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

        {/* ========================================================= */}
        {/* DYNAMIC ANNOTATIONS ON HOVER OVER TRAJECTORY CURVE       */}
        {/* Exact Time, Azimuth, Elevation, Guideline Crosshairs & HUD */}
        {/* ========================================================= */}
        {activeAnnotationPoint && inspectX !== null && inspectY !== null && (
          <g className="elevation-dynamic-annotation-group" pointerEvents="none">
            {/* Shaded vertical column beneath trajectory point */}
            <line
              x1={inspectX}
              y1={inspectY}
              x2={inspectX}
              y2={yScale(0)}
              stroke="url(#heightDropGradient)"
              strokeWidth={2}
              strokeDasharray="3 2"
            />

            {/* Horizontal guideline to Elevation Y-axis */}
            <line
              x1={margin.left}
              y1={inspectY}
              x2={inspectX}
              y2={inspectY}
              stroke="rgba(246, 196, 83, 0.7)"
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />

            {/* Vertical guideline extending up to top of chart */}
            <line
              x1={inspectX}
              y1={margin.top}
              x2={inspectX}
              y2={inspectY}
              stroke="rgba(56, 189, 248, 0.5)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />

            {/* Y-Axis Dynamic Elevation Badge */}
            <g transform={`translate(${margin.left - 4}, ${inspectY})`}>
              <rect
                x={-34}
                y={-8}
                width={33}
                height={16}
                rx={3.5}
                fill="#0e1726"
                stroke="#f6c453"
                strokeWidth={1.2}
              />
              <text
                x={-17}
                y={3}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight="700"
                fill="#f6c453"
                fontFamily="var(--font-mono)"
              >
                {activeAnnotationPoint.elevation.toFixed(1)}°
              </text>
            </g>

            {/* X-Axis Dynamic Time Badge */}
            <g transform={`translate(${timeBadgeX}, ${yScale(0) + 12})`}>
              <rect
                x={-timeBadgeWidth / 2}
                y={-9}
                width={timeBadgeWidth}
                height={17}
                rx={4}
                fill="#071322"
                stroke="#38bdf8"
                strokeWidth={1.2}
              />
              <text
                x={0}
                y={3}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight="600"
                fill="#38bdf8"
                fontFamily="var(--font-mono)"
              >
                {formatClock(new Date(activeAnnotationPoint.timeMs), use24h, true)}
              </text>
            </g>

            {/* Leader line from point to floating card */}
            <line
              x1={leaderX1}
              y1={leaderY1}
              x2={leaderX2}
              y2={leaderY2}
              stroke="rgba(56, 189, 248, 0.65)"
              strokeWidth={1.2}
              strokeDasharray="2 2"
            />

            {/* Reticle / targeting rings on the curve */}
            <circle
              cx={inspectX}
              cy={inspectY}
              r={12}
              fill="rgba(56, 189, 248, 0.22)"
              className="pulse-ring"
            />
            <circle
              cx={inspectX}
              cy={inspectY}
              r={5.5}
              fill="#06121e"
              stroke="#38bdf8"
              strokeWidth={2}
            />
            <circle cx={inspectX} cy={inspectY} r={2.5} fill="#f6c453" />

            {/* Floating Dynamic HUD Annotation Card */}
            <g
              transform={`translate(${cardX}, ${cardY})`}
              filter="url(#elevationCardShadow)"
            >
              {/* Card background frame */}
              <rect
                x={0}
                y={0}
                width={cardWidth}
                height={cardHeight}
                rx={6}
                fill="rgba(5, 14, 26, 0.96)"
                stroke="rgba(56, 189, 248, 0.55)"
                strokeWidth={1.2}
              />

              {/* Card top banner */}
              <rect
                x={1}
                y={1}
                width={cardWidth - 2}
                height={19}
                rx={5}
                fill="rgba(56, 189, 248, 0.12)"
              />
              <text
                x={8}
                y={14}
                fill="#38bdf8"
                fontSize={7.8}
                fontWeight="700"
                fontFamily="var(--font-mono)"
                letterSpacing="0.04em"
              >
                ANOTACIÓN DINÁMICA
              </text>
              <text
                x={cardWidth - 8}
                y={14}
                textAnchor="end"
                fill={activeAnnotationPoint.elevation >= 10 ? "#4ade80" : "#f59e0b"}
                fontSize={7.5}
                fontWeight="600"
                fontFamily="var(--font-mono)"
              >
                {activeAnnotationPoint.elevation >= 10 ? "● VISIBLE" : "● <10° BAJA"}
              </text>

              {/* Metric 1: HORA EXACTA */}
              <text
                x={9}
                y={32}
                fill="rgba(148, 163, 184, 0.85)"
                fontSize={8}
                fontFamily="var(--font-mono)"
              >
                Hora exacta:
              </text>
              <text
                x={cardWidth - 9}
                y={32}
                textAnchor="end"
                fill="#ffffff"
                fontSize={9}
                fontWeight="600"
                fontFamily="var(--font-mono)"
              >
                {formatClock(new Date(activeAnnotationPoint.timeMs), use24h, true)}
              </text>

              {/* Metric 2: AZIMUT */}
              <text
                x={9}
                y={47}
                fill="rgba(148, 163, 184, 0.85)"
                fontSize={8}
                fontFamily="var(--font-mono)"
              >
                Azimut:
              </text>
              <text
                x={cardWidth - 9}
                y={47}
                textAnchor="end"
                fill="#38bdf8"
                fontSize={9}
                fontWeight="600"
                fontFamily="var(--font-mono)"
              >
                {activeAnnotationPoint.azimuth.toFixed(1)}° ({compassDirection(activeAnnotationPoint.azimuth)})
              </text>

              {/* Metric 3: ELEVACIÓN */}
              <text
                x={9}
                y={62}
                fill="rgba(148, 163, 184, 0.85)"
                fontSize={8}
                fontFamily="var(--font-mono)"
              >
                Elevación:
              </text>
              <text
                x={cardWidth - 9}
                y={62}
                textAnchor="end"
                fill="#f6c453"
                fontSize={9.5}
                fontWeight="700"
                fontFamily="var(--font-mono)"
              >
                {activeAnnotationPoint.elevation.toFixed(1)}° sobre horiz.
              </text>

              {/* Small duration indicator when height allows */}
              {!compact && (
                <text
                  x={9}
                  y={73}
                  fill="rgba(148, 163, 184, 0.55)"
                  fontSize={7}
                  fontFamily="var(--font-mono)"
                >
                  +{formatDuration(Math.max(0, (activeAnnotationPoint.timeMs - timeStart) / 1000))} transcurrido
                </text>
              )}
            </g>
          </g>
        )}

        {/* Time Axis Labels along the bottom */}
        <g
          className="elevation-time-axis"
          transform={`translate(0, ${height - margin.bottom + 14})`}
          pointerEvents="none"
        >
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
          {(!inspectX || Math.abs(inspectX - peakX) > 40) && (
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
          )}

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

        {/* Transparent Hit Area spanning entire chart interior */}
        <rect
          x={margin.left}
          y={margin.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          style={{ pointerEvents: "all" }}
        />

        {/* Wide hit-path along the curve to guarantee smooth drag/hover */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="transparent"
            strokeWidth={26}
            style={{ pointerEvents: "stroke" }}
          />
        )}
      </svg>
    </div>
  );
};
