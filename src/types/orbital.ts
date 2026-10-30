export interface Satellite {
  noradId: number;
  name: string;
  objectId?: string;
  epoch?: string;
  meanMotion: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argOfPerigee: number;
  meanAnomaly: number;
  bstar: number;
  index: number;
  group: "stations" | "gps" | "weather" | "starlink" | "other";
  color: string;
  periodMin: number;
  semiMajorKm: number;
  perigeeAlt: number;
  orbitClass: "low" | "medium" | "geostationary";
}

export interface SatellitePass {
  noradId: number;
  name: string;
  group: string;
  riseMs: number;
  setMs: number;
  startMs: number;
  endMs: number;
  peakMs: number;
  peakElevation: number;
  peakAzimuth: number;
  startAzimuth: number;
  endAzimuth: number;
  magnitude: number;
  rangeKm: number;
  durationSec: number;
}

export interface LocationInfo {
  name: string;
  admin?: string;
  country?: string;
  lat: number;
  lon: number;
}

export interface CityInfo {
  name: string;
  admin?: string;
  country: string;
  lat: number;
  lon: number;
  pop?: number;
}

export interface UserSettings {
  units: "metric" | "imperial";
  clock: "12" | "24";
  reducedMotion: boolean;
  nightVision: boolean;
}

export interface DisplayOptions {
  orbits: boolean;
  trails: boolean;
  labels: boolean;
  cityLights: boolean;
  groups: Record<string, boolean>;
  bands: {
    low: boolean;
    medium: boolean;
    geostationary: boolean;
  };
}

export interface PassScanStatus {
  scanned: number;
  total: number;
  done: boolean;
  totalFound: number;
  searchingBeyond?: boolean;
  nextBeyond?: SatellitePass | null;
  startedAt?: number;
}

export interface SkyState {
  open: boolean;
  pass: SatellitePass | null;
  path: Array<{ timeMs: number; azimuth: number; elevation: number }>;
  satellite: Satellite | null;
  satrec: any | null;
  playing: boolean;
  startedWall: number;
  pausedFraction: number;
  lastPoint: { timeMs: number; azimuth: number; elevation: number } | null;
}
