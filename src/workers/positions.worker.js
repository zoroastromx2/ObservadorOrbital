import {
  gstime,
  julianFromUnixMs,
  ommToSatrec,
  propagateAtMs,
  temeToEcef,
} from "../lib/sgp4.js";

let records = [];

function updatePositions(timeMs) {
  const count = records.length;
  const positions = new Float32Array(count * 3);
  const valid = new Uint8Array(count);
  const jd = julianFromUnixMs(timeMs);
  const theta = gstime(jd);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  for (let i = 0; i < count; i += 1) {
    const state = propagateAtMs(records[i], timeMs);
    if (!state) continue;
    const x = c * state.position[0] + s * state.position[1];
    const y = -s * state.position[0] + c * state.position[1];
    const z = state.position[2];
    const offset = i * 3;
    positions[offset] = x / 6378.135;
    positions[offset + 1] = z / 6378.135;
    positions[offset + 2] = -y / 6378.135;
    valid[i] = 1;
  }
  self.postMessage({ type: "positions", timeMs, positions, valid }, [
    positions.buffer,
    valid.buffer,
  ]);
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    records = message.satellites.map((sat) => ommToSatrec(sat));
    self.postMessage({ type: "ready", count: records.length });
    return;
  }
  if (message.type === "update") {
    updatePositions(message.timeMs);
  }
};
