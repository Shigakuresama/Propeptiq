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
          let wrapperEntry: IntersectionObserverEntry | undefined;
          for (let index = entries.length - 1; index >= 0; index -= 1) {
            if (entries[index]?.target === wrapper) {
              wrapperEntry = entries[index];
              break;
            }
          }
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
        <g className="header-brand-motion__bonds" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8">
          <path pathLength="1" d="M8 43 38 18l33 24 33-26 34 27 35-25 58 24" />
          <path pathLength="1" d="M22 52 55 31l33 22 33-24 34 21 34-22 39 18" opacity="0.7" />
          <path pathLength="1" d="m38 18 17 13m16 11 17 11m16-37 17 13m17 14 17 7m18-32 16 10" opacity="0.65" />
        </g>
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <circle cx="38" cy="18" r="7" opacity="0.4" />
          <circle cx="104" cy="16" r="8" opacity="0.4" />
          <circle cx="173" cy="18" r="7" opacity="0.4" />
        </g>
        <g className="header-brand-motion__nodes" fill="currentColor">
          <circle cx="8" cy="43" r="2.4" />
          <circle cx="38" cy="18" r="3.8" />
          <circle cx="71" cy="42" r="2.6" />
          <circle cx="104" cy="16" r="4" />
          <circle cx="138" cy="43" r="2.6" />
          <circle cx="173" cy="18" r="3.8" />
          <circle cx="231" cy="42" r="2.4" />
        </g>
      </svg>
      <span className="header-brand-motion__content">{children}</span>
    </span>
  );
}
