import React from "react";
import { SatellitePass, UserSettings, Satellite } from "../types/orbital";
import {
  formatClock,
  formatTime,
  formatDuration,
  azimuthLabel,
  compassDirection,
  brightnessLabel,
  dayTag,
} from "../lib/format";
import { PassElevationChart } from "./PassElevationChart";

interface SkyViewModalProps {
  pass: SatellitePass;
  satellite: Satellite | null;
  locationName: string | null;
  path: Array<{ timeMs: number; azimuth: number; elevation: number }>;
  settings: UserSettings;
  onClose: () => void;
  onSaveCalendar: () => void;
}

function projectSky(azimuth: number, elevation: number) {
  const radius = 300 * (1 - Math.min(90, Math.max(0, elevation)) / 90);
  const angle = (azimuth * Math.PI) / 180;
  return {
    x: 360 + Math.sin(angle) * radius,
    y: 360 - Math.cos(angle) * radius,
  };
}

function interpolatePath(
  path: Array<{ timeMs: number; azimuth: number; elevation: number }>,
  fraction: number
) {
  if (!path.length) return null;
  if (path.length === 1) return path[0];
  const position = Math.max(0, Math.min(1, fraction)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(position));
  const t = position - i;
  const a = path[i];
  const b = path[i + 1];
  let azDelta = b.azimuth - a.azimuth;
  if (azDelta > 180) azDelta -= 360;
  if (azDelta < -180) azDelta += 360;
  return {
    timeMs: a.timeMs + (b.timeMs - a.timeMs) * t,
    azimuth: (a.azimuth + azDelta * t + 360) % 360,
    elevation: a.elevation + (b.elevation - a.elevation) * t,
  };
}

export const SkyViewModal: React.FC<SkyViewModalProps> = ({
  pass,
  satellite,
  locationName,
  path,
  settings,
  onClose,
  onSaveCalendar,
}) => {
  const [isPlaying, setIsPlaying] = React.useState(!settings.reducedMotion);
  const [pausedFraction, setPausedFraction] = React.useState(settings.reducedMotion ? 0.5 : 0);
  const [viewMode, setViewMode] = React.useState<"both" | "polar" | "elevation">("both");
  const [currentPoint, setCurrentPoint] = React.useState<{
    timeMs: number;
    azimuth: number;
    elevation: number;
  } | null>(null);
  const [hoveredPoint, setHoveredPoint] = React.useState<{
    timeMs: number;
    azimuth: number;
    elevation: number;
  } | null>(null);

  const startWallRef = React.useRef(performance.now() - pausedFraction * 20000);

  const use24h = settings.clock === "24";

  React.useEffect(() => {
    let animId: number;
    const loop = (now: number) => {
      let f: number;
      if (isPlaying) {
        const elapsed = (now - startWallRef.current) / 1000;
        f = (elapsed % 20) / 20;
      } else {
        f = pausedFraction;
      }
      const pt = interpolatePath(path, f);
      if (pt) setCurrentPoint(pt);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, pausedFraction, path]);

  const togglePreview = () => {
    if (isPlaying) {
      if (currentPoint && path.length > 1) {
        const idx = path.findIndex((p) => p.timeMs >= currentPoint.timeMs);
        const f = idx >= 0 ? idx / (path.length - 1) : 0;
        setPausedFraction(f);
      }
      setIsPlaying(false);
    } else {
      startWallRef.current = performance.now() - pausedFraction * 20000;
      setIsPlaying(true);
    }
  };

  const handleSeek = (fraction: number) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    setPausedFraction(clamped);
    startWallRef.current = performance.now() - clamped * 20000;
    const pt = interpolatePath(path, clamped);
    if (pt) setCurrentPoint(pt);
  };

  // Build path SVG d attribute
  const pathD = React.useMemo(() => {
    if (!path.length) return "";
    let d = "";
    let lastAz: number | null = null;
    for (let i = 0; i < path.length; i += 1) {
      const pt = path[i];
      const pos = projectSky(pt.azimuth, pt.elevation);
      if (i === 0 || lastAz === null || Math.abs(pt.azimuth - lastAz) > 120) {
        d += `M ${pos.x.toFixed(2)} ${pos.y.toFixed(2)} `;
      } else {
        d += `L ${pos.x.toFixed(2)} ${pos.y.toFixed(2)} `;
      }
      lastAz = pt.azimuth;
    }
    return d;
  }, [path]);

  const startPt = path.length ? projectSky(path[0].azimuth, path[0].elevation) : null;
  const endPt = path.length ? projectSky(path[path.length - 1].azimuth, path[path.length - 1].elevation) : null;
  const peakPt = React.useMemo(() => {
    if (!path.length) return null;
    const peak = path.reduce((best, p) => (p.elevation > best.elevation ? p : best));
    return projectSky(peak.azimuth, peak.elevation);
  }, [path]);

  const sampleLabels = React.useMemo(() => {
    if (!path.length) return [];
    return [
      { pt: path[Math.floor(path.length * 0.2)], ox: 10, oy: 16 },
      { pt: path[Math.floor(path.length * 0.5)], ox: 10, oy: -10 },
      { pt: path[Math.floor(path.length * 0.8)], ox: -32, oy: 16 },
    ].filter((item) => !!item.pt);
  }, [path]);

  const displayPoint = hoveredPoint || currentPoint;
  const screenSat = displayPoint ? projectSky(displayPoint.azimuth, displayPoint.elevation) : { x: 360, y: 360 };

  const CARDINALS = [
    { label: "N", angle: 0, className: "north" },
    { label: "E", angle: 90 },
    { label: "S", angle: 180 },
    { label: "O", angle: 270 },
    { label: "NE", angle: 45 },
    { label: "SE", angle: 135 },
    { label: "SO", angle: 225 },
    { label: "NO", angle: 315 },
  ];

  return (
    <div id="skyView" className="sky-view sky-view-modal" role="dialog" aria-modal="true" aria-labelledby="skyTitle">
      <div className="sky-shell">
        <header className="sky-header">
          <button id="closeSkyView" className="button secondary" type="button" aria-label="Volver al globo" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Volver al globo</span>
          </button>

          <div className="sky-header-center">
            <span className="eyebrow">VISTA DEL CIELO</span>
            <h2 id="skyTitle">{satellite?.name || pass.name}</h2>
            <span id="skyLocation" className="sky-location">
              {locationName || "Tu cielo"}
            </span>
          </div>

          <button
            id="skySave"
            className="button secondary"
            type="button"
            aria-label="Guardar este paso en el calendario como archivo .ics"
            onClick={onSaveCalendar}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5.5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 3.5v4M16 3.5v4M4 10h16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>.ics</span>
          </button>
        </header>

        <div className="sky-content">
          <div className="sky-chart-wrap">
            <div className="sky-view-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div className="elevation-view-tabs" role="tablist" aria-label="Seleccionar modo de visualización">
                <button
                  type="button"
                  className={`elevation-view-tab ${viewMode === "both" ? "is-active" : ""}`}
                  onClick={() => setViewMode("both")}
                >
                  Vista combinada
                </button>
                <button
                  type="button"
                  className={`elevation-view-tab ${viewMode === "polar" ? "is-active" : ""}`}
                  onClick={() => setViewMode("polar")}
                >
                  Carta polar
                </button>
                <button
                  type="button"
                  className={`elevation-view-tab ${viewMode === "elevation" ? "is-active" : ""}`}
                  onClick={() => setViewMode("elevation")}
                >
                  Curva de elevación (D3)
                </button>
              </div>

              <div
                className="mono"
                style={{
                  fontSize: "9px",
                  color: hoveredPoint ? "var(--accent)" : "var(--faint)",
                  transition: "color 150ms ease",
                }}
              >
                {displayPoint
                  ? `AZ ${displayPoint.azimuth.toFixed(1)}° (${compassDirection(displayPoint.azimuth)}) · EL ${displayPoint.elevation.toFixed(1)}°`
                  : "AZ — · EL —"}
              </div>
            </div>

            {(viewMode === "both" || viewMode === "polar") && (
              <div className="sky-chart-frame" style={viewMode === "both" ? { maxHeight: "310px" } : undefined}>
                <svg id="skyChart" viewBox="0 0 720 720" role="img" aria-label="Carta celeste que muestra la trayectoria del paso del satélite">
                  <defs>
                    <radialGradient id="skyGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#10243b" stopOpacity="0.8" />
                      <stop offset="72%" stopColor="#09111f" stopOpacity="0.42" />
                      <stop offset="100%" stopColor="#050a13" stopOpacity="0" />
                    </radialGradient>
                    <filter id="pathGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  <circle cx="360" cy="360" r="310" fill="url(#skyGlow)" />

                  {/* Sky Grid */}
                  <g id="skyGrid" className="sky-grid">
                    {[0, 30, 60, 80].map((el) => {
                      const r = 300 * (1 - el / 90);
                      return <circle key={el} cx="360" cy="360" r={r} className={el === 0 ? "horizon" : `ring-${el}`} />;
                    })}
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                      const a = (i * Math.PI) / 4;
                      return (
                        <line
                          key={i}
                          x1={360 + Math.sin(a) * 8}
                          y1={360 - Math.cos(a) * 8}
                          x2={360 + Math.sin(a) * 300}
                          y2={360 - Math.cos(a) * 300}
                        />
                      );
                    })}
                    {[30, 60].map((el) => {
                      const r = 300 * (1 - el / 90) - 4;
                      return (
                        <text key={el} x="366" y={360 - r}>
                          {el}°
                        </text>
                      );
                    })}
                  </g>

                  {/* Path and markers */}
                  <g id="skyPathGroup">
                    {pathD && (
                      <>
                        <path d={pathD} className="sky-path-dash" />
                        <path d={pathD} className="sky-path-line" />
                      </>
                    )}
                    {startPt && <circle cx={startPt.x} cy={startPt.y} r="3.2" className="sky-point" />}
                    {peakPt && <circle cx={peakPt.x} cy={peakPt.y} r="3.2" className="sky-point" />}
                    {endPt && <circle cx={endPt.x} cy={endPt.y} r="3.2" className="sky-point" />}
                  </g>

                  {/* Time labels */}
                  <g id="skyTimeLabels" className="sky-time-labels">
                    {sampleLabels.map(({ pt, ox, oy }, idx) => {
                      const pos = projectSky(pt.azimuth, pt.elevation);
                      return (
                        <text key={idx} x={pos.x + ox} y={pos.y + oy}>
                          {formatTime(new Date(pt.timeMs), use24h)}
                        </text>
                      );
                    })}
                  </g>

                  {/* Satellite symbol */}
                  <g id="skySatellite" className="sky-satellite" transform={`translate(${screenSat.x} ${screenSat.y})`}>
                    <circle r="15" className="sky-satellite-halo" />
                    <circle r="6" className="sky-satellite-core" />
                  </g>

                  {/* Cardinals */}
                  <g id="skyCardinals" className="sky-cardinals">
                    {CARDINALS.map(({ label, angle, className }) => {
                      const a = (angle * Math.PI) / 180;
                      const dist = 300 + (label.length > 1 ? 26 : 29);
                      const x = 360 + Math.sin(a) * dist;
                      const y = 360 - Math.cos(a) * dist;
                      return (
                        <React.Fragment key={label}>
                          <text x={x} y={y} className={className || ""}>
                            {label}
                          </text>
                          {label.length === 1 && (
                            <line
                              x1={360 + Math.sin(a) * 299}
                              y1={360 - Math.cos(a) * 299}
                              x2={360 + Math.sin(a) * 307}
                              y2={360 - Math.cos(a) * 307}
                              className="cardinal-tick"
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </g>
                </svg>
              </div>
            )}

            {viewMode === "polar" && (
              <div className="sky-chart-caption">
                <span>
                  <span className="legend-line"></span> Trayectoria
                </span>
                <span className="mono" id="skyAzimuthReadout">
                  {displayPoint
                    ? `AZ ${displayPoint.azimuth.toFixed(1)}° (${compassDirection(displayPoint.azimuth)}) · EL ${displayPoint.elevation.toFixed(1)}°`
                    : "AZ — · EL —"}
                </span>
              </div>
            )}

            {(viewMode === "both" || viewMode === "elevation") && (
              <PassElevationChart
                pass={pass}
                path={path}
                currentPoint={currentPoint}
                use24h={use24h}
                onSeek={handleSeek}
                onHoverPoint={setHoveredPoint}
                height={viewMode === "elevation" ? 330 : 142}
                compact={viewMode === "both"}
              />
            )}
          </div>

          <aside className="sky-side">
            <div className="sky-preview-state">
              <span className="eyebrow" id="skyStateLabel">
                {hoveredPoint ? "ANOTACIÓN DE TRAYECTORIA" : "VISTA PREVIA DEL PASO"}
              </span>
              <strong id="skyClock" className="mono">
                {displayPoint ? formatClock(new Date(displayPoint.timeMs), use24h, true) : "--:--:--"}
              </strong>
            </div>

            <dl className="sky-details">
              <div>
                <dt>Inicio</dt>
                <dd id="skyStart">{`${dayTag(new Date(pass.startMs))} ${formatTime(new Date(pass.startMs), use24h)}`}</dd>
              </div>
              <div>
                <dt>Cúspide</dt>
                <dd id="skyPeak">{formatTime(new Date(pass.peakMs), use24h)}</dd>
              </div>
              <div>
                <dt>Elevación máx.</dt>
                <dd id="skyElevation" className="mono">
                  {Math.round(pass.peakElevation)}°
                </dd>
              </div>
              <div>
                <dt>Dirección</dt>
                <dd id="skyDirection">{azimuthLabel(pass.peakAzimuth)}</dd>
              </div>
              <div>
                <dt>Brillo</dt>
                <dd id="skyBrightness">{`${brightnessLabel(pass.magnitude)} · ${pass.magnitude > 0 ? "+" : "−"}${Math.abs(
                  pass.magnitude
                ).toFixed(1)}`}</dd>
              </div>
              <div>
                <dt>Duración</dt>
                <dd id="skyDuration" className="mono">
                  {formatDuration(pass.durationSec)}
                </dd>
              </div>
            </dl>

            <div className="sky-compass-note">
              <span className="compass-glyph">N</span>
              <div>
                <span className="eyebrow">VISTA CENITAL</span>
                <p>Alineado con brújula. Los anillos indican 30°, 60° y 90° de elevación.</p>
              </div>
            </div>

            <button id="skyPreviewToggle" className="button primary" type="button" onClick={togglePreview}>
              <span id="skyPreviewToggleText">{isPlaying ? "Pausar vista previa" : "Reproducir vista previa"}</span>
            </button>
            <p className="sky-disclaimer">La velocidad de la simulación es ilustrativa. Horas basadas en tu ubicación local.</p>
          </aside>
        </div>
      </div>
    </div>
  );
};
