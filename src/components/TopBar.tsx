import React from "react";
import { UserSettings } from "../types/orbital";
import { formatClock, formatUtcClock, formatAge, formatNumber } from "../lib/format";

interface TopBarProps {
  settings: UserSettings;
  satCount: number;
  meta: any;
  onOpenPalette: () => void;
  onShare: () => void;
  onToggleNight: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  settings,
  satCount,
  meta,
  onOpenPalette,
  onShare,
  onToggleNight,
  onOpenSettings,
  onOpenHelp,
}) => {
  const [now, setNow] = React.useState<Date>(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const use24h = settings.clock === "24";
  const age = meta?.fetchedAt ? Date.now() - new Date(meta.fetchedAt).getTime() : 0;
  const isOffline = !!meta?.offline || (typeof navigator !== "undefined" && !navigator.onLine);

  return (
    <header id="topbar" className="glass">
      <a className="brand" href="#" aria-label="Orbital Watch home" onClick={(e) => e.preventDefault()}>
        <svg className="brand-mark" viewBox="0 0 42 42" aria-hidden="true">
          <circle cx="21" cy="21" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".45" />
          <ellipse
            cx="21"
            cy="21"
            rx="18"
            ry="7.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            transform="rotate(-28 21 21)"
          />
          <circle cx="34.5" cy="12.8" r="2.1" fill="currentColor" />
        </svg>
        <span className="brand-copy">
          <strong>ORBITAL</strong>
          <span>WATCH</span>
        </span>
      </a>

      <div className="top-clocks" aria-label="Clocks">
        <div className="clock-pair">
          <span className="micro-label">UTC</span>
          <span id="utcClock" className="mono clock-value">
            {formatUtcClock(now, use24h)}
          </span>
        </div>
        <div className="clock-rule"></div>
        <div className="clock-pair">
          <span className="micro-label">LOCAL</span>
          <span id="localClock" className="mono clock-value">
            {formatClock(now, use24h)}
          </span>
        </div>
      </div>

      <div className="top-meta">
        <div
          className="meta-line"
          id="updatedLine"
          title={
            isOffline
              ? "Network unavailable. Positions and passes are computed from the local CelesTrak cache."
              : "Live orbital catalog cached locally and refreshed at most every 6 hours."
          }
        >
          <span className={`status-dot ${isOffline ? "offline" : ""}`} id="cacheDot"></span>
          <span id="dataAge">
            {meta
              ? isOffline
                ? `Offline · cache ${formatAge(age)}`
                : `Updated ${formatAge(age)}`
              : "Loading orbital data"}
          </span>
        </div>
        <div className="meta-line">
          <span id="satCount" className="mono">
            {satCount ? formatNumber(satCount) : "—"}
          </span>
          <span>active satellites</span>
        </div>
      </div>

      <div className="search-field" role="search" onClick={onOpenPalette}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m15.6 15.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id="searchOpen"
          type="search"
          placeholder="Search satellites, cities…"
          aria-label="Search satellites, cities, and commands"
          autoComplete="off"
          spellCheck={false}
          readOnly
        />
        <kbd>Ctrl K</kbd>
      </div>

      <div className="top-actions">
        <button
          id="shareBtn"
          className="icon-button"
          type="button"
          aria-label="Export current view as PNG"
          title="Share view"
          onClick={onShare}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 15.5V3.8m0 0L8 7.9m4-4.1 4 4.1M5 13.5v5.25A1.25 1.25 0 0 0 6.25 20h11.5A1.25 1.25 0 0 0 19 18.75V13.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          id="nightBtn"
          className="icon-button"
          type="button"
          aria-label="Toggle night vision"
          title="Night vision"
          onClick={onToggleNight}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 15.1A8.2 8.2 0 0 1 8.9 4a8.3 8.3 0 1 0 11.1 11.1Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          id="settingsBtn"
          className="icon-button"
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M19.4 13.3c.06-.43.06-.87 0-1.3l1.5-1.17-1.78-3.08-1.8.72a7.6 7.6 0 0 0-1.13-.65L16 6l-2.5-.01-.36 1.9c-.4.16-.79.38-1.14.64l-1.78-.75-1.8 3.06 1.48 1.22a7 7 0 0 0 0 1.3l-1.48 1.22 1.8 3.06 1.78-.75c.35.26.74.48 1.14.64L13.5 20H16l.19-1.83c.4-.17.78-.38 1.13-.65l1.8.72 1.78-3.08-1.5-1.86Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          id="helpBtn"
          className="icon-button desktop-only"
          type="button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
          onClick={onOpenHelp}
        >
          <span className="mono help-glyph">?</span>
        </button>
      </div>
    </header>
  );
};
