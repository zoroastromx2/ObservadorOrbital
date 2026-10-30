import React from "react";
import { Satellite, UserSettings } from "../types/orbital";
import { GROUP_BY_ID } from "../lib/catalog";
import { formatAltitude } from "../lib/format";

interface HoverTooltipProps {
  satellite: Satellite | null;
  position: { x: number; y: number; visible: boolean } | null;
  altitude: number | null;
  settings: UserSettings;
}

export const HoverTooltip: React.FC<HoverTooltipProps> = ({
  satellite,
  position,
  altitude,
  settings,
}) => {
  if (!satellite || !position || !position.visible) return null;

  const imperial = settings.units === "imperial";
  const groupColor = satellite.color || GROUP_BY_ID[satellite.group]?.color || "var(--muted)";

  return (
    <div
      id="hoverLabel"
      className="hover-label"
      style={
        {
          left: `${position.x}px`,
          top: `${position.y}px`,
          "--group-color": groupColor,
        } as React.CSSProperties
      }
    >
      <span className="hover-dot"></span>
      <strong id="hoverName">{satellite.name}</strong>
      {altitude !== null && (
        <span id="hoverAlt" className="mono">
          {formatAltitude(altitude, imperial)}
        </span>
      )}
    </div>
  );
};
