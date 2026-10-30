import React from "react";

interface MobileNavProps {
  activeSheet: "layers" | "tonight" | "satellite" | null;
  hasSatelliteSelected: boolean;
  onOpenSheet: (sheet: "layers" | "tonight" | "satellite") => void;
  onCloseSheet: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeSheet,
  hasSatelliteSelected,
  onOpenSheet,
  onCloseSheet,
}) => {
  return (
    <>
      <div id="mobileNav" className="glass mobile-nav" aria-label="Acceso rápido a paneles">
        <button
          type="button"
          data-sheet="layers"
          className={`mobile-nav-button ${activeSheet === "layers" ? "is-active" : ""}`}
          aria-expanded={activeSheet === "layers"}
          aria-pressed={activeSheet === "layers"}
          onClick={() => (activeSheet === "layers" ? onCloseSheet() : onOpenSheet("layers"))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="m12 3 9 5-9 5-9-5 9-5Zm-7 9 7 4 7-4M5 16l7 4 7-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span>Capas</span>
        </button>

        <button
          type="button"
          data-sheet="tonight"
          className={`mobile-nav-button ${activeSheet === "tonight" ? "is-active" : ""}`}
          aria-expanded={activeSheet === "tonight"}
          aria-pressed={activeSheet === "tonight"}
          onClick={() => (activeSheet === "tonight" ? onCloseSheet() : onOpenSheet("tonight"))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 15.1A8.2 8.2 0 0 1 8.9 4a8.3 8.3 0 1 0 11.1 11.1Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <span>Esta noche</span>
        </button>

        {hasSatelliteSelected && (
          <button
            id="mobileSatelliteBtn"
            type="button"
            data-sheet="satellite"
            className={`mobile-nav-button ${activeSheet === "satellite" ? "is-active" : ""}`}
            aria-expanded={activeSheet === "satellite"}
            aria-pressed={activeSheet === "satellite"}
            onClick={() => (activeSheet === "satellite" ? onCloseSheet() : onOpenSheet("satellite"))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <ellipse
                cx="12"
                cy="12"
                rx="9"
                ry="4.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                transform="rotate(-28 12 12)"
              />
            </svg>
            <span>Satélite</span>
          </button>
        )}
      </div>

      {activeSheet && (
        <div id="sheetScrim" className="sheet-scrim" onClick={onCloseSheet}></div>
      )}
    </>
  );
};
