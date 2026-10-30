# SGP4 verification fixtures

- `SGP4-VER.TLE` and `*.e`: official verification cases distributed with
  Vallado, Crawford, Hujsak & Kelso, *Revisiting Spacetrack Report #3*,
  AIAA 2006-6753.
- The files were obtained from the official `AIAA-2006-6753.zip` package linked
  from CelesTrak's software archive:
  <https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753.zip>.
- `ReadMe.txt` is the original test-directory readme.
- Case 33334 is a deliberately pathological mean-motion case. The reference
  driver substitutes the previous valid line for its epoch state; Orbital Watch
  asserts that SGP4 rejects it instead of inventing a position.

The ephemeris vectors are compared in km in the TEME frame against the
implementation in `src/lib/sgp4.js`.
