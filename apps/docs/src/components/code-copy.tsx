// Tombol copy untuk blok kode (markdown + landing) + penanda `js` agar tombol hanya tampil
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
      const wadah = target.closest(".code, .kode-panel, .install");
      const pmBlock = target.closest("[data-pm-block]");
      const manager = document.documentElement.dataset.pm ?? "npm";
      const code =
        pmBlock?.querySelector(`[data-pm-variant="${manager}"] pre code`) ??
        wadah?.querySelector("pre code, pre, code");
      const text = code?.textContent ?? "";
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          const label = target.getAttribute("aria-label");
          target.textContent = "Copied";
          window.setTimeout(() => {
            target.textContent = "Copy";
            if (label !== null) {
              target.setAttribute("aria-label", label);
            }
          }, 1200);
        })
        .catch(() => undefined);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
