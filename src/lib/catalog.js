export const GROUPS = [
  { id: "stations", label: "Estaciones espaciales", color: "#D55E00", short: "Estaciones" },
  { id: "gps", label: "GPS / Navegación", color: "#56B4E9", short: "GPS" },
  { id: "weather", label: "Meteorológicos", color: "#009E73", short: "Clima" },
  { id: "starlink", label: "Starlink", color: "#E69F00", short: "Starlink" },
  { id: "other", label: "Otros", color: "#9AA7BA", short: "Otros" },
];

export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((group) => [group.id, group]));
export const ACCENT = "#F6C453";

const STATION_RE =
  /^(ISS|CSS|TIANHE|WENTIAN|MENGTIAN|TIANZHOU|SHENZHOU|PROGRESS-MS|SOYUZ-MS|POISK$|NAUKA$|PRICHAL$|RASSVET$|CYGNUS|HTV|CREW DRAGON|DRAGON CRS)/i;
const WEATHER_RE =
  /^(NOAA|GOES|EWS-G|DMSP|METEOR|METOP|FENGYUN|FY-|HIMAWARI|METEOSAT|ELEKTRO-L|SUOMI|JPSS|SENTINEL|LANDSAT|OCEANSAT|EOS-6|SCATSAT|SARAL|GRACE|SWARM|SMAP|JASON|OSTM|CFOSAT|HY-|HAIYANG|ICESAT|CLOUDSAT|CALIPSO|SCISAT|AQUARIUS|TERRASAR)/i;
const GPS_RE = /\bGPS\b|NAVSTAR/i;

export function classifyGroup(sat) {
  const name = String(sat.name || "").toUpperCase();
  if (name.includes("STARLINK")) return "starlink";
  if (STATION_RE.test(name)) return "stations";
  if (GPS_RE.test(name)) return "gps";
  if (WEATHER_RE.test(name) || name === "TERRA" || name === "AQUA" || name === "AURA") {
    return "weather";
  }
  return "other";
}

export function orbitDetails(sat) {
  const periodMin = 1440 / sat.meanMotion;
  const periodSec = periodMin * 60;
  const mu = 398600.8;
  const a = Math.cbrt(mu * (periodSec / (2 * Math.PI)) ** 2);
  const perigeeAlt = a * (1 - sat.eccentricity) - 6378.135;
  let orbitClass = "medium";
  if (periodMin >= 1380 && periodMin <= 1500 && sat.eccentricity < 0.25) {
    orbitClass = "geostationary";
  } else if (perigeeAlt < 2000) {
    orbitClass = "low";
  }
  return { periodMin, semiMajorKm: a, perigeeAlt, orbitClass };
}

export function prepareCatalog(satellites) {
  const counts = Object.fromEntries(GROUPS.map((group) => [group.id, 0]));
  const prepared = satellites.map((sat, index) => {
    const group = classifyGroup(sat);
    counts[group] += 1;
    const details = orbitDetails(sat);
    return {
      ...sat,
      index,
      group,
      color: GROUP_BY_ID[group].color,
      ...details,
    };
  });
  prepared.sort((a, b) => {
    const priority = { stations: 0, weather: 1, gps: 2, other: 3, starlink: 4 };
    return priority[a.group] - priority[b.group] || a.noradId - b.noradId;
  });
  prepared.forEach((sat, index) => {
    sat.index = index;
  });
  return { satellites: prepared, counts };
}

export function groupCounts(satellites) {
  const counts = Object.fromEntries(GROUPS.map((group) => [group.id, 0]));
  for (const sat of satellites) counts[sat.group] += 1;
  return counts;
}

export function nearestCity(cities, lat, lon) {
  let best = null;
  let bestDistance = Infinity;
  for (const city of cities) {
    const dLat = (city.lat - lat) * Math.PI / 180;
    const dLon = (city.lon - lon) * Math.PI / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * Math.PI / 180) *
        Math.cos(city.lat * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    const d = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    if (d < bestDistance) {
      bestDistance = d;
      best = city;
    }
  }
  return { city: best, distanceKm: bestDistance };
}
