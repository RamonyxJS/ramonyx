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

  return (
    <button
      type="button"
      className="tombol-ikon"
      onClick={ganti}
      aria-label={tema === "light" ? "Switch to dark theme" : "Switch to light theme"}
      title={tema === "light" ? "Dark theme" : "Light theme"}
    >
      {tema === "light" ? "◐" : "◑"}
    </button>
  );
}
