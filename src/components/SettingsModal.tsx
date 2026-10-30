import React from "react";
import { UserSettings } from "../types/orbital";

interface SettingsModalProps {
  settings: UserSettings;
  onUpdate: (updater: (prev: UserSettings) => UserSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onUpdate, onClose }) => {
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [onClose]);

  return (
    <div ref={popoverRef} id="settingsPop" className="popover glass" role="dialog" aria-label="Ajustes">
      <div className="popover-header">
        <h3>Ajustes</h3>
        <button id="closeSettings" className="icon-button compact" type="button" aria-label="Cerrar ajustes" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="setting-row">
        <div>
          <span className="setting-name">Unidades</span>
          <span className="setting-help">Altitud y velocidad</span>
        </div>
        <div className="segmented" data-setting="units">
          <button
            type="button"
            className={settings.units === "metric" ? "is-active" : ""}
            aria-pressed={settings.units === "metric"}
            onClick={() => onUpdate((prev) => ({ ...prev, units: "metric" }))}
          >
            Métrico
          </button>
          <button
            type="button"
            className={settings.units === "imperial" ? "is-active" : ""}
            aria-pressed={settings.units === "imperial"}
            onClick={() => onUpdate((prev) => ({ ...prev, units: "imperial" }))}
          >
            Imperial
          </button>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <span className="setting-name">Formato de hora</span>
          <span className="setting-help">Relojes y pasos</span>
        </div>
        <div className="segmented" data-setting="clock">
          <button
            type="button"
            className={settings.clock === "24" ? "is-active" : ""}
            aria-pressed={settings.clock === "24"}
            onClick={() => onUpdate((prev) => ({ ...prev, clock: "24" }))}
          >
            24 h
          </button>
          <button
            type="button"
            className={settings.clock === "12" ? "is-active" : ""}
            aria-pressed={settings.clock === "12"}
            onClick={() => onUpdate((prev) => ({ ...prev, clock: "12" }))}
          >
            12 h
          </button>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <span className="setting-name">Movimiento reducido</span>
          <span className="setting-help">Desactivar vuelos de cámara</span>
        </div>
        <button
          id="reducedMotionToggle"
          className="switch-button"
          type="button"
          role="switch"
          aria-checked={settings.reducedMotion}
          onClick={() => onUpdate((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }))}
        >
          <span></span>
        </button>
      </div>

      <div className="popover-note">Los ajustes se guardan localmente.</div>
    </div>
  );
};
