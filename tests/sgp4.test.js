import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { twoline2rv, sgp4, gstime, dateToJulian } from "../src/lib/sgp4.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(HERE, "fixtures", "sgp4");
const TLE_TEXT = fs.readFileSync(path.join(FIXTURE_DIR, "SGP4-VER.TLE"), "utf8");
const TLE_LINES = TLE_TEXT.split(/\r?\n/);

function tleForSatellite(satnum) {
  const index = TLE_LINES.findIndex((line) => line.startsWith(`1 ${satnum}`));
  if (index < 0) throw new Error(`No verification TLE for ${satnum}`);
  return [TLE_LINES[index], TLE_LINES[index + 1]];
}

function readEphemeris(file) {
  const text = fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => /^\s*[-\d]/.test(line))
    .map((line) => line.trim().split(/\s+/).map(Number));
}

test("all Vallado 2006 verification vectors are within 1 km", () => {
  const files = fs.readdirSync(FIXTURE_DIR).filter((file) => file.endsWith(".e"));
  assert.equal(files.length, 32);
  let vectors = 0;
  let worst = { error: 0, satnum: null, time: null };
  const rejected = [];

  for (const file of files) {
    const satnum = file.slice(0, -2);
    const [line1, line2] = tleForSatellite(satnum);
    const satrec = twoline2rv(line1, line2, "a");
    const rows = readEphemeris(file);
    let caseWorst = 0;

    for (const row of rows) {
      const seconds = row[0];
      const expected = row.slice(1, 4);
      const state = sgp4(satrec, seconds / 60);
      if (!state) {
        rejected.push({ satnum, seconds });
        continue;
      }
      const error = Math.hypot(
        state.position[0] - expected[0],
        state.position[1] - expected[1],
        state.position[2] - expected[2]
      );
      caseWorst = Math.max(caseWorst, error);
      vectors += 1;
      if (error > worst.error) worst = { error, satnum, time: seconds };
      assert.ok(
        error < 1.0,
        `${satnum} at t=${seconds}s missed by ${error.toFixed(6)} km`
      );
    }
    assert.ok(caseWorst < 1.0, `${satnum} exceeded 1 km`);
  }

  // 33334 is the intentional pathological mean-motion case in the 2006 suite.
  // The reference client reports "(Use previous data line)" for its epoch state.
  assert.deepEqual(rejected, [{ satnum: "33334", seconds: 0 }]);
  assert.ok(vectors === 640, `expected 640 validation vectors, got ${vectors}`);
  assert.ok(worst.error < 1.0);
  console.log(
    `SGP4 verification: ${vectors} vectors across ${files.length - 1} cases, ` +
      `maximum error ${worst.error.toExponential(3)} km (${worst.satnum}, t=${worst.time}s)`
  );
});

test("the pathological 33334 case is identified as invalid", () => {
  const [line1, line2] = tleForSatellite("33334");
  const satrec = twoline2rv(line1, line2, "a");
  const state = sgp4(satrec, 0);
  assert.equal(state, null);
  assert.ok(satrec.error === 3 || satrec.error === 4);
});

test("Greenwich sidereal time matches the published Julian-date example", () => {
  assert.ok(Math.abs(gstime(2451545.0) - 4.894961212823) < 1e-10);
  assert.ok(Math.abs(dateToJulian(new Date("2000-01-01T12:00:00Z")) - 2451545.0) < 1e-9);
});
