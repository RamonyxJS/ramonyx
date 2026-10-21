// Medan partikel 3D untuk hero: medan bergelombang berperspektif + pita "jalan" hangat menuju
// horizon, additive blending, riak mengikuti kursor, kamera maju mengikuti scroll.
// Canvas 2D (tanpa dependensi). Loop hanya berjalan saat terlihat; reduced-motion → satu frame statis.
import { useEffect, useRef } from "react";

type Tone = "auto" | "dark";

interface Palette {
  readonly terrain: readonly [number, number, number];
  readonly road: readonly [number, number, number];
  readonly star: readonly [number, number, number];
  readonly starAlpha: number;
  readonly blend: GlobalCompositeOperation;
}

const DARK_PALETTE: Palette = {
  terrain: [120, 150, 255],
  road: [255, 176, 96],
  star: [190, 205, 255],
  starAlpha: 0.6,
  blend: "lighter",
};
const LIGHT_PALETTE: Palette = {
  terrain: [47, 75, 255],
  road: [207, 120, 34],
  star: [47, 75, 255],
  starAlpha: 0.32,
  blend: "source-over",
};

function resolvePalette(tone: Tone): Palette {
  if (tone === "dark") {
    return DARK_PALETTE;
  }
  const theme = document.documentElement.dataset.theme;
  const dark =
    theme === "dark" ||
    (theme === undefined && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return dark ? DARK_PALETTE : LIGHT_PALETTE;
}

function schedule(callback: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 120);
  return () => window.clearTimeout(id);
}

export function ParticleField({ tone = "auto" }: { readonly tone?: Tone } = {}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) {
      return;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let palette = resolvePalette(tone);
    let width = 1;
    let height = 1;
    let cols = 0;
    let rows = 0;
    let frame = 0;
    let visible = true;
    let disposed = false;
    let cancelStart: (() => void) | null = null;
    const mouse = { x: -9999, y: -9999, active: false, strength: 0 };
    let stars: Float32Array = new Float32Array(0);

    const roadCenter = (z: number, t: number): number =>
      Math.sin(z * 0.55 + t * 0.00018) * 2.6 + Math.sin(z * 0.21 - t * 0.00011) * 1.8;

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const small = width < 640;
      cols = small ? 90 : 190;
      rows = small ? 46 : 74;
      const count = small ? 60 : 130;
      stars = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        stars[i * 3] = Math.random() * width;
        stars[i * 3 + 1] = Math.random() * height * 0.46;
        stars[i * 3 + 2] = Math.random() * Math.PI * 2;
      }
    };

    const draw = (time: number, animate: boolean): void => {
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = palette.blend;
      const t = animate ? time : 0;
      const horizon = height * 0.3;
      const focal = Math.min(width, height * 1.7) * 0.82;
      const camera = 3.1;
      const fly = window.scrollY * 0.006;
      const centerX = width * 0.5;
      const spanX = 17;

      for (let i = 0; i < stars.length; i += 3) {
        const twinkle = 0.25 + 0.35 * Math.sin(t * 0.0012 + (stars[i + 2] ?? 0));
        context.fillStyle = `rgba(${palette.star[0]},${palette.star[1]},${palette.star[2]},${(twinkle * palette.starAlpha).toFixed(3)})`;
        context.fillRect(stars[i] ?? 0, stars[i + 1] ?? 0, 1.2, 1.2);
      }

      mouse.strength += ((mouse.active ? 1 : 0) - mouse.strength) * 0.08;

      for (let r = 0; r < rows; r += 1) {
        const depth = r / (rows - 1);
        const z = 1.9 + depth * depth * 26 + fly * 0.0;
        const worldZ = z + fly;
        const scale = focal / z;
        const fog = (1 - depth) ** 1.15;
        const road = roadCenter(worldZ, t);
        for (let c = 0; c < cols; c += 1) {
          const u = c / (cols - 1) - 0.5;
          const x = u * spanX * (0.55 + z * 0.16) + (r % 2 === 0 ? 0 : (spanX / cols) * 0.5);
          const fromRoad = x - road;
          const valley = Math.min(1, Math.abs(fromRoad) / 3.4);
          const hills =
            valley ** 1.6 *
            (1.35 +
              Math.sin(worldZ * 0.9 + x * 0.55 + t * 0.00035) * 0.55 +
              Math.sin(x * 1.3 - worldZ * 0.4) * 0.35);
          const ripple = Math.sin(worldZ * 2.2 - t * 0.0016 + x * 0.7) * 0.12 * (0.4 + valley);
          const h = hills + ripple;
          let sx = centerX + x * scale;
          let sy = horizon + (camera - h) * scale * 0.34;
          if (sx < -8 || sx > width + 8 || sy > height + 8) {
            continue;
          }
          if (mouse.strength > 0.01) {
            const dx = sx - mouse.x;
            const dy = sy - mouse.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 190 && dist > 0.1) {
              const push = (1 - dist / 190) * 26 * mouse.strength;
              sx += (dx / dist) * push;
              sy += (dy / dist) * push - push * 0.6;
            }
          }
          const onRoad = Math.abs(fromRoad) < 0.32 + depth * 0.3;
          const rgb = onRoad ? palette.road : palette.terrain;
          const lift = Math.min(1, h * 0.5);
          const alpha = Math.min(1, fog * (onRoad ? 1.2 : 0.95 + lift * 0.6));
          if (alpha < 0.03) {
            continue;
          }
          const size = Math.max(0.7, scale * 0.0105 * (onRoad ? 1.4 : 1));
          context.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
          context.fillRect(sx - size / 2, sy - size / 2, size, size);
        }
      }
      context.globalCompositeOperation = "source-over";
    };

    const loop = (time: number): void => {
      frame = 0;
      if (disposed || !visible || reduced.matches) {
        return;
      }
      draw(time, true);
      frame = window.requestAnimationFrame(loop);
    };

    const kick = (): void => {
      if (frame === 0 && visible && !reduced.matches && !disposed) {
        frame = window.requestAnimationFrame(loop);
      }
    };

    const start = (): void => {
      cancelStart = null;
      if (disposed) {
        return;
      }
      resize();
      draw(performance.now(), false);
      kick();
    };

    const onPointer = (event: PointerEvent): void => {
      if (event.pointerType === "touch") {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active =
        mouse.x >= 0 && mouse.y >= 0 && mouse.x <= rect.width && mouse.y <= rect.height;
    };
    const onLeave = (): void => {
      mouse.active = false;
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting === true;
      if (visible) {
        kick();
      }
    });
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(performance.now(), !reduced.matches);
    });
    resizeObserver.observe(canvas);
    const onVisibility = (): void => {
      visible = !document.hidden;
      kick();
    };
    const onMotion = (): void => {
      if (reduced.matches) {
        draw(0, false);
      } else {
        kick();
      }
    };
    reduced.addEventListener("change", onMotion);
    const onTheme = (): void => {
      palette = resolvePalette(tone);
      if (!reduced.matches) {
        draw(performance.now(), true);
        kick();
      } else {
        draw(0, false);
      }
    };
    const themeObserver = new MutationObserver(onTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    cancelStart = schedule(start);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      cancelStart?.();
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      observer.disconnect();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      reduced.removeEventListener("change", onMotion);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tone]);

  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: canvas dekoratif, tidak fokusabel
  return <canvas ref={ref} className="particle-field" aria-hidden="true" />;
}
