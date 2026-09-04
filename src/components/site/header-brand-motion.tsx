"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type MotionState = "paused" | "running" | "static";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

export function HeaderBrandMotion({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [motionState, setMotionState] = useState<MotionState>("paused");

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper === null) return;

    const mediaQuery = typeof window.matchMedia === "function"
      ? window.matchMedia(reducedMotionQuery)
      : null;
    let isIntersecting = false;
    let prefersReducedMotion = mediaQuery?.matches ?? false;

    const updateMotionState = (): void => {
      if (prefersReducedMotion) {
        setMotionState("static");
        return;
      }
      setMotionState(
        isIntersecting && document.visibilityState === "visible" ? "running" : "paused",
      );
    };
    const handleVisibilityChange = (): void => updateMotionState();
    const handleMotionPreferenceChange = (event: MediaQueryListEvent): void => {
      prefersReducedMotion = event.matches;
      updateMotionState();
    };
    const observer = typeof window.IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          const wrapperEntry = entries.find((entry) => entry.target === wrapper);
          if (wrapperEntry === undefined) return;
          isIntersecting = wrapperEntry.isIntersecting;
          updateMotionState();
        }, { threshold: 0 })
      : null;

    updateMotionState();
    observer?.observe(wrapper);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    mediaQuery?.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      mediaQuery?.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, []);

  return (
    <span
      className="header-brand-motion"
      data-motion-state={motionState}
      ref={wrapperRef}
    >
      <svg
        aria-hidden="true"
        className="header-brand-motion__field"
        focusable="false"
        viewBox="0 0 240 64"
      >
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25">
          <path d="M8 43 38 18l33 24 33-26 34 27 35-25 58 24" />
          <path d="M22 52 55 31l33 22 33-24 34 21 34-22 39 18" opacity="0.62" />
        </g>
        <g fill="currentColor">
          <circle cx="8" cy="43" r="2.4" />
          <circle cx="38" cy="18" r="3" />
          <circle cx="71" cy="42" r="2.6" />
          <circle cx="104" cy="16" r="3.2" />
          <circle cx="138" cy="43" r="2.6" />
          <circle cx="173" cy="18" r="3" />
          <circle cx="231" cy="42" r="2.4" />
        </g>
      </svg>
      <span className="header-brand-motion__content">{children}</span>
    </span>
  );
}
