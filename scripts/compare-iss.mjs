import fs from "node:fs";
import path from "node:path";
import {
  ommToSatrec,
  propagateAtMs,
  temeToEcef,
  julianFromUnixMs,
} from "../src/lib/sgp4.js";

const cache = JSON.parse(fs.readFileSync("data/gp-cache.json", "utf8"));
const iss = cache.satellites.find((sat) => sat.noradId === 25544);
if (!iss) throw new Error("ISS not present in the local CelesTrak cache");

const response = await fetch("https://api.wheretheiss.at/v1/satellites/25544", {
  headers: { "User-Agent": "OrbitalWatch/1.0 ISS verification" },
});
if (!response.ok) throw new Error(`Independent source returned HTTP ${response.status}`);
const independent = await response.json();
const timestamp = independent.timestamp * 1000;
const state = propagateAtMs(ommToSatrec(iss), timestamp);
const ecef = temeToEcef(state.position, julianFromUnixMs(timestamp));

const a = 6378.137;
const f = 1 / 298.257223563;
const e2 = f * (2 - f);

function geodeticToEcef(latDeg, lonDeg, altitudeKm) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [
    (n + altitudeKm) * Math.cos(lat) * Math.cos(lon),
    (n + altitudeKm) * Math.cos(lat) * Math.sin(lon),
    (n * (1 - e2) + altitudeKm) * Math.sin(lat),
  ];
}

function ecefToGeodetic(position) {
  const r = Math.hypot(position[0], position[1]);
  const lon = Math.atan2(position[1], position[0]);
  let lat = Math.atan2(position[2], r * (1 - e2));
  let altitude = 0;
  for (let i = 0; i < 4; i += 1) {
    const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    altitude = r / Math.cos(lat) - n;
    lat = Math.atan2(position[2] + n * e2 * Math.sin(lat), r);
  }
  return {
    lat: (lat * 180) / Math.PI,
    lon: (lon * 180) / Math.PI,
    altitude,
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const oursGeo = ecefToGeodetic(ecef);
const independentEcef = geodeticToEcef(
  independent.latitude,
  independent.longitude,
  independent.altitude
);
const positionDeltaKm = Math.hypot(
  ecef[0] - independentEcef[0],
  ecef[1] - independentEcef[1],
  ecef[2] - independentEcef[2]
);
const groundDeltaKm = haversineKm(
  oursGeo.lat,
  oursGeo.lon,
  independent.latitude,
  independent.longitude
);

const result = {
  source: "wheretheiss.at public ISS API",
  sourceUrl: "https://api.wheretheiss.at/v1/satellites/25544",
  comparedAtUtc: new Date(timestamp).toISOString(),
  tleEpochUtc: iss.epoch,
  ours: {
    latitude: Number(oursGeo.lat.toFixed(4)),
    longitude: Number(oursGeo.lon.toFixed(4)),
    altitudeKm: Number(oursGeo.altitude.toFixed(1)),
  },
  independent: {
    latitude: independent.latitude,
    longitude: independent.longitude,
    altitudeKm: independent.altitude,
  },
  difference: {
    positionKm: Number(positionDeltaKm.toFixed(2)),
    groundTrackKm: Number(groundDeltaKm.toFixed(2)),
    altitudeKm: Number(Math.abs(oursGeo.altitude - independent.altitude).toFixed(2)),
  },
};

fs.mkdirSync("proof", { recursive: true });
fs.writeFileSync(path.join("proof", "iss-comparison.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
