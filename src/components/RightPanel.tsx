import React from "react";
import { SatellitePass, PassScanStatus, UserSettings } from "../types/orbital";
import { GROUP_BY_ID } from "../lib/catalog";
import {
  formatTime,
  formatDay,
  formatDayLong,
  formatCountdown,
  azimuthLabel,
  compassDirection,
  magnitudeLabel,
  brightnessLabel,
  dayTag,
  formatNumber,
} from "../lib/format";
import { BrightnessIndicator } from "./BrightnessIndicator";

interface RightPanelProps {
  locationName: string | null;
  locationCountry?: string;
  passes: SatellitePass[];
  scanStatus: PassScanStatus;
  spotlightPass: SatellitePass | null;
  settings: UserSettings;
  onChangeLocation: () => void;
  onOpenPass: (pass: SatellitePass) => void;
  onSavePass: (pass: SatellitePass) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  locationName,
  locationCountry,
  passes,
  scanStatus,
  spotlightPass,
  settings,
  onChangeLocation,
  onOpenPass,
  onSavePass,
}) => {
  const [now, setNow] = React.useState<number>(Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const use24h = settings.clock === "24";

  // Filter upcoming passes
  const upcoming = React.useMemo(() => {
    return passes.filter((p) => p.endMs > now).sort((a, b) => a.startMs - b.startMs);
  }, [passes, now]);

  const activeNext = upcoming[0] || null;

  const groupColor = (groupId: string) => {
    return GROUP_BY_ID[groupId]?.color || "var(--muted)";
  };

  const getCountdownText = (pass: SatellitePass) => {
    if (now < pass.startMs) {
      return `T− ${formatCountdown(pass.startMs - now)}`;
    } else if (now <= pass.endMs) {
      return formatCountdown(pass.endMs - now);
    }
    return "--:--:--";
  };

  const getCaptionText = (pass: SatellitePass) => {
    if (now < pass.startMs) {
      return `${brightnessLabel(pass.magnitude)} in ${compassDirection(pass.startAzimuth)} · visible for ${Math.round(
        pass.durationSec / 60
      )} min`;
    } else if (now <= pass.endMs) {
      return `Overhead now · look ${compassDirection(pass.peakAzimuth)} · ${brightnessLabel(pass.magnitude)}`;
    }
    return "";
  };

  // Group passes by day
  const groupedPasses = React.useMemo(() => {
    const map = new Map<string, { date: Date; passes: SatellitePass[] }>();
    for (const pass of upcoming.slice(0, 60)) {
      const date = new Date(pass.startMs);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!map.has(key)) map.set(key, { date, passes: [] });
      map.get(key)!.passes.push(pass);
    }
    return Array.from(map.values());
  }, [upcoming]);

  return (
    <aside id="rightPanel" className="panel glass tonight-panel">
      <div className="panel-header tonight-header">
        <div>
          <span className="eyebrow">YOUR SKY</span>
          <h2>Tonight</h2>
        </div>
        <button
          id="changeLocationBtn"
          className="location-button"
          type="button"
          title={locationName ? `${locationName}${locationCountry ? `, ${locationCountry}` : ""} — change location` : "Change location"}
          onClick={onChangeLocation}
        >
          <span className="location-pin">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
          <span id="locationName">{locationName || "Set location"}</span>
        </button>
      </div>

      <div id="tonightScroll" className="tonight-scroll">
        <div id="nextPassCard" className="next-pass-card">
          <button
            id="nextPassMain"
            className="next-pass-main"
            type="button"
            aria-label="Open next visible pass in sky view"
            onClick={() => {
              if (activeNext) onOpenPass(activeNext);
              else if (!locationName) onChangeLocation();
            }}
          >
            <span className="eyebrow" id="nextPassEyebrow">
              NEXT VISIBLE PASS
            </span>
            <span className="next-pass-title">
              <span
                className="swatch"
                id="nextPassSwatch"
                style={{ "--group-color": activeNext ? groupColor(activeNext.group) : "var(--muted)" } as React.CSSProperties}
              ></span>
              <strong id="nextPassName">
                {!locationName
                  ? "Set your location"
                  : activeNext
                  ? activeNext.name
                  : scanStatus.done
                  ? "No visible pass tonight"
                  : "Scanning the sky"}
              </strong>
              <svg className="arrow-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 16 16 8m0 0H9m7 0v7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>

            <span className="next-countdown mono" id="nextCountdown">
              {activeNext ? getCountdownText(activeNext) : "--:--:--"}
            </span>

            <span className="next-caption" id="nextCaption">
              {!locationName
                ? "Choose a city to calculate when satellites pass over you."
                : activeNext
                ? getCaptionText(activeNext)
                : scanStatus.done
                ? "The tracker will keep watching for the next window."
                : "Computing passes for your location."}
            </span>

            <span className="next-pass-grid">
              <span>
                <small>START</small>
                <strong className="mono" id="nextStart">
                  {activeNext ? `${dayTag(new Date(activeNext.startMs))} ${formatTime(new Date(activeNext.startMs), use24h)}` : "—"}
                </strong>
              </span>
              <span>
                <small>PEAK</small>
                <strong className="mono" id="nextPeak">
                  {activeNext ? `${Math.round(activeNext.peakElevation)}°` : "—"}
                </strong>
              </span>
              <span>
                <small>DIRECTION</small>
                <strong className="mono" id="nextDirection">
                  {activeNext ? `${compassDirection(activeNext.startAzimuth)} · ${Math.round(activeNext.startAzimuth)}°` : "—"}
                </strong>
              </span>
              <span>
                <small>BRIGHTNESS</small>
                <strong className="mono next-brightness-val" id="nextBrightness">
                  {activeNext ? (
                    <>
                      <BrightnessIndicator magnitude={activeNext.magnitude} />
                      <span>{magnitudeLabel(activeNext.magnitude)}</span>
                      <span className="next-brightness-tier">({brightnessLabel(activeNext.magnitude)})</span>
                    </>
                  ) : (
                    "—"
                  )}
                </strong>
              </span>
            </span>
          </button>

          <button
            id="nextPassSave"
            className="icon-button compact next-save"
            type="button"
            aria-label="Save next pass to calendar"
            title="Save to calendar"
            disabled={!activeNext}
            onClick={(e) => {
              e.stopPropagation();
              if (activeNext) onSavePass(activeNext);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5.5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 3.5v4M16 3.5v4M4 10h16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {spotlightPass && (
            <button
              id="issSpotlight"
              className="iss-spotlight"
              type="button"
              aria-label={`First run. Open the next ISS pass on ${formatDayLong(new Date(spotlightPass.startMs))} in sky view.`}
              onClick={() => onOpenPass(spotlightPass)}
            >
              <span className="iss-spotlight-label">FIRST RUN · ISS</span>
              <strong>
                {`${dayTag(new Date(spotlightPass.startMs))} ${formatTime(new Date(spotlightPass.startMs), use24h)} · ${Math.round(
                  spotlightPass.peakElevation
                )}° peak`}
              </strong>
              <span className="iss-spotlight-action">Sky view →</span>
            </button>
          )}
        </div>

        {/* Scan loading state */}
        {!scanStatus.done && locationName && (
          <div id="passLoading" className="inline-status">
            <span className="scan-spinner" aria-hidden="true"></span>
            <span id="passLoadingText">
              {scanStatus.searchingBeyond
                ? "No visible passes in 24 h · checking the days ahead…"
                : `Scanning all active satellites · ${scanStatus.total ? Math.round((scanStatus.scanned / scanStatus.total) * 100) : 0}%`}
            </span>
          </div>
        )}

        {/* Empty state */}
        {scanStatus.done && upcoming.length === 0 && (
          <div id="noPasses" className="empty-pass-state">
            <div className="empty-orbit" aria-hidden="true">
              <span></span>
            </div>
            <h3>No visible passes yet</h3>
            <p id="noPassesText">
              {scanStatus.nextBeyond
                ? `No visible passes in the next 24 hours. The next one is ${dayTag(new Date(scanStatus.nextBeyond.startMs))} at ${formatTime(
                    new Date(scanStatus.nextBeyond.startMs),
                    use24h
                  )} · ${scanStatus.nextBeyond.name}.`
                : "No visible passes in the next 24 hours for the major tracked satellites."}
            </p>
          </div>
        )}

        {/* Pass list */}
        {upcoming.length > 0 && (
          <div id="passGroups" className="pass-groups" aria-live="polite">
            <div className="section-label upcoming-label">
              <span>UPCOMING</span>
              <span className="mono">{scanStatus.done ? `${formatNumber(scanStatus.totalFound)} found` : "SCANNING"}</span>
            </div>

            {groupedPasses.map(({ date, passes: dayPasses }) => (
              <section key={date.toISOString()} className="pass-day">
                <div className="pass-day-heading">
                  <strong>{`${dayTag(date)} · ${formatDay(date)}`}</strong>
                  <span>{`${dayPasses.length} pass${dayPasses.length === 1 ? "" : "es"}`}</span>
                </div>

                {dayPasses.map((pass) => (
                  <div key={`${pass.noradId}-${pass.startMs}`} className="pass-row">
                    <button
                      className="pass-main"
                      type="button"
                      aria-label={`Open ${pass.name} pass at ${formatTime(new Date(pass.startMs), use24h)}`}
                      onClick={() => onOpenPass(pass)}
                    >
                      <span className="swatch" style={{ "--group-color": groupColor(pass.group) } as React.CSSProperties}></span>
                      <span className="pass-copy">
                        <strong>{pass.name}</strong>
                        <small>
                          {`Peak ${formatTime(new Date(pass.peakMs), use24h)} · ${Math.round(pass.peakElevation)}° ${compassDirection(
                            pass.peakAzimuth
                          )}`}
                        </small>
                      </span>
                      <span className="pass-mag" title={`${brightnessLabel(pass.magnitude)} (${magnitudeLabel(pass.magnitude)})`}>
                        <BrightnessIndicator magnitude={pass.magnitude} />
                        <span>{magnitudeLabel(pass.magnitude)}</span>
                      </span>
                    </button>
                    <button
                      className="pass-save"
                      type="button"
                      aria-label={`Save ${pass.name} pass on ${formatDayLong(new Date(pass.startMs))} to calendar`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSavePass(pass);
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="4" y="5.5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M8 3.5v4M16 3.5v4M4 10h16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </section>
            ))}

            {scanStatus.totalFound > 60 && (
              <p className="pass-more">Showing the next 60 of {formatNumber(scanStatus.totalFound)} visible passes.</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
