import React from "react";
import { CityInfo, LocationInfo } from "../types/orbital";
import { nearestCity } from "../lib/catalog";

interface WelcomeModalProps {
  mode: "first" | "change";
  cities: CityInfo[];
  currentLocation: LocationInfo | null;
  onSelectLocation: (loc: LocationInfo, isFirstRun: boolean) => void;
  onClose: () => void;
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  mode,
  cities,
  currentLocation,
  onSelectLocation,
  onClose,
}) => {
  const [query, setQuery] = React.useState("");
  const [activeSuggestion, setActiveSuggestion] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const suggestions = React.useMemo(() => {
    const q = normalizeText(query);
    const scored: Array<{ city: CityInfo; score: number }> = [];
    for (const city of cities) {
      const name = normalizeText(city.name);
      const admin = normalizeText(city.admin || "");
      const country = normalizeText(city.country);
      let score = Infinity;
      if (!q) score = 10;
      else if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (name.split(/[^A-Z0-9]+/).some((w) => w.startsWith(q))) score = 2;
      else if (name.includes(q)) score = 3;
      else if (admin.startsWith(q) || country.startsWith(q)) score = 4;
      if (score < Infinity) scored.push({ city, score });
    }
    scored.sort((a, b) => a.score - b.score || (b.city.pop || 0) - (a.city.pop || 0));
    return scored.slice(0, 4).map((entry) => entry.city);
  }, [query, cities]);

  const chooseCity = (city: CityInfo) => {
    setErrorMsg(null);
    onSelectLocation(
      {
        name: city.name,
        admin: city.admin,
        country: city.country,
        lat: city.lat,
        lon: city.lon,
      },
      mode === "first"
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length) {
        setActiveSuggestion((prev) => Math.min(suggestions.length - 1, prev + 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length) {
        setActiveSuggestion((prev) => Math.max(0, prev - 1));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const city = suggestions[activeSuggestion] || suggestions[0];
      if (city) chooseCity(city);
      else {
        setErrorMsg("Elige una ciudad de las sugerencias para continuar.");
      }
    }
  };

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg("Este navegador no proporciona ubicación. Busca tu ciudad manualmente.");
      return;
    }
    setErrorMsg(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        const nearest = nearestCity(cities, latitude, longitude);
        const loc: LocationInfo = {
          name: nearest.city && nearest.distanceKm < 80 ? nearest.city.name : "Mi ubicación",
          admin: nearest.city?.admin || "",
          country: nearest.city?.country || "",
          lat: latitude,
          lon: longitude,
        };
        onSelectLocation(loc, mode === "first");
      },
      (err) => {
        setLocating(false);
        setErrorMsg(
          err.code === 1
            ? "Permiso de ubicación denegado. Busca tu ciudad manualmente."
            : "No se pudo determinar tu ubicación. Busca tu ciudad manualmente."
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  };

  return (
    <div id="welcome" className="modal-layer welcome-layer">
      <div className="welcome-card glass">
        {mode === "change" && (
          <button id="welcomeClose" className="icon-button welcome-close" type="button" aria-label="Cerrar selector de ubicación" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <div className="welcome-topline">
          <span className="eyebrow">CENTRO DE CONTROL PERSONAL</span>
          {mode === "first" && (
            <span id="welcomeCoordinate" className="welcome-coordinate mono">
              {currentLocation ? `LAT ${currentLocation.lat.toFixed(1)} · LON ${currentLocation.lon.toFixed(1)}` : "LAT — · LON —"}
            </span>
          )}
        </div>

        <div className="welcome-symbol" aria-hidden="true">
          <span className="orbit-line one"></span>
          <span className="orbit-line two"></span>
          <span className="orbit-core"></span>
        </div>

        <h1>
          ¿Qué puedes ver
          <br />
          <em>desde donde estás?</em>
        </h1>
        <p className="welcome-copy">Descubre tu próximo paso de satélite visible. Tu ubicación solo se usa en este dispositivo.</p>

        <form
          id="locationForm"
          className="location-form"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            const city = suggestions[activeSuggestion] || suggestions[0];
            if (city) chooseCity(city);
            else setErrorMsg("Elige una ciudad de las sugerencias para continuar.");
          }}
        >
          <label className="welcome-search-label" htmlFor="welcomeSearch">
            Tu ciudad
          </label>
          <div className="welcome-search-row">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="m15.6 15.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              id="welcomeSearch"
              type="search"
              placeholder="Buscar una ciudad"
              aria-label="Buscar una ciudad"
              autoCapitalize="words"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveSuggestion(0);
              }}
              onKeyDown={handleKeyDown}
            />
            <button type="submit" className="welcome-submit" aria-label="Usar ciudad seleccionada">
              ↵
            </button>
          </div>

          <div id="welcomeSuggestions" className="city-suggestions" role="listbox" aria-label="Sugerencias de ciudades">
            {suggestions.map((city, idx) => (
              <button
                key={`${city.name}-${city.country}-${idx}`}
                type="button"
                className={`city-suggestion ${idx === activeSuggestion ? "is-focused" : ""}`}
                role="option"
                aria-selected={idx === activeSuggestion}
                onClick={() => chooseCity(city)}
              >
                <strong>{city.name}</strong>
                <span>{`${city.admin ? `${city.admin} · ` : ""}${city.country}`}</span>
              </button>
            ))}
            {suggestions.length === 0 && <div className="palette-empty">No se encontró esa ciudad. Prueba con una ciudad cercana importante.</div>}
          </div>
        </form>

        <div className="welcome-divider">
          <span>O</span>
        </div>

        <button id="useLocation" className="button location-action" type="button" disabled={locating} onClick={handleGeolocation}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="2.1" fill="currentColor" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{locating ? "Localizando…" : "Usar mi ubicación"}</span>
        </button>

        {errorMsg && (
          <p id="welcomeError" className="welcome-error" role="alert">
            {errorMsg}
          </p>
        )}

        <p className="welcome-footnote">Elementos orbitales CelesTrak · Predicción de pasos SGP4</p>
      </div>
    </div>
  );
};
