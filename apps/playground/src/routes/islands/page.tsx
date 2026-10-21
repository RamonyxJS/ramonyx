import { defineIsland, Island } from "@ramonyx/react/islands";
import { useId, useState } from "react";

interface CounterProps {
  start: number;
}

/** Komponen interaktif yang dirender server dan di-hydrate hanya di batas Island. */
function Counter({ start }: CounterProps) {
  const [count, setCount] = useState(start);
  const hintId = useId();
  return (
    <>
      <button
        type="button"
        aria-describedby={hintId}
        onClick={() => setCount((value) => value + 1)}
      >
        Island counter: {count}
      </button>
      <span id={hintId} hidden>
        Menambah hitungan
      </span>
    </>
  );
}

// Registrasi terjadi saat modul halaman dimuat di server DAN client.
defineIsland("playground-counter", Counter);

export const metadata = { title: "Islands — Ramonyx Playground" };

export default function IslandsPage() {
  return (
    <>
      <h1>Partial hydration islands</h1>
      <p data-static>Konten ini dirender server dan tidak di-hydrate.</p>
      <Island id="playground-counter" props={{ start: 2 }} />
    </>
  );
}
