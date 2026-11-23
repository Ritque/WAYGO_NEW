import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import nycSunsetImg from '../assets/images/waygo_nyc_vibey_1795015971383.jpg';

interface RoadCar {
  t: number;
  speed: number;
  laneFrac: number;
  inbound: boolean;
  isCab: boolean;
}

interface CrossCar {
  uFrac: number; // -1..1 across avenue opening
  speed: number;
  v: number;
  dir: 1 | -1;
}

interface ChampagneMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  depth: number;
  phase: number;
  alpha: number;
  rgb: string;
}

interface OpticalBokeh {
  xFrac: number;
  yFrac: number;
  offX: number;
  offY: number;
  radius: number;
  depth: number;
  rgb: string;
  alpha: number;
  phase: number;
  speed: number;
}

interface WindowGlint {
  u: number;
  v: number;
  depth: number;
  phase: number;
  speed: number;
  rgb: string;
}

interface LightPulse {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

const SPIRE_BEACONS: Array<{ u: number; v: number; depth: number; phase: number }> = [
  { u: 0.436, v: 0.043, depth: 0.44, phase: 0.0 },
  { u: 0.614, v: 0.116, depth: 0.42, phase: 1.6 },
  { u: 0.329, v: 0.168, depth: 0.36, phase: 3.1 },
  { u: 0.778, v: 0.064, depth: 0.48, phase: 4.4 }
];

const WINDOW_GLINTS: WindowGlint[] = [
  { u: 0.432, v: 0.245, depth: 0.46, phase: 0.4, speed: 0.65, rgb: '253, 230, 138' },
  { u: 0.441, v: 0.295, depth: 0.48, phase: 1.7, speed: 0.52, rgb: '255, 248, 225' },
  { u: 0.435, v: 0.365, depth: 0.5, phase: 2.9, speed: 0.74, rgb: '251, 191, 36' },
  { u: 0.608, v: 0.255, depth: 0.44, phase: 0.9, speed: 0.58, rgb: '253, 230, 138' },
  { u: 0.618, v: 0.312, depth: 0.47, phase: 3.4, speed: 0.48, rgb: '255, 248, 225' },
  { u: 0.773, v: 0.145, depth: 0.5, phase: 1.2, speed: 0.68, rgb: '253, 230, 138' },
  { u: 0.781, v: 0.225, depth: 0.52, phase: 4.1, speed: 0.54, rgb: '251, 191, 36' },
  { u: 0.775, v: 0.328, depth: 0.56, phase: 2.2, speed: 0.6, rgb: '255, 248, 225' },
  { u: 0.615, v: 0.495, depth: 0.68, phase: 0.7, speed: 0.55, rgb: '253, 230, 138' },
  { u: 0.626, v: 0.585, depth: 0.75, phase: 3.8, speed: 0.66, rgb: '251, 191, 36' },
  { u: 0.162, v: 0.382, depth: 0.56, phase: 2.4, speed: 0.5, rgb: '253, 230, 138' },
  { u: 0.172, v: 0.458, depth: 0.64, phase: 5.1, speed: 0.62, rgb: '255, 248, 225' },
  { u: 0.376, v: 0.605, depth: 0.78, phase: 1.5, speed: 0.53, rgb: '253, 230, 138' },
  { u: 0.384, v: 0.712, depth: 0.86, phase: 4.6, speed: 0.69, rgb: '251, 191, 36' },
  { u: 0.872, v: 0.415, depth: 0.64, phase: 2.0, speed: 0.49, rgb: '253, 230, 138' },
  { u: 0.884, v: 0.525, depth: 0.74, phase: 0.3, speed: 0.64, rgb: '255, 248, 225' },
  { u: 0.905, v: 0.64, depth: 0.84, phase: 2.7, speed: 0.56, rgb: '253, 230, 138' },
  { u: 0.088, v: 0.62, depth: 0.82, phase: 1.9, speed: 0.51, rgb: '251, 191, 36' }
];

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform float uTexAspect;
  uniform vec2 uMouse;
  uniform vec2 uDrift;
  uniform vec2 uPointerUV;
  uniform float uPointerActive;
  uniform float uTime;
  uniform float uZoom;
  uniform float uIntro;

  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p = rot * p * 2.05 + vec2(13.1, 7.7);
      a *= 0.5;
    }
    return v;
  }

  float sceneDepth(vec2 imgUV) {
    float vertical = smoothstep(0.16, 0.98, imgUV.y);
    float canyonDist = abs(imgUV.x - 0.50);
    float towerWalls = smoothstep(0.08, 0.24, canyonDist) * smoothstep(0.24, 0.52, imgUV.y);
    float midSkyline = smoothstep(0.14, 0.46, imgUV.y) * 0.26;
    return clamp(0.12 + vertical * 0.58 + towerWalls * 0.24 + midSkyline, 0.12, 1.0);
  }

  vec3 sampleScene(vec2 imgUV) {
    vec2 clamped = clamp(imgUV, vec2(0.002), vec2(0.998));
    return texture2D(uTexture, vec2(clamped.x, 1.0 - clamped.y)).rgb;
  }

  void main() {
    float viewAspect = uResolution.x / max(1.0, uResolution.y);
    vec2 uvScale = viewAspect >= uTexAspect
      ? vec2(1.0, uTexAspect / viewAspect)
      : vec2(viewAspect / uTexAspect, 1.0);

    // Map screen vUv (0,0 bottom-left -> 1,1 top-right) to image UV (0,0 top-left -> 1,1 bottom-right)
    vec2 screenTopDown = vec2(vUv.x, 1.0 - vUv.y);
    vec2 baseImgUV = (screenTopDown - 0.5) * uvScale / uZoom + 0.5;

    // Smooth 2.5D architectural depth parallax
    float d = sceneDepth(baseImgUV);
    vec2 shift = (uMouse * 0.017 + uDrift * 0.0035) * (0.18 + 0.82 * d);
    vec2 imgUV = baseImgUV + shift;

    vec3 col = sampleScene(imgUV);

    // Matte-accurate sky separation behind Empire State, Chrysler & supertall silhouettes
    float heightGate = 1.0 - smoothstep(0.28, 0.42, imgUV.y);
    float blueSky = smoothstep(0.015, 0.10, col.b - col.r) * smoothstep(0.15, 0.32, col.b);
    float horizonSky = smoothstep(0.66, 0.88, col.r)
      * smoothstep(0.46, 0.72, col.g)
      * smoothstep(0.25, 0.46, col.b)
      * (1.0 - smoothstep(0.25, 0.37, imgUV.y));
    float skyMask = clamp(max(blueSky, horizonSky) * heightGate, 0.0, 1.0);

    // Continuous luxury sunset-to-twilight sky mood progression (~35s seamless cycle)
    float skyCycle = uTime * 0.18;
    float phaseRose = pow(0.5 + 0.5 * sin(skyCycle), 1.35);
    float phaseChampagne = pow(0.5 + 0.5 * cos(skyCycle * 0.72 + 0.9), 1.4);

    float horizBand = smoothstep(0.04, 0.36, imgUV.y);
    float westWarmth = 1.0 - smoothstep(0.05, 0.78, imgUV.x);

    vec3 zenithTone = mix(
      vec3(0.09, 0.22, 0.54),
      vec3(0.25, 0.16, 0.50),
      phaseRose * 0.82
    );
    zenithTone = mix(zenithTone, vec3(0.12, 0.30, 0.62), phaseChampagne * 0.35);

    vec3 horizonTone = mix(
      vec3(1.00, 0.66, 0.32),
      vec3(0.98, 0.44, 0.56),
      phaseRose * 0.85
    );
    horizonTone = mix(horizonTone, vec3(1.00, 0.78, 0.44), phaseChampagne * 0.40);

    vec3 moodSky = mix(zenithTone, horizonTone, horizBand * (0.42 + 0.58 * westWarmth));
    col = mix(col, mix(col, moodSky, 0.68), skyMask * 0.66);

    // Flowing sunlit high-altitude cirrus clouds gliding behind skyscrapers
    vec2 cloudUV1 = vec2(imgUV.x * 2.8 - uTime * 0.016, imgUV.y * 9.5);
    vec2 cloudUV2 = vec2(imgUV.x * 4.6 - uTime * 0.025 + 4.2, imgUV.y * 13.0 + 1.7);
    float c1 = fbm(cloudUV1);
    float c2 = fbm(cloudUV2);
    float cloudDensity = smoothstep(0.45, 0.78, c1 * 0.65 + c2 * 0.35);
    float cloudBand = smoothstep(0.02, 0.13, imgUV.y) * (1.0 - smoothstep(0.26, 0.39, imgUV.y));
    float sunProximity = exp(-abs(imgUV.x - 0.22) * 1.4);
    vec3 cloudGlow = mix(vec3(1.0, 0.74, 0.46), vec3(1.0, 0.52, 0.64), phaseRose);
    col = mix(
      col,
      col * 0.90 + cloudGlow * (0.24 + 0.36 * sunProximity),
      skyMask * cloudDensity * cloudBand * 0.64
    );

    // Subtle crisp early-evening stars twinkling high in the upper twilight zenith
    vec2 starCell = floor(imgUV * vec2(260.0, 146.0));
    vec2 starFract = fract(imgUV * vec2(260.0, 146.0)) - 0.5;
    float starRand = hash21(starCell);
    float isStar = step(0.9925, starRand);
    float starDot = smoothstep(0.32, 0.03, length(starFract)) * isStar;
    float starTwinkle = 0.55 + 0.45 * sin(uTime * (1.8 + starRand * 3.0) + starRand * 62.83);
    float starZone = blueSky * (1.0 - smoothstep(0.08, 0.23, imgUV.y)) * smoothstep(0.18, 0.52, imgUV.x);
    col += vec3(0.95, 0.97, 1.0) * starDot * starTwinkle * starZone * 0.68;

    // Subtle anamorphic optical halation bloom on bright golden & incandescent highlights
    vec3 bloom = vec3(0.0);
    float tapWeights[4];
    float tapOffsets[4];
    tapOffsets[0] = 0.0022; tapWeights[0] = 0.34;
    tapOffsets[1] = 0.0052; tapWeights[1] = 0.28;
    tapOffsets[2] = 0.0095; tapWeights[2] = 0.20;
    tapOffsets[3] = 0.0155; tapWeights[3] = 0.14;

    for (int i = 0; i < 4; i++) {
      vec3 cL = sampleScene(imgUV - vec2(tapOffsets[i], 0.0));
      vec3 cR = sampleScene(imgUV + vec2(tapOffsets[i], 0.0));
      vec3 cU = sampleScene(imgUV - vec2(0.0, tapOffsets[i] * 0.65));
      vec3 cD = sampleScene(imgUV + vec2(0.0, tapOffsets[i] * 0.65));
      vec3 hiL = max(cL - vec3(0.66), vec3(0.0));
      vec3 hiR = max(cR - vec3(0.66), vec3(0.0));
      vec3 hiU = max(cU - vec3(0.72), vec3(0.0));
      vec3 hiD = max(cD - vec3(0.72), vec3(0.0));
      bloom += (hiL + hiR) * tapWeights[i] * 0.85 + (hiU + hiD) * tapWeights[i] * 0.35;
    }
    col += bloom * vec3(1.12, 0.94, 0.72) * (0.48 + (1.0 - uIntro) * 0.35);

    // Volumetric Golden-Hour Crepuscular Light Rays synced to living sky mood
    vec2 sunOrigin = vec2(0.11, 0.305);
    vec2 toSun = imgUV - sunOrigin;
    float sunDist = length(toSun);
    float sunAngle = atan(toSun.y, toSun.x);
    float rayMask = smoothstep(-0.35, 0.55, sunAngle) * (1.0 - smoothstep(0.55, 1.25, sunAngle));
    float rayWave = 0.5 + 0.5 * sin(sunAngle * 14.0 - uTime * 0.22 + sin(sunAngle * 5.0 + uTime * 0.14));
    float rayWave2 = 0.5 + 0.5 * cos(sunAngle * 9.0 + uTime * 0.16);
    float skyFade = 1.0 - smoothstep(0.28, 0.62, imgUV.y);
    float sunShaft = rayMask * pow(rayWave * 0.65 + rayWave2 * 0.35, 2.2) * exp(-sunDist * 1.9) * skyFade;
    vec3 rayColor = mix(vec3(1.0, 0.80, 0.44), vec3(1.0, 0.60, 0.58), phaseRose * 0.62);
    col += rayColor * sunShaft * 0.23;

    // Gentle Hudson River sunset water shimmer on far left horizon
    float riverMask = (1.0 - smoothstep(0.02, 0.105, imgUV.x))
      * smoothstep(0.352, 0.368, imgUV.y)
      * (1.0 - smoothstep(0.388, 0.408, imgUV.y));
    float ripple = pow(0.5 + 0.5 * sin(imgUV.x * 260.0 + uTime * 1.9 + sin(imgUV.y * 420.0 - uTime * 1.3)), 5.0);
    col += mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.58, 0.56), phaseRose * 0.5) * riverMask * ripple * 0.24;

    // Empire State & Chrysler crown atmospheric evening uplight aura
    vec2 esbCrown = (imgUV - vec2(0.436, 0.145)) * vec2(uTexAspect, 1.0);
    vec2 chrysCrown = (imgUV - vec2(0.614, 0.205)) * vec2(uTexAspect, 1.0);
    float crownBreathe = 0.85 + 0.15 * sin(uTime * 0.85);
    float esbAura = exp(-dot(esbCrown, esbCrown) * 58.0) * crownBreathe;
    float chrysAura = exp(-dot(chrysCrown, chrysCrown) * 72.0) * crownBreathe;
    vec3 crownHue = mix(vec3(1.0, 0.78, 0.46), vec3(1.0, 0.62, 0.56), phaseRose * 0.45);
    col += crownHue * (esbAura * 0.14 + chrysAura * 0.12);

    // Subtle drifting canyon valley depth mist separating foreground & mid-distance towers
    float valleyBand = smoothstep(0.34, 0.43, imgUV.y) * (1.0 - smoothstep(0.46, 0.58, imgUV.y));
    float valleyCenter = exp(-pow((imgUV.x - 0.50) * 3.8, 2.0));
    float mistNoise = fbm(vec2(imgUV.x * 5.0 - uTime * 0.02, imgUV.y * 12.0));
    float canyonMist = valleyBand * (0.35 + 0.65 * valleyCenter) * smoothstep(0.35, 0.75, mistNoise);
    vec3 mistColor = mix(vec3(1.0, 0.76, 0.48), vec3(0.98, 0.60, 0.62), phaseRose * 0.5);
    col = mix(col, col + mistColor * 0.22, canyonMist * 0.34);

    // Subtle sky-synced ambient reflection on bright skyscraper windows
    float facadeLum = dot(col, vec3(0.299, 0.587, 0.114));
    float facadeMask = (1.0 - skyMask) * smoothstep(0.45, 0.85, facadeLum) * (1.0 - smoothstep(0.45, 0.78, imgUV.y));
    vec3 skyBounce = mix(vec3(1.0, 0.84, 0.62), vec3(1.0, 0.72, 0.76), phaseRose * 0.6);
    col = mix(col, col * skyBounce, facadeMask * 0.18);

    // Interactive warm specular sheen awakening building window & facade highlights near pointer
    float ptrDist = length((imgUV - uPointerUV) * vec2(uTexAspect, 1.0));
    float ptrGlow = exp(-ptrDist * ptrDist * 18.0) * uPointerActive;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float windowReact = smoothstep(0.28, 0.78, lum);
    col += vec3(1.0, 0.88, 0.64) * ptrGlow * (0.04 + 0.16 * windowReact);

    // Editorial cinema grading, fine 35mm organic micro-grain & perimeter contrast vignette
    col = pow(max(col, vec3(0.0)), vec3(1.02));
    col *= 0.93;
    float grain = (hash21(screenTopDown * uResolution + fract(uTime * 11.7)) - 0.5) * 0.016;
    col += grain;
    vec2 centered = screenTopDown - 0.5;
    float vig = 1.0 - dot(centered, centered) * 0.65;
    col *= clamp(vig, 0.66, 1.0);
    col *= smoothstep(0.0, 1.0, uIntro * 0.85 + 0.15);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const AmbientBackground: React.FC = () => {
  const imageLayerRef = useRef<HTMLDivElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const fxCanvas = fxCanvasRef.current;
    const ctx = fxCanvas ? fxCanvas.getContext('2d') : null;
    const webglCanvas = webglCanvasRef.current;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let frameId = 0;
    let width = Math.max(window.innerWidth, document.documentElement.clientWidth || 1);
    let height = Math.max(window.innerHeight, document.documentElement.clientHeight || 1);

    // Optional Three.js WebGL 2.5D Depth & Volumetric Shader Pipeline
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.OrthographicCamera | null = null;
    let material: THREE.ShaderMaterial | null = null;
    let geometry: THREE.PlaneGeometry | null = null;
    let texture: THREE.Texture | null = null;
    let webglReady = false;

    if (webglCanvas) {
      try {
        renderer = new THREE.WebGLRenderer({
          canvas: webglCanvas,
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);

        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const loader = new THREE.TextureLoader();
        texture = loader.load(nycSunsetImg, () => {
          webglReady = true;
          if (webglCanvasRef.current) {
            webglCanvasRef.current.style.opacity = '1';
          }
          if (prefersReducedMotion && renderer && scene && camera) {
            renderer.render(scene, camera);
          }
        });
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        material = new THREE.ShaderMaterial({
          vertexShader: VERTEX_SHADER,
          fragmentShader: FRAGMENT_SHADER,
          depthWrite: false,
          depthTest: false,
          uniforms: {
            uTexture: { value: texture },
            uResolution: { value: new THREE.Vector2(width, height) },
            uTexAspect: { value: 16 / 9 },
            uMouse: { value: new THREE.Vector2(0, 0) },
            uDrift: { value: new THREE.Vector2(0, 0) },
            uPointerUV: { value: new THREE.Vector2(0.5, 0.5) },
            uPointerActive: { value: 0 },
            uTime: { value: 0 },
            uZoom: { value: 1.07 },
            uIntro: { value: prefersReducedMotion ? 1 : 0 }
          }
        });

        geometry = new THREE.PlaneGeometry(2, 2);
        const quad = new THREE.Mesh(geometry, material);
        scene.add(quad);
      } catch {
        renderer = null;
      }
    }

    const syncSizes = () => {
      width = Math.max(window.innerWidth, document.documentElement.clientWidth || 1);
      height = Math.max(window.innerHeight, document.documentElement.clientHeight || 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (fxCanvas && ctx) {
        fxCanvas.width = Math.floor(width * dpr);
        fxCanvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (renderer && material) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        material.uniforms.uResolution.value.set(width, height);
      }
    };

    syncSizes();

    const pointer = {
      x: width * 0.5,
      y: height * 0.5,
      targetX: width * 0.5,
      targetY: height * 0.5,
      active: false,
      intensity: 0
    };

    const handleMouseMove = (e: MouseEvent) => {
      pointer.targetX = e.clientX;
      pointer.targetY = e.clientY;
      pointer.active = true;
    };

    const handleMouseLeave = () => {
      pointer.active = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        pointer.targetX = e.touches[0].clientX;
        pointer.targetY = e.touches[0].clientY;
        pointer.active = true;
      }
    };

    const handleTouchEnd = () => {
      pointer.active = false;
    };

    // 1. Live Multi-Lane Midtown Avenue Traffic (24 vehicles across inbound & outbound lanes)
    const cars: RoadCar[] = [
      { t: 0.06, speed: 0.072, laneFrac: -0.66, inbound: true, isCab: false },
      { t: 0.16, speed: 0.079, laneFrac: -0.25, inbound: true, isCab: true },
      { t: 0.28, speed: 0.071, laneFrac: -0.63, inbound: true, isCab: false },
      { t: 0.39, speed: 0.082, laneFrac: -0.27, inbound: true, isCab: false },
      { t: 0.51, speed: 0.074, laneFrac: -0.65, inbound: true, isCab: true },
      { t: 0.63, speed: 0.08, laneFrac: -0.24, inbound: true, isCab: false },
      { t: 0.74, speed: 0.069, laneFrac: -0.6, inbound: true, isCab: false },
      { t: 0.85, speed: 0.077, laneFrac: -0.26, inbound: true, isCab: true },
      { t: 0.95, speed: 0.073, laneFrac: -0.62, inbound: true, isCab: false },
      { t: 0.21, speed: 0.084, laneFrac: -0.24, inbound: true, isCab: false },
      { t: 0.45, speed: 0.076, laneFrac: -0.26, inbound: true, isCab: true },
      { t: 0.69, speed: 0.075, laneFrac: -0.64, inbound: true, isCab: false },

      { t: 0.08, speed: 0.076, laneFrac: 0.25, inbound: false, isCab: false },
      { t: 0.19, speed: 0.081, laneFrac: 0.63, inbound: false, isCab: true },
      { t: 0.31, speed: 0.07, laneFrac: 0.24, inbound: false, isCab: false },
      { t: 0.42, speed: 0.079, laneFrac: 0.6, inbound: false, isCab: false },
      { t: 0.54, speed: 0.073, laneFrac: 0.26, inbound: false, isCab: true },
      { t: 0.66, speed: 0.083, laneFrac: 0.62, inbound: false, isCab: false },
      { t: 0.77, speed: 0.071, laneFrac: 0.25, inbound: false, isCab: false },
      { t: 0.88, speed: 0.077, laneFrac: 0.61, inbound: false, isCab: true },
      { t: 0.96, speed: 0.074, laneFrac: 0.27, inbound: false, isCab: false },
      { t: 0.25, speed: 0.085, laneFrac: 0.59, inbound: false, isCab: false },
      { t: 0.48, speed: 0.075, laneFrac: 0.63, inbound: false, isCab: false },
      { t: 0.72, speed: 0.078, laneFrac: 0.24, inbound: false, isCab: false }
    ];

    // Cross-street vehicles fleeting past avenue intersections
    const crossCars: CrossCar[] = [
      { uFrac: -0.4, speed: 0.55, v: 0.665, dir: 1 },
      { uFrac: 0.6, speed: 0.48, v: 0.815, dir: -1 }
    ];

    // 2. Luxury Anamorphic Optical Bokeh Spheres (Multi-depth glass rim + mid-distance shoulder glints)
    const opticalBokehs: OpticalBokeh[] = [
      { xFrac: 0.07, yFrac: 0.76, offX: 0, offY: 0, radius: 24, depth: 1.3, rgb: '253, 224, 138', alpha: 0.085, phase: 0.4, speed: 0.3 },
      { xFrac: 0.13, yFrac: 0.86, offX: 0, offY: 0, radius: 15, depth: 1.05, rgb: '251, 191, 36', alpha: 0.09, phase: 1.6, speed: 0.36 },
      { xFrac: 0.05, yFrac: 0.63, offX: 0, offY: 0, radius: 12, depth: 0.9, rgb: '255, 248, 220', alpha: 0.075, phase: 2.8, speed: 0.32 },
      { xFrac: 0.18, yFrac: 0.91, offX: 0, offY: 0, radius: 19, depth: 1.2, rgb: '253, 186, 116', alpha: 0.07, phase: 4.1, speed: 0.26 },
      { xFrac: 0.91, yFrac: 0.79, offX: 0, offY: 0, radius: 26, depth: 1.32, rgb: '251, 191, 36', alpha: 0.082, phase: 1.1, speed: 0.28 },
      { xFrac: 0.86, yFrac: 0.88, offX: 0, offY: 0, radius: 16, depth: 1.08, rgb: '253, 224, 138', alpha: 0.088, phase: 3.2, speed: 0.34 },
      { xFrac: 0.94, yFrac: 0.66, offX: 0, offY: 0, radius: 13, depth: 0.92, rgb: '255, 248, 220', alpha: 0.07, phase: 5.0, speed: 0.31 },
      { xFrac: 0.82, yFrac: 0.73, offX: 0, offY: 0, radius: 10, depth: 0.78, rgb: '253, 186, 116', alpha: 0.078, phase: 2.1, speed: 0.38 },
      { xFrac: 0.09, yFrac: 0.24, offX: 0, offY: 0, radius: 17, depth: 0.95, rgb: '253, 212, 132', alpha: 0.06, phase: 0.8, speed: 0.24 },
      { xFrac: 0.91, yFrac: 0.23, offX: 0, offY: 0, radius: 16, depth: 0.95, rgb: '191, 219, 254', alpha: 0.052, phase: 3.9, speed: 0.25 },
      // Mid-distance smaller street-level bokeh glints
      { xFrac: 0.26, yFrac: 0.84, offX: 0, offY: 0, radius: 7, depth: 0.62, rgb: '253, 230, 138', alpha: 0.095, phase: 1.4, speed: 0.42 },
      { xFrac: 0.74, yFrac: 0.86, offX: 0, offY: 0, radius: 7.5, depth: 0.64, rgb: '251, 191, 36', alpha: 0.09, phase: 2.9, speed: 0.4 },
      { xFrac: 0.31, yFrac: 0.76, offX: 0, offY: 0, radius: 5.5, depth: 0.55, rgb: '255, 248, 220', alpha: 0.085, phase: 4.5, speed: 0.44 },
      { xFrac: 0.69, yFrac: 0.77, offX: 0, offY: 0, radius: 6, depth: 0.56, rgb: '253, 186, 116', alpha: 0.085, phase: 0.6, speed: 0.41 }
    ];

    // 3. Fine Champagne & Ivory Floating Micro-Spheres (Rack-focus aperture bloom near cursor)
    const motePalette = ['255, 248, 225', '253, 230, 138', '253, 186, 116', '251, 191, 36'];
    const moteCount = width < 640 ? 22 : 36;
    const motes: ChampagneMote[] = Array.from({ length: moteCount }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 7,
      vy: -(5 + Math.random() * 9),
      radius: 1.1 + Math.random() * 1.5,
      depth: 0.5 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.2 + Math.random() * 0.28,
      rgb: motePalette[i % motePalette.length]
    }));

    // Distant twilight aircraft + low eastern horizon helicopter patrols
    let aircraftT = 0.18;
    let heliT = 0.55;

    const pulses: LightPulse[] = [];

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest(
          'button, input, select, textarea, a, [role="dialog"], .cursor-pointer, .modal-content'
        )
      ) {
        return;
      }
      pointer.targetX = e.clientX;
      pointer.targetY = e.clientY;
      pointer.active = true;

      pulses.push({
        x: e.clientX,
        y: e.clientY,
        radius: 10,
        maxRadius: 230,
        alpha: 0.26
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('resize', syncSizes);

    let lastTime = performance.now();
    let elapsed = 0;

    const renderFrame = (now: number, animate: boolean) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      if (animate) elapsed += dt;

      const damp = 1 - Math.exp(-5.0 * dt);
      pointer.x += (pointer.targetX - pointer.x) * damp;
      pointer.y += (pointer.targetY - pointer.y) * damp;
      pointer.intensity += ((pointer.active ? 1 : 0) - pointer.intensity) * damp;

      const normX = (pointer.x - width * 0.5) / width;
      const normY = (pointer.y - height * 0.5) / height;

      const driftX = animate ? Math.sin(elapsed * 0.12) : 0;
      const driftY = animate ? Math.cos(elapsed * 0.09) : 0;
      const zoom = 1.07 + (animate ? Math.sin(elapsed * 0.07) * 0.008 : 0);
      const introProgress = prefersReducedMotion ? 1 : Math.min(1, elapsed / 1.1);

      // Compute viewport cover transform matching shader & 2D overlay
      const imgAspect = 16 / 9;
      const viewAspect = width / height;
      const baseDrawW = viewAspect >= imgAspect ? width : height * imgAspect;
      const baseDrawH = viewAspect >= imgAspect ? width / imgAspect : height;
      const scaledW = baseDrawW * zoom;
      const scaledH = baseDrawH * zoom;

      const midFactor = 0.55; // Depth multiplier for fallback CSS & baseline 2D reference
      const pOffX = -(normX * 0.017 + driftX * 0.0035) * scaledW;
      const pOffY = -(normY * 0.017 + driftY * 0.0035) * scaledH;

      // Update fallback CSS layer if WebGL is still loading or unavailable
      if (imageLayerRef.current && !webglReady) {
        imageLayerRef.current.style.transform = `translate3d(${(pOffX * midFactor).toFixed(2)}px, ${(pOffY * midFactor).toFixed(2)}px, 0) scale(${zoom.toFixed(4)})`;
      }

      // Compute pointer in base image UV space for shader interactive glow
      const baseLeft = (width - scaledW) * 0.5;
      const baseTop = (height - scaledH) * 0.5;
      const ptrU = (pointer.x - baseLeft) / scaledW;
      const ptrV = (pointer.y - baseTop) / scaledH;

      if (renderer && scene && camera && material && webglReady) {
        material.uniforms.uMouse.value.set(normX, normY);
        material.uniforms.uDrift.value.set(driftX, driftY);
        material.uniforms.uPointerUV.value.set(ptrU, ptrV);
        material.uniforms.uPointerActive.value = pointer.intensity;
        material.uniforms.uTime.value = elapsed;
        material.uniforms.uZoom.value = zoom;
        material.uniforms.uIntro.value = introProgress;
        renderer.render(scene, camera);
      }

      // Depth-accurate projection helper matching the GLSL shader displacement
      const toX = (u: number, depth = 0.5) =>
        baseLeft + u * scaledW + pOffX * (0.18 + 0.82 * depth);
      const toY = (v: number, depth = 0.5) =>
        baseTop + v * scaledH + pOffY * (0.18 + 0.82 * depth);

      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        // A. Subtle Flowing Avenue Traffic Light-Stream Glow (Underneath moving vehicles)
        const vpU = 0.5;
        const botU = 0.498;
        const vpV = 0.435;
        const botV = 1.03;
        const roadHalfWidthAtBottom = 0.053;

        const streamPulse = 0.78 + 0.22 * Math.sin(elapsed * 1.1);
        const avTopX = toX(vpU, 0.38);
        const avTopY = toY(vpV, 0.38);
        const avBotX = toX(botU, 0.96);
        const avBotY = toY(botV, 0.96);

        // Warm gold inbound stream
        const inStream = ctx.createLinearGradient(avTopX, avTopY, avBotX, avBotY);
        inStream.addColorStop(0, 'rgba(253, 230, 138, 0.01)');
        inStream.addColorStop(0.55, `rgba(253, 224, 138, ${(0.065 * streamPulse).toFixed(3)})`);
        inStream.addColorStop(1, `rgba(251, 191, 36, ${(0.095 * streamPulse).toFixed(3)})`);
        ctx.fillStyle = inStream;
        ctx.beginPath();
        ctx.moveTo(avTopX - scaledW * 0.005, avTopY);
        ctx.lineTo(avTopX, avTopY);
        ctx.lineTo(avBotX, avBotY);
        ctx.lineTo(avBotX - scaledW * roadHalfWidthAtBottom * 0.95, avBotY);
        ctx.closePath();
        ctx.fill();

        // Warm ruby outbound stream
        const outStream = ctx.createLinearGradient(avTopX, avTopY, avBotX, avBotY);
        outStream.addColorStop(0, 'rgba(244, 63, 94, 0.01)');
        outStream.addColorStop(0.55, `rgba(239, 68, 68, ${(0.055 * streamPulse).toFixed(3)})`);
        outStream.addColorStop(1, `rgba(244, 63, 94, ${(0.085 * streamPulse).toFixed(3)})`);
        ctx.fillStyle = outStream;
        ctx.beginPath();
        ctx.moveTo(avTopX, avTopY);
        ctx.lineTo(avTopX + scaledW * 0.005, avTopY);
        ctx.lineTo(avBotX + scaledW * roadHalfWidthAtBottom * 0.95, avBotY);
        ctx.lineTo(avBotX, avBotY);
        ctx.closePath();
        ctx.fill();

        // B. Live Midtown Skyscraper Window Micro-Glints & Crisp FAA Spire Beacons
        for (const wg of WINDOW_GLINTS) {
          const wx = toX(wg.u, wg.depth);
          const wy = toY(wg.v, wg.depth);
          const breathe = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(elapsed * wg.speed + wg.phase));
          const wr = 3.2 + breathe * 2.8;
          const wGrad = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
          wGrad.addColorStop(0, `rgba(255, 252, 240, ${(0.5 * breathe).toFixed(3)})`);
          wGrad.addColorStop(0.42, `rgba(${wg.rgb}, ${(0.24 * breathe).toFixed(3)})`);
          wGrad.addColorStop(1, `rgba(${wg.rgb}, 0)`);
          ctx.fillStyle = wGrad;
          ctx.beginPath();
          ctx.arc(wx, wy, wr, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const sb of SPIRE_BEACONS) {
          const sx = toX(sb.u, sb.depth);
          const sy = toY(sb.v, sb.depth);
          const pulse = Math.pow(Math.max(0, Math.sin(elapsed * 1.9 + sb.phase)), 7);
          if (pulse > 0.04) {
            const br = 6.5 + pulse * 12;
            const bg = ctx.createRadialGradient(sx, sy, 0, sx, sy, br);
            bg.addColorStop(0, `rgba(255, 232, 232, ${(0.9 * pulse).toFixed(3)})`);
            bg.addColorStop(0.32, `rgba(248, 113, 113, ${(0.58 * pulse).toFixed(3)})`);
            bg.addColorStop(1, 'rgba(248, 113, 113, 0)');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.arc(sx, sy, br, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // C. Distant Twilight Executive Aircraft & Eastern Midtown Helicopter
        if (animate) {
          aircraftT = (aircraftT + dt * 0.015) % 1;
          heliT = (heliT + dt * 0.012) % 1;
        }
        const airU = 0.96 - aircraftT * 0.92;
        const airV = 0.125 - aircraftT * 0.032;
        const airX = toX(airU, 0.2);
        const airY = toY(airV, 0.2);
        const airFade = Math.sin(aircraftT * Math.PI);
        if (airFade > 0.05) {
          const strobe = Math.pow(Math.max(0, Math.sin(elapsed * 4.5)), 8);
          const navG = ctx.createRadialGradient(airX, airY, 0, airX, airY, 4.5);
          navG.addColorStop(0, `rgba(255, 250, 235, ${(0.75 * airFade).toFixed(3)})`);
          navG.addColorStop(1, 'rgba(255, 250, 235, 0)');
          ctx.fillStyle = navG;
          ctx.beginPath();
          ctx.arc(airX, airY, 4.5, 0, Math.PI * 2);
          ctx.fill();
          if (strobe > 0.08) {
            const stG = ctx.createRadialGradient(airX + 3, airY + 0.5, 0, airX + 3, airY + 0.5, 6 * strobe + 2);
            stG.addColorStop(0, `rgba(255, 220, 220, ${(0.85 * strobe * airFade).toFixed(3)})`);
            stG.addColorStop(0.4, `rgba(248, 113, 113, ${(0.55 * strobe * airFade).toFixed(3)})`);
            stG.addColorStop(1, 'rgba(248, 113, 113, 0)');
            ctx.fillStyle = stG;
            ctx.beginPath();
            ctx.arc(airX + 3, airY + 0.5, 6 * strobe + 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        const heliU = 0.67 + heliT * 0.24;
        const heliV = 0.22 + Math.sin(heliT * Math.PI * 2) * 0.012;
        const heliX = toX(heliU, 0.34);
        const heliY = toY(heliV, 0.34);
        const heliFade = Math.sin(heliT * Math.PI);
        if (heliFade > 0.05) {
          const hPulse = Math.pow(Math.max(0, Math.sin(elapsed * 3.4 + 1.1)), 7);
          const hG = ctx.createRadialGradient(heliX, heliY, 0, heliX, heliY, 4);
          hG.addColorStop(0, `rgba(253, 230, 138, ${(0.65 * heliFade).toFixed(3)})`);
          hG.addColorStop(1, 'rgba(253, 230, 138, 0)');
          ctx.fillStyle = hG;
          ctx.beginPath();
          ctx.arc(heliX, heliY, 4, 0, Math.PI * 2);
          ctx.fill();
          if (hPulse > 0.1) {
            const hsG = ctx.createRadialGradient(heliX, heliY, 0, heliX, heliY, 5.5 * hPulse + 2);
            hsG.addColorStop(0, `rgba(255, 225, 225, ${(0.75 * hPulse * heliFade).toFixed(3)})`);
            hsG.addColorStop(1, 'rgba(248, 113, 113, 0)');
            ctx.fillStyle = hsG;
            ctx.beginPath();
            ctx.arc(heliX, heliY, 5.5 * hPulse + 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // D. Cross-Street Intersecting Headlight Sweeps Inside Avenue Canyon
        for (const cc of crossCars) {
          if (animate) {
            cc.uFrac += cc.dir * cc.speed * dt;
            if (cc.uFrac > 1.1) cc.uFrac = -1.1;
            else if (cc.uFrac < -1.1) cc.uFrac = 1.1;
          }
          const cDepth = (cc.v - vpV) / (botV - vpV);
          const centerU = vpU + (botU - vpU) * cDepth;
          const halfW = roadHalfWidthAtBottom * cDepth * 0.92;
          const u = centerU + cc.uFrac * halfW;
          const cx = toX(u, 0.38 + 0.58 * cDepth);
          const cy = toY(cc.v, 0.38 + 0.58 * cDepth);
          const edgeAlpha = Math.max(0, 1 - Math.pow(Math.abs(cc.uFrac), 3)) * 0.72;
          if (edgeAlpha > 0.03) {
            const s = 0.4 + cDepth * 0.9;
            const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 7 * s);
            cg.addColorStop(0, `rgba(255, 248, 225, ${(0.85 * edgeAlpha).toFixed(3)})`);
            cg.addColorStop(0.4, `rgba(253, 224, 138, ${(0.4 * edgeAlpha).toFixed(3)})`);
            cg.addColorStop(1, 'rgba(253, 224, 138, 0)');
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.arc(cx, cy, 7 * s, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // E. Photorealistic 24-Vehicle Live Avenue Traffic
        for (const car of cars) {
          if (animate) {
            car.t += (car.inbound ? car.speed : -car.speed) * dt;
            if (car.t > 1.02) car.t = 0.03;
            else if (car.t < 0.03) car.t = 1.02;
          }

          const persp = Math.pow(car.t, 1.85);
          const layerDepth = 0.38 + 0.58 * persp;
          const centerU = vpU + (botU - vpU) * persp;
          const u = centerU + car.laneFrac * roadHalfWidthAtBottom * persp;
          const v = vpV + (botV - vpV) * persp;

          const cx = toX(u, layerDepth);
          const cy = toY(v, layerDepth);
          const carScale = 0.2 + persp * 1.35;
          const alpha = Math.sin(Math.min(1, Math.max(0, car.t)) * Math.PI) * 0.95;
          if (alpha <= 0.03) continue;

          const halfSep = 3.25 * carScale;

          if (car.inbound) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            const bodyW = 9.0 * carScale;
            const bodyH = 4.0 * carScale;
            const bodyGrad = ctx.createRadialGradient(
              cx,
              cy - bodyH * 0.52,
              bodyW * 0.1,
              cx,
              cy - bodyH * 0.52,
              bodyW * 0.72
            );
            bodyGrad.addColorStop(
              0,
              car.isCab
                ? `rgba(220, 162, 16, ${(0.56 * alpha).toFixed(3)})`
                : `rgba(10, 14, 24, ${(0.6 * alpha).toFixed(3)})`
            );
            bodyGrad.addColorStop(1, 'rgba(10, 14, 24, 0)');
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.ellipse(cx, cy - bodyH * 0.48, bodyW * 0.56, bodyH * 0.58, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            const reflLen = 21 * carScale;
            for (const lx of [cx - halfSep, cx + halfSep]) {
              const reflGrad = ctx.createLinearGradient(lx, cy, lx, cy + reflLen);
              reflGrad.addColorStop(0, `rgba(255, 246, 224, ${(0.36 * alpha).toFixed(3)})`);
              reflGrad.addColorStop(1, 'rgba(255, 246, 224, 0)');
              ctx.fillStyle = reflGrad;
              ctx.fillRect(lx - 1.2 * carScale, cy, 2.4 * carScale, reflLen);

              const hg = ctx.createRadialGradient(lx, cy, 0, lx, cy, 6.4 * carScale);
              hg.addColorStop(0, `rgba(255, 255, 252, ${(0.96 * alpha).toFixed(3)})`);
              hg.addColorStop(0.28, `rgba(254, 240, 199, ${(0.55 * alpha).toFixed(3)})`);
              hg.addColorStop(1, 'rgba(254, 240, 199, 0)');
              ctx.fillStyle = hg;
              ctx.beginPath();
              ctx.arc(lx, cy, 6.4 * carScale, 0, Math.PI * 2);
              ctx.fill();
            }

            const flareW = 15 * carScale;
            const flareGrad = ctx.createLinearGradient(cx - flareW, cy, cx + flareW, cy);
            flareGrad.addColorStop(0, 'rgba(255, 244, 214, 0)');
            flareGrad.addColorStop(0.5, `rgba(255, 244, 214, ${(0.2 * alpha).toFixed(3)})`);
            flareGrad.addColorStop(1, 'rgba(255, 244, 214, 0)');
            ctx.fillStyle = flareGrad;
            ctx.fillRect(cx - flareW, cy - 0.65 * carScale, flareW * 2, 1.3 * carScale);

            if (car.isCab && persp > 0.14) {
              const medY = cy - 4.4 * carScale;
              const mg = ctx.createRadialGradient(cx, medY, 0, cx, medY, 3.6 * carScale);
              mg.addColorStop(0, `rgba(254, 240, 138, ${(0.75 * alpha).toFixed(3)})`);
              mg.addColorStop(1, 'rgba(254, 240, 138, 0)');
              ctx.fillStyle = mg;
              ctx.beginPath();
              ctx.arc(cx, medY, 3.6 * carScale, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            const bodyW = 8.2 * carScale;
            const bodyH = 3.7 * carScale;
            const bodyGrad = ctx.createRadialGradient(
              cx,
              cy - bodyH * 0.48,
              bodyW * 0.1,
              cx,
              cy - bodyH * 0.48,
              bodyW * 0.7
            );
            bodyGrad.addColorStop(
              0,
              car.isCab
                ? `rgba(182, 132, 14, ${(0.45 * alpha).toFixed(3)})`
                : `rgba(10, 14, 24, ${(0.52 * alpha).toFixed(3)})`
            );
            bodyGrad.addColorStop(1, 'rgba(10, 14, 24, 0)');
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.ellipse(cx, cy - bodyH * 0.44, bodyW * 0.54, bodyH * 0.54, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            const trailLen = 19 * carScale;
            for (const lx of [cx - halfSep, cx + halfSep]) {
              const trailGrad = ctx.createLinearGradient(lx, cy, lx, cy + trailLen);
              trailGrad.addColorStop(0, `rgba(244, 63, 94, ${(0.4 * alpha).toFixed(3)})`);
              trailGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
              ctx.fillStyle = trailGrad;
              ctx.fillRect(lx - 1.1 * carScale, cy, 2.2 * carScale, trailLen);

              const tg = ctx.createRadialGradient(lx, cy, 0, lx, cy, 5.8 * carScale);
              tg.addColorStop(0, `rgba(255, 224, 224, ${(0.9 * alpha).toFixed(3)})`);
              tg.addColorStop(0.32, `rgba(239, 68, 68, ${(0.58 * alpha).toFixed(3)})`);
              tg.addColorStop(1, 'rgba(239, 68, 68, 0)');
              ctx.fillStyle = tg;
              ctx.beginPath();
              ctx.arc(lx, cy, 5.8 * carScale, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        // F. Interactive 3D-Depth Anamorphic Optical Bokeh Spheres ("Small Balls", Elevated)
        for (const b of opticalBokehs) {
          const baseBx =
            b.xFrac * width +
            Math.sin(elapsed * b.speed + b.phase) * 10 -
            normX * 26 * b.depth;
          const baseBy =
            b.yFrac * height +
            Math.cos(elapsed * b.speed * 0.85 + b.phase) * 8 -
            normY * 18 * b.depth;

          // Subtle fluid parting around pointer
          let targetOffX = 0;
          let targetOffY = 0;
          let ptrBoost = 0;
          if (pointer.intensity > 0.03) {
            const dx = baseBx - pointer.x;
            const dy = baseBy - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1 && dist < 240) {
              const force = (1 - dist / 240) * pointer.intensity;
              targetOffX = (dx / dist) * force * 24 * b.depth;
              targetOffY = (dy / dist) * force * 18 * b.depth;
              ptrBoost = force * 0.05;
            }
          }
          b.offX += (targetOffX - b.offX) * Math.min(1, 5 * dt);
          b.offY += (targetOffY - b.offY) * Math.min(1, 5 * dt);

          const bx = baseBx + b.offX;
          const by = baseBy + b.offY;
          const breathe = 0.85 + 0.15 * Math.sin(elapsed * 0.95 + b.phase);
          const a = (b.alpha + ptrBoost) * breathe;

          const og = ctx.createRadialGradient(bx, by, 0, bx, by, b.radius);
          og.addColorStop(0, `rgba(${b.rgb}, ${(a * 0.25).toFixed(3)})`);
          og.addColorStop(0.68, `rgba(${b.rgb}, ${(a * 0.42).toFixed(3)})`);
          og.addColorStop(0.88, `rgba(${b.rgb}, ${(a * 0.95).toFixed(3)})`);
          og.addColorStop(0.95, `rgba(255, 252, 242, ${(a * 0.72).toFixed(3)})`);
          og.addColorStop(1, `rgba(${b.rgb}, 0)`);
          ctx.fillStyle = og;
          ctx.beginPath();
          ctx.arc(bx, by, b.radius, 0, Math.PI * 2);
          ctx.fill();

          // Delicate upper-left specular glass crescent inside the bokeh lens disc
          const specX = bx - b.radius * 0.34;
          const specY = by - b.radius * 0.34;
          const sg = ctx.createRadialGradient(specX, specY, 0, specX, specY, b.radius * 0.45);
          sg.addColorStop(0, `rgba(255, 253, 245, ${(a * 0.65).toFixed(3)})`);
          sg.addColorStop(1, 'rgba(255, 253, 245, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(specX, specY, b.radius * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }

        // G. Fine Champagne Floating Micro-Spheres Awakening Near Cursor Beam
        for (const m of motes) {
          if (animate) {
            m.x += (m.vx + Math.sin(elapsed * 0.55 + m.phase) * 4.5) * dt;
            m.y += m.vy * dt;
            if (m.y < -16) {
              m.y = height + 16;
              m.x = Math.random() * width;
            }
            if (m.x < -16) m.x = width + 16;
            else if (m.x > width + 16) m.x = -16;
          }

          const px = m.x - normX * 18 * m.depth;
          const py = m.y - normY * 12 * m.depth;

          let cursorWarmth = 0;
          if (pointer.intensity > 0.03) {
            const dist = Math.hypot(px - pointer.x, py - pointer.y);
            if (dist < 200) {
              cursorWarmth = (1 - dist / 200) * 0.3 * pointer.intensity;
            }
          }

          const shimmer = 0.72 + 0.28 * Math.sin(elapsed * 1.5 + m.phase);
          const a = Math.min(0.7, (m.alpha + cursorWarmth) * shimmer);
          const focusFactor = Math.min(1, cursorWarmth / 0.28);
          const r = m.radius * (3.1 + focusFactor * 2.6);

          const mg = ctx.createRadialGradient(px, py, 0, px, py, r);
          if (focusFactor > 0.18) {
            // Rack-focus into crisp warm glass aperture ring near cursor
            mg.addColorStop(0, `rgba(255, 252, 244, ${(a * (0.85 - focusFactor * 0.45)).toFixed(3)})`);
            mg.addColorStop(0.62, `rgba(${m.rgb}, ${(a * 0.42).toFixed(3)})`);
            mg.addColorStop(0.86, `rgba(253, 230, 138, ${(a * 0.85).toFixed(3)})`);
            mg.addColorStop(1, `rgba(${m.rgb}, 0)`);
          } else {
            mg.addColorStop(0, `rgba(255, 252, 244, ${(a * 0.92).toFixed(3)})`);
            mg.addColorStop(0.42, `rgba(${m.rgb}, ${(a * 0.56).toFixed(3)})`);
            mg.addColorStop(0.78, `rgba(${m.rgb}, ${(a * 0.22).toFixed(3)})`);
            mg.addColorStop(1, `rgba(${m.rgb}, 0)`);
          }
          ctx.fillStyle = mg;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // H. Dual-Ring Restrained Champagne Click Optical Wave
        for (let i = pulses.length - 1; i >= 0; i--) {
          const rp = pulses[i];
          rp.radius += (rp.maxRadius - rp.radius) * Math.min(1, 4.4 * dt);
          rp.alpha *= Math.exp(-3.3 * dt);
          if (rp.alpha < 0.008) {
            pulses.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = `rgba(253, 230, 138, ${rp.alpha.toFixed(3)})`;
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = `rgba(255, 248, 225, ${(rp.alpha * 0.45).toFixed(3)})`;
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.radius * 0.72, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }

      if (animate) {
        frameId = requestAnimationFrame((ts) => renderFrame(ts, true));
      }
    };

    if (prefersReducedMotion) {
      renderFrame(performance.now(), false);
    } else {
      frameId = requestAnimationFrame((ts) => renderFrame(ts, true));
    }

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('resize', syncSizes);
      geometry?.dispose();
      material?.dispose();
      texture?.dispose();
      renderer?.dispose();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 w-screen h-[100dvh] pointer-events-none z-0 overflow-hidden select-none bg-[#060911]"
    >
      {/* Instant Fallback & Pre-Load Photorealistic Golden-Hour Midtown NYC Skyline */}
      <div
        ref={imageLayerRef}
        className="absolute inset-0 w-full h-full will-change-transform scale-[1.07]"
      >
        <img
          src={nycSunsetImg}
          alt=""
          className="w-full h-full object-cover object-center brightness-[0.87] contrast-[1.06] saturate-[1.04]"
          decoding="async"
        />
      </div>

      {/* Three.js WebGL 2.5D Architectural Depth, Volumetric Sun Shafts & Anamorphic Bloom Layer */}
      <canvas
        ref={webglCanvasRef}
        className="absolute inset-0 w-full h-full opacity-0 transition-opacity duration-500"
      />

      {/* Measured Editorial Contrast Scrim (Keeps Foreground Cards Effortlessly Readable) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#060911]/40 via-[#070b14]/16 to-[#04070e]/68" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,10,18,0.16)_0%,rgba(4,7,14,0.52)_100%)]" />

      {/* Depth-Locked Avenue Traffic, Intersecting Headlights, Aircraft & Prime-Lens Bokeh */}
      <canvas ref={fxCanvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};
