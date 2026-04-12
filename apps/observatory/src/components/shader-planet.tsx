"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FragCanvas, defineMaterial, useFrame, useMotionGPU, usePointer } from "@motion-core/motion-gpu/react";
import { getWorldName, type World } from "@/lib/types";

interface ShaderPlanetProps {
  world: World;
  index: number;
  onClick: () => void;
  onEnter?: () => void;
  isSelected: boolean;
  compact?: boolean;
  hideLabels?: boolean;
}

// Deterministic hue from world ID (same algo as cobe planet)
function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

// Convert hue (0-360) to RGB triplet normalized 0-1
function hueToRgb(hue: number): [number, number, number] {
  const h = hue / 60;
  const c = 0.75; // saturation * lightness
  const x = c * (1 - Math.abs((h % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; }
  else if (h < 2) { r = x; g = c; }
  else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; }
  else if (h < 5) { r = x; b = c; }
  else { r = c; b = x; }
  return [r, g, b];
}

const STATUS_SAT: Record<string, number> = {
  running: 55,
  creating: 55,
  idle: 40,
  error: 85,
  stopped: 15,
};

// The shader material — adapted from blood-moon by @madebyhex (CC-BY-NC-SA-4.0)
// Modified: parameterized wave color via uWaveColor uniform, world-specific
const material = defineMaterial({
  uniforms: {
    uClick0: { type: "vec4f", value: [0, 0, 1, -100] },
    uClick1: { type: "vec4f", value: [0, 0, 1, -100] },
    uClick2: { type: "vec4f", value: [0, 0, 1, -100] },
    uWaveColor: { type: "vec3f", value: [0.75, 0.0, 0.0] },
    uViewportScale: { type: "f32", value: 1.0 },
  },
  fragment: `
const MAX_STEPS: i32 = 128;
const CLOSENESS: f32 = 0.0001;
const EPSILON: f32 = 0.008;

fn noise(x: vec3f) -> f32 {
  let p = floor(x);
  var f = fract(x);
  f = f * f * (vec3f(3.0) - 2.0 * f);
  let n = p.x + p.y * 157.0 + 113.0 * p.z;
  let v1 = fract(753.5453123 * sin(n + vec4f(0.0, 1.0, 157.0, 158.0)));
  let v2 = fract(753.5453123 * sin(n + vec4f(113.0, 114.0, 270.0, 271.0)));
  let v3 = mix(v1, v2, f.z);
  let v4 = mix(v3.xy, v3.zw, f.y);
  return mix(v4.x, v4.y, f.x);
}

fn rockyBasis() -> mat3x3f {
  return mat3x3f(
    vec3f(0.289, 0.700, 0.654),
    vec3f(0.070, 0.665, -0.743),
    vec3f(-0.955, 0.260, 0.143)
  );
}

fn field(p: vec3f) -> f32 {
  let basis = rockyBasis();
  let p1 = basis * p;
  let p2 = basis * p1;
  let n1 = noise(p1 * 5.0);
  let n2 = noise(p2 * 10.0);
  let n3 = noise(p1 * 20.0);
  let rocky = 0.1 * n1 * n1 + 0.05 * n2 * n2 + 0.02 * n3 * n3;
  let dist = length(p) - 1.0;
  return dist + select(0.0, rocky * 0.2, dist < 0.1);
}

fn fieldLo(p: vec3f) -> f32 {
  let p1 = rockyBasis() * p;
  let n1 = noise(p1 * 5.0);
  return length(p) - 1.0 + 0.02 * n1 * n1;
}

fn getNormal(p: vec3f, val: f32, rot: mat3x3f) -> vec3f {
  return normalize(vec3f(
    field(rot * vec3f(p.x + EPSILON, p.y, p.z)),
    field(rot * vec3f(p.x, p.y + EPSILON, p.z)),
    field(rot * vec3f(p.x, p.y, p.z + EPSILON))
  ) - vec3f(val));
}

fn clickWave(on: vec3f, sn: vec3f, cd: vec4f, t: f32) -> vec3f {
  let age = t - cd.w;
  if (cd.w < 0.0 || age < 0.0 || age > 5.0) { return vec3f(0.0); }
  let c = normalize(cd.xyz);
  let arc = acos(clamp(dot(on, c), -1.0, 1.0));
  let r = age * 1.6;
  let w = mix(0.22, 0.05, clamp(age * 0.3, 0.0, 1.0));
  let ring = exp(-pow((arc - r) / max(w, 0.0001), 2.0) * 3.8);
  let swirl = 0.55 + 0.45 * sin(arc * 40.0 - age * 16.0 + noise(on * 12.0 + c * 7.0) * 8.0);
  let decay = exp(-age * 0.35);
  let fr = pow(1.0 - max(dot(sn, vec3f(0.0, 0.0, 1.0)), 0.0), 1.8);
  return (ring * 2.0 * swirl * decay) * motiongpuUniforms.uWaveColor
       + ring * decay * (0.15 + 0.35 * fr) * motiongpuUniforms.uWaveColor * 3.0;
}

fn frag(uv: vec2f) -> vec4f {
  let res = motiongpuFrame.resolution;
  let time = motiongpuFrame.time;
  let fc = uv * res;
  // Canvas is 1.4x the logical size; sphere fills ~60% of canvas
  // leaving room for the atmospheric glow at the edges
  let rs = 2.8 / max(motiongpuUniforms.uViewportScale, 0.0001);
  let src = vec3f(rs * (fc - 0.5 * res) / res.y, 2.0);
  let dir = vec3f(0.0, 0.0, -1.0);
  let a = time * 0.15;
  let rot = mat3x3f(
    vec3f(-sin(a), 0.0, cos(a)),
    vec3f(0.0, 1.0, 0.0),
    vec3f(cos(a), 0.0, sin(a))
  );
  var t = 0.0;
  var atmos = 0.0;
  var loc = src;
  var val = 1.0;
  for (var i: i32 = 0; i < MAX_STEPS; i += 1) {
    loc = src + t * dir;
    if (loc.z < -1.0) { break; }
    val = field(rot * loc);
    if (val <= CLOSENESS) { break; }
    if (val > 0.00001) { atmos += 0.03; }
    t += val * 0.5;
  }

  let od = normalize(vec3f(0.0, 5.0, 1.0));
  let s1 = max(0.0, fieldLo(rot * (loc + od * 0.1))) / 0.1;
  let s2 = max(0.0, fieldLo(rot * (loc + od * 0.15))) / 0.15;
  var shad = clamp((s1 + s2) * 0.5, 0.0, 1.0);
  shad = mix(shad, 1.0, 0.3);
  let amb = clamp(field(rot * (loc - 0.5 * dir)) / 0.5 * 1.2, 0.0, 1.0);
  // Black background — mix-blend-mode:screen on the canvas makes
  // black pixels invisible against the dark app background
  var fc4 = vec4f(0.0, 0.0, 0.0, 1.0);
  var we = 0.0;
  if (val <= CLOSENESS) {
    let n = getNormal(loc, val, rot);
    let on = normalize(rot * loc);
    let ld = normalize(vec3f(0.0, 3.0, 1.0));
    let vd = normalize(src - loc);
    let li = max(dot(n, ld), 0.0);
    let rm = clamp(1.0 - (1.0 - length(loc)) * 18.0, 0.0, 1.0);
    let body = mix(vec3f(0.02, 0.02, 0.024), vec3f(0.06, 0.055, 0.06), rm * 0.65);
    let sp = pow(max(dot(reflect(-ld, n), vd), 0.0), 64.0) * 0.15;
    let fr = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
    let rim = vec3f(1.0) * fr * 1.5;
    let wave = clickWave(on, n, motiongpuUniforms.uClick0, time)
             + clickWave(on, n, motiongpuUniforms.uClick1, time)
             + clickWave(on, n, motiongpuUniforms.uClick2, time);
    we = clamp(length(wave), 0.0, 4.0);
    let tl = mix(amb * 0.6, shad * li, 0.78) + we * 0.14;
    fc4 = vec4f(body * (0.07 + tl * 0.93) + rim + vec3f(sp) + wave, 1.0);
  }
  let p = 2.0 * (fc / res.y - vec2f(0.5 / res.y * res.x, 0.5));
  let q = max(0.1, min(1.0, dot(vec3f(p, sqrt(max(1.0 - dot(p, p), 0.0))), vec3f(0.0, 2.0, 1.0))));
  let al = shad * max(0.0, dot(normalize(src), normalize(vec3f(0.0, 2.0, 1.0)))) * pow(max(atmos, 0.0), 1.5);
  fc4 += q * vec4f(al * vec3f(0.45, 0.5, 0.6) + pow(we * 0.5, 1.0) * motiongpuUniforms.uWaveColor * 2.0, 1.0);
  return fc4;
}
`,
});

// Runtime component — handles click interaction + per-frame uniform updates
function ShaderRuntime({ waveColor }: { waveColor: [number, number, number] }) {
  const MAX_WAVES = 3;
  const motiongpu = useMotionGPU();
  const waves = useRef(
    Array.from({ length: MAX_WAVES }, (): [number, number, number, number] => [0, 0, 1, -100])
  );
  const nextIdx = useRef(0);
  const ft = useRef(0);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  usePointer({
    onClick: (click) => {
      const { width, height } = motiongpu.size.current;
      if (width <= 0 || height <= 0) return;
      const rs = 2.3; // match shader rayScale
      const aspect = width / height;
      const sx = rs * (click.uv[0] - 0.5) * aspect;
      const sy = rs * (click.uv[1] - 0.5);
      if (sx * sx + sy * sy >= 1) return;
      const sz = Math.sqrt(1 - sx * sx - sy * sy);
      const a = ft.current * 0.15;
      const s = Math.sin(a), c = Math.cos(a);
      const rx = -s * sx + c * sz;
      const ry = sy;
      const rz = c * sx + s * sz;
      const len = Math.hypot(rx, ry, rz);
      if (len < 1e-6) return;
      waves.current[nextIdx.current] = [rx / len, ry / len, rz / len, ft.current];
      nextIdx.current = (nextIdx.current + 1) % MAX_WAVES;
    },
  });

  useFrame((state) => {
    ft.current = state.time;
    // For small planet canvases (140-200px), always use scale 1.0
    // (the original demo scaled for fullscreen viewports)
    state.setUniform("uViewportScale", 1.0);
    state.setUniform("uWaveColor", waveColor);
    for (let i = 0; i < MAX_WAVES; i++) {
      state.setUniform(`uClick${i}`, waves.current[i]);
    }
  });

  return null;
}

// The exported planet component — same interface + scaling as the cobe version
export function Planet({
  world,
  index,
  onClick,
  onEnter,
  isSelected,
  compact,
  hideLabels,
}: ShaderPlanetProps) {
  const isPlaceholder = world.id === "w-new-00000";
  const hue = hashHue(world.id);
  const sat = STATUS_SAT[world.status] ?? 40;
  const waveColor = hueToRgb(hue);
  const size = compact ? 140 : 200;
  const name = getWorldName(world);

  // Responsive check
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  // Scale + filter match the old cobe planet exactly
  const scale = isSelected
    ? isMobile ? 1.3 : compact ? 1.5 : 1.8
    : isMobile ? 0.7 : compact ? 1.15 : 0.85;

  // No CSS drop-shadow — the shader has its own rim glow + atmosphere
  const filter = isSelected ? "brightness(1.15)" : "brightness(1)";

  return (
    <div
      onClick={onClick}
      onDoubleClick={onEnter}
      role="button"
      tabIndex={0}
      className="relative flex flex-col items-center gap-3 focus:outline-none cursor-pointer will-change-transform select-none"
      style={{ width: size, height: size + 40 }}
    >
      {!hideLabels && (
        <span
          className="text-[11px] font-medium tracking-wide text-foreground/60 truncate max-w-[160px]"
          style={{ opacity: isSelected ? 1 : 0.5 }}
        >
          {isPlaceholder ? "" : name}
        </span>
      )}
      {/* Globe wrapper — the canvas is 40% larger than the logical
           size so the atmospheric rim glow has room to breathe without
           being clipped at the canvas edge. negative margin pulls
           the oversized canvas back into the layout flow. */}
      <div
        className="will-change-[transform,filter]"
        style={{
          width: size,
          height: size,
          transform: `scale(${scale})`,
          filter: isPlaceholder ? "grayscale(1) brightness(0.3)" : filter,
          transition:
            "transform 0.9s cubic-bezier(0.16, 1, 0.3, 1), filter 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {isPlaceholder ? (
          <div className="w-full h-full bg-white/[0.03] flex items-center justify-center rounded-full">
            <svg
              className="pointer-events-none text-white/90"
              width="28"
              height="28"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M10 4.5V15.5M4.5 10H15.5"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        ) : (
          <div
            style={{
              width: size * 1.4,
              height: size * 1.4,
              margin: size * -0.2,
              // screen blend mode makes black pixels invisible against
              // the dark app background — the shader's near-black
              // empty area disappears, only the lit sphere shows
              mixBlendMode: "screen",
            }}
          >
            <FragCanvas
              material={material}
              outputColorSpace="linear"
              dpr={2.0}
            >
              <ShaderRuntime waveColor={waveColor} />
            </FragCanvas>
          </div>
        )}
      </div>
      {/* Status dot */}
      <div
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor:
            world.status === "running"
              ? `hsl(${hue}, ${sat}%, 55%)`
              : world.status === "error"
                ? "#ef4444"
                : `hsl(${hue}, 15%, 35%)`,
        }}
      />
    </div>
  );
}
