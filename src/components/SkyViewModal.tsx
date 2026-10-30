import React from "react";
import { SatellitePass, UserSettings, Satellite } from "../types/orbital";
import {
  formatClock,
  formatTime,
  formatDuration,
  azimuthLabel,
  brightnessLabel,
  dayTag,
} from "../lib/format";

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
  const [currentPoint, setCurrentPoint] = React.useState<{
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

  const screenSat = currentPoint ? projectSky(currentPoint.azimuth, currentPoint.elevation) : { x: 360, y: 360 };

  const CARDINALS = [
    { label: "N", angle: 0, className: "north" },
    { label: "E", angle: 90 },
    { label: "S", angle: 180 },
    { label: "W", angle: 270 },
    { label: "NE", angle: 45 },
    { label: "SE", angle: 135 },
    { label: "SW", angle: 225 },
    { label: "NW", angle: 315 },
  ];

  return (
    <div id="skyView" className="sky-view" role="dialog" aria-modal="true" aria-labelledby="skyTitle">
      <div className="sky-shell">
        <header className="sky-header">
          <button id="closeSkyView" className="button secondary" type="button" aria-label="Back to globe" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Back to globe</span>
          </button>

          <div className="sky-header-center">
            <span className="eyebrow">SKY VIEW</span>
            <h2 id="skyTitle">{satellite?.name || pass.name}</h2>
            <span id="skyLocation" className="sky-location">
              {locationName || "Your sky"}
            </span>
          </div>

          <button
            id="skySave"
            className="button secondary"
            type="button"
            aria-label="Save this pass to calendar as an .ics file"
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
            <div className="sky-chart-frame">
              <svg id="skyChart" viewBox="0 0 720 720" role="img" aria-label="Sky chart showing the satellite pass path">
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

            <div className="sky-chart-caption">
              <span>
                <span className="legend-line"></span> Pass path
              </span>
              <span className="mono" id="skyAzimuthReadout">
                {currentPoint
                  ? `AZ ${Math.round(currentPoint.azimuth)}° · EL ${Math.round(currentPoint.elevation)}°`
                  : "AZ — · EL —"}
              </span>
            </div>
          </div>

          <aside className="sky-side">
            <div className="sky-preview-state">
              <span className="eyebrow" id="skyStateLabel">
                PASS PREVIEW
              </span>
              <strong id="skyClock" className="mono">
                {currentPoint ? formatClock(new Date(currentPoint.timeMs), use24h) : "--:--:--"}
              </strong>
            </div>

            <dl className="sky-details">
              <div>
                <dt>Start</dt>
                <dd id="skyStart">{`${dayTag(new Date(pass.startMs))} ${formatTime(new Date(pass.startMs), use24h)}`}</dd>
              </div>
              <div>
                <dt>Peak</dt>
                <dd id="skyPeak">{formatTime(new Date(pass.peakMs), use24h)}</dd>
              </div>
              <div>
                <dt>Peak elevation</dt>
                <dd id="skyElevation" className="mono">
                  {Math.round(pass.peakElevation)}°
                </dd>
              </div>
              <div>
                <dt>Direction</dt>
                <dd id="skyDirection">{azimuthLabel(pass.peakAzimuth)}</dd>
              </div>
              <div>
                <dt>Brightness</dt>
                <dd id="skyBrightness">{`${brightnessLabel(pass.magnitude)} · ${pass.magnitude > 0 ? "+" : "−"}${Math.abs(
                  pass.magnitude
                ).toFixed(1)}`}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd id="skyDuration" className="mono">
                  {formatDuration(pass.durationSec)}
                </dd>
              </div>
            </dl>

            <div className="sky-compass-note">
              <span className="compass-glyph">N</span>
              <div>
                <span className="eyebrow">TOP-DOWN VIEW</span>
                <p>Compass aligned. Rings show 30°, 60°, and 90° elevation.</p>
              </div>
            </div>

            <button id="skyPreviewToggle" className="button primary" type="button" onClick={togglePreview}>
              <span id="skyPreviewToggleText">{isPlaying ? "Pause preview" : "Play preview"}</span>
            </button>
            <p className="sky-disclaimer">Preview speed is illustrative. Times shown are at your location.</p>
          </aside>
        </div>
      </div>
    </div>
  );
};
