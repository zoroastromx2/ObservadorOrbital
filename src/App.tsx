import React, { useEffect, useRef, useState, useCallback } from "react";
import "./style.css";
import { Globe } from "./scene/globe.js";
import {
  prepareCatalog,
  GROUPS,
  GROUP_BY_ID,
  nearestCity,
} from "./lib/catalog.js";
import {
  formatAltitude,
  formatSpeed,
  buildIcs,
  icsFilename,
  compassDirection,
  brightnessLabel,
} from "./lib/format.js";
import {
  ommToSatrec,
  propagateAtMs,
  temeToEcef,
  julianFromUnixMs,
  RAD2DEG,
} from "./lib/sgp4.js";
import {
  observerFromLocation,
  nextPassForSatellite,
  skyPath,
} from "./lib/passes.js";
import {
  Satellite,
  SatellitePass,
  LocationInfo,
  CityInfo,
  UserSettings,
  DisplayOptions,
  PassScanStatus,
} from "./types/orbital";

import { TopBar } from "./components/TopBar";
import { LeftDock } from "./components/LeftDock";
import { RightPanel } from "./components/RightPanel";
import { TimelineDock } from "./components/TimelineDock";
import { SkyViewModal } from "./components/SkyViewModal";
import { CommandPaletteModal } from "./components/CommandPaletteModal";
import { SettingsModal } from "./components/SettingsModal";
import { HelpModal } from "./components/HelpModal";
import { WelcomeModal } from "./components/WelcomeModal";
import { MobileNav } from "./components/MobileNav";
import { HoverTooltip } from "./components/HoverTooltip";
import { WorldLabels, ProjectedLabel } from "./components/WorldLabels";
import { BootScreen } from "./components/BootScreen";

const PREF_KEY = "orbital-watch-prefs-v1";
const LOCATION_KEY = "orbital-watch-location-v1";
const NOTIFY_KEY = "orbital-watch-notifications-v1";
const DAY = 86400000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

class PositionRuntime {
  satellites: Satellite[];
  onPositions: (positions: Float32Array, valid: Uint8Array, timeMs: number) => void;
  pending = false;
  ready = false;
  desired: number | null = null;
  lastSent = 0;
  firstResolve: (() => void) | null = null;
  readyResolve: ((count: number) => void) | null = null;
  hasFirst = false;
  worker: Worker;

  constructor(
    satellites: Satellite[],
    onPositions: (positions: Float32Array, valid: Uint8Array, timeMs: number) => void
  ) {
    this.satellites = satellites;
    this.onPositions = onPositions;
    this.worker = new Worker(new URL("./workers/positions.worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event) => this.handleMessage(event);
    this.worker.onerror = (error) => {
      console.error("Satellite position worker failed", error);
    };
  }

  start() {
    const ready = new Promise<number>((resolve) => {
      this.readyResolve = resolve;
    });
    const first = new Promise<void>((resolve) => {
      this.firstResolve = resolve;
    });
    this.worker.postMessage({ type: "init", satellites: this.satellites });
    return { ready, first };
  }

  handleMessage(event: MessageEvent) {
    const message = event.data;
    if (message.type === "ready") {
      this.ready = true;
      this.readyResolve?.(message.count);
      return;
    }
    if (message.type !== "positions") return;
    this.pending = false;
    this.onPositions(message.positions, message.valid, message.timeMs);
    if (!this.hasFirst) {
      this.hasFirst = true;
      this.firstResolve?.();
    }
    if (
      this.desired !== null &&
      Math.abs(this.desired - message.timeMs) > 1 &&
      performance.now() - this.lastSent > 28
    ) {
      this.send(this.desired);
    }
  }

  update(timeMs: number) {
    this.desired = timeMs;
    if (!this.ready || this.pending) return;
    if (performance.now() - this.lastSent < 28) return;
    this.send(timeMs);
  }

  send(timeMs: number) {
    this.pending = true;
    this.lastSent = performance.now();
    this.worker.postMessage({ type: "update", timeMs });
  }

  terminate() {
    this.worker.terminate();
  }
}

export const App: React.FC = () => {
  // References
  const viewportRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const runtimeRef = useRef<PositionRuntime | null>(null);
  const passWorkerRef = useRef<Worker | null>(null);
  const passScanTokenRef = useRef(0);
  const toastTimerRef = useRef<any>(0);
  const satrecMapRef = useRef<Map<number, any>>(new Map());
  const satellitesRef = useRef<Satellite[]>([]);
  const handleSelectSatelliteRef = useRef<(index: number | null, fly?: boolean) => void>(() => {});

  // Settings
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = readJson<any>(PREF_KEY, {});
    const mediaReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return {
      units: saved.units === "imperial" ? "imperial" : "metric",
      clock: saved.clock === "12" ? "12" : "24",
      reducedMotion:
        typeof saved.reducedMotion === "boolean" ? saved.reducedMotion : mediaReduced,
      nightVision: saved.nightVision === true,
    };
  });

  // Display options
  const [display, setDisplay] = useState<DisplayOptions>({
    orbits: true,
    trails: true,
    labels: true,
    cityLights: true,
    groups: Object.fromEntries(GROUPS.map((g) => [g.id, true])),
    bands: { low: true, medium: true, geostationary: true },
  });

  // App state
  const [booted, setBooted] = useState(false);
  const [bootStatus, setBootStatus] = useState("Cargando catálogo orbital de CelesTrak");
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [location, setLocationState] = useState<LocationInfo | null>(() => {
    const loc = readJson<any>(LOCATION_KEY, null);
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && typeof loc.name === "string") {
      return loc;
    }
    return null;
  });

  // Selection & Telemetry
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [selectedPass, setSelectedPass] = useState<SatellitePass | null>(null);
  const [selectedPassStatus, setSelectedPassStatus] = useState<string>("Escaneando…");
  const [telemetry, setTelemetry] = useState<{
    altitude: number | null;
    speed: number | null;
    lat: number | null;
    lon: number | null;
  }>({ altitude: null, speed: null, lat: null, lon: null });

  // Playback & Timeline
  const [playing, setPlaying] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [simTime, setSimTime] = useState<number>(Date.now());
  const [timelineCenter, setTimelineCenter] = useState<number>(Date.now());

  // Passes & Scanning
  const [passes, setPasses] = useState<SatellitePass[]>([]);
  const [scanStatus, setScanStatus] = useState<PassScanStatus>({
    scanned: 0,
    total: 0,
    done: true,
    totalFound: 0,
  });
  const [spotlightPass, setSpotlightPass] = useState<SatellitePass | null>(null);

  // Pass Notifications
  const [notifiedNorads, setNotifiedNorads] = useState<number[]>(() =>
    readJson<number[]>(NOTIFY_KEY, [])
  );
  const alertedPassesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    writeJson(NOTIFY_KEY, notifiedNorads);
  }, [notifiedNorads]);

  // Modals & Sheets
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeMode, setWelcomeMode] = useState<"first" | "change">("first");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [skyViewOpen, setSkyViewOpen] = useState(false);
  const [skyPass, setSkyPass] = useState<SatellitePass | null>(null);
  const [skyPathData, setSkyPathData] = useState<Array<{ timeMs: number; azimuth: number; elevation: number }>>([]);
  const [activeSheet, setActiveSheet] = useState<"layers" | "tonight" | "satellite" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Hover & Projected Labels
  const [hoverInfo, setHoverInfo] = useState<{
    satellite: Satellite | null;
    position: { x: number; y: number; visible: boolean } | null;
    altitude: number | null;
  }>({ satellite: null, position: null, altitude: null });
  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);

  // Toast helper
  const showToast = useCallback((msg: string, duration = 2800) => {
    clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, duration);
  }, []);

  useEffect(() => {
    satellitesRef.current = satellites;
  }, [satellites]);

  // Sync mobile sheet state to body classes
  useEffect(() => {
    document.body.classList.toggle("sheet-open", activeSheet !== null);
    document.body.classList.toggle("sheet-layers", activeSheet === "layers");
    document.body.classList.toggle("sheet-tonight", activeSheet === "tonight");
    document.body.classList.toggle("sheet-satellite", activeSheet === "satellite");
  }, [activeSheet]);

  // Save preferences
  useEffect(() => {
    writeJson(PREF_KEY, settings);
    document.body.classList.toggle("reduced-motion", settings.reducedMotion);
    document.body.classList.toggle("night-vision", settings.nightVision);
    globeRef.current?.setReducedMotion(settings.reducedMotion);
  }, [settings]);

  // Observer
  const observer = React.useMemo(() => {
    if (!location) return null;
    return observerFromLocation(location.lat, location.lon, 0);
  }, [location]);

  // Satrec cache helper
  const getSatrec = useCallback(
    (sat: Satellite) => {
      let rec = satrecMapRef.current.get(sat.noradId);
      if (!rec) {
        rec = ommToSatrec(sat);
        satrecMapRef.current.set(sat.noradId, rec);
      }
      return rec;
    },
    []
  );

  const selectedSat = selectedIndex !== null ? satellites[selectedIndex] || null : null;

  // Geometry builder for selection orbit & trail
  const buildSelectionGeometry = useCallback(
    (sat: Satellite, currentSimTime: number) => {
      if (!globeRef.current) return;
      const rec = getSatrec(sat);
      const periodMs = sat.periodMin * 60000;
      const sampleCount = 280;
      const start = currentSimTime - periodMs * 0.75;
      const end = currentSimTime + periodMs * 0.25;
      const headIndex = Math.round(sampleCount * 0.75);
      const orbitPositions: number[] = [];
      const orbitFade: number[] = [];
      const groundPoints: Array<{ lat: number; lon: number }> = [];

      for (let i = 0; i <= sampleCount; i += 1) {
        const time = start + ((end - start) * i) / sampleCount;
        const vector = propagateAtMs(rec, time);
        if (!vector) continue;
        const jd = julianFromUnixMs(time);
        const ecef = temeToEcef(vector.position, jd);
        orbitPositions.push(ecef[0] / 6378.135, ecef[2] / 6378.135, -ecef[1] / 6378.135);
        let fade: number;
        if (i <= headIndex) {
          fade = 0.08 + 0.88 * Math.pow(i / headIndex, 5);
        } else {
          fade = 0.28 * (1 - (i - headIndex) / (sampleCount - headIndex)) + 0.035;
        }
        orbitFade.push(fade);
        const r = Math.hypot(ecef[0], ecef[1], ecef[2]);
        const lat = Math.asin(ecef[2] / r);
        const lon = Math.atan2(ecef[1], ecef[0]);
        groundPoints.push({ lat, lon });
      }

      const groundSegments: number[][][] = [];
      let segment: number[][] = [];
      let prevLon: number | null = null;
      for (const pt of groundPoints) {
        const lon = pt.lon;
        if (prevLon !== null && Math.abs(lon - prevLon) > Math.PI) {
          if (segment.length > 1) groundSegments.push(segment);
          segment = [];
        }
        const cosLat = Math.cos(pt.lat);
        segment.push([
          1.003 * cosLat * Math.cos(lon),
          1.003 * Math.sin(pt.lat),
          -1.003 * cosLat * Math.sin(lon),
        ]);
        prevLon = lon;
      }
      if (segment.length > 1) groundSegments.push(segment);

      const trailStart = currentSimTime - periodMs * 0.16;
      const trailPositions: number[] = [];
      const trailFade: number[] = [];
      for (let i = 0; i <= 60; i += 1) {
        const time = trailStart + ((currentSimTime - trailStart) * i) / 60;
        const vector = propagateAtMs(rec, time);
        if (!vector) continue;
        const jd = julianFromUnixMs(time);
        const ecef = temeToEcef(vector.position, jd);
        trailPositions.push(ecef[0] / 6378.135, ecef[2] / 6378.135, -ecef[1] / 6378.135);
        trailFade.push(0.04 + Math.pow(i / 60, 2.5) * 0.9);
      }

      let subpoint: number[] | null = null;
      const current = propagateAtMs(rec, currentSimTime);
      if (current) {
        const currentEcef = temeToEcef(current.position, julianFromUnixMs(currentSimTime));
        const radius = Math.hypot(currentEcef[0], currentEcef[1], currentEcef[2]);
        if (radius) {
          subpoint = [currentEcef[0] / radius, currentEcef[2] / radius, -currentEcef[1] / radius];
        }
      }

      globeRef.current.setSelectionGeometry(
        orbitPositions,
        orbitFade,
        trailPositions,
        trailFade,
        groundSegments,
        subpoint
      );
    },
    [getSatrec]
  );

  // Compute telemetry for selected satellite
  const computeTelemetry = useCallback(
    (sat: Satellite, currentSimTime: number) => {
      try {
        const rec = getSatrec(sat);
        const vector = propagateAtMs(rec, currentSimTime);
        if (!vector) {
          setTelemetry({ altitude: null, speed: null, lat: null, lon: null });
          return;
        }
        const jd = julianFromUnixMs(currentSimTime);
        const ecef = temeToEcef(vector.position, jd);
        const a = 6378.137;
        const f = 1 / 298.257223563;
        const e2 = f * (2 - f);
        const r = Math.hypot(ecef[0], ecef[1]);
        let lat = Math.atan2(ecef[2], r * (1 - e2));
        let alt = 0;
        for (let i = 0; i < 3; i += 1) {
          const sinLat = Math.sin(lat);
          const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);
          alt = r / Math.cos(lat) - n;
          lat = Math.atan2(ecef[2] + n * e2 * sinLat, r);
        }
        const lon = Math.atan2(ecef[1], ecef[0]);
        const spd = Math.hypot(vector.velocity[0], vector.velocity[1], vector.velocity[2]);
        setTelemetry({
          altitude: alt,
          speed: spd,
          lat: lat * RAD2DEG,
          lon: lon * RAD2DEG,
        });
      } catch {
        setTelemetry({ altitude: null, speed: null, lat: null, lon: null });
      }
    },
    [getSatrec]
  );

  // Start pass scan for observer
  const startPassScan = useCallback(
    (loc: LocationInfo, satList: Satellite[]) => {
      if (!loc || !satList.length) return;
      passScanTokenRef.current += 1;
      const token = passScanTokenRef.current;
      if (passWorkerRef.current) {
        passWorkerRef.current.postMessage({ type: "cancel" });
        passWorkerRef.current.terminate();
      }
      const worker = new Worker(new URL("./workers/passes.worker.js", import.meta.url), {
        type: "module",
      });
      passWorkerRef.current = worker;
      setPasses([]);
      setScanStatus({
        scanned: 0,
        total: satList.length,
        done: false,
        totalFound: 0,
        startedAt: Date.now(),
      });

      worker.onmessage = (event) => {
        if (token !== passScanTokenRef.current) return;
        const message = event.data;
        if (message.type !== "passes") return;
        setPasses(message.passes);
        setScanStatus({
          scanned: message.scanned,
          total: message.total,
          done: message.done,
          totalFound: message.totalFound,
          searchingBeyond: !!message.searchingBeyond,
          nextBeyond: message.nextBeyond || null,
        });
      };

      const startMs = Date.now();
      worker.postMessage({
        type: "start",
        satellites: satList.map((sat) => ({
          ...sat,
          group: sat.group,
        })),
        location: loc,
        startMs,
        endMs: startMs + DAY,
      });
    },
    []
  );

  // Set location handler
  const setLocation = useCallback(
    (loc: LocationInfo, options: { fly?: boolean; firstRun?: boolean } = {}) => {
      const { fly = true, firstRun = false } = options;
      setLocationState(loc);
      writeJson(LOCATION_KEY, loc);
      globeRef.current?.setLocation(loc);
      if (fly && globeRef.current) {
        globeRef.current.flyToLocation(loc.lat, loc.lon, 2.95, 1300);
      }
      setSelectedPass(null);
      startPassScan(loc, satellites);
      if (firstRun) {
        showToast(`Ubicación establecida en ${loc.name}. Buscando el próximo paso de la EEI.`);
        const iss = satellites.find((s) => s.noradId === 25544);
        if (iss) {
          try {
            const obs = observerFromLocation(loc.lat, loc.lon, 0);
            const pass = nextPassForSatellite(ommToSatrec(iss), iss, obs, Date.now(), 7);
            if (pass) setSpotlightPass(pass);
          } catch {
            /* ignore */
          }
        }
      }
    },
    [satellites, startPassScan, showToast]
  );

  // Satellite selection
  const handleSelectSatellite = useCallback(
    (index: number | null, fly = true) => {
      if (index === null) {
        setSelectedIndex(null);
        setIsFollowing(false);
        setSelectedPass(null);
        globeRef.current?.setSelected(null);
        globeRef.current?.setFollow(null, false);
        return;
      }
      const list = satellitesRef.current.length ? satellitesRef.current : satellites;
      const sat = list[index];
      if (!sat) return;
      setSelectedIndex(index);
      setIsFollowing(false);
      setSelectedPass(null);
      if (!display.groups[sat.group]) {
        setDisplay((prev) => ({
          ...prev,
          groups: { ...prev.groups, [sat.group]: true },
        }));
        globeRef.current?.setGroupVisible(sat.group, true);
      }
      globeRef.current?.setSelected(index);
      if (fly) globeRef.current?.flyToSatellite(index, 2.65);

      computeTelemetry(sat, simTime);
      buildSelectionGeometry(sat, simTime);

      showToast(`Satélite seleccionado: ${sat.name} · NORAD ${sat.noradId}`);

      if (window.innerWidth <= 760) {
        setActiveSheet("satellite");
      }

      if (observer) {
        setSelectedPassStatus("Escaneando…");
        try {
          const rec = getSatrec(sat);
          const p = nextPassForSatellite(rec, sat, observer, Date.now(), 7);
          setSelectedPass(p);
          setSelectedPassStatus(p ? "" : "Ninguno en los próximos 7 días");
        } catch {
          setSelectedPassStatus("Búsqueda no disponible");
        }
      }
    },
    [satellites, display.groups, computeTelemetry, buildSelectionGeometry, simTime, observer, getSatrec, showToast]
  );
  handleSelectSatelliteRef.current = handleSelectSatellite;

  // Toggle follow
  const handleToggleFollow = useCallback(() => {
    if (selectedIndex === null) return;
    const nextVal = !isFollowing;
    setIsFollowing(nextVal);
    globeRef.current?.setFollow(selectedIndex, nextVal);
  }, [selectedIndex, isFollowing]);

  // Show orbit
  const handleShowOrbit = useCallback(() => {
    if (selectedIndex === null) return;
    if (!display.orbits) {
      setDisplay((prev) => {
        const next = { ...prev, orbits: true };
        globeRef.current?.setDisplay(next);
        return next;
      });
    }
    const sat = satellites[selectedIndex];
    if (sat) buildSelectionGeometry(sat, simTime);
    globeRef.current?.flyToSatellite(selectedIndex, 2.65);
    showToast("Órbita y traza terrestre mostradas");
  }, [selectedIndex, display.orbits, satellites, buildSelectionGeometry, simTime, showToast]);

  // Layer toggles
  const handleToggleGroup = useCallback((groupId: string) => {
    setDisplay((prev) => {
      const next = {
        ...prev,
        groups: { ...prev.groups, [groupId]: !prev.groups[groupId] },
      };
      globeRef.current?.setGroupVisible(groupId, next.groups[groupId]);
      return next;
    });
  }, []);

  const handleToggleOverlay = useCallback(
    (overlayId: keyof DisplayOptions) => {
      const overlayNames: Record<string, string> = {
        orbits: "Órbitas",
        trails: "Estelas",
        labels: "Etiquetas",
        cityLights: "Luces urbanas",
      };
      setDisplay((prev) => {
        const next = { ...prev, [overlayId]: !prev[overlayId] };
        globeRef.current?.setDisplay(next);
        const name = overlayNames[overlayId] || overlayId;
        showToast(`${name} ${next[overlayId] ? "activadas" : "desactivadas"}`);
        return next;
      });
    },
    [showToast]
  );

  const handleToggleBand = useCallback((band: "low" | "medium" | "geostationary") => {
    setDisplay((prev) => {
      const next = {
        ...prev,
        bands: { ...prev.bands, [band]: !prev.bands[band] },
      };
      globeRef.current?.setBandVisible(band, next.bands[band]);
      return next;
    });
  }, []);

  // Time navigation
  const handleGoNow = useCallback(() => {
    const now = Date.now();
    setIsLive(true);
    setPlaying(true);
    setSpeed(1);
    setSimTime(now);
    setTimelineCenter(now);
    showToast("Volviendo al tiempo real");
  }, [showToast]);

  const handleSetSpeed = useCallback((s: number) => {
    setSpeed(s);
    if (s !== 1) setIsLive(false);
    setPlaying(true);
  }, []);

  const handleScrub = useCallback((targetTime: number) => {
    setIsLive(false);
    setPlaying(false);
    setSimTime(targetTime);
  }, []);

  // Open Sky View
  const handleOpenPass = useCallback(
    (pass: SatellitePass) => {
      const entry = satellites.find((s) => s.noradId === pass.noradId);
      if (!entry || !observer) return;
      handleSelectSatellite(entry.index, true);
      const rec = getSatrec(entry);
      const path = skyPath(rec, pass, observer, 96);
      setSkyPass(pass);
      setSkyPathData(path);
      setSkyViewOpen(true);
    },
    [satellites, observer, handleSelectSatellite, getSatrec]
  );

  // Save calendar .ics
  const handleSaveCalendar = useCallback(
    (pass: SatellitePass) => {
      if (!location) return;
      const blob = new Blob([buildIcs(pass, location.name)], {
        type: "text/calendar;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = icsFilename(pass);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast("Paso guardado en el calendario");
    },
    [location, showToast]
  );

  // Send imminent pass notification using browser Notification API
  const sendImminentPassNotification = useCallback(
    (sat: Satellite, pass: SatellitePass, locName: string) => {
      const now = Date.now();
      const minsUntil = Math.max(0, Math.round((pass.startMs - now) / 60000));
      const timeStr = minsUntil === 0 ? "¡Sobrevolando ahora!" : `Comienza en ${minsUntil} min`;
      const peakEl = Math.round(pass.peakElevation);
      const direction = compassDirection(pass.startAzimuth);
      const brightness = brightnessLabel(pass.magnitude);

      const title = `🛰️ Paso inminente de ${sat.name} (${timeStr})`;
      const body = `Paso visible sobre ${locName} iniciando hacia el ${direction} (Cúspide ${peakEl}°). ${brightness}. Haz clic para ver en el domo celeste.`;

      showToast(`🔔 Paso inminente de ${sat.name}: ${timeStr} hacia el ${direction} (cúspide a ${peakEl}°)`, 6000);

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          const notif = new Notification(title, {
            body,
            icon: "/favicon.svg",
            tag: `pass-${pass.noradId}-${pass.startMs}`,
          });
          notif.onclick = () => {
            window.focus();
            handleSelectSatellite(sat.index, true);
            handleOpenPass(pass);
          };
        } catch (e) {
          console.warn("Failed to dispatch browser notification:", e);
        }
      }
    },
    [showToast, handleSelectSatellite, handleOpenPass]
  );

  // Toggle notification for selected satellite
  const handleToggleNotification = useCallback(async () => {
    if (!selectedSat) return;
    const noradId = selectedSat.noradId;
    const isCurrentlyEnabled = notifiedNorads.includes(noradId);

    if (isCurrentlyEnabled) {
      setNotifiedNorads((prev) => prev.filter((id) => id !== noradId));
      showToast(`Avisos de paso desactivados para ${selectedSat.name}`);
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      showToast("La API de notificaciones del navegador no está disponible.");
      return;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch (e) {
        console.warn("Notification request permission error:", e);
      }
    }

    if (permission === "granted") {
      setNotifiedNorads((prev) => [...prev, noradId]);
      showToast(`🔔 Alertas de paso activadas para ${selectedSat.name} (10 min antes)`);

      const now = Date.now();
      const imminentPass =
        passes.find(
          (p) => p.noradId === noradId && p.startMs - now <= 10 * 60 * 1000 && p.endMs > now
        ) ||
        (selectedPass &&
        selectedPass.noradId === noradId &&
        selectedPass.startMs - now <= 10 * 60 * 1000 &&
        selectedPass.endMs > now
          ? selectedPass
          : null);

      if (imminentPass) {
        sendImminentPassNotification(selectedSat, imminentPass, location?.name || "tu ubicación");
      } else {
        try {
          new Notification(`Orbital Watch: ${selectedSat.name}`, {
            body: `¡Notificaciones activadas! Te avisaremos 10 minutos antes de su próximo paso visible.`,
            icon: "/favicon.svg",
            tag: `setup-${noradId}`,
          });
        } catch {
          /* ignore */
        }
      }
    } else if (permission === "denied") {
      showToast("Permiso de notificaciones denegado en el navegador.");
    } else {
      showToast("Permiso de notificaciones cancelado.");
    }
  }, [
    selectedSat,
    notifiedNorads,
    showToast,
    passes,
    selectedPass,
    location,
    sendImminentPassNotification,
  ]);

  // Imminent pass monitor: check subscribed satellites every 10 seconds
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !notifiedNorads.length
    ) {
      return;
    }

    const checkInterval = setInterval(() => {
      const now = Date.now();
      for (const noradId of notifiedNorads) {
        const satPasses = passes.filter((p) => p.noradId === noradId);
        for (const pass of satPasses) {
          const passKey = `${pass.noradId}-${pass.startMs}`;
          const timeUntilStart = pass.startMs - now;
          const isImminent = timeUntilStart <= 10 * 60 * 1000 && pass.endMs > now;
          if (isImminent && !alertedPassesRef.current.has(passKey)) {
            alertedPassesRef.current.add(passKey);
            const sat = satellites.find((s) => s.noradId === pass.noradId);
            if (sat) {
              sendImminentPassNotification(sat, pass, location?.name || "tu ubicación");
            }
          }
        }

        // Also check selectedPass if it belongs to this satellite and is imminent
        if (
          selectedPass &&
          selectedPass.noradId === noradId &&
          selectedPass.startMs - now <= 10 * 60 * 1000 &&
          selectedPass.endMs > now
        ) {
          const passKey = `${selectedPass.noradId}-${selectedPass.startMs}`;
          if (!alertedPassesRef.current.has(passKey)) {
            alertedPassesRef.current.add(passKey);
            const sat = satellites.find((s) => s.noradId === selectedPass.noradId);
            if (sat) {
              sendImminentPassNotification(sat, selectedPass, location?.name || "tu ubicación");
            }
          }
        }
      }
    }, 10000);

    return () => clearInterval(checkInterval);
  }, [notifiedNorads, passes, selectedPass, satellites, location, sendImminentPassNotification]);

  // Export clean PNG
  const handleShare = useCallback(() => {
    if (!globeRef.current) return;
    const sat = selectedSat;
    const date = new Date(simTime);
    const timeText = `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
    const name = sat ? sat.name : "Vista en vivo de la Tierra";
    const subtitle = sat
      ? `${GROUP_BY_ID[sat.group]?.label || ""} · NORAD ${sat.noradId} · CelesTrak GP`
      : `${satellites.length} satélites activos · CelesTrak GP`;
    globeRef.current
      .captureShare({ name, timeText, subtitle })
      .then((blob: Blob) => {
        if (!blob) throw new Error("PNG export failed");
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `orbital-watch-${(sat?.name || "earth")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}-${date.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        showToast("Vista PNG limpia exportada");
      })
      .catch(() => showToast("No se pudo exportar esta vista"));
  }, [selectedSat, simTime, satellites.length, showToast]);

  // Solo group from palette
  const handleSoloGroup = useCallback(
    (groupId: string) => {
      setDisplay((prev) => {
        const nextGroups: Record<string, boolean> = {};
        for (const g of GROUPS) nextGroups[g.id] = g.id === groupId;
        const next = { ...prev, groups: nextGroups };
        globeRef.current?.setDisplay(next);
        return next;
      });
      showToast(`Mostrando solo ${GROUP_BY_ID[groupId]?.label || groupId}`);
    },
    [showToast]
  );

  const handleShowAll = useCallback(() => {
    setDisplay((prev) => {
      const nextGroups: Record<string, boolean> = {};
      for (const g of GROUPS) nextGroups[g.id] = true;
      const next = { ...prev, groups: nextGroups };
      globeRef.current?.setDisplay(next);
      return next;
    });
    showToast("Mostrando todos los satélites activos");
  }, [showToast]);

  const handleFocusIss = useCallback(() => {
    const iss = satellites.find((s) => s.noradId === 25544);
    if (iss) handleSelectSatellite(iss.index, true);
  }, [satellites, handleSelectSatellite]);

  // Initial Boot
  useEffect(() => {
    let unmounted = false;

    async function initApp() {
      if (!viewportRef.current) return;

      setBootStatus("Cargando catálogo orbital de CelesTrak");
      const globe = new Globe(viewportRef.current, {
        onHover: (index: number | null) => {
          if (index === null || index === undefined) {
            setHoverInfo({ satellite: null, position: null, altitude: null });
            viewportRef.current?.classList.remove("hovering-satellite");
          } else {
            const list = satellitesRef.current;
            const sat = list[index] || null;
            const pos = globe.screenPosition(index);
            const alt = globe.altitudeOf(index);
            setHoverInfo({ satellite: sat, position: pos, altitude: alt });
            if (pos?.visible) viewportRef.current?.classList.add("hovering-satellite");
          }
        },
        onSelect: (index: number | null) => {
          handleSelectSatelliteRef.current(index, true);
        },
        onFollowChange: (val: boolean) => {
          setIsFollowing(val);
        },
      });
      globeRef.current = globe;
      await globe.init();

      let payload: any;
      try {
        const resp = await fetch("/api/gp", { headers: { Accept: "application/json" } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        payload = await resp.json();
      } catch {
        const fallback = await fetch("/data/gp-fallback.json");
        payload = await fallback.json();
      }

      let cityList: CityInfo[] = [];
      try {
        const cResp = await fetch("/data/cities.json");
        if (cResp.ok) cityList = await cResp.json();
      } catch {
        /* ignore */
      }

      if (unmounted) return;

      setCities(cityList);
      setMeta(payload.meta);
      const prep = prepareCatalog(payload.satellites);
      satellitesRef.current = prep.satellites;
      setSatellites(prep.satellites);
      setCounts(prep.counts);

      globe.setCatalog(prep.satellites);
      globe.setTime(Date.now());
      globe.applyVisibility();

      setBootStatus(`Iniciando ${prep.satellites.length} órbitas SGP4`);
      const runtime = new PositionRuntime(prep.satellites, (positions, valid, timeMs) => {
        globe.updatePositions(positions, valid, timeMs);
      });
      runtimeRef.current = runtime;
      const { ready, first } = runtime.start();
      await ready;
      runtime.update(Date.now());
      await first;

      if (location) {
        globe.setLocation(location);
        startPassScan(location, prep.satellites);
      } else {
        setWelcomeOpen(true);
        setWelcomeMode("first");
      }

      setBooted(true);

      globe.setReducedMotion(settings.reducedMotion);
      if (location) {
        globe.startIntro(location.lat, location.lon);
      } else {
        globe.startIntro();
      }

      // Expose test hooks on window
      (window as any).__ORBITAL_WATCH__ = {
        ready: true,
        get satelliteCount() {
          return prep.satellites.length;
        },
        get location() {
          return location;
        },
      };
    }

    initApp().catch((err) => {
      console.error(err);
      setBootStatus(`No se pudo iniciar: ${err.message}. Comprueba la caché de datos.`);
    });

    return () => {
      unmounted = true;
      runtimeRef.current?.terminate();
      passWorkerRef.current?.terminate();
    };
  }, []);

  // Sync Globe display options
  useEffect(() => {
    if (globeRef.current && booted) {
      globeRef.current.setDisplay(display);
    }
  }, [display, booted]);

  // Main animation / simulation tick loop
  useEffect(() => {
    if (!booted) return;
    let animId: number;
    let prevWall = performance.now();
    let lastPositionUpdate = 0;
    let lastSunUpdate = 0;
    let lastTelemetryUpdate = 0;
    let lastOrbitUpdate = 0;
    let lastLabelUpdate = 0;

    const tick = (now: number) => {
      const deltaSec = Math.min(1, (now - prevWall) / 1000);
      prevWall = now;

      // Update simulation time
      setSimTime((currentSimTime) => {
        let nextSim = currentSimTime;
        if (playing) {
          if (isLive) {
            nextSim = Date.now();
          } else {
            nextSim += deltaSec * 1000 * speed;
          }
        }

        if (isLive) {
          setTimelineCenter(Date.now());
        }

        // Send position updates to worker
        const interval = speed >= 1000 ? 50 : speed >= 100 ? 80 : speed >= 10 ? 130 : 260;
        if (runtimeRef.current && now - lastPositionUpdate > interval) {
          lastPositionUpdate = now;
          runtimeRef.current.update(nextSim);
        }

        // Update sun orientation
        if (globeRef.current && Math.abs(nextSim - lastSunUpdate) > 500) {
          lastSunUpdate = nextSim;
          globeRef.current.setTime(nextSim);
        }

        // Update selected orbit line & ground track
        if (selectedIndex !== null && globeRef.current) {
          const orbitInterval = speed >= 100 ? 160 : speed >= 10 ? 400 : 1500;
          if (now - lastOrbitUpdate > orbitInterval) {
            lastOrbitUpdate = now;
            const sat = satellites[selectedIndex];
            if (sat) buildSelectionGeometry(sat, nextSim);
          }
        }

        // Update telemetry
        if (selectedIndex !== null && now - lastTelemetryUpdate > 250) {
          lastTelemetryUpdate = now;
          const sat = satellites[selectedIndex];
          if (sat) computeTelemetry(sat, nextSim);
        }

        return nextSim;
      });

      // Update 3D screen projected labels
      if (now - lastLabelUpdate > 450) {
        lastLabelUpdate = now;
        if (globeRef.current && display.labels) {
          const compact = window.innerWidth <= 760;
          const candidates: Satellite[] = [];
          if (selectedSat) candidates.push(selectedSat);
          const preferredNames = [
            "ISS (ZARYA)",
            "CSS (TIANHE)",
            "HST",
            "NOAA 20 (JPSS-1)",
            "GOES 19",
            "TIANZHOU-10",
            "CREW DRAGON 13",
            "STARLINK-1008",
          ];
          if (!compact) {
            for (const name of preferredNames) {
              const s = satellites.find((cand) => cand.name === name);
              if (s && !candidates.includes(s) && display.groups[s.group]) {
                candidates.push(s);
              }
            }
          }
          const list: ProjectedLabel[] = [];
          for (const s of candidates.slice(0, compact ? 1 : 14)) {
            const pt = globeRef.current.screenPosition(s.index);
            if (!pt || !pt.visible) continue;
            list.push({
              sat: s,
              x: pt.x,
              y: pt.y,
              transform: compact && pt.x > window.innerWidth - 130 ? "translate(calc(-100% - 8px), -50%)" : undefined,
            });
            if (list.length >= (compact ? 1 : 8)) break;
          }
          setProjectedLabels(list);
        } else {
          setProjectedLabels([]);
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [
    booted,
    playing,
    isLive,
    speed,
    selectedIndex,
    satellites,
    selectedSat,
    display.labels,
    display.groups,
    buildSelectionGeometry,
    computeTelemetry,
  ]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (e.key === "Escape") {
        if (skyViewOpen) {
          setSkyViewOpen(false);
          return;
        }
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (activeSheet) {
          setActiveSheet(null);
          return;
        }
        if (welcomeOpen && welcomeMode === "change") {
          setWelcomeOpen(false);
          return;
        }
      }

      if (isTyping || welcomeOpen || skyViewOpen || helpOpen || paletteOpen || settingsOpen) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleGoNow();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        handleToggleFollow();
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleToggleOverlay("orbits");
      } else if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        handleToggleOverlay("labels");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    skyViewOpen,
    helpOpen,
    paletteOpen,
    settingsOpen,
    activeSheet,
    welcomeOpen,
    welcomeMode,
    handleGoNow,
    handleToggleFollow,
    handleToggleOverlay,
  ]);

  return (
    <div id="app">
      {/* 3D Viewport */}
      <div ref={viewportRef} id="viewport" aria-hidden="true"></div>
      <div id="sceneShade" aria-hidden="true"></div>

      {/* Top Bar */}
      <TopBar
        settings={settings}
        satCount={satellites.length}
        meta={meta}
        onOpenPalette={() => setPaletteOpen(true)}
        onShare={handleShare}
        onToggleNight={() => setSettings((s) => ({ ...s, nightVision: !s.nightVision }))}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />

      {/* Left Dock (Layers & Satellite details) */}
      <LeftDock
        satellites={satellites}
        counts={counts}
        display={display}
        selectedSatellite={selectedSat}
        selectedPass={selectedPass}
        selectedPassStatus={selectedPassStatus}
        telemetry={telemetry}
        isFollowing={isFollowing}
        settings={settings}
        locationName={location?.name || null}
        onToggleGroup={handleToggleGroup}
        onToggleOverlay={handleToggleOverlay}
        onToggleBand={handleToggleBand}
        onCloseCard={() => handleSelectSatellite(null)}
        onToggleFollow={handleToggleFollow}
        onShowOrbit={handleShowOrbit}
        isNotificationEnabled={selectedSat ? notifiedNorads.includes(selectedSat.noradId) : false}
        onToggleNotification={handleToggleNotification}
      />

      {/* Right Panel (Tonight Passes) */}
      <RightPanel
        locationName={location?.name || null}
        locationCountry={location?.country}
        passes={passes}
        scanStatus={scanStatus}
        spotlightPass={spotlightPass}
        settings={settings}
        onChangeLocation={() => {
          setWelcomeMode("change");
          setWelcomeOpen(true);
        }}
        onOpenPass={handleOpenPass}
        onSavePass={handleSaveCalendar}
      />

      {/* Bottom Timeline */}
      <TimelineDock
        playing={playing}
        isLive={isLive}
        speed={speed}
        simTime={simTime}
        timelineCenter={timelineCenter}
        passes={passes}
        settings={settings}
        onTogglePlay={() => setPlaying(!playing)}
        onGoNow={handleGoNow}
        onSetSpeed={handleSetSpeed}
        onScrub={handleScrub}
      />

      {/* Mobile Bottom Navigation & Sheets */}
      <MobileNav
        activeSheet={activeSheet}
        hasSatelliteSelected={selectedIndex !== null}
        onOpenSheet={(sheet) => setActiveSheet(sheet)}
        onCloseSheet={() => setActiveSheet(null)}
      />

      {/* Projected 2D World Labels & Hover Tooltip */}
      <WorldLabels labels={projectedLabels} />
      <HoverTooltip
        satellite={hoverInfo.satellite}
        position={hoverInfo.position}
        altitude={hoverInfo.altitude}
        settings={settings}
      />

      {/* Toast Notification */}
      {toast && (
        <div id="toast" className="toast glass" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {/* Initial Boot Loading Screen */}
      <BootScreen booted={booted} status={bootStatus} />

      {/* Welcome / Location Picker Modal */}
      {welcomeOpen && (
        <WelcomeModal
          mode={welcomeMode}
          cities={cities}
          currentLocation={location}
          onSelectLocation={(loc, isFirst) => {
            setWelcomeOpen(false);
            setLocation(loc, { fly: true, firstRun: isFirst });
          }}
          onClose={() => setWelcomeOpen(false)}
        />
      )}

      {/* Command Palette Modal */}
      {paletteOpen && (
        <CommandPaletteModal
          satellites={satellites}
          cities={cities}
          onClose={() => setPaletteOpen(false)}
          onSelectSatellite={(sat) => handleSelectSatellite(sat.index, true)}
          onSelectCity={(city) =>
            setLocation(
              {
                name: city.name,
                admin: city.admin,
                country: city.country,
                lat: city.lat,
                lon: city.lon,
              },
              { fly: true, firstRun: false }
            )
          }
          onGoNow={handleGoNow}
          onSoloGroup={handleSoloGroup}
          onShowAll={handleShowAll}
          onFocusIss={handleFocusIss}
          onToggleNight={() => setSettings((s) => ({ ...s, nightVision: !s.nightVision }))}
          onToggleOverlay={(overlay) => handleToggleOverlay(overlay as keyof DisplayOptions)}
          onOpenSettings={() => {
            setPaletteOpen(false);
            setSettingsOpen(true);
          }}
          onOpenHelp={() => {
            setPaletteOpen(false);
            setHelpOpen(true);
          }}
        />
      )}

      {/* Settings Popover */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdate={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Help Modal */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Interactive Sky Dome Modal */}
      {skyViewOpen && skyPass && (
        <SkyViewModal
          pass={skyPass}
          satellite={satellites.find((s) => s.noradId === skyPass.noradId) || null}
          locationName={location?.name || null}
          path={skyPathData}
          settings={settings}
          onClose={() => setSkyViewOpen(false)}
          onSaveCalendar={() => handleSaveCalendar(skyPass)}
        />
      )}
    </div>
  );
};
export default App;
