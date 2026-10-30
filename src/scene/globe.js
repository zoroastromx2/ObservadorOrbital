import * as THREE from "three";
import { GROUPS, GROUP_BY_ID, ACCENT } from "../lib/catalog.js";

const DEG = Math.PI / 180;
const EARTH_RADIUS = 6378.135;

function makeStarfield(count = 2600) {
  let seed = 19830727;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const u = random();
    const v = random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const radius = 35 + random() * 45;
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const tint = random();
    const magnitude = 0.15 + random() ** 3 * 0.8;
    colors[i * 3] = magnitude * (tint > 0.9 ? 1.0 : 0.7);
    colors[i * 3 + 1] = magnitude * 0.8;
    colors[i * 3 + 2] = magnitude * (tint < 0.2 ? 0.7 : 1.0);
    sizes[i] = random() > 0.985 ? 2.2 : 0.9 + random() * 1.1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float alpha = smoothstep(0.5, 0.05, length(p));
        gl_FragColor = vec4(vColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

function makeEarth(dayTexture, nightTexture) {
  const geometry = new THREE.SphereGeometry(1, 160, 96);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: dayTexture },
      uNight: { value: nightTexture },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uCityLights: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform vec3 uSunDir;
      uniform float uCityLights;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float sunDot = dot(normal, normalize(uSunDir));
        float dayMix = smoothstep(-0.09, 0.12, sunDot);
        vec3 dayColor = texture2D(uDay, vUv).rgb;
        vec3 nightTex = texture2D(uNight, vUv).rgb;
        float lightMask = dot(nightTex, vec3(0.3333));
        vec3 city = nightTex * (1.2 + lightMask * 1.4) * uCityLights;
        vec3 nightColor = city + dayColor * 0.035 + vec3(0.002, 0.006, 0.012);
        float daylight = clamp(0.42 + sunDot * 0.72, 0.16, 1.0);
        vec3 litDay = dayColor * daylight;
        vec3 color = mix(nightColor, litDay, dayMix);
        float twilight = exp(-pow(sunDot / 0.13, 2.0));
        color += vec3(0.38, 0.15, 0.045) * twilight * 0.28;
        float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.2);
        color += vec3(0.055, 0.2, 0.38) * rim * (0.25 + max(sunDot, 0.0) * 0.7);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const earth = new THREE.Mesh(geometry, material);
  earth.renderOrder = 0;
  return earth;
}

function makeAtmosphere() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x5aa8ff) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - abs(dot(normal, viewDir)), 3.4);
        gl_FragColor = vec4(uColor * rim * 0.9, rim);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.075, 96, 64), material);
  mesh.renderOrder = 2;
  return mesh;
}

function makeRingTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(246,196,83,0.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 53, 0, Math.PI * 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function canvasLineMaterial(color, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      attribute float aFade;
      varying float vFade;
      void main() {
        vFade = aFade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(uColor, vFade * uOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function makeSolidLine(color, opacity) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function dirFromLatLon(latDeg, lonDeg, radius = 1) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon)
  );
}

function vecArrayToScene(v) {
  return [v[0], v[2], -v[1]];
}

export class Globe {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x02050b, 1);
    this.renderer.domElement.id = "globe-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D Earth and satellite map");
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 150);
    this.view = { lat: 17, lon: -25, distance: 3.05 };
    this.flight = null;
    this.followIndex = null;
    this.selectedIndex = null;
    this.reducedMotion = false;
    this.nightVision = false;
    this.location = null;
    this.positions = new Float32Array(0);
    this.valid = new Uint8Array(0);
    this.satellites = [];
    this.catalogCount = 0;
    this.display = {
      orbits: true,
      trails: true,
      labels: true,
      cityLights: true,
      groups: Object.fromEntries(GROUPS.map((g) => [g.id, true])),
      bands: { low: true, medium: true, geostationary: true },
    };
    this.opacityByGroup = Object.fromEntries(
      GROUPS.map((g) => [g.id, g.id === "starlink" ? 0.78 : 0.95])
    );
    this.sizeByGroup = {
      stations: 3.8,
      weather: 2.5,
      gps: 2.6,
      starlink: 1.5,
      other: 2.0,
    };
    this.pointer = { x: 0, y: 0, inside: false, buttonDown: false, moved: false };
    this.lastPointer = null;
    this.pointerState = null;
    this.pinchDistance = 0;
    this.frameTimes = [];
    this.fps = 0;
    this.lastFpsUpdate = performance.now();
    this.frames = 0;
    this.intro = null;
    this.orbitLine = null;
    this.trailLine = null;
    this.groundGroup = null;
    this.selectionRing = null;
    this.locationGroup = null;
    this.hoverIndex = null;
    this.clock = new THREE.Clock();
    this.stars = null;
    this.sunDir = new THREE.Vector3(1, 0, 0);
    this.currentTimeMs = Date.now();
    this.pickPending = false;
    this.pickTarget = null;
    this.pickEarth = null;
    this.raycasterActive = false;
    this._boundAnimate = this.animate.bind(this);
    this._resize = this.resize.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onWheel = this.onWheel.bind(this);
    this._onPointerLeave = this.onPointerLeave.bind(this);
  }

  async init() {
    const loader = new THREE.TextureLoader();
    const [day, night] = await Promise.all([
      loader.loadAsync("/assets/textures/earth_day.jpg"),
      loader.loadAsync("/assets/textures/earth_night.jpg"),
    ]);
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    night.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.dayTexture = day;
    this.nightTexture = night;
    this.earth = makeEarth(day, night);
    this.scene.add(this.earth);
    this.atmosphere = makeAtmosphere();
    this.scene.add(this.atmosphere);
    this.stars = makeStarfield();
    this.scene.add(this.stars);
    this.stars.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();

    this.groundGroup = new THREE.Group();
    this.scene.add(this.groundGroup);

    this.orbitLine = new THREE.Line(
      new THREE.BufferGeometry(),
      canvasLineMaterial(ACCENT, 0.42)
    );
    this.orbitLine.frustumCulled = false;
    this.orbitLine.renderOrder = 5;
    this.scene.add(this.orbitLine);

    this.trailLine = new THREE.Line(
      new THREE.BufferGeometry(),
      canvasLineMaterial("#FFDB82", 0.72)
    );
    this.trailLine.frustumCulled = false;
    this.trailLine.renderOrder = 6;
    this.scene.add(this.trailLine);

    const ringTexture = makeRingTexture();
    this.selectionRing = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ringTexture,
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 20;
    this.scene.add(this.selectionRing);

    this.locationGroup = new THREE.Group();
    this.scene.add(this.locationGroup);
    this.selectionSubpoint = new THREE.Mesh(
      new THREE.RingGeometry(0.004, 0.0062, 24),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(ACCENT),
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.selectionSubpoint.visible = false;
    this.scene.add(this.selectionSubpoint);

    this.camera.position.copy(dirFromLatLon(this.view.lat, this.view.lon, this.view.distance));
    this.camera.lookAt(0, 0, 0);
    this.camera.up.set(0, 1, 0);

    this.setupPicking();
    this.resize();
    window.addEventListener("resize", this._resize);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointercancel", this._onPointerUp);
    canvas.addEventListener("pointerleave", this._onPointerLeave);
    canvas.addEventListener("wheel", this._onWheel, { passive: false });
    this.renderer.setAnimationLoop(this._boundAnimate);
    return this;
  }

  setupPicking() {
    this.pickScene = new THREE.Scene();
    this.pickMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        attribute vec3 aPos;
        attribute float aSize;
        attribute float aId;
        uniform vec2 uResolution;
        varying float vId;
        void main() {
          vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
          gl_Position = projectionMatrix * mv;
          if (aSize <= 0.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          }
          gl_Position.xy += position.xy * 2.0 * (aSize * 3.0) / uResolution * gl_Position.w;
          vId = aId;
        }
      `,
      fragmentShader: `
        varying float vId;
        void main() {
          float hi = floor(vId / 256.0);
          float lo = vId - hi * 256.0;
          gl_FragColor = vec4(hi / 255.0, lo / 255.0, 0.0, 1.0);
        }
      `,
      depthTest: true,
      depthWrite: true,
    });
    this.pickEarth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    this.pickEarth.renderOrder = -1;
    this.pickScene.add(this.pickEarth);
  }

  setCatalog(satellites) {
    this.satellites = satellites;
    this.catalogCount = satellites.length;
    if (this.satMesh) {
      this.scene.remove(this.satMesh);
      this.satMesh.geometry.dispose();
      this.satMesh.material.dispose();
      this.satMesh = null;
    }
    if (this.pickMesh) {
      this.pickScene.remove(this.pickMesh);
      this.pickMesh.geometry.dispose();
      this.pickMesh.material.dispose();
      this.pickMesh = null;
    }
    const count = satellites.length;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const ids = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const sat = satellites[i];
      const color = new THREE.Color(sat.color);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = this.sizeByGroup[sat.group] || 2.2;
      ids[i] = i + 1;
    }
    this.positions = positions;
    this.valid = new Uint8Array(count);

    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("aPos", new THREE.InstancedBufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute("aId", new THREE.InstancedBufferAttribute(ids, 1));
    geometry.instanceCount = count;
    this.instanceSizes = sizes;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute vec3 aPos;
        attribute vec3 aColor;
        attribute float aSize;
        uniform vec2 uResolution;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          vColor = aColor;
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.xy += position.xy * 2.0 * (aSize * uPixelRatio) / uResolution * gl_Position.w;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          if (d > 1.0) discard;
          float glow = pow(1.0 - d, 3.2);
          float core = smoothstep(0.62, 0.08, d);
          float alpha = glow * 0.44 + core * 0.64;
          vec3 color = vColor * (0.75 + core * 1.3);
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.satMaterial = material;
    this.satMesh = new THREE.Mesh(geometry, material);
    this.satMesh.frustumCulled = false;
    this.satMesh.renderOrder = 4;
    this.scene.add(this.satMesh);

    this.pickMaterial = this.pickMaterial.clone();
    this.pickMaterial.uniforms.uResolution.value = new THREE.Vector2(1, 1);
    this.pickMesh = new THREE.Mesh(geometry, this.pickMaterial);
    this.pickMesh.frustumCulled = false;
    this.pickScene.add(this.pickMesh);
    this.pickEarth.scale.setScalar(1);
    this.applyVisibility();
    this.resize();
  }

  applyVisibility() {
    if (!this.instanceSizes || !this.satellites.length) return;
    const dprAdjust = window.innerWidth < 760 ? 0.1 : 0;
    for (let i = 0; i < this.satellites.length; i += 1) {
      const sat = this.satellites[i];
      const visible =
        this.display.groups[sat.group] &&
        this.display.bands[sat.orbitClass] &&
        this.valid[i] !== 0;
      this.instanceSizes[i] = visible ? (this.sizeByGroup[sat.group] || 2.2) + dprAdjust : 0;
    }
    if (this.satMesh) {
      this.satMesh.geometry.getAttribute("aSize").needsUpdate = true;
    }
  }

  updatePositions(positions, valid, timeMs) {
    if (positions.length !== this.satellites.length * 3) return;
    this.positions = positions;
    this.valid = valid;
    this.currentTimeMs = timeMs;
    if (this.satMesh) {
      const attr = this.satMesh.geometry.getAttribute("aPos");
      attr.array = positions;
      attr.needsUpdate = true;
      this.satMesh.geometry.getAttribute("aSize").needsUpdate = true;
    }
    this.applyVisibility();
    this.updateSelectionRing();
  }

  setTime(timeMs) {
    this.currentTimeMs = timeMs;
    const jd = timeMs / 86400000 + 2440587.5;
    const n = jd - 2451545.0;
    const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360;
    const g = ((((357.528 + 0.9856003 * n) % 360) + 360) % 360) * DEG;
    const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
    const epsilon = (23.439 - 0.0000004 * n) * DEG;
    const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
    const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
    const eci = [
      Math.cos(dec) * Math.cos(ra),
      Math.cos(dec) * Math.sin(ra),
      Math.sin(dec),
    ];
    const theta = this.gmst(jd);
    const ecef = [
      Math.cos(theta) * eci[0] + Math.sin(theta) * eci[1],
      -Math.sin(theta) * eci[0] + Math.cos(theta) * eci[1],
      eci[2],
    ];
    this.sunDir.set(ecef[0], ecef[2], -ecef[1]).normalize();
    if (this.earth) this.earth.material.uniforms.uSunDir.value.copy(this.sunDir);
  }

  gmst(jd) {
    const tut1 = (jd - 2451545.0) / 36525.0;
    let temp =
      -6.2e-6 * tut1 ** 3 +
      0.093104 * tut1 ** 2 +
      (876600.0 * 3600 + 8640184.812866) * tut1 +
      67310.54841;
    temp = ((temp * DEG) / 240.0) % (2 * Math.PI);
    if (temp < 0) temp += 2 * Math.PI;
    return temp;
  }

  setDisplay(display) {
    this.display = { ...this.display, ...display };
    this.earth.material.uniforms.uCityLights.value = this.display.cityLights ? 1 : 0;
    this.orbitLine.visible = this.display.orbits;
    this.trailLine.visible = this.display.trails;
    this.groundGroup.visible = this.display.orbits;
    if (this.selectionSubpoint) {
      this.selectionSubpoint.visible = this.display.orbits && this.selectedIndex !== null;
    }
    this.applyVisibility();
  }

  setGroupVisible(groupId, visible) {
    this.display.groups[groupId] = visible;
    this.applyVisibility();
  }

  setBandVisible(bandId, visible) {
    this.display.bands[bandId] = visible;
    this.applyVisibility();
  }

  setReducedMotion(value) {
    this.reducedMotion = value;
    if (value && this.intro) {
      this.view.lat = this.intro.toLat;
      this.view.lon = this.intro.toLon;
      this.view.distance = this.intro.toDistance;
      this.intro = null;
    }
    if (value && this.flight) {
      this.view.lat = this.flight.toLat;
      this.view.lon = this.flight.toLon;
      this.view.distance = this.flight.toDistance;
      this.flight = null;
    }
  }

  setSelected(index) {
    this.selectedIndex = index;
    if (this.selectionRing) this.selectionRing.visible = index !== null && index !== undefined;
    if (index === null || index === undefined) {
      this.clearOrbit();
      if (this.selectionSubpoint) this.selectionSubpoint.visible = false;
      this.updateSelectionRing();
    }
    this.updateSelectionRing();
  }

  clearOrbit() {
    if (this.orbitLine) {
      this.orbitLine.geometry.dispose();
      this.orbitLine.geometry = new THREE.BufferGeometry();
    }
    if (this.trailLine) {
      this.trailLine.geometry.dispose();
      this.trailLine.geometry = new THREE.BufferGeometry();
    }
    while (this.groundGroup.children.length) {
      const child = this.groundGroup.children.pop();
      child.geometry.dispose();
      child.material.dispose();
    }
  }

  setSelectionGeometry(
    orbitPositions,
    orbitFade,
    trailPositions,
    trailFade,
    groundSegments,
    subpoint
  ) {
    if (orbitPositions && orbitPositions.length >= 6) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(orbitPositions, 3));
      geom.setAttribute("aFade", new THREE.Float32BufferAttribute(orbitFade, 1));
      if (this.orbitLine) {
        this.orbitLine.geometry.dispose();
        this.orbitLine.geometry = geom;
        this.orbitLine.visible = this.display.orbits;
      }
    }
    if (trailPositions && trailPositions.length >= 6) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(trailPositions, 3));
      geom.setAttribute("aFade", new THREE.Float32BufferAttribute(trailFade, 1));
      if (this.trailLine) {
        this.trailLine.geometry.dispose();
        this.trailLine.geometry = geom;
        this.trailLine.visible = this.display.trails;
      }
    }
    while (this.groundGroup.children.length) {
      const child = this.groundGroup.children.pop();
      child.geometry.dispose();
      child.material.dispose();
    }
    if (groundSegments) {
      for (const segment of groundSegments) {
        if (segment.length < 2) continue;
        const flat = [];
        for (let i = 0; i < segment.length - 1; i += 1) {
          if (i % 16 >= 8) continue;
          flat.push(
            segment[i][0], segment[i][1], segment[i][2],
            segment[i + 1][0], segment[i + 1][1], segment[i + 1][2]
          );
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.Float32BufferAttribute(flat, 3));
        const line = new THREE.LineSegments(geom, makeSolidLine("#C8D9EC", 0.6));
        line.visible = this.display.orbits;
        line.renderOrder = 7;
        this.groundGroup.add(line);
      }
    }
    if (this.selectionSubpoint) {
      if (subpoint) {
        const normal = new THREE.Vector3(subpoint[0], subpoint[1], subpoint[2]).normalize();
        this.selectionSubpoint.position.copy(normal).multiplyScalar(1.0045);
        this.selectionSubpoint.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          normal
        );
        this.selectionSubpoint.visible = this.display.orbits;
      } else {
        this.selectionSubpoint.visible = false;
      }
    }
  }

  updateSelectionRing() {
    if (!this.selectionRing) return;
    const index = this.selectedIndex;
    if (index === null || index === undefined || !this.valid[index]) {
      this.selectionRing.visible = false;
      return;
    }
    const x = this.positions[index * 3];
    const y = this.positions[index * 3 + 1];
    const z = this.positions[index * 3 + 2];
    this.selectionRing.position.set(x, y, z);
    const distance = this.camera.position.distanceTo(this.selectionRing.position);
    const worldPerCssPixel =
      (2 * Math.tan((this.camera.fov * DEG) / 2) * distance) /
      Math.max(1, this.renderer.domElement.clientHeight);
    const px = window.innerWidth < 760 ? 44 : 56;
    this.selectionRing.scale.setScalar(worldPerCssPixel * px);
    const hidden = this.isOccluded(new THREE.Vector3(x, y, z));
    this.selectionRing.visible = !hidden;
  }

  setLocation(location) {
    this.location = location;
    while (this.locationGroup.children.length) {
      const child = this.locationGroup.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    if (!location) return;
    const normal = dirFromLatLon(location.lat, location.lon, 1.0035);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal.clone().normalize()
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.009, 0.0118, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(ACCENT),
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      })
    );
    ring.position.copy(normal);
    ring.quaternion.copy(quat);
    this.locationGroup.add(ring);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0038, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT) })
    );
    dot.position.copy(dirFromLatLon(location.lat, location.lon, 1.004));
    this.locationGroup.add(dot);
  }

  flyToLocation(lat, lon, distance = 2.35, duration = 1500) {
    this.startFlight(lat, lon, distance, duration);
  }

  flyToSatellite(index, distance = 2.65) {
    if (index === null || index === undefined || !this.valid[index]) return;
    const { lat, lon } = this.latLonOf(index);
    this.startFlight(lat, lon, Math.min(this.view.distance, distance), 1000);
  }

  startFlight(lat, lon, distance, duration) {
    this.intro = null;
    if (this.reducedMotion) {
      this.view.lat = lat;
      this.view.lon = lon;
      this.view.distance = distance;
      this.followIndex = null;
      this.flight = null;
      return;
    }
    let toLon = lon;
    let delta = ((toLon - this.view.lon + 540) % 360) - 180;
    this.flight = {
      start: performance.now(),
      duration,
      fromLat: this.view.lat,
      fromLon: this.view.lon,
      fromDistance: this.view.distance,
      toLat: lat,
      toLon: this.view.lon + delta,
      toDistance: distance,
    };
  }

  latLonOf(index) {
    const x = this.positions[index * 3];
    const y = this.positions[index * 3 + 1];
    const z = this.positions[index * 3 + 2];
    const r = Math.hypot(x, y, z);
    if (!r) return { lat: 0, lon: 0 };
    return {
      lat: Math.asin(Math.max(-1, Math.min(1, y / r))) / DEG,
      lon: Math.atan2(-z, x) / DEG,
    };
  }

  setFollow(index, enabled) {
    if (!enabled) {
      this.followIndex = null;
      return;
    }
    this.followIndex = index;
    const { lat, lon } = this.latLonOf(index);
    this.startFlight(lat, lon, Math.min(this.view.distance, 2.3), 850);
    this.followIndex = index;
  }

  startIntro(toLat = 17, toLon = -25) {
    if (this.reducedMotion) {
      this.view.lat = toLat;
      this.view.lon = toLon;
      this.view.distance = 3.05;
      return;
    }
    this.intro = {
      start: performance.now(),
      duration: 3600,
      fromDistance: 13.5,
      fromLat: 23,
      fromLon: 58,
      toDistance: 3.05,
      toLat,
      toLon,
    };
    this.view.distance = 13.5;
    this.view.lat = 23;
    this.view.lon = 58;
    this.followIndex = null;
    this.flight = null;
  }

  skipIntro() {
    if (!this.intro) return false;
    const target = this.intro;
    this.intro = null;
    this.view.distance = target.toDistance;
    this.view.lat = target.toLat;
    this.view.lon = target.toLon;
    return true;
  }

  resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.satMaterial) {
      this.satMaterial.uniforms.uResolution.value.set(size.x, size.y);
    }
    if (this.pickTarget) {
      this.pickTarget.dispose();
      this.pickTarget = null;
    }
    const pickWidth = Math.max(320, Math.min(1440, Math.floor(width)));
    const pickHeight = Math.max(240, Math.round(pickWidth * (height / width)));
    this.pickTarget = new THREE.WebGLRenderTarget(pickWidth, pickHeight, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.pickTarget.texture.generateMipmaps = false;
    this.pickMaterial.uniforms.uResolution.value.set(pickWidth, pickHeight);
    this.pickSize = { width: pickWidth, height: pickHeight };
  }

  updateCamera(delta, now) {
    if (this.flight) {
      const progress = Math.min(1, (now - this.flight.start) / this.flight.duration);
      const eased = progress < 0.5
        ? 4 * progress ** 3
        : 1 - (-2 * progress + 2) ** 3 / 2;
      const f = this.flight;
      this.view.lat = f.fromLat + (f.toLat - f.fromLat) * eased;
      this.view.lon = f.fromLon + (f.toLon - f.fromLon) * eased;
      this.view.distance = f.fromDistance + (f.toDistance - f.fromDistance) * eased;
      if (progress >= 1) this.flight = null;
    } else if (this.followIndex !== null) {
      const target = this.latLonOf(this.followIndex);
      let deltaLon = ((target.lon - this.view.lon + 540) % 360) - 180;
      const blend = 1 - Math.exp(-delta * 6);
      this.view.lat += (target.lat - this.view.lat) * blend;
      this.view.lon += deltaLon * blend;
    }
    const pos = dirFromLatLon(this.view.lat, this.view.lon, this.view.distance);
    this.camera.position.copy(pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
  }

  animate() {
    const now = performance.now();
    const delta = Math.min(0.1, this.clock.getDelta());
    if (this.intro) {
      const progress = Math.min(1, (now - this.intro.start) / this.intro.duration);
      const eased = 1 - (1 - progress) ** 4;
      this.view.distance =
        this.intro.fromDistance +
        (this.intro.toDistance - this.intro.fromDistance) * eased;
      this.view.lat = this.intro.fromLat + (this.intro.toLat - this.intro.fromLat) * eased;
      this.view.lon = this.intro.fromLon + (this.intro.toLon - this.intro.fromLon) * eased;
      if (progress >= 1) this.intro = null;
    }
    this.updateCamera(delta, now);
    this.updateSelectionRing();
    if (this.stars) {
      this.stars.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    }
    this.renderer.render(this.scene, this.camera);
    this.frames += 1;
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsUpdate));
      this.frames = 0;
      this.lastFpsUpdate = now;
      if (this.callbacks.onFps) this.callbacks.onFps(this.fps);
    }
    if (this.pointer.inside && this.callbacks.onLabelUpdate) {
      this.callbacks.onLabelUpdate();
    }
  }

  screenPosition(index) {
    if (!this.valid[index]) return null;
    const vec = new THREE.Vector3(
      this.positions[index * 3],
      this.positions[index * 3 + 1],
      this.positions[index * 3 + 2]
    );
    if (this.isOccluded(vec)) return null;
    const projected = vec.clone().project(this.camera);
    if (projected.z > 1 || projected.z < -1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
      visible:
        projected.x > -1.1 && projected.x < 1.1 && projected.y > -1.1 && projected.y < 1.1,
    };
  }

  isOccluded(position) {
    const cam = this.camera.position;
    const dir = position.clone().sub(cam);
    const length2 = dir.lengthSq();
    if (length2 < 1e-9) return false;
    const b = 2 * cam.dot(dir);
    const c = cam.lengthSq() - 0.995 ** 2;
    const disc = b * b - 4 * length2 * c;
    if (disc <= 0) return false;
    const t1 = (-b - Math.sqrt(disc)) / (2 * length2);
    return t1 > 0 && t1 < 1;
  }

  altitudeOf(index) {
    if (!this.valid[index]) return null;
    const x = this.positions[index * 3];
    const y = this.positions[index * 3 + 1];
    const z = this.positions[index * 3 + 2];
    return (Math.hypot(x, y, z) - 1) * EARTH_RADIUS;
  }

  onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (this.callbacks.onInteract) this.callbacks.onInteract();
    const canvas = this.renderer.domElement;
    if (event.pointerType === "touch") {
      if (!this.pointerState) this.pointerState = [];
      this.pointerState.push({ id: event.pointerId, x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (this.pointerState.length === 2) {
        const dx = this.pointerState[0].x - this.pointerState[1].x;
        const dy = this.pointerState[0].y - this.pointerState[1].y;
        this.pinchDistance = Math.hypot(dx, dy);
      }
      this.pointer.buttonDown = true;
      this.pointer.moved = false;
      this.pointer.startX = event.clientX;
      this.pointer.startY = event.clientY;
      return;
    }
    this.pointer.buttonDown = true;
    this.pointer.moved = false;
    this.pointer.startX = event.clientX;
    this.pointer.startY = event.clientY;
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }

  onPointerMove(event) {
    if (this.callbacks.onPointerActivity) this.callbacks.onPointerActivity();
    this.pointer.inside = true;
    if (event.pointerType === "touch" && this.pointerState) {
      const index = this.pointerState.findIndex((p) => p.id === event.pointerId);
      if (index >= 0) {
        const prev = this.pointerState[index];
        this.pointerState[index] = { id: event.pointerId, x: event.clientX, y: event.clientY };
        if (this.pointerState.length === 2) {
          const dx = this.pointerState[0].x - this.pointerState[1].x;
          const dy = this.pointerState[0].y - this.pointerState[1].y;
          const distance = Math.hypot(dx, dy);
          if (this.pinchDistance) {
            this.view.distance = Math.max(
              1.18,
              Math.min(8.5, this.view.distance * (this.pinchDistance / distance))
            );
            this.followIndex = null;
            this.flight = null;
          }
          this.pinchDistance = distance;
          this.pointer.moved = true;
          return;
        }
        if (this.pointer.buttonDown) {
          const ddx = event.clientX - prev.x;
          const ddy = event.clientY - prev.y;
          if (Math.abs(ddx) + Math.abs(ddy) > 1) {
            this.pointer.moved = true;
            this.view.lon -= ddx * 0.006;
            this.view.lat = Math.max(-85, Math.min(85, this.view.lat + ddy * 0.005));
            this.followIndex = null;
            this.flight = null;
            if (this.callbacks.onFollowChange) this.callbacks.onFollowChange(false);
          }
        }
      }
      this.pointer.clientX = event.clientX;
      this.pointer.clientY = event.clientY;
      return;
    }

    this.pointer.clientX = event.clientX;
    this.pointer.clientY = event.clientY;
    if (this.pointer.buttonDown) {
      const ddx = event.clientX - this.pointer.lastX;
      const ddy = event.clientY - this.pointer.lastY;
      if (Math.abs(ddx) + Math.abs(ddy) > 1) {
        this.pointer.moved = true;
        this.view.lon -= ddx * 0.0052;
        this.view.lat = Math.max(-85, Math.min(85, this.view.lat + ddy * 0.0045));
        this.followIndex = null;
        this.flight = null;
        if (this.callbacks.onFollowChange) this.callbacks.onFollowChange(false);
      }
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      return;
    }
    this.hoverAt(event.clientX, event.clientY);
  }

  onPointerUp(event) {
    const canvas = this.renderer.domElement;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (event.pointerType === "touch" && this.pointerState) {
      this.pointerState = this.pointerState.filter((p) => p.id !== event.pointerId);
      if (this.pointerState.length < 2) this.pinchDistance = 0;
      if (!this.pointer.moved && this.pointer.buttonDown) {
        this.pickAndSelect(event.clientX, event.clientY);
      }
      this.pointer.buttonDown = false;
      return;
    }
    if (!this.pointer.moved && this.pointer.buttonDown) {
      this.pickAndSelect(event.clientX, event.clientY);
    }
    this.pointer.buttonDown = false;
  }

  onPointerLeave() {
    this.pointer.inside = false;
    this.hoverIndex = null;
    if (this.callbacks.onHover) this.callbacks.onHover(null, null);
  }

  onWheel(event) {
    event.preventDefault();
    if (this.callbacks.onInteract) this.callbacks.onInteract();
    const scale = Math.exp(event.deltaY * 0.0011);
    this.view.distance = Math.max(1.18, Math.min(8.5, this.view.distance * scale));
    this.followIndex = null;
    this.flight = null;
    if (this.callbacks.onFollowChange) this.callbacks.onFollowChange(false);
  }

  hoverAt(clientX, clientY) {
    if (this.pickPending) return;
    this.pickPending = true;
    requestAnimationFrame(() => {
      this.pickPending = false;
      const index = this.pick(clientX, clientY);
      this.hoverIndex = index;
      if (this.callbacks.onHover) {
        this.callbacks.onHover(index, index !== null ? this.screenPosition(index) : null);
      }
    });
  }

  pickAndSelect(clientX, clientY) {
    const index = this.pick(clientX, clientY);
    if (this.callbacks.onSelect) this.callbacks.onSelect(index);
  }

  pick(clientX, clientY) {
    if (!this.pickTarget || !this.pickMesh) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (
      clientX < rect.left || clientX > rect.right ||
      clientY < rect.top || clientY > rect.bottom
    ) return null;
    const previousTarget = this.renderer.getRenderTarget();
    const previousColor = new THREE.Color();
    this.renderer.getClearColor(previousColor);
    const previousAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.pickTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.pickScene, this.camera);
    const x = Math.max(
      0,
      Math.min(
        this.pickSize.width - 1,
        Math.round(((clientX - rect.left) / rect.width) * this.pickSize.width)
      )
    );
    const y = Math.max(
      0,
      Math.min(
        this.pickSize.height - 1,
        Math.round(((rect.bottom - clientY) / rect.height) * this.pickSize.height)
      )
    );
    const pixel = new Uint8Array(4);
    this.renderer.readRenderTargetPixels(this.pickTarget, x, y, 1, 1, pixel);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setClearColor(previousColor, previousAlpha);
    const id = pixel[0] * 256 + pixel[1];
    if (!id) return null;
    const index = id - 1;
    return index >= 0 && index < this.satellites.length ? index : null;
  }

  async captureShare({ name, timeText, subtitle }) {
    this.renderer.render(this.scene, this.camera);
    const source = this.renderer.domElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0);
    const scale = canvas.width / 1400;
    const gradient = ctx.createLinearGradient(0, canvas.height * 0.68, 0, canvas.height);
    gradient.addColorStop(0, "rgba(2,5,11,0)");
    gradient.addColorStop(1, "rgba(2,5,11,0.86)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, canvas.height * 0.68, canvas.width, canvas.height * 0.32);
    ctx.fillStyle = "#f6f7f9";
    ctx.font = `600 ${Math.round(46 * scale)}px Inter, sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.fillText(name || "Live orbital view", 58 * scale, canvas.height - 94 * scale);
    ctx.fillStyle = "#f6c453";
    ctx.font = `500 ${Math.round(19 * scale)}px "JetBrains Mono", monospace`;
    ctx.fillText(timeText, 60 * scale, canvas.height - 58 * scale);
    ctx.fillStyle = "rgba(234,241,255,0.62)";
    ctx.font = `500 ${Math.round(14 * scale)}px Inter, sans-serif`;
    ctx.fillText(subtitle || "Orbital Watch · CelesTrak GP", 60 * scale, canvas.height - 32 * scale);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(234,241,255,0.8)";
    ctx.font = `600 ${Math.round(15 * scale)}px "JetBrains Mono", monospace`;
    ctx.fillText("ORBITAL / WATCH", canvas.width - 58 * scale, 54 * scale);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }
}
