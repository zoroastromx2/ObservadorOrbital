import React from "react";

interface BootScreenProps {
  booted: boolean;
  status: string;
}

export const BootScreen: React.FC<BootScreenProps> = ({ booted, status }) => {
  if (booted) return null;

  return (
    <div id="bootScreen" className="boot-screen">
      <div className="boot-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="12" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
          <ellipse
            cx="32"
            cy="32"
            rx="28"
            ry="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            transform="rotate(-28 32 32)"
          />
          <circle cx="52" cy="20" r="2.4" fill="currentColor" />
        </svg>
      </div>
      <div className="boot-wordmark">
        ORBITAL <span>WATCH</span>
      </div>
      <div className="boot-status">
        <span className="scan-spinner"></span>
        <span id="bootStatusText">{status}</span>
      </div>
    </div>
  );
};
