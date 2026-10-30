/*
 * SGP4 / SDP4 implementation from the equations published in
 * Vallado, Crawford, Hujsak & Kelso, "Revisiting Spacetrack Report #3",
 * AIAA 2006-6753. WGS-72 gravity constants, AFSPC operation mode.
 *
 * Distances are kilometres, velocities kilometres/second, angles radians,
 * and times minutes from the element epoch.
 */

export const PI = Math.PI;
export const TWOPI = 2.0 * Math.PI;
export const DEG2RAD = PI / 180.0;
export const RAD2DEG = 180.0 / PI;

const X2O3 = 2.0 / 3.0;

const GRAV = {
  mu: 398600.8,
  radiusearthkm: 6378.135,
  xke: 60.0 / Math.sqrt((6378.135 * 6378.135 * 6378.135) / 398600.8),
  j2: 0.001082616,
  j3: -0.00000253881,
  j4: -0.00000165597,
};
GRAV.j3oj2 = GRAV.j3 / GRAV.j2;
GRAV.tumin = 1.0 / GRAV.xke;

function posMod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function cos(x) { return Math.cos(x); }
function sin(x) { return Math.sin(x); }
function sqrt(x) { return Math.sqrt(x); }
function fabs(x) { return Math.abs(x); }
function pow(x, y) { return Math.pow(x, y); }
function atan2(y, x) { return Math.atan2(y, x); }

export function gstime(jdut1) {
  const tut1 = (jdut1 - 2451545.0) / 36525.0;
  let temp =
    -6.2e-6 * tut1 * tut1 * tut1 +
    0.093104 * tut1 * tut1 +
    (876600.0 * 3600 + 8640184.812866) * tut1 +
    67310.54841;
  temp = ((temp * DEG2RAD) / 240.0) % TWOPI;
  if (temp < 0.0) temp += TWOPI;
  return temp;
}

export function jday(year, mon, day, hr, minute, sec) {
  return (
    367.0 * year -
    Math.floor((7 * (year + Math.floor((mon + 9) / 12.0))) * 0.25) +
    Math.floor((275 * mon) / 9.0) +
    day +
    1721013.5 +
    ((sec / 60.0 + minute) / 60.0 + hr) / 24.0
  );
}

export function dateToJulian(date) {
  const sec = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;
  return jday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    sec
  );
}

function parseExp(field) {
  const s = field.trim().replace(/\s+/g, "");
  if (!s || s === "0" || s === "00000+0" || s === "00000-0") return 0.0;
  const match = s.match(/^([+-]?)(\d+)([+-]\d+)$/);
  if (!match) return Number(s) || 0.0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * Number(`0.${match[2]}`) * Math.pow(10, Number(match[3]));
}

function parseTleEpoch(line1) {
  const yy = Number(line1.substring(18, 20));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const day = Number(line1.substring(20, 32));
  return { year, day, jd: jday(year, 1, 0, 0, 0, 0) + day };
}

export function twoline2rv(line1, line2, opsmode = "a") {
  const satrec = {};
  satrec.satnum = line1.substring(2, 7).trim();
  satrec.classification = line1[7] || "U";
  satrec.intldesg = line1.substring(9, 17).trim();
  const epoch = parseTleEpoch(line1);
  satrec.jdsatepoch = epoch.jd;
  satrec.epochdays = epoch.day;
  satrec.epochYear = epoch.year;
  satrec.epoch = epoch.jd - 2433281.5;

  satrec.ndot = Number(line1.substring(33, 43)) || 0.0;
  satrec.nddot = parseExp(line1.substring(44, 52));
  satrec.bstar = parseExp(line1.substring(53, 61));
  satrec.ephtype = Number(line1.substring(62, 63)) || 0;
  satrec.elnum = Number(line1.substring(64, 68)) || 0;

  satrec.inclo = Number(line2.substring(8, 16)) * DEG2RAD;
  satrec.nodeo = Number(line2.substring(17, 25)) * DEG2RAD;
  satrec.ecco = Number(`0.${line2.substring(26, 33).trim()}`);
  satrec.argpo = Number(line2.substring(34, 42)) * DEG2RAD;
  satrec.mo = Number(line2.substring(43, 51)) * DEG2RAD;
  const revPerDay = Number(line2.substring(52, 63));
  satrec.no_kozai = (revPerDay * TWOPI) / 1440.0;
  satrec.revnum = Number(line2.substring(63, 68)) || 0;

  return sgp4init(satrec, opsmode);
}

export function ommToSatrec(omm, opsmode = "a") {
  const epoch = new Date(omm.epoch.includes("Z") ? omm.epoch : `${omm.epoch}Z`);
  const satrec = {
    satnum: String(omm.noradCatId),
    classification: "U",
    intldesg: omm.objectId || "",
    jdsatepoch: dateToJulian(epoch),
    epochYear: epoch.getUTCFullYear(),
    epochMs: epoch.getTime(),
    ndot: omm.meanMotionDot || 0.0,
    nddot: omm.meanMotionDdot || 0.0,
    bstar: omm.bstar || 0.0,
    ephtype: omm.ephemerisType || 0,
    elnum: omm.elementSetNo || 0,
    inclo: omm.inclination * DEG2RAD,
    nodeo: omm.raan * DEG2RAD,
    ecco: omm.eccentricity,
    argpo: omm.argPerigee * DEG2RAD,
    mo: omm.meanAnomaly * DEG2RAD,
    no_kozai: (omm.meanMotion * TWOPI) / 1440.0,
    revnum: omm.revAtEpoch || 0,
  };
  satrec.epoch = satrec.jdsatepoch - 2433281.5;
  return sgp4init(satrec, opsmode);
}

function initl(satrec) {
  const { xke, j2 } = GRAV;
  const eccsq = satrec.ecco * satrec.ecco;
  const omeosq = 1.0 - eccsq;
  const rteosq = sqrt(omeosq);
  const cosio = cos(satrec.inclo);
  const cosio2 = cosio * cosio;
  let no = satrec.no_kozai;

  const ak = pow(xke / no, X2O3);
  const d1 = (0.75 * j2 * (3.0 * cosio2 - 1.0)) / (rteosq * omeosq);
  let del = d1 / (ak * ak);
  const adel = ak * (1.0 - del * del - del * (1.0 / 3.0 + (134.0 * del * del) / 81.0));
  del = d1 / (adel * adel);
  no = no / (1.0 + del);

  const ao = pow(xke / no, X2O3);
  const sinio = sin(satrec.inclo);
  const po = ao * omeosq;
  const con42 = 1.0 - 5.0 * cosio2;
  const con41 = -con42 - cosio2 - cosio2;
  const ainv = 1.0 / ao;
  const posq = po * po;
  const rp = ao * (1.0 - satrec.ecco);

  let gsto;
  if (satrec.operationmode === "a") {
    const ts70 = satrec.epoch - 7305.0;
    const ds70 = Math.floor(ts70 + 1.0e-8);
    const tfrac = ts70 - ds70;
    const c1 = 1.72027916940703639e-2;
    const thgr70 = 1.7321343856509374;
    const fk5r = 5.07551419432269442e-15;
    const c1p2p = c1 + TWOPI;
    gsto = (thgr70 + c1 * ds70 + c1p2p * tfrac + ts70 * ts70 * fk5r) % TWOPI;
    if (gsto < 0.0) gsto += TWOPI;
  } else {
    gsto = gstime(satrec.epoch + 2433281.5);
  }

  return {
    no,
    ainv,
    ao,
    con41,
    con42,
    cosio,
    cosio2,
    eccsq,
    omeosq,
    posq,
    rp,
    rteosq,
    sinio,
    gsto,
  };
}

function dpper(satrec, inclo, init, inp) {
  const e3 = satrec.e3;
  const ee2 = satrec.ee2;
  const se2 = satrec.se2;
  const se3 = satrec.se3;
  const sgh2 = satrec.sgh2;
  const sgh3 = satrec.sgh3;
  const sgh4 = satrec.sgh4;
  const sh2 = satrec.sh2;
  const sh3 = satrec.sh3;
  const si2 = satrec.si2;
  const si3 = satrec.si3;
  const sl2 = satrec.sl2;
  const sl3 = satrec.sl3;
  const sl4 = satrec.sl4;
  const t = satrec.t;
  const xgh2 = satrec.xgh2;
  const xgh3 = satrec.xgh3;
  const xgh4 = satrec.xgh4;
  const xh2 = satrec.xh2;
  const xh3 = satrec.xh3;
  const xi2 = satrec.xi2;
  const xi3 = satrec.xi3;
  const xl2 = satrec.xl2;
  const xl3 = satrec.xl3;
  const xl4 = satrec.xl4;

  const zns = 1.19459e-5;
  const zes = 0.01675;
  const znl = 1.5835218e-4;
  const zel = 0.0549;

  let zm = satrec.zmos + zns * t;
  if (init === "y") zm = satrec.zmos;
  let zf = zm + 2.0 * zes * sin(zm);
  let sinzf = sin(zf);
  let f2 = 0.5 * sinzf * sinzf - 0.25;
  let f3 = -0.5 * sinzf * cos(zf);
  const ses = se2 * f2 + se3 * f3;
  const sis = si2 * f2 + si3 * f3;
  const sls = sl2 * f2 + sl3 * f3 + sl4 * sinzf;
  const sghs = sgh2 * f2 + sgh3 * f3 + sgh4 * sinzf;
  const shs = sh2 * f2 + sh3 * f3;
  zm = satrec.zmol + znl * t;
  if (init === "y") zm = satrec.zmol;
  zf = zm + 2.0 * zel * sin(zm);
  sinzf = sin(zf);
  f2 = 0.5 * sinzf * sinzf - 0.25;
  f3 = -0.5 * sinzf * cos(zf);
  const sel = ee2 * f2 + e3 * f3;
  const sil = xi2 * f2 + xi3 * f3;
  const sll = xl2 * f2 + xl3 * f3 + xl4 * sinzf;
  const sghl = xgh2 * f2 + xgh3 * f3 + xgh4 * sinzf;
  const shll = xh2 * f2 + xh3 * f3;

  let pe = ses + sel;
  let pinc = sis + sil;
  let pl = sls + sll;
  let pgh = sghs + sghl;
  let ph = shs + shll;
  let ep = inp.ep;
  let inclp = inp.inclp;
  let nodep = inp.nodep;
  let argpp = inp.argpp;
  let mp = inp.mp;

  if (init === "n") {
    pe -= satrec.peo;
    pinc -= satrec.pinco;
    pl -= satrec.plo;
    pgh -= satrec.pgho;
    ph -= satrec.pho;
    inclp += pinc;
    ep += pe;
    const sinip = sin(inclp);
    const cosip = cos(inclp);

    if (inclp >= 0.2) {
      ph /= sinip;
      pgh -= cosip * ph;
      argpp += pgh;
      nodep += ph;
      mp += pl;
    } else {
      const sinop = sin(nodep);
      const cosop = cos(nodep);
      let alfdp = sinip * sinop;
      let betdp = sinip * cosop;
      const dalf = ph * cosop + pinc * cosip * sinop;
      const dbet = -ph * sinop + pinc * cosip * cosop;
      alfdp += dalf;
      betdp += dbet;
      nodep = posMod(nodep, TWOPI);
      if (nodep < 0.0 && satrec.operationmode === "a") nodep += TWOPI;
      let xls = mp + argpp + pl + pgh + (cosip - pinc * sinip) * nodep;
      const xnoh = nodep;
      nodep = atan2(alfdp, betdp);
      if (nodep < 0.0 && satrec.operationmode === "a") nodep += TWOPI;
      if (fabs(xnoh - nodep) > PI) {
        if (nodep < xnoh) nodep += TWOPI;
        else nodep -= TWOPI;
      }
      mp += pl;
      argpp = xls - mp - cosip * nodep;
    }
  }

  return { ep, inclp, nodep, argpp, mp };
}

function dscom(satrec, epoch, ep, argpp, tc, inclp, nodep, np) {
  const zes = 0.01675;
  const zel = 0.0549;
  const c1ss = 2.9864797e-6;
  const c1l = 4.7968065e-7;
  const zsinis = 0.39785416;
  const zcosis = 0.91744867;
  const zcosgs = 0.1945905;
  const zsings = -0.98088458;

  const nm = np;
  const em = ep;
  const snodm = sin(nodep);
  const cnodm = cos(nodep);
  const sinomm = sin(argpp);
  const cosomm = cos(argpp);
  const sinim = sin(inclp);
  const cosim = cos(inclp);
  const emsq = em * em;
  const betasq = 1.0 - emsq;
  const rtemsq = sqrt(betasq);

  let peo = 0.0;
  let pinco = 0.0;
  let plo = 0.0;
  let pgho = 0.0;
  let pho = 0.0;

  const day = epoch + 18261.5 + tc / 1440.0;
  const xnodce = posMod(4.523602 - 9.2422029e-4 * day, TWOPI);
  const stem = sin(xnodce);
  const ctem = cos(xnodce);
  const zcosil = 0.91375164 - 0.03568096 * ctem;
  const zsinil = sqrt(1.0 - zcosil * zcosil);
  const zsinhl = (0.089683511 * stem) / zsinil;
  const zcoshl = sqrt(1.0 - zsinhl * zsinhl);
  const gam = 5.8351514 + 0.001944368 * day;
  let zx = (0.39785416 * stem) / zsinil;
  const zy = zcoshl * ctem + 0.91744867 * zsinhl * stem;
  zx = atan2(zx, zy);
  zx = gam + zx - xnodce;
  const zcosgl = cos(zx);
  const zsingl = sin(zx);

  let zcosg = zcosgs;
  let zsing = zsings;
  let zcosi = zcosis;
  let zsini = zsinis;
  let zcosh = cnodm;
  let zsinh = snodm;
  let cc = c1ss;
  const xnoi = 1.0 / nm;

  let ss1 = 0, ss2 = 0, ss3 = 0, ss4 = 0, ss5 = 0, ss6 = 0, ss7 = 0;
  let sz1 = 0, sz2 = 0, sz3 = 0;
  let sz11 = 0, sz12 = 0, sz13 = 0;
  let sz21 = 0, sz22 = 0, sz23 = 0;
  let sz31 = 0, sz32 = 0, sz33 = 0;
  let z1 = 0, z2 = 0, z3 = 0;
  let z11 = 0, z12 = 0, z13 = 0;
  let z21 = 0, z22 = 0, z23 = 0;
  let z31 = 0, z32 = 0, z33 = 0;
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, s6 = 0, s7 = 0;

  for (let lsflg = 1; lsflg <= 2; lsflg += 1) {
    const a1 = zcosg * zcosh + zsing * zcosi * zsinh;
    const a3 = -zsing * zcosh + zcosg * zcosi * zsinh;
    const a7 = -zcosg * zsinh + zsing * zcosi * zcosh;
    const a8 = zsing * zsini;
    const a9 = zsing * zsinh + zcosg * zcosi * zcosh;
    const a10 = zcosg * zsini;
    const a2 = cosim * a7 + sinim * a8;
    const a4 = cosim * a9 + sinim * a10;
    const a5 = -sinim * a7 + cosim * a8;
    const a6 = -sinim * a9 + cosim * a10;

    const x1 = a1 * cosomm + a2 * sinomm;
    const x2 = a3 * cosomm + a4 * sinomm;
    const x3 = -a1 * sinomm + a2 * cosomm;
    const x4 = -a3 * sinomm + a4 * cosomm;
    const x5 = a5 * sinomm;
    const x6 = a6 * sinomm;
    const x7 = a5 * cosomm;
    const x8 = a6 * cosomm;

    z31 = 12.0 * x1 * x1 - 3.0 * x3 * x3;
    z32 = 24.0 * x1 * x2 - 6.0 * x3 * x4;
    z33 = 12.0 * x2 * x2 - 3.0 * x4 * x4;
    z1 = 3.0 * (a1 * a1 + a2 * a2) + z31 * emsq;
    z2 = 6.0 * (a1 * a3 + a2 * a4) + z32 * emsq;
    z3 = 3.0 * (a3 * a3 + a4 * a4) + z33 * emsq;
    z11 = -6.0 * a1 * a5 + emsq * (-24.0 * x1 * x7 - 6.0 * x3 * x5);
    z12 =
      -6.0 * (a1 * a6 + a3 * a5) +
      emsq * (-24.0 * (x2 * x7 + x1 * x8) - 6.0 * (x3 * x6 + x4 * x5));
    z13 = -6.0 * a3 * a6 + emsq * (-24.0 * x2 * x8 - 6.0 * x4 * x6);
    z21 = 6.0 * a2 * a5 + emsq * (24.0 * x1 * x5 - 6.0 * x3 * x7);
    z22 =
      6.0 * (a4 * a5 + a2 * a6) +
      emsq * (24.0 * (x2 * x5 + x1 * x6) - 6.0 * (x4 * x7 + x3 * x8));
    z23 = 6.0 * a4 * a6 + emsq * (24.0 * x2 * x6 - 6.0 * x4 * x8);
    z1 = z1 + z1 + betasq * z31;
    z2 = z2 + z2 + betasq * z32;
    z3 = z3 + z3 + betasq * z33;
    s3 = cc * xnoi;
    s2 = (-0.5 * s3) / rtemsq;
    s4 = s3 * rtemsq;
    s1 = -15.0 * em * s4;
    s5 = x1 * x3 + x2 * x4;
    s6 = x2 * x3 + x1 * x4;
    s7 = x2 * x4 - x1 * x3;

    if (lsflg === 1) {
      ss1 = s1;
      ss2 = s2;
      ss3 = s3;
      ss4 = s4;
      ss5 = s5;
      ss6 = s6;
      ss7 = s7;
      sz1 = z1;
      sz2 = z2;
      sz3 = z3;
      sz11 = z11;
      sz12 = z12;
      sz13 = z13;
      sz21 = z21;
      sz22 = z22;
      sz23 = z23;
      sz31 = z31;
      sz32 = z32;
      sz33 = z33;
      zcosg = zcosgl;
      zsing = zsingl;
      zcosi = zcosil;
      zsini = zsinil;
      zcosh = zcoshl * cnodm + zsinhl * snodm;
      zsinh = snodm * zcoshl - cnodm * zsinhl;
      cc = c1l;
    }
  }

  satrec.zmol = posMod(4.7199672 + 0.2299715 * day - gam, TWOPI);
  satrec.zmos = posMod(6.2565837 + 0.017201977 * day, TWOPI);
  satrec.peo = peo;
  satrec.pinco = pinco;
  satrec.plo = plo;
  satrec.pgho = pgho;
  satrec.pho = pho;

  satrec.se2 = 2.0 * ss1 * ss6;
  satrec.se3 = 2.0 * ss1 * ss7;
  satrec.si2 = 2.0 * ss2 * sz12;
  satrec.si3 = 2.0 * ss2 * (sz13 - sz11);
  satrec.sl2 = -2.0 * ss3 * sz2;
  satrec.sl3 = -2.0 * ss3 * (sz3 - sz1);
  satrec.sl4 = -2.0 * ss3 * (-21.0 - 9.0 * emsq) * zes;
  satrec.sgh2 = 2.0 * ss4 * sz32;
  satrec.sgh3 = 2.0 * ss4 * (sz33 - sz31);
  satrec.sgh4 = -18.0 * ss4 * zes;
  satrec.sh2 = -2.0 * ss2 * sz22;
  satrec.sh3 = -2.0 * ss2 * (sz23 - sz21);

  satrec.ee2 = 2.0 * s1 * s6;
  satrec.e3 = 2.0 * s1 * s7;
  satrec.xi2 = 2.0 * s2 * z12;
  satrec.xi3 = 2.0 * s2 * (z13 - z11);
  satrec.xl2 = -2.0 * s3 * z2;
  satrec.xl3 = -2.0 * s3 * (z3 - z1);
  satrec.xl4 = -2.0 * s3 * (-21.0 - 9.0 * emsq) * zel;
  satrec.xgh2 = 2.0 * s4 * z32;
  satrec.xgh3 = 2.0 * s4 * (z33 - z31);
  satrec.xgh4 = -18.0 * s4 * zel;
  satrec.xh2 = -2.0 * s2 * z22;
  satrec.xh3 = -2.0 * s2 * (z23 - z21);

  return {
    snodm, cnodm, sinim, cosim, sinomm, cosomm, day, em, emsq,
    rtemsq, s1, s2, s3, s4, s5, s6, s7, ss1, ss2, ss3, ss4, ss5,
    ss6, ss7, sz1, sz2, sz3, sz11, sz12, sz13, sz21, sz22, sz23,
    sz31, sz32, sz33, z1, z2, z3, z11, z12, z13, z21, z22, z23,
    z31, z32, z33, nm,
  };
}

function dsinit(satrec, cosim, emsq, argpo, s1, s2, s3, s4, s5, sinim,
  ss1, ss2, ss3, ss4, ss5, sz1, sz3, sz11, sz13, sz21, sz23, sz31, sz33,
  t, tc, gsto, mo, mdot, no, nodeo, nodedot, xpidot,
  z1, z3, z11, z13, z21, z23, z31, z33, ecco, eccsq,
  em, argpm, inclm, mm, nm, nodem, irez) {
  const q22 = 1.7891679e-6;
  const q31 = 2.1460748e-6;
  const q33 = 2.2123015e-7;
  const root22 = 1.7891679e-6;
  const root44 = 7.3636953e-9;
  const root54 = 2.1765803e-9;
  const rptim = 4.37526908801129966e-3;
  const root32 = 3.7393792e-7;
  const root52 = 1.1428639e-7;
  const znl = 1.5835218e-4;
  const zns = 1.19459e-5;
  const xke = GRAV.xke;

  let d2201 = 0, d2211 = 0, d3210 = 0, d3222 = 0, d4410 = 0, d4422 = 0;
  let d5220 = 0, d5232 = 0, d5421 = 0, d5433 = 0;
  let dedt = 0, didt = 0, dmdt = 0, dndt = 0, dnodt = 0, domdt = 0;
  let del1 = 0, del2 = 0, del3 = 0, xfact = 0, xlamo = 0, xli = 0, xni = 0;
  let atime = 0;

  irez = 0;
  if (nm > 0.0034906585 && nm < 0.0052359877) irez = 1;
  if (nm >= 8.26e-3 && nm <= 9.24e-3 && em >= 0.5) irez = 2;

  const ses = ss1 * zns * ss5;
  const sis = ss2 * zns * (sz11 + sz13);
  const sls = -zns * ss3 * (sz1 + sz3 - 14.0 - 6.0 * emsq);
  const sghs = ss4 * zns * (sz31 + sz33 - 6.0);
  let shs = -zns * ss2 * (sz21 + sz23);
  if (inclm < 5.2359877e-2 || inclm > PI - 5.2359877e-2) shs = 0.0;
  if (sinim !== 0.0) shs = shs / sinim;
  const sgs = sghs - cosim * shs;

  dedt = ses + s1 * znl * s5;
  didt = sis + s2 * znl * (z11 + z13);
  dmdt = sls - znl * s3 * (z1 + z3 - 14.0 - 6.0 * emsq);
  const sghl = s4 * znl * (z31 + z33 - 6.0);
  let shll = -znl * s2 * (z21 + z23);
  if (inclm < 5.2359877e-2 || inclm > PI - 5.2359877e-2) shll = 0.0;
  domdt = sgs + sghl;
  dnodt = shs;
  if (sinim !== 0.0) {
    domdt -= (cosim / sinim) * shll;
    dnodt += shll / sinim;
  }

  dndt = 0.0;
  const theta = posMod(gsto + tc * rptim, TWOPI);
  em += dedt * t;
  inclm += didt * t;
  argpm += domdt * t;
  nodem += dnodt * t;
  mm += dmdt * t;

  if (irez !== 0) {
    const aonv = pow(nm / xke, X2O3);

    if (irez === 2) {
      const cosisq = cosim * cosim;
      const emo = em;
      const emsqo = emsq;
      em = ecco;
      emsq = eccsq;
      const eoc = em * emsq;
      const g201 = -0.306 - (em - 0.64) * 0.44;
      let g211, g310, g322, g410, g422, g520;
      if (em <= 0.65) {
        g211 = 3.616 - 13.247 * em + 16.29 * emsq;
        g310 = -19.302 + 117.39 * em - 228.419 * emsq + 156.591 * eoc;
        g322 = -18.9068 + 109.7927 * em - 214.6334 * emsq + 146.5816 * eoc;
        g410 = -41.122 + 242.694 * em - 471.094 * emsq + 313.953 * eoc;
        g422 = -146.407 + 841.88 * em - 1629.014 * emsq + 1083.435 * eoc;
        g520 = -532.114 + 3017.977 * em - 5740.032 * emsq + 3708.276 * eoc;
      } else {
        g211 = -72.099 + 331.819 * em - 508.738 * emsq + 266.724 * eoc;
        g310 = -346.844 + 1582.851 * em - 2415.925 * emsq + 1246.113 * eoc;
        g322 = -342.585 + 1554.908 * em - 2366.899 * emsq + 1215.972 * eoc;
        g410 = -1052.797 + 4758.686 * em - 7193.992 * emsq + 3651.957 * eoc;
        g422 = -3581.69 + 16178.11 * em - 24462.77 * emsq + 12422.52 * eoc;
        if (em > 0.715) {
          g520 = -5149.66 + 29936.92 * em - 54087.36 * emsq + 31324.56 * eoc;
        } else {
          g520 = 1464.74 - 4664.75 * em + 3763.64 * emsq;
        }
      }
      let g533, g521, g532;
      if (em < 0.7) {
        g533 = -919.2277 + 4988.61 * em - 9064.77 * emsq + 5542.21 * eoc;
        g521 = -822.71072 + 4568.6173 * em - 8491.4146 * emsq + 5337.524 * eoc;
        g532 = -853.666 + 4690.25 * em - 8624.77 * emsq + 5341.4 * eoc;
      } else {
        g533 = -37995.78 + 161616.52 * em - 229838.2 * emsq + 109377.94 * eoc;
        g521 = -51752.104 + 218913.95 * em - 309468.16 * emsq + 146349.42 * eoc;
        g532 = -40023.88 + 170470.89 * em - 242699.48 * emsq + 115605.82 * eoc;
      }

      const sini2 = sinim * sinim;
      const f220 = 0.75 * (1.0 + 2.0 * cosim + cosisq);
      const f221 = 1.5 * sini2;
      const f321 = 1.875 * sinim * (1.0 - 2.0 * cosim - 3.0 * cosisq);
      const f322 = -1.875 * sinim * (1.0 + 2.0 * cosim - 3.0 * cosisq);
      const f441 = 35.0 * sini2 * f220;
      const f442 = 39.375 * sini2 * sini2;
      const f522 =
        9.84375 * sinim *
        (sini2 * (1.0 - 2.0 * cosim - 5.0 * cosisq) +
          0.33333333 * (-2.0 + 4.0 * cosim + 6.0 * cosisq));
      const f523 =
        sinim *
        (4.92187512 * sini2 * (-2.0 - 4.0 * cosim + 10.0 * cosisq) +
          6.56250012 * (1.0 + 2.0 * cosim - 3.0 * cosisq));
      const f542 =
        29.53125 * sinim *
        (2.0 - 8.0 * cosim + cosisq * (-12.0 + 8.0 * cosim + 10.0 * cosisq));
      const f543 =
        29.53125 * sinim *
        (-2.0 - 8.0 * cosim + cosisq * (12.0 + 8.0 * cosim - 10.0 * cosisq));
      const xno2 = nm * nm;
      const ainv2 = aonv * aonv;
      let temp1 = 3.0 * xno2 * ainv2;
      let temp = temp1 * root22;
      d2201 = temp * f220 * g201;
      d2211 = temp * f221 * g211;
      temp1 *= aonv;
      temp = temp1 * root32;
      d3210 = temp * f321 * g310;
      d3222 = temp * f322 * g322;
      temp1 *= aonv;
      temp = 2.0 * temp1 * root44;
      d4410 = temp * f441 * g410;
      d4422 = temp * f442 * g422;
      temp1 *= aonv;
      temp = temp1 * root52;
      d5220 = temp * f522 * g520;
      d5232 = temp * f523 * g532;
      temp = 2.0 * temp1 * root54;
      d5421 = temp * f542 * g521;
      d5433 = temp * f543 * g533;
      xlamo = posMod(mo + nodeo + nodeo - theta - theta, TWOPI);
      xfact = mdot + dmdt + 2.0 * (nodedot + dnodt - rptim) - no;
      em = emo;
      emsq = emsqo;
    }

    if (irez === 1) {
      const g200 = 1.0 + emsq * (-2.5 + 0.8125 * emsq);
      const g310 = 1.0 + 2.0 * emsq;
      const g300 = 1.0 + emsq * (-6.0 + 6.60937 * emsq);
      const f220 = 0.75 * (1.0 + cosim) * (1.0 + cosim);
      const f311 = 0.9375 * sinim * sinim * (1.0 + 3.0 * cosim) - 0.75 * (1.0 + cosim);
      let f330 = 1.0 + cosim;
      f330 = 1.875 * f330 * f330 * f330;
      del1 = 3.0 * nm * nm * aonv * aonv;
      del2 = 2.0 * del1 * f220 * g200 * q22;
      del3 = 3.0 * del1 * f330 * g300 * q33 * aonv;
      del1 = del1 * f311 * g310 * q31 * aonv;
      xlamo = posMod(mo + nodeo + argpo - theta, TWOPI);
      xfact = mdot + xpidot - rptim + dmdt + domdt + dnodt - no;
    }

    xli = xlamo;
    xni = no;
    atime = 0.0;
    nm = no + dndt;
  }

  return {
    em, argpm, inclm, mm, nm, nodem, irez, atime, d2201, d2211,
    d3210, d3222, d4410, d4422, d5220, d5232, d5421, d5433,
    dedt, didt, dmdt, dndt, dnodt, domdt, del1, del2, del3,
    xfact, xlamo, xli, xni,
  };
}

function dspace(satrec, t, tc, gsto, atime, em, argpm, inclm, xli,
  mm, xni, nodem, nm) {
  const { irez, dedt, didt, dmdt, dnodt, domdt, argpo, argpdot,
    xfact, xlamo, d2201, d2211, d3210, d3222, d4410, d4422,
    d5220, d5232, d5421, d5433, del1, del2, del3 } = satrec;
  const fasx2 = 0.13130908;
  const fasx4 = 2.8843198;
  const fasx6 = 0.37448087;
  const g22 = 5.7686396;
  const g32 = 0.95240898;
  const g44 = 1.8014998;
  const g52 = 1.050833;
  const g54 = 4.4108898;
  const rptim = 4.37526908801129966e-3;
  const stepp = 720.0;
  const stepn = -720.0;
  const step2 = 259200.0;
  let dndt = 0.0;
  const theta = posMod(gsto + tc * rptim, TWOPI);
  em += dedt * t;
  inclm += didt * t;
  argpm += domdt * t;
  nodem += dnodt * t;
  mm += dmdt * t;

  let ft = 0.0;
  if (irez !== 0) {
    if (atime === 0.0 || t * atime <= 0.0 || fabs(t) < fabs(atime)) {
      atime = 0.0;
      xni = satrec.no_unkozai;
      xli = xlamo;
    }
    let delt = t > 0.0 ? stepp : stepn;
    let iretn = 381;
    let xndt = 0.0;
    let xldot = 0.0;
    let xnddt = 0.0;
    while (iretn === 381) {
      if (irez !== 2) {
        xndt =
          del1 * sin(xli - fasx2) +
          del2 * sin(2.0 * (xli - fasx4)) +
          del3 * sin(3.0 * (xli - fasx6));
        xldot = xni + xfact;
        xnddt =
          del1 * cos(xli - fasx2) +
          2.0 * del2 * cos(2.0 * (xli - fasx4)) +
          3.0 * del3 * cos(3.0 * (xli - fasx6));
        xnddt *= xldot;
      } else {
        const xomi = argpo + argpdot * atime;
        const x2omi = xomi + xomi;
        const x2li = xli + xli;
        xndt =
          d2201 * sin(x2omi + xli - g22) +
          d2211 * sin(xli - g22) +
          d3210 * sin(xomi + xli - g32) +
          d3222 * sin(-xomi + xli - g32) +
          d4410 * sin(x2omi + x2li - g44) +
          d4422 * sin(x2li - g44) +
          d5220 * sin(xomi + xli - g52) +
          d5232 * sin(-xomi + xli - g52) +
          d5421 * sin(xomi + x2li - g54) +
          d5433 * sin(-xomi + x2li - g54);
        xldot = xni + xfact;
        xnddt =
          d2201 * cos(x2omi + xli - g22) +
          d2211 * cos(xli - g22) +
          d3210 * cos(xomi + xli - g32) +
          d3222 * cos(-xomi + xli - g32) +
          d5220 * cos(xomi + xli - g52) +
          d5232 * cos(-xomi + xli - g52) +
          2.0 *
            (d4410 * cos(x2omi + x2li - g44) +
              d4422 * cos(x2li - g44) +
              d5421 * cos(xomi + x2li - g54) +
              d5433 * cos(-xomi + x2li - g54));
        xnddt *= xldot;
      }

      if (fabs(t - atime) >= stepp) {
        iretn = 381;
      } else {
        ft = t - atime;
        iretn = 0;
      }

      if (iretn === 381) {
        xli = xli + xldot * delt + xndt * step2;
        xni = xni + xndt * delt + xnddt * step2;
        atime += delt;
      }
    }

    nm = xni + xndt * ft + xnddt * ft * ft * 0.5;
    const xl = xli + xldot * ft + xndt * ft * ft * 0.5;
    if (irez !== 1) {
      mm = xl - 2.0 * nodem + 2.0 * theta;
      dndt = nm - satrec.no_unkozai;
    } else {
      mm = xl - nodem - argpm + theta;
      dndt = nm - satrec.no_unkozai;
    }
    nm = satrec.no_unkozai + dndt;
  }

  return { atime, em, argpm, inclm, xli, mm, xni, nodem, dndt, nm };
}

function sgp4init(satrec, opsmode) {
  const x2o3 = 2.0 / 3.0;
  const temp4 = 1.5e-12;
  satrec.operationmode = opsmode;
  satrec.error = 0;
  satrec.isimp = 0;
  satrec.method = "n";
  satrec.aycof = 0.0;
  satrec.con41 = 0.0;
  satrec.cc1 = 0.0;
  satrec.cc4 = 0.0;
  satrec.cc5 = 0.0;
  satrec.d2 = 0.0;
  satrec.d3 = 0.0;
  satrec.d4 = 0.0;
  satrec.delmo = 0.0;
  satrec.eta = 0.0;
  satrec.argpdot = 0.0;
  satrec.omgcof = 0.0;
  satrec.sinmao = 0.0;
  satrec.t = 0.0;
  satrec.t2cof = 0.0;
  satrec.t3cof = 0.0;
  satrec.t4cof = 0.0;
  satrec.t5cof = 0.0;
  satrec.x1mth2 = 0.0;
  satrec.x7thm1 = 0.0;
  satrec.mdot = 0.0;
  satrec.nodedot = 0.0;
  satrec.xlcof = 0.0;
  satrec.xmcof = 0.0;
  satrec.nodecf = 0.0;

  satrec.irez = 0;
  satrec.d2201 = 0.0;
  satrec.d2211 = 0.0;
  satrec.d3210 = 0.0;
  satrec.d3222 = 0.0;
  satrec.d4410 = 0.0;
  satrec.d4422 = 0.0;
  satrec.d5220 = 0.0;
  satrec.d5232 = 0.0;
  satrec.d5421 = 0.0;
  satrec.d5433 = 0.0;
  satrec.dedt = 0.0;
  satrec.del1 = 0.0;
  satrec.del2 = 0.0;
  satrec.del3 = 0.0;
  satrec.didt = 0.0;
  satrec.dmdt = 0.0;
  satrec.dnodt = 0.0;
  satrec.domdt = 0.0;
  satrec.e3 = 0.0;
  satrec.ee2 = 0.0;
  satrec.peo = 0.0;
  satrec.pgho = 0.0;
  satrec.pho = 0.0;
  satrec.pinco = 0.0;
  satrec.plo = 0.0;
  satrec.se2 = 0.0;
  satrec.se3 = 0.0;
  satrec.sgh2 = 0.0;
  satrec.sgh3 = 0.0;
  satrec.sgh4 = 0.0;
  satrec.sh2 = 0.0;
  satrec.sh3 = 0.0;
  satrec.si2 = 0.0;
  satrec.si3 = 0.0;
  satrec.sl2 = 0.0;
  satrec.sl3 = 0.0;
  satrec.sl4 = 0.0;
  satrec.gsto = 0.0;
  satrec.xfact = 0.0;
  satrec.xgh2 = 0.0;
  satrec.xgh3 = 0.0;
  satrec.xgh4 = 0.0;
  satrec.xh2 = 0.0;
  satrec.xh3 = 0.0;
  satrec.xi2 = 0.0;
  satrec.xi3 = 0.0;
  satrec.xl2 = 0.0;
  satrec.xl3 = 0.0;
  satrec.xl4 = 0.0;
  satrec.xlamo = 0.0;
  satrec.zmol = 0.0;
  satrec.zmos = 0.0;
  satrec.atime = 0.0;
  satrec.xli = 0.0;
  satrec.xni = 0.0;
  satrec.radiusearthkm = GRAV.radiusearthkm;
  satrec.xke = GRAV.xke;
  satrec.j2 = GRAV.j2;
  satrec.j3 = GRAV.j3;
  satrec.j4 = GRAV.j4;
  satrec.j3oj2 = GRAV.j3oj2;

  const ss = 78.0 / satrec.radiusearthkm + 1.0;
  const qzms2ttemp = (120.0 - 78.0) / satrec.radiusearthkm;
  const qzms2t = qzms2ttemp * qzms2ttemp * qzms2ttemp * qzms2ttemp;
  satrec.init = "y";
  satrec.t = 0.0;

  const ini = initl(satrec);
  satrec.no_unkozai = ini.no;
  satrec.method = "n";
  satrec.con41 = ini.con41;
  satrec.gsto = ini.gsto;
  const { ao, ainv, cosio, cosio2, eccsq, omeosq, posq, rp, rteosq, sinio } = ini;
  satrec.a = pow(satrec.no_unkozai * GRAV.tumin, -2.0 / 3.0);
  satrec.alta = satrec.a * (1.0 + satrec.ecco) - 1.0;
  satrec.altp = satrec.a * (1.0 - satrec.ecco) - 1.0;

  if (omeosq >= 0.0 || satrec.no_unkozai >= 0.0) {
    satrec.isimp = 0;
    if (rp < 220.0 / satrec.radiusearthkm + 1.0) satrec.isimp = 1;
    let sfour = ss;
    let qzms24 = qzms2t;
    const perige = (rp - 1.0) * satrec.radiusearthkm;
    if (perige < 156.0) {
      sfour = perige - 78.0;
      if (perige < 98.0) sfour = 20.0;
      const qzms24temp = (120.0 - sfour) / satrec.radiusearthkm;
      qzms24 = qzms24temp * qzms24temp * qzms24temp * qzms24temp;
      sfour = sfour / satrec.radiusearthkm + 1.0;
    }

    const pinvsq = 1.0 / posq;
    const tsi = 1.0 / (ao - sfour);
    satrec.eta = ao * satrec.ecco * tsi;
    const etasq = satrec.eta * satrec.eta;
    const eeta = satrec.ecco * satrec.eta;
    const psisq = fabs(1.0 - etasq);
    const coef = qzms24 * pow(tsi, 4.0);
    const coef1 = coef / pow(psisq, 3.5);
    const cc2 =
      coef1 * satrec.no_unkozai *
      (ao * (1.0 + 1.5 * etasq + eeta * (4.0 + etasq)) +
        0.375 * satrec.j2 * tsi / psisq * satrec.con41 *
          (8.0 + 3.0 * etasq * (8.0 + etasq)));
    satrec.cc1 = satrec.bstar * cc2;
    let cc3 = 0.0;
    if (satrec.ecco > 1.0e-4) {
      cc3 = -2.0 * coef * tsi * satrec.j3oj2 * satrec.no_unkozai * sinio / satrec.ecco;
    }
    satrec.x1mth2 = 1.0 - cosio2;
    satrec.cc4 =
      2.0 * satrec.no_unkozai * coef1 * ao * omeosq *
      (satrec.eta * (2.0 + 0.5 * etasq) +
        satrec.ecco * (0.5 + 2.0 * etasq) -
        satrec.j2 * tsi / (ao * psisq) *
          (-3.0 * satrec.con41 *
            (1.0 - 2.0 * eeta + etasq * (1.5 - 0.5 * eeta)) +
            0.75 * satrec.x1mth2 *
              (2.0 * etasq - eeta * (1.0 + etasq)) *
              cos(2.0 * satrec.argpo)));
    satrec.cc5 =
      2.0 * coef1 * ao * omeosq * (1.0 + 2.75 * (etasq + eeta) + eeta * etasq);
    const cosio4 = cosio2 * cosio2;
    const temp1 = 1.5 * satrec.j2 * pinvsq * satrec.no_unkozai;
    const temp2 = 0.5 * temp1 * satrec.j2 * pinvsq;
    const temp3 = -0.46875 * satrec.j4 * pinvsq * pinvsq * satrec.no_unkozai;
    satrec.mdot =
      satrec.no_unkozai +
      0.5 * temp1 * rteosq * satrec.con41 +
      0.0625 * temp2 * rteosq * (13.0 - 78.0 * cosio2 + 137.0 * cosio4);
    satrec.argpdot =
      -0.5 * temp1 * ini.con42 +
      0.0625 * temp2 * (7.0 - 114.0 * cosio2 + 395.0 * cosio4) +
      temp3 * (3.0 - 36.0 * cosio2 + 49.0 * cosio4);
    const xhdot1 = -temp1 * cosio;
    satrec.nodedot =
      xhdot1 +
      (0.5 * temp2 * (4.0 - 19.0 * cosio2) + 2.0 * temp3 * (3.0 - 7.0 * cosio2)) * cosio;
    const xpidot = satrec.argpdot + satrec.nodedot;
    satrec.omgcof = satrec.bstar * cc3 * cos(satrec.argpo);
    satrec.xmcof = 0.0;
    if (satrec.ecco > 1.0e-4) satrec.xmcof = (-x2o3 * coef * satrec.bstar) / eeta;
    satrec.nodecf = 3.5 * omeosq * xhdot1 * satrec.cc1;
    satrec.t2cof = 1.5 * satrec.cc1;
    if (fabs(cosio + 1.0) > 1.5e-12) {
      satrec.xlcof =
        (-0.25 * satrec.j3oj2 * sinio * (3.0 + 5.0 * cosio)) / (1.0 + cosio);
    } else {
      satrec.xlcof =
        (-0.25 * satrec.j3oj2 * sinio * (3.0 + 5.0 * cosio)) / temp4;
    }
    satrec.aycof = -0.5 * satrec.j3oj2 * sinio;
    const delmotemp = 1.0 + satrec.eta * cos(satrec.mo);
    satrec.delmo = delmotemp * delmotemp * delmotemp;
    satrec.sinmao = sin(satrec.mo);
    satrec.x7thm1 = 7.0 * cosio2 - 1.0;

    if ((2.0 * PI) / satrec.no_unkozai >= 225.0) {
      satrec.method = "d";
      satrec.isimp = 1;
      const tc = 0.0;
      const inclm = satrec.inclo;
      const ds = dscom(satrec, satrec.epoch, satrec.ecco, satrec.argpo, tc,
        satrec.inclo, satrec.nodeo, satrec.no_unkozai);

      const dp = dpper(satrec, inclm, satrec.init, {
        ep: satrec.ecco,
        inclp: satrec.inclo,
        nodep: satrec.nodeo,
        argpp: satrec.argpo,
        mp: satrec.mo,
      });
      satrec.ecco = dp.ep;
      satrec.inclo = dp.inclp;
      satrec.nodeo = dp.nodep;
      satrec.argpo = dp.argpp;
      satrec.mo = dp.mp;

      const di = dsinit(satrec, ds.cosim, ds.emsq, satrec.argpo, ds.s1, ds.s2,
        ds.s3, ds.s4, ds.s5, ds.sinim, ds.ss1, ds.ss2, ds.ss3, ds.ss4, ds.ss5,
        ds.sz1, ds.sz3, ds.sz11, ds.sz13, ds.sz21, ds.sz23, ds.sz31, ds.sz33,
        satrec.t, tc, satrec.gsto, satrec.mo, satrec.mdot,
        satrec.no_unkozai, satrec.nodeo, satrec.nodedot, xpidot,
        ds.z1, ds.z3, ds.z11, ds.z13, ds.z21, ds.z23, ds.z31, ds.z33,
        satrec.ecco, eccsq, ds.em, 0.0, inclm, 0.0, ds.nm, 0.0, satrec.irez);

      satrec.irez = di.irez;
      satrec.atime = di.atime;
      satrec.d2201 = di.d2201;
      satrec.d2211 = di.d2211;
      satrec.d3210 = di.d3210;
      satrec.d3222 = di.d3222;
      satrec.d4410 = di.d4410;
      satrec.d4422 = di.d4422;
      satrec.d5220 = di.d5220;
      satrec.d5232 = di.d5232;
      satrec.d5421 = di.d5421;
      satrec.d5433 = di.d5433;
      satrec.dedt = di.dedt;
      satrec.didt = di.didt;
      satrec.dmdt = di.dmdt;
      satrec.dnodt = di.dnodt;
      satrec.domdt = di.domdt;
      satrec.del1 = di.del1;
      satrec.del2 = di.del2;
      satrec.del3 = di.del3;
      satrec.xfact = di.xfact;
      satrec.xlamo = di.xlamo;
      satrec.xli = di.xli;
      satrec.xni = di.xni;
    }

    if (satrec.isimp !== 1) {
      const cc1sq = satrec.cc1 * satrec.cc1;
      satrec.d2 = 4.0 * ao * tsi * cc1sq;
      let temp = (satrec.d2 * tsi * satrec.cc1) / 3.0;
      satrec.d3 = (17.0 * ao + sfour) * temp;
      satrec.d4 =
        0.5 * temp * ao * tsi * (221.0 * ao + 31.0 * sfour) * satrec.cc1;
      satrec.t3cof = satrec.d2 + 2.0 * cc1sq;
      satrec.t4cof =
        0.25 *
        (3.0 * satrec.d3 + satrec.cc1 * (12.0 * satrec.d2 + 10.0 * cc1sq));
      satrec.t5cof =
        0.2 *
        (3.0 * satrec.d4 +
          12.0 * satrec.cc1 * satrec.d3 +
          6.0 * satrec.d2 * satrec.d2 +
          15.0 * cc1sq * (2.0 * satrec.d2 + cc1sq));
    }
  }

  satrec.init = "y";
  sgp4(satrec, 0.0);
  satrec.init = "n";
  return satrec;
}

export function sgp4(satrec, tsince) {
  const temp4 = 1.5e-12;
  const vkmpersec = (satrec.radiusearthkm * satrec.xke) / 60.0;
  satrec.t = tsince;
  satrec.error = 0;

  const xmdf = satrec.mo + satrec.mdot * satrec.t;
  const argpdf = satrec.argpo + satrec.argpdot * satrec.t;
  const nodedf = satrec.nodeo + satrec.nodedot * satrec.t;
  let argpm = argpdf;
  let mm = xmdf;
  const t2 = satrec.t * satrec.t;
  let nodem = nodedf + satrec.nodecf * t2;
  let tempa = 1.0 - satrec.cc1 * satrec.t;
  let tempe = satrec.bstar * satrec.cc4 * satrec.t;
  let templ = satrec.t2cof * t2;

  if (satrec.isimp !== 1) {
    const delomg = satrec.omgcof * satrec.t;
    const delmtemp = 1.0 + satrec.eta * cos(xmdf);
    const delm = satrec.xmcof * (delmtemp * delmtemp * delmtemp - satrec.delmo);
    const temp = delomg + delm;
    mm = xmdf + temp;
    argpm = argpdf - temp;
    const t3 = t2 * satrec.t;
    const t4 = t3 * satrec.t;
    tempa = tempa - satrec.d2 * t2 - satrec.d3 * t3 - satrec.d4 * t4;
    tempe = tempe + satrec.bstar * satrec.cc5 * (sin(mm) - satrec.sinmao);
    templ = templ + satrec.t3cof * t3 + t4 * (satrec.t4cof + satrec.t * satrec.t5cof);
  }

  let nm = satrec.no_unkozai;
  let em = satrec.ecco;
  let inclm = satrec.inclo;
  if (satrec.method === "d") {
    const ds = dspace(satrec, satrec.t, satrec.t, satrec.gsto,
      satrec.atime, em, argpm, inclm, satrec.xli, mm, satrec.xni, nodem, nm);
    em = ds.em;
    argpm = ds.argpm;
    inclm = ds.inclm;
    mm = ds.mm;
    nm = ds.nm;
    nodem = ds.nodem;
  }

  if (nm <= 0.0) {
    satrec.error = 2;
    return null;
  }

  let am = pow(satrec.xke / nm, X2O3) * tempa * tempa;
  nm = satrec.xke / pow(am, 1.5);
  em -= tempe;
  if (em >= 1.0 || em < -0.001) {
    satrec.error = 1;
    return null;
  }
  if (em < 1.0e-6) em = 1.0e-6;
  mm += satrec.no_unkozai * templ;
  let xlm = mm + argpm + nodem;
  const emsq = em * em;
  const temp = 1.0 - emsq;

  nodem = nodem % TWOPI;
  argpm = posMod(argpm, TWOPI);
  xlm = posMod(xlm, TWOPI);
  mm = posMod(xlm - argpm - nodem, TWOPI);

  const sinim = sin(inclm);
  const cosim = cos(inclm);
  let ep = em;
  let xincp = inclm;
  let argpp = argpm;
  let nodep = nodem;
  let mp = mm;
  let sinip = sinim;
  let cosip = cosim;
  if (satrec.method === "d") {
    const dp = dpper(satrec, satrec.inclo, "n", { ep, inclp: xincp, nodep, argpp, mp });
    ep = dp.ep;
    xincp = dp.inclp;
    nodep = dp.nodep;
    argpp = dp.argpp;
    mp = dp.mp;
    if (xincp < 0.0) {
      xincp = -xincp;
      nodep += PI;
      argpp -= PI;
    }
    if (ep < 0.0 || ep > 1.0) satrec.error = 3;
  }

  if (satrec.method === "d") {
    sinip = sin(xincp);
    cosip = cos(xincp);
    satrec.aycof = -0.5 * satrec.j3oj2 * sinip;
    if (fabs(cosip + 1.0) > 1.5e-12) {
      satrec.xlcof =
        (-0.25 * satrec.j3oj2 * sinip * (3.0 + 5.0 * cosip)) / (1.0 + cosip);
    } else {
      satrec.xlcof =
        (-0.25 * satrec.j3oj2 * sinip * (3.0 + 5.0 * cosip)) / temp4;
    }
  }

  const axnl = ep * cos(argpp);
  const tempDen = 1.0 / (am * (1.0 - ep * ep));
  const aynl = ep * sin(argpp) + tempDen * satrec.aycof;
  const xl = mp + argpp + nodep + tempDen * satrec.xlcof * axnl;

  const u = posMod(xl - nodep, TWOPI);
  let eo1 = u;
  let tem5 = 9999.9;
  let ktr = 1;
  let coseo1 = 0, sineo1 = 0;
  while (fabs(tem5) >= 1.0e-12 && ktr <= 10) {
    sineo1 = sin(eo1);
    coseo1 = cos(eo1);
    tem5 = 1.0 - coseo1 * axnl - sineo1 * aynl;
    tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5;
    if (fabs(tem5) >= 0.95) tem5 = tem5 > 0.0 ? 0.95 : -0.95;
    eo1 += tem5;
    ktr += 1;
  }

  const ecose = axnl * coseo1 + aynl * sineo1;
  const esine = axnl * sineo1 - aynl * coseo1;
  const el2 = axnl * axnl + aynl * aynl;
  const pl = am * (1.0 - el2);
  if (pl < 0.0) {
    satrec.error = 4;
    return null;
  }

  const rl = am * (1.0 - ecose);
  const rdotl = (sqrt(am) * esine) / rl;
  let rvdotl = sqrt(pl) / rl;
  const betal = sqrt(1.0 - el2);
  let tempu = esine / (1.0 + betal);
  const sinu = (am / rl) * (sineo1 - aynl - axnl * tempu);
  const cosu = (am / rl) * (coseo1 - axnl + aynl * tempu);
  let su = atan2(sinu, cosu);
  const sin2u = (cosu + cosu) * sinu;
  const cos2u = 1.0 - 2.0 * sinu * sinu;
  const pinv = 1.0 / pl;
  const temp1 = 0.5 * satrec.j2 * pinv;
  const temp2 = temp1 * pinv;

  if (satrec.method === "d") {
    const cosisq = cosip * cosip;
    satrec.con41 = 3.0 * cosisq - 1.0;
    satrec.x1mth2 = 1.0 - cosisq;
    satrec.x7thm1 = 7.0 * cosisq - 1.0;
  }

  const mrt =
    rl * (1.0 - 1.5 * temp2 * betal * satrec.con41) +
    0.5 * temp1 * satrec.x1mth2 * cos2u;
  su = su - 0.25 * temp2 * satrec.x7thm1 * sin2u;
  const xnode = nodep + 1.5 * temp2 * cosip * sin2u;
  const xinc = xincp + 1.5 * temp2 * cosip * sinip * cos2u;
  const mvt = rdotl - (nm * temp1 * satrec.x1mth2 * sin2u) / satrec.xke;
  rvdotl =
    rvdotl +
    (nm * temp1 * (satrec.x1mth2 * cos2u + 1.5 * satrec.con41)) / satrec.xke;

  const sinsu = sin(su);
  const cossu = cos(su);
  const snod = sin(xnode);
  const cnod = cos(xnode);
  const sini = sin(xinc);
  const cosi = cos(xinc);
  const xmx = -snod * cosi;
  const xmy = cnod * cosi;
  const ux = xmx * sinsu + cnod * cossu;
  const uy = xmy * sinsu + snod * cossu;
  const uz = sini * sinsu;
  const vx = xmx * cossu - cnod * sinsu;
  const vy = xmy * cossu - snod * sinsu;
  const vz = sini * cossu;
  const mr = mrt * satrec.radiusearthkm;
  const position = [mr * ux, mr * uy, mr * uz];
  const velocity = [
    (mvt * ux + rvdotl * vx) * vkmpersec,
    (mvt * uy + rvdotl * vy) * vkmpersec,
    (mvt * uz + rvdotl * vz) * vkmpersec,
  ];
  if (mrt < 1.0) satrec.error = 6;
  return { position, velocity, error: satrec.error };
}

export function propagateAt(satrec, date) {
  const jd = dateToJulian(date);
  const tsince = (jd - satrec.jdsatepoch) * 1440.0;
  return sgp4(satrec, tsince);
}

export function julianFromUnixMs(ms) {
  return ms / 86400000.0 + 2440587.5;
}

export function propagateAtMs(satrec, ms) {
  const jd = julianFromUnixMs(ms);
  return sgp4(satrec, (jd - satrec.jdsatepoch) * 1440.0);
}

export function temeToEcef(position, jdUt1) {
  const theta = gstime(jdUt1);
  const c = cos(theta);
  const s = sin(theta);
  return [
    c * position[0] + s * position[1],
    -s * position[0] + c * position[1],
    position[2],
  ];
}

export function eciToEcefDeg(position, jdUt1) {
  const ecef = temeToEcef(position, jdUt1);
  const a = 6378.137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const r = sqrt(ecef[0] * ecef[0] + ecef[1] * ecef[1]);
  const lon = atan2(ecef[1], ecef[0]);
  let lat = atan2(ecef[2], r * (1 - e2));
  let alt = 0;
  for (let i = 0; i < 3; i += 1) {
    const sinLat = sin(lat);
    const n = a / sqrt(1 - e2 * sinLat * sinLat);
    alt = r / cos(lat) - n;
    lat = atan2(ecef[2] + n * e2 * sinLat, r);
  }
  return { lat: lat * RAD2DEG, lon: lon * RAD2DEG, alt };
}

export function sunEcefUnit(date) {
  const jd = dateToJulian(date);
  const n = jd - 2451545.0;
  const L = posMod(280.46 + 0.9856474 * n, 360.0);
  const g = posMod(357.528 + 0.9856003 * n, 360.0) * DEG2RAD;
  const lambda = (L + 1.915 * sin(g) + 0.02 * sin(2 * g)) * DEG2RAD;
  const epsilon = (23.439 - 0.0000004 * n) * DEG2RAD;
  const ra = atan2(cos(epsilon) * sin(lambda), cos(lambda));
  const dec = Math.asin(sin(epsilon) * sin(lambda));
  const eci = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const ecef = temeToEcef(eci, jd);
  const len = sqrt(ecef[0] * ecef[0] + ecef[1] * ecef[1] + ecef[2] * ecef[2]);
  return [ecef[0] / len, ecef[1] / len, ecef[2] / len];
}

export function sunEciFromJulian(jd) {
  const n = jd - 2451545.0;
  const L = posMod(280.46 + 0.9856474 * n, 360.0);
  const g = posMod(357.528 + 0.9856003 * n, 360.0) * DEG2RAD;
  const lambda = (L + 1.915 * sin(g) + 0.02 * sin(2 * g)) * DEG2RAD;
  const epsilon = (23.439 - 0.0000004 * n) * DEG2RAD;
  const ra = atan2(cos(epsilon) * sin(lambda), cos(lambda));
  const dec = Math.asin(sin(epsilon) * sin(lambda));
  return [
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  ];
}

export function sunEciUnit(date) {
  return sunEciFromJulian(dateToJulian(date));
}
