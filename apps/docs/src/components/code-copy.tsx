// Tombol copy untuk blok kode (HTML dari markdown) + penanda `js` agar tombol hanya tampil
// ketika JavaScript aktif.
import { useEffect } from "react";

export function CodeCopy() {
  useEffect(() => {
    document.documentElement.classList.add("js");

    const onClick = (event: MouseEvent): void => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
        "[data-copy]",
      );
      if (target === null || target === undefined) {
        return;
      }
      const figure = target.closest(".code");
      const code = figure?.querySelector("pre code, pre");
      const text = code?.textContent ?? "";
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          target.textContent = "Copied";
          window.setTimeout(() => {
            target.textContent = "Copy";
          }, 1200);
        })
        .catch(() => undefined);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
