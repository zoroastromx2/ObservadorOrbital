import { ommToSatrec } from "../lib/sgp4.js";
import { findPasses, observerFromLocation } from "../lib/passes.js";

let cancelled = false;

function serializePass(pass) {
  return {
    noradId: pass.noradId,
    name: pass.name,
    group: pass.group,
    riseMs: pass.riseMs,
    setMs: pass.setMs,
    startMs: pass.startMs,
    endMs: pass.endMs,
    peakMs: pass.peakMs,
    peakElevation: pass.peakElevation,
    peakAzimuth: pass.peakAzimuth,
    startAzimuth: pass.startAzimuth,
    endAzimuth: pass.endAzimuth,
    magnitude: pass.magnitude,
    rangeKm: pass.rangeKm,
    durationSec: pass.durationSec,
  };
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "start") {
    cancelled = false;
    const { satellites, location, startMs, endMs } = message;
    const observer = observerFromLocation(location.lat, location.lon, 0);
    const records = new Array(satellites.length);
    for (let i = 0; i < satellites.length; i += 1) {
      records[i] = ommToSatrec(satellites[i]);
    }

    const allPasses = [];
    let scanned = 0;
    const batchSize = 300;
    let searchingBeyond = false;

    const scanBeyond = () => {
      if (cancelled) return;
      const horizonEnd = endMs + 6 * 86400000;
      let nextBeyond = null;
      const count = Math.min(2000, satellites.length);
      for (let i = 0; i < count; i += 1) {
        if (cancelled) return;
        try {
          const passes = findPasses(records[i], satellites[i], observer, endMs, horizonEnd, {
            stepMs: 180000,
            maxPasses: 1,
          });
          if (passes.length && (!nextBeyond || passes[0].startMs < nextBeyond.startMs)) {
            nextBeyond = serializePass(passes[0]);
          }
        } catch {
          /* A single bad element must not stop the sky scan. */
        }
      }
      self.postMessage({
        type: "passes",
        passes: [],
        scanned: satellites.length,
        total: satellites.length,
        totalFound: 0,
        done: true,
        searchingBeyond: false,
        nextBeyond,
      });
    };

    const scan = () => {
      if (cancelled) return;
      const batchEnd = Math.min(satellites.length, scanned + batchSize);
      for (let i = scanned; i < batchEnd; i += 1) {
        const satellite = satellites[i];
        let passes = [];
        try {
          passes = findPasses(records[i], satellite, observer, startMs, endMs, {
            stepMs: 120000,
            maxPasses: 2,
          });
        } catch {
          passes = [];
        }
        for (const pass of passes) allPasses.push(serializePass(pass));
      }
      scanned = batchEnd;
      allPasses.sort((a, b) => a.startMs - b.startMs);
      const complete = scanned >= satellites.length;
      if (complete && allPasses.length === 0 && !searchingBeyond) {
        searchingBeyond = true;
        self.postMessage({
          type: "passes",
          passes: [],
          scanned,
          total: satellites.length,
          totalFound: 0,
          done: false,
          searchingBeyond: true,
          nextBeyond: null,
        });
        setTimeout(scanBeyond, 0);
        return;
      }
      const done = complete && !searchingBeyond;
      self.postMessage({
        type: "passes",
        passes: allPasses.slice(0, 320),
        scanned,
        total: satellites.length,
        totalFound: allPasses.length,
        done,
        searchingBeyond,
      });
      if (!done) setTimeout(scan, 0);
    };
    scan();
  }
  if (message.type === "cancel") {
    cancelled = true;
  }
};
