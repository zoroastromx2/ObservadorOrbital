import {
  propagateAtMs,
  gstime,
  julianFromUnixMs,
  sunEciFromJulian,
  temeToEcef,
} from "./sgp4.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_RADIUS_KM = 6378.135;

export function observerFromLocation(latDeg, lonDeg, elevationM = 0) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const a = 6378.137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const h = elevationM / 1000;
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const position = [
    (n + h) * cosLat * cosLon,
    (n + h) * cosLat * sinLon,
    (n * (1 - e2) + h) * sinLat,
  ];
  const up = [cosLat * cosLon, cosLat * sinLon, sinLat];
  const east = [-sinLon, cosLon, 0];
  const north = [-sinLat * cosLon, -sinLat * sinLon, cosLat];
  return {
    lat: latDeg,
    lon: lonDeg,
    elevationM,
    position,
    up,
    east,
    north,
  };
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function satelliteLook(rec, timeMs, observer) {
  const state = propagateAtMs(rec, timeMs);
  if (!state) return null;
  const jd = julianFromUnixMs(timeMs);
  const ecef = temeToEcef(state.position, jd);
  const dx = ecef[0] - observer.position[0];
  const dy = ecef[1] - observer.position[1];
  const dz = ecef[2] - observer.position[2];
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!range) return null;
  const up = (dx * observer.up[0] + dy * observer.up[1] + dz * observer.up[2]) / range;
  const east = (dx * observer.east[0] + dy * observer.east[1] + dz * observer.east[2]) / range;
  const north = (dx * observer.north[0] + dy * observer.north[1] + dz * observer.north[2]) / range;
  let azimuth = Math.atan2(east, north) * RAD;
  if (azimuth < 0) azimuth += 360;
  return {
    elevation: Math.asin(Math.max(-1, Math.min(1, up))) * RAD,
    azimuth,
    range,
    ecef,
    eci: state.position,
    velocity: state.velocity,
    timeMs,
  };
}

function elevationAt(rec, timeMs, observer) {
  const state = propagateAtMs(rec, timeMs);
  if (!state) return -90;
  const jd = julianFromUnixMs(timeMs);
  const ecef = temeToEcef(state.position, jd);
  const dx = ecef[0] - observer.position[0];
  const dy = ecef[1] - observer.position[1];
  const dz = ecef[2] - observer.position[2];
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!range) return -90;
  const up = (dx * observer.up[0] + dy * observer.up[1] + dz * observer.up[2]) / range;
  return Math.asin(Math.max(-1, Math.min(1, up))) * RAD;
}

function isSatelliteSunlit(eci, sunEci) {
  const along = dot(eci, sunEci);
  if (along >= 0) return true;
  const r2 = dot(eci, eci);
  const perpendicular2 = r2 - along * along;
  return perpendicular2 >= EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

function observerSunAltitude(timeMs, observer) {
  const jd = julianFromUnixMs(timeMs);
  const sunEcef = temeToEcef(sunEciFromJulian(jd), jd);
  return Math.asin(Math.max(-1, Math.min(1, dot(sunEcef, observer.up)))) * RAD;
}

function visibleAt(rec, timeMs, observer) {
  const sat = satelliteLook(rec, timeMs, observer);
  if (!sat || sat.elevation <= 0) return false;
  const sunAlt = observerSunAltitude(timeMs, observer);
  if (sunAlt > -6) return false;
  const sunEci = sunEciFromJulian(julianFromUnixMs(timeMs));
  return isSatelliteSunlit(sat.eci, sunEci);
}

function refineHorizon(rec, lowMs, highMs, observer) {
  let lo = lowMs;
  let hi = highMs;
  const lowRising = elevationAt(rec, lo, observer) <= 0;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    const above = elevationAt(rec, mid, observer) > 0;
    if (above === lowRising) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function refineVisibility(rec, lowMs, highMs, observer) {
  let lo = lowMs;
  let hi = highMs;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    if (visibleAt(rec, mid, observer)) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function searchVisibleBoundary(rec, fromMs, toMs, observer) {
  if (visibleAt(rec, fromMs, observer)) return fromMs;
  if (!visibleAt(rec, toMs, observer)) return toMs;
  return refineVisibility(rec, fromMs, toMs, observer);
}

function refinePeak(rec, lowMs, highMs, observer) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = lowMs;
  let b = highMs;
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  for (let i = 0; i < 22; i += 1) {
    if (elevationAt(rec, c, observer) > elevationAt(rec, d, observer)) b = d;
    else a = c;
    c = b - phi * (b - a);
    d = a + phi * (b - a);
  }
  const t = (a + b) / 2;
  return { timeMs: t, elevation: elevationAt(rec, t, observer) };
}

function absoluteMagnitude(sat) {
  const name = sat.name.toUpperCase();
  if (name === "ISS (ZARYA)" || name === "ISS") return -1.8;
  if (name.startsWith("CSS") || name.includes("TIANHE")) return -1.5;
  if (name === "HST") return 1.5;
  if (sat.group === "stations") return 0.0;
  if (sat.group === "starlink") return 4.8;
  if (sat.group === "gps") return 4.0;
  if (sat.group === "weather") return 3.0;
  return 4.3;
}

function estimateMagnitude(satellite, satLook, observer, sunEcef) {
  const range = satLook.range;
  const toObs = [
    observer.position[0] - satLook.ecef[0],
    observer.position[1] - satLook.ecef[1],
    observer.position[2] - satLook.ecef[2],
  ];
  const lenObs = Math.sqrt(dot(toObs, toObs));
  const cosPhase =
    (toObs[0] * sunEcef[0] + toObs[1] * sunEcef[1] + toObs[2] * sunEcef[2]) /
    Math.max(1e-9, lenObs);
  const phase = Math.acos(Math.max(-1, Math.min(1, cosPhase)));
  const phaseFactor = Math.max(0.03, (Math.sin(phase) + (Math.PI - phase) * Math.cos(phase)) / Math.PI);
  const base = absoluteMagnitude(satellite);
  return base + 5 * Math.log10(range / 1000) - 2.5 * Math.log10(phaseFactor);
}

function buildPass(rec, satellite, observer, riseMs, setMs, peak, stepMs) {
  const peakLook = satelliteLook(rec, peak.timeMs, observer);
  if (!peakLook || peak.elevation < 10) return null;
  const jd = julianFromUnixMs(peak.timeMs);
  const sunEci = sunEciFromJulian(jd);
  if (!isSatelliteSunlit(peakLook.eci, sunEci)) return null;
  const sunAlt = observerSunAltitude(peak.timeMs, observer);
  if (sunAlt > -6) return null;
  if (!visibleAt(rec, peak.timeMs, observer)) return null;

  const scanLow = Math.max(riseMs, peak.timeMs - stepMs * 4);
  let visibleStart = peak.timeMs;
  if (!visibleAt(rec, riseMs + 1, observer)) {
    const boundary = searchVisibleBoundary(rec, riseMs + 1, peak.timeMs, observer);
    visibleStart = boundary;
  } else {
    visibleStart = riseMs;
  }
  const scanHigh = Math.min(setMs, peak.timeMs + stepMs * 4);
  let visibleEnd = setMs;
  if (!visibleAt(rec, setMs - 1, observer)) {
    let lo = peak.timeMs;
    let hi = setMs - 1;
    for (let i = 0; i < 14; i += 1) {
      const mid = (lo + hi) / 2;
      if (visibleAt(rec, mid, observer)) lo = mid;
      else hi = mid;
    }
    visibleEnd = (lo + hi) / 2;
  }
  if (visibleEnd - visibleStart < 30000) return null;

  const startLook = satelliteLook(rec, visibleStart, observer);
  const endLook = satelliteLook(rec, visibleEnd, observer);
  const sunEcef = temeToEcef(sunEci, jd);
  const magnitude = estimateMagnitude(satellite, peakLook, observer, sunEcef);
  if (magnitude > 6.5) return null;
  return {
    noradId: satellite.noradId,
    name: satellite.name,
    group: satellite.group,
    riseMs,
    setMs,
    startMs: visibleStart,
    endMs: visibleEnd,
    peakMs: peak.timeMs,
    peakElevation: peak.elevation,
    peakAzimuth: peakLook.azimuth,
    startAzimuth: startLook ? startLook.azimuth : peakLook.azimuth,
    endAzimuth: endLook ? endLook.azimuth : peakLook.azimuth,
    magnitude,
    rangeKm: peakLook.range,
    durationSec: (visibleEnd - visibleStart) / 1000,
    sunAltitude: sunAlt,
    observer,
  };
}

export function findPasses(rec, satellite, observer, startMs, endMs, options = {}) {
  const stepMs = options.stepMs || 120000;
  const maxPasses = options.maxPasses || 8;
  const passes = [];
  let prevT = startMs - stepMs;
  let prevElev = elevationAt(rec, prevT, observer);
  let inPass = false;
  let riseMs = 0;
  let peakMs = 0;
  let peakElevation = -90;

  for (let t = startMs; t <= endMs; t += stepMs) {
    const elev = elevationAt(rec, t, observer);
    if (!inPass && prevElev <= 0 && elev > 0) {
      inPass = true;
      riseMs = refineHorizon(rec, prevT, t, observer);
      peakMs = t;
      peakElevation = elev;
    } else if (inPass && elev > peakElevation) {
      peakMs = t;
      peakElevation = elev;
    }
    if (inPass && elev <= 0 && prevElev > 0) {
      const setMs = refineHorizon(rec, t - stepMs, t, observer);
      const peak = refinePeak(
        rec,
        Math.max(riseMs, peakMs - stepMs),
        Math.min(setMs, peakMs + stepMs),
        observer
      );
      const pass = buildPass(rec, satellite, observer, riseMs, setMs, peak, stepMs);
      if (pass) passes.push(pass);
      inPass = false;
      if (passes.length >= maxPasses) break;
    }
    prevT = t;
    prevElev = elev;
  }

  if (inPass && passes.length < maxPasses) {
    const setMs = endMs;
    const peak = refinePeak(
      rec,
      Math.max(riseMs, peakMs - stepMs),
      Math.min(setMs, peakMs + stepMs),
      observer
    );
    const pass = buildPass(rec, satellite, observer, riseMs, setMs, peak, stepMs);
    if (pass) passes.push(pass);
  }
  return passes;
}

export function skyPath(rec, pass, observer, count = 72) {
  const points = [];
  const start = pass.startMs ?? pass.riseMs;
  const end = pass.endMs ?? pass.setMs;
  for (let i = 0; i <= count; i += 1) {
    const t = start + ((end - start) * i) / count;
    const look = satelliteLook(rec, t, observer);
    if (!look || look.elevation < -0.5) continue;
    points.push({
      timeMs: t,
      azimuth: look.azimuth,
      elevation: Math.max(0, look.elevation),
      range: look.range,
    });
  }
  return points;
}

export function nextPassForSatellite(rec, satellite, observer, startMs, days = 7) {
  const endMs = startMs + days * 86400000;
  const passes = findPasses(rec, satellite, observer, startMs, endMs, {
    stepMs: 60000,
    maxPasses: 1,
  });
  return passes[0] || null;
}
