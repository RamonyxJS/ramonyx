// Toggle tema (klien). Preferensi disimpan di localStorage; default mengikuti sistem (CSS).
import { useEffect, useState } from "react";

type Tema = "light" | "dark";

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    const tersimpan = localStorage.getItem("ramonyx-theme");
    const sistem: Tema = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
    const awal: Tema = tersimpan === "light" || tersimpan === "dark" ? tersimpan : sistem;
    document.documentElement.dataset.theme = awal;
    setTema(awal);
  }, []);

  const ganti = (): void => {
    const berikut: Tema = tema === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = berikut;
    localStorage.setItem("ramonyx-theme", berikut);
    setTema(berikut);
  };

  const label = tema === "light" ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button
      type="button"
      className="tombol-ikon"
      onClick={ganti}
      aria-label={label}
      title={tema === "light" ? "Dark theme" : "Light theme"}
    >
      {tema === "light" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
