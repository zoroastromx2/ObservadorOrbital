const EARTH_GP_FIELDS = {
  OBJECT_NAME: "name",
  OBJECT_ID: "objectId",
  EPOCH: "epoch",
  MEAN_MOTION: "meanMotion",
  ECCENTRICITY: "eccentricity",
  INCLINATION: "inclination",
  RA_OF_ASC_NODE: "raan",
  ARG_OF_PERICENTER: "argPerigee",
  MEAN_ANOMALY: "meanAnomaly",
  NORAD_CAT_ID: "noradId",
  BSTAR: "bstar",
  MEAN_MOTION_DOT: "meanMotionDot",
  MEAN_MOTION_DDOT: "meanMotionDdot",
  EPHEMERIS_TYPE: "ephemerisType",
  ELEMENT_SET_NO: "elementSetNo",
  REV_AT_EPOCH: "revAtEpoch",
};

export function normalizeOmm(raw) {
  const sat = {};
  for (const [source, target] of Object.entries(EARTH_GP_FIELDS)) {
    sat[target] = raw[source];
  }
  sat.name = String(sat.name || "UNKNOWN").trim();
  sat.objectId = String(sat.objectId || "").trim();
  sat.noradId = Number(sat.noradId);
  sat.epoch = String(sat.epoch);
  if (!sat.epoch.endsWith("Z")) sat.epoch += "Z";
  sat.meanMotion = Number(sat.meanMotion);
  sat.eccentricity = Number(sat.eccentricity);
  sat.inclination = Number(sat.inclination);
  sat.raan = Number(sat.raan);
  sat.argPerigee = Number(sat.argPerigee);
  sat.meanAnomaly = Number(sat.meanAnomaly);
  sat.bstar = Number(sat.bstar) || 0;
  sat.meanMotionDot = Number(sat.meanMotionDot) || 0;
  sat.meanMotionDdot = Number(sat.meanMotionDdot) || 0;
  sat.ephemerisType = Number(sat.ephemerisType) || 0;
  sat.elementSetNo = Number(sat.elementSetNo) || 0;
  sat.revAtEpoch = Number(sat.revAtEpoch) || 0;
  return sat;
}

export function normalizeGpPayload(raw) {
  if (!Array.isArray(raw)) throw new Error("CelesTrak GP payload was not an array");
  const satellites = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || !item.OBJECT_NAME || !item.NORAD_CAT_ID) continue;
    const sat = normalizeOmm(item);
    if (!Number.isFinite(sat.noradId) || !Number.isFinite(sat.meanMotion)) continue;
    if (seen.has(sat.noradId)) continue;
    seen.add(sat.noradId);
    satellites.push(sat);
  }
  if (satellites.length < 1000) {
    throw new Error(`CelesTrak returned only ${satellites.length} usable records`);
  }
  return satellites;
}
