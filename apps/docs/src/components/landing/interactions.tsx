// Micro-interaction kecil: magnetic, cursor glow, tilt. Semua progressive & reduced-motion aware.
import { type ReactNode, useEffect, useRef } from "react";

import { useReducedMotion } from "./hooks.ts";

export function Magnetic({
  children,
  strength = 7,
  className = "",
}: {
  readonly children: ReactNode;
  readonly strength?: number;
  readonly className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (element === null || reduced) {
      return;
    }
    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    const apply = (): void => {
      raf = 0;
      element.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    };
    const move = (event: PointerEvent): void => {
      if (event.pointerType === "touch") {
        return;
      }
      const rect = element.getBoundingClientRect();
      targetX = ((event.clientX - (rect.left + rect.width / 2)) / rect.width) * strength;
      targetY = ((event.clientY - (rect.top + rect.height / 2)) / rect.height) * strength;
      if (raf === 0) {
        raf = window.requestAnimationFrame(apply);
      }
    };
    const leave = (): void => {
      targetX = 0;
      targetY = 0;
      if (raf === 0) {
        raf = window.requestAnimationFrame(apply);
      }
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      if (raf !== 0) {
        window.cancelAnimationFrame(raf);
      }
      element.style.transform = "";
    };
  }, [reduced, strength]);

  return (
    <span ref={ref} className={`magnetic ${className}`}>
      {children}
    </span>
  );
}

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (element === null || reduced || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }
    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    const apply = (): void => {
      raf = 0;
      element.style.transform = `translate3d(${x - 220}px, ${y - 220}px, 0)`;
    };
    const move = (event: PointerEvent): void => {
      element.classList.add("is-active");
      x = event.clientX;
      y = event.clientY;
      if (raf === 0) {
        raf = window.requestAnimationFrame(apply);
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    apply();
    return () => {
      window.removeEventListener("pointermove", move);
      if (raf !== 0) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [reduced]);

  return <div ref={ref} className="cursor-glow" aria-hidden="true" />;
}

export function Tilt({
  children,
  className = "",
  max = 3,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (element === null || reduced || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }
    let raf = 0;
    let rx = 0;
    let ry = 0;
    const apply = (): void => {
      raf = 0;
      element.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    };
    const move = (event: PointerEvent): void => {
      const rect = element.getBoundingClientRect();
      ry = ((event.clientX - (rect.left + rect.width / 2)) / rect.width) * max * 2;
      rx = ((event.clientY - (rect.top + rect.height / 2)) / rect.height) * -max * 2;
      if (raf === 0) {
        raf = window.requestAnimationFrame(apply);
      }
    };
    const leave = (): void => {
      rx = 0;
      ry = 0;
      if (raf === 0) {
        raf = window.requestAnimationFrame(apply);
      }
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      if (raf !== 0) {
        window.cancelAnimationFrame(raf);
      }
      element.style.transform = "";
    };
  }, [max, reduced]);

  return (
    <div ref={ref} className={`tilt ${className}`}>
      {children}
    </div>
  );
}
