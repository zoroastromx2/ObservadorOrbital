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
      return `${brightnessLabel(pass.magnitude)} hacia el ${compassDirection(pass.startAzimuth)} · visible durante ${Math.round(
        pass.durationSec / 60
      )} min`;
    } else if (now <= pass.endMs) {
      return `Sobrevolando ahora · mira hacia el ${compassDirection(pass.peakAzimuth)} · ${brightnessLabel(pass.magnitude)}`;
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
          <span className="eyebrow">TU CIELO</span>
          <h2>Esta noche</h2>
        </div>
        <button
          id="changeLocationBtn"
          className="location-button"
          type="button"
          title={locationName ? `${locationName}${locationCountry ? `, ${locationCountry}` : ""} — cambiar ubicación` : "Cambiar ubicación"}
          onClick={onChangeLocation}
        >
          <span className="location-pin">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
          <span id="locationName">{locationName || "Definir ubicación"}</span>
        </button>
      </div>

      <div id="tonightScroll" className="tonight-scroll">
        <div id="nextPassCard" className="next-pass-card">
          <button
            id="nextPassMain"
            className="next-pass-main"
            type="button"
            aria-label="Abrir próximo paso visible en vista del cielo"
            onClick={() => {
              if (activeNext) onOpenPass(activeNext);
              else if (!locationName) onChangeLocation();
            }}
          >
            <span className="eyebrow" id="nextPassEyebrow">
              PRÓXIMO PASO VISIBLE
            </span>
            <span className="next-pass-title">
              <span
                className="swatch"
                id="nextPassSwatch"
                style={{ "--group-color": activeNext ? groupColor(activeNext.group) : "var(--muted)" } as React.CSSProperties}
              ></span>
              <strong id="nextPassName">
                {!locationName
                  ? "Configura tu ubicación"
                  : activeNext
                  ? activeNext.name
                  : scanStatus.done
                  ? "Sin pasos visibles esta noche"
                  : "Escaneando el cielo…"}
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
                ? "Elige una ciudad para calcular cuándo los satélites pasarán sobre ti."
                : activeNext
                ? getCaptionText(activeNext)
                : scanStatus.done
                ? "El rastreador seguirá vigilando para la próxima ventana."
                : "Calculando pasos para tu ubicación…"}
            </span>

            <span className="next-pass-grid">
              <span>
                <small>INICIO</small>
                <strong className="mono" id="nextStart">
                  {activeNext ? `${dayTag(new Date(activeNext.startMs))} ${formatTime(new Date(activeNext.startMs), use24h)}` : "—"}
                </strong>
              </span>
              <span>
                <small>CÚSPIDE</small>
                <strong className="mono" id="nextPeak">
                  {activeNext ? `${Math.round(activeNext.peakElevation)}°` : "—"}
                </strong>
              </span>
              <span>
                <small>DIRECCIÓN</small>
                <strong className="mono" id="nextDirection">
                  {activeNext ? `${compassDirection(activeNext.startAzimuth)} · ${Math.round(activeNext.startAzimuth)}°` : "—"}
                </strong>
              </span>
              <span>
                <small>BRILLO</small>
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
            aria-label="Guardar próximo paso en el calendario"
            title="Guardar en el calendario"
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
              aria-label={`Primer vistazo. Abre el próximo paso de la EEI el ${formatDayLong(new Date(spotlightPass.startMs))} en vista del cielo.`}
              onClick={() => onOpenPass(spotlightPass)}
            >
              <span className="iss-spotlight-label">PRIMER VISTAZO · EEI</span>
              <strong>
                {`${dayTag(new Date(spotlightPass.startMs))} ${formatTime(new Date(spotlightPass.startMs), use24h)} · cúspide a ${Math.round(
                  spotlightPass.peakElevation
                )}°`}
              </strong>
              <span className="iss-spotlight-action">Vista del cielo →</span>
            </button>
          )}
        </div>

        {/* Scan loading state */}
        {!scanStatus.done && locationName && (
          <div id="passLoading" className="inline-status">
            <span className="scan-spinner" aria-hidden="true"></span>
            <span id="passLoadingText">
              {scanStatus.searchingBeyond
                ? "Sin pasos visibles en 24 h · buscando en los próximos días…"
                : `Escaneando todos los satélites activos · ${scanStatus.total ? Math.round((scanStatus.scanned / scanStatus.total) * 100) : 0}%`}
            </span>
          </div>
        )}

        {/* Empty state */}
        {scanStatus.done && upcoming.length === 0 && (
          <div id="noPasses" className="empty-pass-state">
            <div className="empty-orbit" aria-hidden="true">
              <span></span>
            </div>
            <h3>Sin pasos visibles todavía</h3>
            <p id="noPassesText">
              {scanStatus.nextBeyond
                ? `No hay pasos visibles en las próximas 24 horas. El siguiente es el ${dayTag(new Date(scanStatus.nextBeyond.startMs))} a las ${formatTime(
                    new Date(scanStatus.nextBeyond.startMs),
                    use24h
                  )} · ${scanStatus.nextBeyond.name}.`
                : "No hay pasos visibles en las próximas 24 horas para los principales satélites rastreados."}
            </p>
          </div>
        )}

        {/* Pass list */}
        {upcoming.length > 0 && (
          <div id="passGroups" className="pass-groups" aria-live="polite">
            <div className="section-label upcoming-label">
              <span>PRÓXIMOS</span>
              <span className="mono">{scanStatus.done ? `${formatNumber(scanStatus.totalFound)} encontrados` : "ESCANEANDO"}</span>
            </div>

            {groupedPasses.map(({ date, passes: dayPasses }) => (
              <section key={date.toISOString()} className="pass-day">
                <div className="pass-day-heading">
                  <strong>{`${dayTag(date)} · ${formatDay(date)}`}</strong>
                  <span>{`${dayPasses.length} ${dayPasses.length === 1 ? "paso" : "pasos"}`}</span>
                </div>

                {dayPasses.map((pass) => (
                  <div key={`${pass.noradId}-${pass.startMs}`} className="pass-row">
                    <button
                      className="pass-main"
                      type="button"
                      aria-label={`Abrir paso de ${pass.name} a las ${formatTime(new Date(pass.startMs), use24h)}`}
                      onClick={() => onOpenPass(pass)}
                    >
                      <span className="swatch" style={{ "--group-color": groupColor(pass.group) } as React.CSSProperties}></span>
                      <span className="pass-copy">
                        <strong>{pass.name}</strong>
                        <small>
                          {`Cúspide ${formatTime(new Date(pass.peakMs), use24h)} · ${Math.round(pass.peakElevation)}° hacia el ${compassDirection(
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
                      aria-label={`Guardar paso de ${pass.name} el ${formatDayLong(new Date(pass.startMs))} en el calendario`}
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
              <p className="pass-more">Mostrando los próximos 60 de {formatNumber(scanStatus.totalFound)} pasos visibles.</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
