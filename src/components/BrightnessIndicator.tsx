import React from "react";
import { brightnessLabel } from "../lib/format";

interface BrightnessIndicatorProps {
  magnitude: number;
  showLabel?: boolean;
  className?: string;
}

export const BrightnessIndicator: React.FC<BrightnessIndicatorProps> = ({
  magnitude,
  showLabel = false,
  className = "",
}) => {
  const label = brightnessLabel(magnitude);

  const renderIcon = () => {
    switch (label) {
      case "Very bright":
        // Radiant 4-point celestial sparkle with luminous center
        return (
          <svg className="brightness-icon very-bright" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 0 C8 4.2 4.2 8 0 8 C4.2 8 8 11.8 8 16 C8 11.8 11.8 8 16 8 C11.8 8 8 4.2 8 0 Z"
              fill="currentColor"
            />
            <circle cx="8" cy="8" r="1.8" fill="#ffffff" />
          </svg>
        );
      case "Bright":
        // 4-point star
        return (
          <svg className="brightness-icon bright" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 1.5 C8 4.8 4.8 8 1.5 8 C4.8 8 8 11.2 8 14.5 C8 11.2 11.2 8 14.5 8 C11.2 8 8 4.8 8 1.5 Z"
              fill="currentColor"
            />
          </svg>
        );
      case "Visible":
        // Circular luminous disc
        return (
          <svg className="brightness-icon visible" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="4.2" fill="currentColor" />
          </svg>
        );
      case "Faint":
      default:
        // Subtle outlined celestial circle with small core
        return (
          <svg className="brightness-icon faint" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8" cy="8" r="1.1" fill="currentColor" />
          </svg>
        );
    }
  };

  return (
    <span
      className={`brightness-indicator tier-${label.toLowerCase().replace(/\s+/g, "-")} ${className}`}
      title={`${label} (${magnitude > 0 ? "+" : "−"}${Math.abs(magnitude).toFixed(1)} mag)`}
    >
      {renderIcon()}
      {showLabel && <span className="brightness-label-text">{label}</span>}
    </span>
  );
};
