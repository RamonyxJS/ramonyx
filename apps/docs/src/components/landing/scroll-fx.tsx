// Scrub scroll: tiap elemen [data-scrub] menerima --p (0 → 1) selama melintasi viewport.
// CSS memakai --p untuk parallax/marquee/angka raksasa. Satu rAF per batch scroll, tanpa dependensi.
import { useEffect } from "react";

export function ScrollFx() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-scrub]"));
    if (elements.length === 0) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = (): void => {
      frame = 0;
      const viewport = window.innerHeight;
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const progress = (viewport - rect.top) / (viewport + rect.height);
        element.style.setProperty("--p", Math.min(1, Math.max(0, progress)).toFixed(4));
      }
    };
    const schedule = (): void => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(update);
      }
    };

    if (reduced.matches) {
      for (const element of elements) {
        element.style.setProperty("--p", "0.5");
      }
      return;
    }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return null;
}
