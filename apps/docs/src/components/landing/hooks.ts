// Hook kecil untuk komponen landing (client). Tidak ada dependensi eksternal.
import { type RefObject, useEffect, useRef, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function useInView<T extends Element>(
  options: { readonly once?: boolean; readonly rootMargin?: string } = {},
): { readonly ref: RefObject<T | null>; readonly inView: boolean } {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const once = options.once ?? true;

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting === true) {
          setInView(true);
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin: options.rootMargin ?? "0px 0px -12% 0px", threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [once, options.rootMargin]);

  return { ref, inView };
}
