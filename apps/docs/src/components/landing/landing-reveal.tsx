// Satu observer untuk data-reveal; tanpa JS konten tetap terlihat (class js baru ditambahkan
// oleh bootstrap nonce di akhir dokumen).
import { useEffect } from "react";

export function LandingReveal() {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (elements.length === 0) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      for (const element of elements) {
        element.classList.add("is-in");
      }
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);
  return null;
}
