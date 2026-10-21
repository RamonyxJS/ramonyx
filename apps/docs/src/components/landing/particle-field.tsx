// Field partikel/grid 2D untuk hero. Canvas di-lazy-init, pause saat offscreen/hidden,
// menghormati reduced-motion, dan membaca warna dari token tema.
import { useEffect, useRef } from "react";

interface Point {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  phase: number;
}

const START_DELAY_MS = 180;

function schedule(callback: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 600 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, START_DELAY_MS);
  return () => window.clearTimeout(id);
}

export function ParticleField() {
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
    let width = 0;
    let height = 0;
    let points: Point[] = [];
    let frame = 0;
    let visible = true;
    let disposed = false;
    let cancelStart: (() => void) | null = null;
    const mouse = { x: -9999, y: -9999, active: false };
    const colors = { dot: "#2340c8", line: "#d7d3c5" };

    const readColors = (): void => {
      const style = getComputedStyle(document.documentElement);
      colors.dot = style.getPropertyValue("--accent").trim() || colors.dot;
      colors.line = style.getPropertyValue("--line").trim() || colors.line;
    };

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gap = Math.max(38, Math.min(64, width / (width < 640 ? 12 : 24)));
      points = [];
      let row = 0;
      for (let y = gap * 0.5; y < height; y += gap) {
        row += 1;
        let column = 0;
        for (let x = gap * 0.5; x < width; x += gap) {
          column += 1;
          points.push({
            baseX: x,
            baseY: y,
            x,
            y,
            phase: row * 0.55 + column * 0.35,
          });
        }
      }
      draw(performance.now(), false);
    };

    const draw = (time: number, animate = true): void => {
      context.clearRect(0, 0, width, height);
      const scroll = window.scrollY * 0.025;
      const radius = width < 640 ? 1.1 : 1.4;
      context.fillStyle = colors.dot;
      for (const point of points) {
        const wave = animate ? Math.sin(time * 0.00065 + point.phase) * (width < 640 ? 3 : 5) : 0;
        let offsetX = 0;
        let offsetY = wave - scroll;
        if (mouse.active && !reduced.matches) {
          const dx = point.baseX - mouse.x;
          const dy = point.baseY - mouse.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 170 && distance > 0.1) {
            const force = (1 - distance / 170) * 22;
            offsetX += (dx / distance) * force;
            offsetY += (dy / distance) * force;
          }
        }
        point.x = point.baseX + offsetX;
        point.y = point.baseY + offsetY;
        context.globalAlpha = 0.18 + Math.max(0, Math.sin(point.phase + time * 0.0004)) * 0.22;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    /** Satu frame per batch pointer/scroll — tidak ada loop idle (hemat CPU). */
    const redraw = (): void => {
      if (disposed || !visible || frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        draw(performance.now(), !reduced.matches);
      });
    };

    const start = (): void => {
      cancelStart = null;
      if (disposed) {
        return;
      }
      readColors();
      resize();
      draw(performance.now(), false);
    };

    const onVisibility = (): void => {
      if (document.hidden) {
        visible = false;
        if (frame !== 0) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      } else {
        visible = true;
        draw(performance.now(), false);
      }
    };

    const onScroll = (): void => {
      redraw();
    };

    const onPointer = (event: PointerEvent): void => {
      if (reduced.matches || event.pointerType === "touch") {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active =
        mouse.x >= 0 && mouse.y >= 0 && mouse.x <= rect.width && mouse.y <= rect.height;
      redraw();
    };

    const onLeave = (): void => {
      mouse.active = false;
      redraw();
    };

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      visible = entry?.isIntersecting === true;
      if (!visible && frame !== 0) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        draw(performance.now(), false);
      }
    });
    observer.observe(canvas);

    const onTheme = (): void => {
      readColors();
      draw(performance.now(), false);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(performance.now(), !reduced.matches);
    });
    resizeObserver.observe(canvas);

    const themeObserver = new MutationObserver(onTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const mediaListener = (): void => {
      if (reduced.matches) {
        if (frame !== 0) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        draw(performance.now(), false);
      } else if (visible) {
        draw(performance.now(), false);
      }
    };
    reduced.addEventListener("change", mediaListener);

    cancelStart = schedule(start);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
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
      reduced.removeEventListener("change", mediaListener);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: canvas dekoratif, tidak fokusabel
  return <canvas ref={ref} className="particle-field" aria-hidden="true" />;
}
