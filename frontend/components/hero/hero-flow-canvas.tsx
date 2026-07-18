"use client";

import { useEffect, useRef } from "react";

/**
 * HeroFlowCanvas — lightweight raw-WebGL fragment shader replicating the
 * Monolog "flowing light-smoke" hero effect.
 *
 * What it renders:
 *   A wide, soft beam of diffuse light (the "hot-spot") that slowly sweeps
 *   left-to-right across a very dark background, overlaid with a fBm-noise
 *   smoke field that gives it an organic, living quality. The beam color is
 *   tinted with the brand's violet (--primary) and gold (--gold) to match the
 *   existing atmosphere rather than being neutral grey like Monolog's.
 *
 * Engineering choices:
 *   - Zero new dependencies — raw WebGL2 with a single fullscreen quad.
 *   - DPR capped at 1.5 to stay GPU-light on retina.
 *   - IntersectionObserver pauses the rAF loop when off-screen.
 *   - prefers-reduced-motion → canvas is hidden, CSS fog shows instead.
 *   - Falls back gracefully if WebGL2 is not supported (canvas hidden).
 */
export function HeroFlowCanvas({
  className = "",
}: {
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Reduced-motion: hide the canvas, let the CSS fog take over.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      canvas.style.display = "none";
      return;
    }

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      canvas.style.display = "none";
      return;
    }

    // ── Shaders ──────────────────────────────────────────────────────────────
    const vert = `#version 300 es
      in vec2 a_pos;
      out vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    // Fragment shader: fBm noise field + a sweeping gaussian beam.
    // All color values use the brand palette baked in (violet / gold / near-black).
    const frag = `#version 300 es
      precision mediump float;
      uniform float u_time;
      uniform vec2  u_res;
      in  vec2 v_uv;
      out vec4 fragColor;

      // ── Hash / noise helpers ─────────────────────────────────────────────
      float hash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 17.5);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i),              hash(i + vec2(1,0)), u.x),
          mix(hash(i + vec2(0,1)),  hash(i + vec2(1,1)), u.x),
          u.y
        );
      }
      // 4-octave fBm
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p  = p * 2.1 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      // ── Brand palette (approximate oklch → linear sRGB) ──────────────────
      // Primary violet  hsl(258 90% 66%)  → approx #8B5CF6
      const vec3 COL_VIOLET = vec3(0.545, 0.361, 0.965);
      // Gold            hsl(42 65% 56%)   → approx #D6A949
      const vec3 COL_GOLD   = vec3(0.839, 0.663, 0.286);
      // Near-black bg   hsl(258 45% 12%)  → approx #140F26
      const vec3 COL_BG     = vec3(0.078, 0.059, 0.149);

      void main() {
        // Aspect-correct UV centred at (0,0)
        float aspect = u_res.x / u_res.y;
        vec2 uv = (v_uv - 0.5) * vec2(aspect, 1.0);

        // ── Sweep: a gaussian hot-spot that drifts left-right ─────────────
        // x-center oscillates slowly; y-center sits slightly above mid.
        float t = u_time * 0.07;
        float cx = sin(t * 0.8) * aspect * 0.38;           // gentle L↔R swing
        float cy = -0.06 + sin(t * 0.55) * 0.06;           // slow vertical bob

        // Gaussian beam profile (wide on x, narrow on y for the "streak" look)
        float dx = (uv.x - cx) / (aspect * 0.55);
        float dy = (uv.y - cy) / 0.28;
        float beam = exp(-(dx*dx + dy*dy));

        // ── fBm smoke field displaced by time ────────────────────────────
        vec2 smokeUV = uv * 1.8 + vec2(u_time * 0.025, u_time * 0.012);
        float smoke   = fbm(smokeUV);
        // Second octave offset for extra depth
        float smoke2  = fbm(smokeUV * 1.4 + vec2(3.7, 1.2));
        float smokeMix = smoke * 0.65 + smoke2 * 0.35;

        // ── Compose ──────────────────────────────────────────────────────
        // The beam is the primary light; smoke modulates its density.
        float beamMod  = beam * (0.72 + smokeMix * 0.44);

        // Colour: blend violet → gold based on horizontal sweep position
        // (left half = more violet, right half = more gold)
        float warmth   = smoothstep(-aspect*0.3, aspect*0.3, cx + smoke*0.3);
        vec3  beamCol  = mix(COL_VIOLET, COL_GOLD, warmth * 0.38);

        // A faint ambient smoke tint adds volume at low intensities
        float ambient  = smokeMix * smokeMix * 0.055;
        vec3  ambCol   = mix(COL_VIOLET, COL_BG, 0.55);

        vec3 color = COL_BG
                   + beamCol  * beamMod  * 0.82
                   + ambCol   * ambient;

        // Soft vignette to kill hard canvas edges
        vec2 vigUV  = v_uv * (1.0 - v_uv);
        float vig   = vigUV.x * vigUV.y * 14.0;
        vig         = pow(clamp(vig, 0.0, 1.0), 0.35);
        color      *= vig;

        fragColor   = vec4(color, 1.0);
      }
    `;

    // ── Compile ─────────────────────────────────────────────────────────────
    function compileShader(type: number, src: string) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    const vs = compileShader(gl.VERTEX_SHADER, vert);
    const fs = compileShader(gl.FRAGMENT_SHADER, frag);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes  = gl.getUniformLocation(prog, "u_res");

    // ── Resize ──────────────────────────────────────────────────────────────
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width  = w * DPR;
      canvas.height = h * DPR;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Render loop ─────────────────────────────────────────────────────────
    let raf = 0;
    let visible = true;

    const render = (t: number) => {
      if (!visible) { raf = 0; return; }
      gl.uniform1f(uTime, t * 0.001);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(render);
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
