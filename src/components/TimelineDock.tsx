import React from "react";
import { SatellitePass, UserSettings } from "../types/orbital";
import { formatClock, formatDay, formatTime } from "../lib/format";

interface TimelineDockProps {
  playing: boolean;
  isLive: boolean;
  speed: number;
  simTime: number;
  timelineCenter: number;
  passes: SatellitePass[];
  settings: UserSettings;
  onTogglePlay: () => void;
  onGoNow: () => void;
  onSetSpeed: (speed: number) => void;
  onScrub: (timeMs: number) => void;
}

const HOUR = 3600000;

export const TimelineDock: React.FC<TimelineDockProps> = ({
  playing,
  isLive,
  speed,
  simTime,
  timelineCenter,
  passes,
  settings,
  onTogglePlay,
  onGoNow,
  onSetSpeed,
  onScrub,
}) => {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragWindowRef = React.useRef<{ start: number; end: number } | null>(null);

  const use24h = settings.clock === "24";

  // Timeline window spans 24 hours centered at timelineCenter
  const start = timelineCenter - 12 * HOUR;
  const end = timelineCenter + 12 * HOUR;

  const fraction = Math.max(0, Math.min(1, (simTime - start) / (end - start)));
  const percent = fraction * 100;

  const nowPercent = ((Date.now() - start) / (end - start)) * 100;
  const showNow = nowPercent >= 0 && nowPercent <= 100;

  // Generate 5 tick marks
  const ticks = React.useMemo(() => {
    const list: Array<{ label: string }> = [];
    for (let i = 0; i <= 4; i += 1) {
      const d = new Date(start + (i / 4) * (end - start));
      list.push({
        label: i === 0 || i === 4 ? `${formatDay(d)} ${formatTime(d, use24h)}` : formatTime(d, use24h),
      });
    }
    return list;
  }, [start, end, use24h]);

  // Aggregate pass markers in 10-minute buckets
  const passMarkers = React.useMemo(() => {
    const buckets = new Map<string, { markerTime: number; count: number; peakElevation: number; name: string }>();
    for (const pass of passes) {
      const markerTime = pass.peakMs || pass.startMs;
      if (markerTime < start || markerTime > end) continue;
      const key = String(Math.floor(markerTime / 600000));
      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        existing.peakElevation = Math.max(existing.peakElevation, pass.peakElevation);
      } else {
        buckets.set(key, {
          markerTime,
          count: 1,
          peakElevation: pass.peakElevation,
          name: pass.name,
        });
      }
    }
    const sorted = Array.from(buckets.values()).sort((a, b) => a.markerTime - b.markerTime);
    return sorted.slice(0, 90).map((b) => {
      const pos = ((b.markerTime - start) / (end - start)) * 100;
      const title =
        b.count > 1
          ? `${b.count} visible passes near ${formatTime(new Date(b.markerTime), use24h)}`
          : `${b.name} · peak ${formatTime(new Date(b.markerTime), use24h)}`;
      const height = 5 + Math.round((b.peakElevation / 90) * 4) + Math.min(7, b.count * 0.35);
      return { pos, title, height };
    });
  }, [passes, start, end, use24h]);

  const pointerToTime = (clientX: number, win: { start: number; end: number }) => {
    if (!trackRef.current) return win.start;
    const rect = trackRef.current.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return win.start + f * (win.end - win.start);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const win = { start, end };
    dragWindowRef.current = win;
    setIsDragging(true);
    trackRef.current?.setPointerCapture?.(e.pointerId);
    const targetTime = pointerToTime(e.clientX, win);
    onScrub(targetTime);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragWindowRef.current) return;
    const targetTime = pointerToTime(e.clientX, dragWindowRef.current);
    onScrub(targetTime);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    dragWindowRef.current = null;
    trackRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = (e.key === "ArrowLeft" ? -1 : 1) * 15 * 60000;
      onScrub(simTime + delta);
    }
  };

  return (
    <footer id="timelineDock" className={`glass timeline ${!playing ? "is-paused" : ""}`} aria-label="Time controls">
      <div className="timeline-transport">
        <button
          id="playBtn"
          className={`transport-button play ${!playing ? "is-paused" : ""}`}
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onTogglePlay}
        >
          <svg className="icon-play" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 5 11 7-11 7V5Z" fill="currentColor" />
          </svg>
          <svg className="icon-pause" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5h3v14H8zM14 5h3v14h-3z" fill="currentColor" />
          </svg>
        </button>

        <button id="nowBtn" className="button now-button" type="button" onClick={onGoNow}>
          Now
        </button>

        <div id="speedButtons" className="speed-group" aria-label="Playback speed">
          {[1, 10, 100, 1000].map((s) => (
            <button
              key={s}
              data-speed={s}
              className={`speed-button ${speed === s ? "is-active" : ""}`}
              type="button"
              aria-pressed={speed === s}
              onClick={() => onSetSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="timeline-main">
        <div
          ref={trackRef}
          id="timelineTrack"
          className="timeline-track"
          role="slider"
          tabIndex={0}
          aria-label="24 hour timeline"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-valuetext={`${formatDay(new Date(simTime))} ${formatTime(new Date(simTime), use24h)}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          <div className="timeline-base"></div>
          <div className="timeline-fill" style={{ width: `${percent}%` }}></div>
          <div id="timelinePassLayer" className="timeline-passes">
            {passMarkers.map((m, idx) => (
              <span
                key={idx}
                className="timeline-pass-tick"
                title={m.title}
                style={{ left: `${m.pos}%`, height: `${m.height}px` }}
              ></span>
            ))}
          </div>
          {showNow && <div id="timelineNow" className="timeline-now" aria-hidden="true" style={{ left: `${nowPercent}%` }}></div>}
          <div id="timelineThumb" className="timeline-thumb" style={{ left: `${percent}%` }}>
            <span></span>
          </div>
        </div>

        <div id="timelineTicks" className="timeline-ticks">
          {ticks.map((t, i) => (
            <span key={i}>{t.label}</span>
          ))}
        </div>
      </div>

      <div className="timeline-mode">
        <span className="live-row">
          <span id="liveDot" className={`status-dot ${isLive && playing ? "accent" : "muted"}`}></span>
          <span id="timelineMode">{!playing ? "PAUSED" : isLive ? "LIVE" : "SIM"}</span>
        </span>
        <span id="simTime" className="mono">
          {formatClock(new Date(simTime), use24h)}
        </span>
      </div>
    </footer>
  );
};
