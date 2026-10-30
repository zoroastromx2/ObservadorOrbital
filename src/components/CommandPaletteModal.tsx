import React from "react";
import { Satellite, CityInfo } from "../types/orbital";
import { GROUP_BY_ID } from "../lib/catalog";

interface PaletteItem {
  id: string;
  type: "command" | "satellite" | "city";
  title: string;
  subtitle?: string;
  hint?: string;
  iconText?: string;
  iconClass?: string;
  groupColor?: string;
  run: () => void;
}

interface CommandPaletteModalProps {
  satellites: Satellite[];
  cities: CityInfo[];
  onClose: () => void;
  onSelectSatellite: (sat: Satellite) => void;
  onSelectCity: (city: CityInfo) => void;
  onGoNow: () => void;
  onSoloGroup: (group: string) => void;
  onShowAll: () => void;
  onFocusIss: () => void;
  onToggleNight: () => void;
  onToggleOverlay: (overlay: string) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  satellites,
  cities,
  onClose,
  onSelectSatellite,
  onSelectCity,
  onGoNow,
  onSoloGroup,
  onShowAll,
  onFocusIss,
  onToggleNight,
  onToggleOverlay,
  onOpenSettings,
  onOpenHelp,
}) => {
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const COMMANDS = React.useMemo(
    () => [
      {
        id: "now",
        label: "Ir al presente",
        detail: "Devolver el globo y la línea de tiempo a la hora actual",
        hint: "N",
        keywords: "ahora en vivo restablecer presente tiempo now live reset present",
        run: onGoNow,
      },
      {
        id: "starlink",
        label: "Mostrar Starlink",
        detail: "Aislar la constelación Starlink",
        hint: "",
        keywords: "mostrar starlink constelacion show starlink",
        run: () => onSoloGroup("starlink"),
      },
      {
        id: "gps",
        label: "Mostrar GPS",
        detail: "Aislar la constelación GPS",
        hint: "",
        keywords: "mostrar gps navegacion navstar show gps",
        run: () => onSoloGroup("gps"),
      },
      {
        id: "weather",
        label: "Mostrar satélites meteorológicos",
        detail: "Aislar satélites meteorológicos y de observación",
        hint: "",
        keywords: "mostrar clima meteorologicos noaa goes observacion weather",
        run: () => onSoloGroup("weather"),
      },
      {
        id: "stations",
        label: "Mostrar estaciones espaciales",
        detail: "Aislar estaciones tripuladas y naves visitantes",
        hint: "",
        keywords: "mostrar estacion espacial eei iss css space station",
        run: () => onSoloGroup("stations"),
      },
      {
        id: "showall",
        label: "Mostrar todos los satélites",
        detail: "Restablecer todos los grupos activos",
        hint: "",
        keywords: "mostrar todos satelites grupos restablecer show all",
        run: onShowAll,
      },
      {
        id: "iss",
        label: "Enfocar la EEI",
        detail: "Seleccionar y seguir la Estación Espacial Internacional",
        hint: "",
        keywords: "eei iss zarya estacion espacial internacional focus",
        run: onFocusIss,
      },
      {
        id: "night",
        label: "Alternar visión nocturna",
        detail: "Atenuar toda la interfaz a tonos rojos",
        hint: "",
        keywords: "vision nocturna rojo oscuro night vision red",
        run: onToggleNight,
      },
      {
        id: "orbits",
        label: "Alternar líneas de órbita",
        detail: "Mostrar u ocultar la órbita seleccionada",
        hint: "O",
        keywords: "orbita lineas trayectoria mostrar ocultar orbit",
        run: () => onToggleOverlay("orbits"),
      },
      {
        id: "trails",
        label: "Alternar estelas",
        detail: "Mostrar u ocultar la estela degradada",
        hint: "",
        keywords: "estela rastro cola mostrar ocultar trail",
        run: () => onToggleOverlay("trails"),
      },
      {
        id: "labels",
        label: "Alternar etiquetas",
        detail: "Mostrar u ocultar etiquetas de satélites principales",
        hint: "L",
        keywords: "etiquetas rotulos nombres mostrar ocultar labels",
        run: () => onToggleOverlay("labels"),
      },
      {
        id: "citylights",
        label: "Alternar luces urbanas",
        detail: "Mostrar u ocultar luces nocturnas de la Tierra",
        hint: "",
        keywords: "luces urbanas ciudades noche tierra city lights",
        run: () => onToggleOverlay("cityLights"),
      },
      {
        id: "settings",
        label: "Abrir ajustes",
        detail: "Unidades, formato de hora, movimiento reducido",
        hint: "",
        keywords: "ajustes preferencias opciones configuracion settings",
        run: onOpenSettings,
      },
      {
        id: "help",
        label: "Atajos de teclado",
        detail: "Abrir la guía de atajos de teclado",
        hint: "?",
        keywords: "ayuda atajos teclas teclado help shortcuts",
        run: onOpenHelp,
      },
    ],
    [
      onGoNow,
      onSoloGroup,
      onShowAll,
      onFocusIss,
      onToggleNight,
      onToggleOverlay,
      onOpenSettings,
      onOpenHelp,
    ]
  );

  // Compute matched commands, satellites, and cities
  const { commandItems, satItems, cityItems, allItems } = React.useMemo(() => {
    const q = normalizeText(query);

    // Commands
    let matchedCmds = COMMANDS;
    if (q) {
      matchedCmds = COMMANDS.filter((cmd) => {
        const haystack = normalizeText(`${cmd.label} ${cmd.detail} ${cmd.keywords}`);
        return haystack.includes(q) || (q === "MOSTRAR" && cmd.id !== "now") || (q === "SHOW" && cmd.id !== "now");
      }).slice(0, 8);
    } else {
      matchedCmds = COMMANDS.slice(0, 7);
    }
    const cItems: PaletteItem[] = matchedCmds.map((c) => ({
      id: `cmd-${c.id}`,
      type: "command",
      title: c.label,
      subtitle: c.detail,
      hint: c.hint || "",
      iconText: ">",
      run: () => {
        onClose();
        c.run();
      },
    }));

    // Satellites
    const sItems: PaletteItem[] = [];
    if (q) {
      const priority: Record<string, number> = { stations: 0, weather: 1, gps: 2, other: 3, starlink: 4 };
      const scored: Array<{ sat: Satellite; score: number }> = [];
      for (const sat of satellites) {
        const name = normalizeText(sat.name);
        const id = String(sat.noradId);
        let score = Infinity;
        if (id === q || name === q) score = 0;
        else if (name.startsWith(q)) score = 1;
        else if (id.startsWith(q)) score = 2;
        else if (name.split(/[^A-Z0-9]+/).some((w) => w.startsWith(q))) score = 3;
        else if (name.includes(q)) score = 4;
        if (score < Infinity) scored.push({ sat, score });
      }
      scored.sort(
        (a, b) =>
          a.score - b.score ||
          (priority[a.sat.group] ?? 9) - (priority[b.sat.group] ?? 9) ||
          a.sat.name.length - b.sat.name.length
      );
      for (const entry of scored.slice(0, 6)) {
        const sat = entry.sat;
        sItems.push({
          id: `sat-${sat.noradId}`,
          type: "satellite",
          title: sat.name,
          subtitle: `NORAD ${sat.noradId} · ${GROUP_BY_ID[sat.group]?.label || ""}`,
          iconClass: "swatch-icon",
          groupColor: sat.color,
          run: () => {
            onClose();
            onSelectSatellite(sat);
          },
        });
      }
    }

    // Cities
    const ciItems: PaletteItem[] = [];
    if (q) {
      const scored: Array<{ city: CityInfo; score: number }> = [];
      for (const city of cities) {
        const name = normalizeText(city.name);
        const admin = normalizeText(city.admin || "");
        const country = normalizeText(city.country);
        let score = Infinity;
        if (name === q) score = 0;
        else if (name.startsWith(q)) score = 1;
        else if (name.split(/[^A-Z0-9]+/).some((w) => w.startsWith(q))) score = 2;
        else if (name.includes(q)) score = 3;
        else if (admin.startsWith(q) || country.startsWith(q)) score = 4;
        if (score < Infinity) scored.push({ city, score });
      }
      scored.sort((a, b) => a.score - b.score || (b.city.pop || 0) - (a.city.pop || 0));
      for (const entry of scored.slice(0, 4)) {
        const city = entry.city;
        ciItems.push({
          id: `city-${city.name}-${city.country}`,
          type: "city",
          title: city.name,
          subtitle: `${city.admin ? `${city.admin} · ` : ""}${city.country}`,
          iconText: "◎",
          run: () => {
            onClose();
            onSelectCity(city);
          },
        });
      }
    }

    return {
      commandItems: cItems,
      satItems: sItems,
      cityItems: ciItems,
      allItems: [...cItems, ...sItems, ...ciItems],
    };
  }, [query, COMMANDS, satellites, cities, onClose, onSelectSatellite, onSelectCity]);

  // Adjust activeIndex if out of bounds
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (allItems.length > 0) {
        setActiveIndex((prev) => (prev + 1) % allItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (allItems.length > 0) {
        setActiveIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = allItems[activeIndex];
      if (item) item.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let globalIndexCounter = 0;

  const renderSection = (title: string, items: PaletteItem[]) => {
    if (!items.length) return null;
    return (
      <div className="palette-section" key={title}>
        <div className="palette-section-label">{title}</div>
        {items.map((item) => {
          const itemIdx = globalIndexCounter++;
          const isActive = itemIdx === activeIndex;
          return (
            <button
              key={item.id}
              className={`palette-item ${isActive ? "is-active" : ""}`}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={item.run}
              onPointerEnter={() => setActiveIndex(itemIdx)}
            >
              <span
                className={`palette-icon ${item.iconClass || ""}`}
                style={{ "--group-color": item.groupColor } as React.CSSProperties}
              >
                {item.iconText || ""}
              </span>
              <span className="palette-item-copy">
                <strong>{item.title}</strong>
                {item.subtitle && <small>{item.subtitle}</small>}
              </span>
              <kbd>{item.hint || "↵"}</kbd>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div id="commandPalette" className="modal-layer palette-layer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette glass" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div className="palette-input-row">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="m15.6 15.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            id="paletteInput"
            type="text"
            placeholder="Buscar satélites, ciudades o comandos"
            aria-label="Búsqueda en paleta de comandos"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd onClick={onClose} style={{ cursor: "pointer" }}>
            ESC
          </kbd>
        </div>

        <div id="paletteResults" className="palette-results">
          {renderSection("COMANDOS", commandItems)}
          {renderSection("SATÉLITES", satItems)}
          {renderSection("CIUDADES", cityItems)}

          {allItems.length === 0 && (
            <div className="palette-empty">No se encontraron satélites, ciudades ni comandos.</div>
          )}
        </div>

        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navegar
          </span>
          <span>
            <kbd>↵</kbd> Seleccionar
          </span>
          <span>
            <kbd>Esc</kbd> Cerrar
          </span>
        </div>
      </div>
    </div>
  );
};
