const LOCALE = "es-ES";

export function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

export function formatClock(date, use24Hour = true, seconds = true) {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hour12: !use24Hour,
  }).format(date);
}

export function formatUtcClock(date, use24Hour = true) {
  const text = new Intl.DateTimeFormat(LOCALE, {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !use24Hour,
  }).format(date);
  return text;
}

export function formatDay(date) {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatDayLong(date) {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatShortDate(date) {
  return new Intl.DateTimeFormat(LOCALE, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatTime(date, use24Hour = true) {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24Hour,
  }).format(date);
}

export function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

export function dayTag(date) {
  const now = new Date();
  if (sameLocalDay(date, now)) return "Hoy";
  if (sameLocalDay(date, addDays(now, 1))) return "Mañana";
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short" }).format(date);
}

export function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  let total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  total %= 86400;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${pad(secs)}s`;
}

export function formatAge(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat(LOCALE).format(value);
}

export function formatAltitude(altKm, imperial) {
  if (imperial) return `${formatNumber(Math.round(altKm * 0.621371))} mi`;
  return `${formatNumber(Math.round(altKm))} km`;
}

export function formatSpeed(speedKmS, imperial) {
  if (imperial) return `${formatNumber(Math.round(speedKmS * 2236.936))} mph`;
  return `${speedKmS.toFixed(2)} km/s`;
}

export function formatDistance(km, imperial) {
  if (imperial) return `${formatNumber(Math.round(km * 0.621371))} mi`;
  return `${formatNumber(Math.round(km))} km`;
}

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
];

export function compassDirection(azimuth) {
  return COMPASS_16[Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16];
}

export function azimuthLabel(azimuth) {
  return `${compassDirection(azimuth)} ${Math.round((azimuth + 360) % 360)}°`;
}

export function brightnessLabel(magnitude) {
  if (magnitude <= 0.5) return "Muy brillante";
  if (magnitude <= 2.5) return "Brillante";
  if (magnitude <= 4.2) return "Visible";
  return "Tenue";
}

export function magnitudeLabel(magnitude) {
  return `${magnitude > 0 ? "+" : "−"}${Math.abs(magnitude).toFixed(1)} mag`;
}

export function toIcsDate(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(pass, city) {
  const start = toIcsDate(pass.startMs);
  const end = toIcsDate(pass.endMs);
  const stamp = toIcsDate(Date.now());
  const escape = (value) =>
    String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const title = escape(`Paso de ${pass.name} sobre ${city}`);
  const description = escape(
    `Elevación máxima ${pass.peakElevation.toFixed(0)}° · ` +
      `${compassDirection(pass.peakAzimuth)} · ${magnitudeLabel(pass.magnitude)}. ` +
      `Paso visible calculado por Orbital Watch a partir de datos GP de CelesTrak.`
  );
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Orbital Watch//Satellite Passes//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${pass.noradId}-${pass.startMs}@orbital-watch.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function icsFilename(pass) {
  const safe = pass.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const date = new Date(pass.startMs).toISOString().slice(0, 10);
  return `orbital-watch-${safe}-${date}.ics`;
}
