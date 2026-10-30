import React from "react";
import { Satellite, SatellitePass, DisplayOptions, UserSettings } from "../types/orbital";
import { GROUPS, GROUP_BY_ID } from "../lib/catalog";
import {
  formatNumber,
  formatAltitude,
  formatSpeed,
  formatTime,
  dayTag,
  brightnessLabel,
  magnitudeLabel,
} from "../lib/format";
import { BrightnessIndicator } from "./BrightnessIndicator";

interface TelemetryData {
  altitude: number | null;
  speed: number | null;
  lat: number | null;
  lon: number | null;
}

interface LeftDockProps {
  satellites: Satellite[];
  counts: Record<string, number>;
  display: DisplayOptions;
  selectedSatellite: Satellite | null;
  selectedPass: SatellitePass | null;
  selectedPassStatus: string;
  telemetry: TelemetryData;
  isFollowing: boolean;
  settings: UserSettings;
  locationName: string | null;
  onToggleGroup: (groupId: string) => void;
  onToggleOverlay: (overlayId: keyof DisplayOptions) => void;
  onToggleBand: (band: "low" | "medium" | "geostationary") => void;
  onCloseCard: () => void;
  onToggleFollow: () => void;
  onShowOrbit: () => void;
  isNotificationEnabled: boolean;
  onToggleNotification: () => void;
}

export const LeftDock: React.FC<LeftDockProps> = ({
  satellites,
  counts,
  display,
  selectedSatellite,
  selectedPass,
  selectedPassStatus,
  telemetry,
  isFollowing,
  settings,
  locationName,
  onToggleGroup,
  onToggleOverlay,
  onToggleBand,
  onCloseCard,
  onToggleFollow,
  onShowOrbit,
  isNotificationEnabled,
  onToggleNotification,
}) => {
  const [collapsed, setCollapsed] = React.useState(false);

  const imperial = settings.units === "imperial";
  const use24h = settings.clock === "24";

  const DISPLAY_TOGGLES: Array<{ id: "orbits" | "trails" | "labels" | "cityLights"; label: string }> = [
    { id: "orbits", label: "Órbitas" },
    { id: "trails", label: "Estelas" },
    { id: "labels", label: "Etiquetas" },
    { id: "cityLights", label: "Luces urbanas" },
  ];

  const formatLat = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) return "—";
    return `${Math.abs(val).toFixed(2)}° ${val >= 0 ? "N" : "S"}`;
  };

  const formatLon = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) return "—";
    return `${Math.abs(val).toFixed(2)}° ${val >= 0 ? "E" : "O"}`;
  };

  const nextPassText = () => {
    if (!selectedSatellite) return "—";
    if (!locationName) return "Configura una ubicación";
    if (selectedPass) {
      const date = new Date(selectedPass.startMs);
      return `${dayTag(date)} ${formatTime(date, use24h)} · ${Math.round(selectedPass.peakElevation)}°`;
    }
    if (selectedPassStatus === "Scanning…") return "Escaneando…";
    if (selectedPassStatus === "None in the next 7 days") return "Ninguno en los próximos 7 días";
    if (selectedPassStatus === "Pass search unavailable") return "Búsqueda no disponible";
    return selectedPassStatus || "Escaneando…";
  };

  return (
    <div id="leftDock">
      <section id="layersPanel" className={`panel glass ${collapsed ? "is-collapsed" : ""}`}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">VISUALIZACIÓN</span>
            <h2>Capas</h2>
          </div>
          <button
            id="layersCollapse"
            className="icon-button compact"
            type="button"
            aria-label={collapsed ? "Expandir capas" : "Contraer capas"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d={collapsed ? "m6 10 6 6 6-6" : "m6 14 6-6 6 6"}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div id="layersBody" className="panel-body">
          <div className="section-label">
            <span>GRUPOS</span>
            <span id="layerTotal" className="mono">
              {formatNumber(satellites.length)}
            </span>
          </div>

          <div id="groupRows" className="group-list">
            {GROUPS.map((group) => {
              const on = display.groups[group.id] !== false;
              return (
                <button
                  key={group.id}
                  className={`group-row ${!on ? "is-off" : ""}`}
                  type="button"
                  data-group={group.id}
                  style={{ "--group-color": group.color } as React.CSSProperties}
                  aria-pressed={on}
                  aria-label={`${on ? "Ocultar" : "Mostrar"} ${group.label}`}
                  onClick={() => onToggleGroup(group.id)}
                >
                  <span className="swatch"></span>
                  <span className="group-name">{group.label}</span>
                  <span className="group-count mono">{formatNumber(counts[group.id] || 0)}</span>
                  <span className="layer-switch" aria-hidden="true"></span>
                </button>
              );
            })}
          </div>

          <div className="panel-divider"></div>

          <div className="section-label">
            <span>SUPERPOSICIONES</span>
          </div>

          <div id="displayToggles" className="toggle-list">
            {DISPLAY_TOGGLES.map((toggle) => {
              const on = !!display[toggle.id];
              return (
                <button
                  key={toggle.id}
                  className="toggle-row"
                  type="button"
                  data-toggle={toggle.id}
                  aria-pressed={on}
                  onClick={() => onToggleOverlay(toggle.id)}
                >
                  <span>{toggle.label}</span>
                  <span className="layer-switch" aria-hidden="true"></span>
                </button>
              );
            })}
          </div>

          <div className="panel-divider"></div>

          <div className="section-label">
            <span>ALTITUD</span>
          </div>

          <div id="bandFilters" className="segment-grid">
            <button
              className={`band-chip ${display.bands.low ? "is-active" : ""}`}
              data-band="low"
              type="button"
              aria-pressed={display.bands.low}
              onClick={() => onToggleBand("low")}
            >
              <span>LEO</span>
              <small>Órbita baja</small>
            </button>
            <button
              className={`band-chip ${display.bands.medium ? "is-active" : ""}`}
              data-band="medium"
              type="button"
              aria-pressed={display.bands.medium}
              onClick={() => onToggleBand("medium")}
            >
              <span>MEO</span>
              <small>Media</small>
            </button>
            <button
              className={`band-chip ${display.bands.geostationary ? "is-active" : ""}`}
              data-band="geostationary"
              type="button"
              aria-pressed={display.bands.geostationary}
              onClick={() => onToggleBand("geostationary")}
            >
              <span>GEO</span>
              <small>Estacionaria</small>
            </button>
          </div>
        </div>
      </section>

      {selectedSatellite && (
        <section id="satelliteCard" className="panel glass sat-card">
          <div className="sat-card-top">
            <span
              id="satGroupChip"
              className="group-chip"
              style={{ "--group-color": selectedSatellite.color } as React.CSSProperties}
            >
              <span className="swatch"></span>
              <span className="group-chip-text">{GROUP_BY_ID[selectedSatellite.group]?.label || "—"}</span>
            </span>
            <button
              id="closeSatCard"
              className="icon-button compact"
              type="button"
              aria-label="Cerrar detalles del satélite"
              onClick={onCloseCard}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <h2 id="satName" className="sat-name">
            {selectedSatellite.name}
          </h2>

          <div className="sat-ids">
            <span className="mono" id="satNorad">
              NORAD {selectedSatellite.noradId}
            </span>
            <span id="satObjectId">{selectedSatellite.objectId || ""}</span>
          </div>

          <div className="telemetry-grid">
            <div className="telemetry-cell">
              <span>ALTITUD</span>
              <strong id="satAltitude" className="mono accent-value">
                {telemetry.altitude !== null ? formatAltitude(telemetry.altitude, imperial) : "—"}
              </strong>
            </div>
            <div className="telemetry-cell">
              <span>VELOCIDAD</span>
              <strong id="satSpeed" className="mono accent-value">
                {telemetry.speed !== null ? formatSpeed(telemetry.speed, imperial) : "—"}
              </strong>
            </div>
            <div className="telemetry-cell">
              <span>LATITUD</span>
              <strong id="satLat" className="mono">
                {formatLat(telemetry.lat)}
              </strong>
            </div>
            <div className="telemetry-cell">
              <span>LONGITUD</span>
              <strong id="satLon" className="mono">
                {formatLon(telemetry.lon)}
              </strong>
            </div>
            <div className="telemetry-cell">
              <span>PERÍODO</span>
              <strong id="satPeriod" className="mono">
                {selectedSatellite.periodMin ? `${selectedSatellite.periodMin.toFixed(1)} min` : "—"}
              </strong>
            </div>
            <div className="telemetry-cell">
              <span>INCLINACIÓN</span>
              <strong id="satInclination" className="mono">
                {selectedSatellite.inclination ? `${selectedSatellite.inclination.toFixed(2)}°` : "—"}
              </strong>
            </div>
          </div>

          <div className="next-pass-summary">
            <span>
              MI PRÓXIMO PASO
              {isNotificationEnabled && (
                <span className="notify-indicator" title="Alertas de paso activadas para este satélite">
                  {" "}· 🔔
                </span>
              )}
            </span>
            <div className="sat-pass-detail">
              <strong id="satNextPass">{nextPassText()}</strong>
              {selectedPass && (
                <span
                  className="sat-pass-brightness"
                  title={`${brightnessLabel(selectedPass.magnitude)} (${magnitudeLabel(selectedPass.magnitude)})`}
                >
                  <BrightnessIndicator magnitude={selectedPass.magnitude} showLabel />
                  <span className="mono mag-sub">({magnitudeLabel(selectedPass.magnitude)})</span>
                </span>
              )}
            </div>
          </div>

          <div className="sat-actions">
            <button
              id="followBtn"
              className={`button secondary ${isFollowing ? "is-active" : ""}`}
              type="button"
              aria-pressed={isFollowing}
              onClick={onToggleFollow}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>{isFollowing ? "Siguiendo" : "Seguir"}</span>
            </button>
            <button id="orbitBtn" className="button secondary" type="button" onClick={onShowOrbit}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <ellipse cx="12" cy="12" rx="9" ry="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(-28 12 12)" />
                <circle cx="12" cy="12" r="2.2" fill="currentColor" />
              </svg>
              <span>Ver órbita</span>
            </button>
            <button
              id="notifyPassBtn"
              className={`button secondary sat-notify-btn ${isNotificationEnabled ? "is-active" : ""}`}
              type="button"
              aria-pressed={isNotificationEnabled}
              title={isNotificationEnabled ? "Desactivar avisos de paso" : "Activar aviso en el navegador cuando el paso sea inminente"}
              onClick={onToggleNotification}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {isNotificationEnabled && <circle cx="18" cy="4" r="2.5" fill="var(--accent)" />}
              </svg>
              <span>{isNotificationEnabled ? "Alertas activadas (10 min antes)" : "Avisar en paso inminente"}</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
