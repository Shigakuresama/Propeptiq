"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const revealThreshold = 0.15;

const observerOptions: IntersectionObserverInit = Object.freeze({
  root: null,
  rootMargin: "0px",
  threshold: revealThreshold,
});

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const finiteRevealSelector = [
  "[data-motion-step]",
  '[data-motion-sequence="home-hero"] > *',
  ".catalog-grid > :nth-child(-n + 3)",
].join(", ");

function topLevelPublicSections(): readonly HTMLElement[] {
  const main = document.querySelector<HTMLElement>(".public-layout > main");
  if (!main) return [];

  return [...main.querySelectorAll<HTMLElement>("section")].filter((section) => {
    const ancestorSection = section.parentElement?.closest("section") ?? null;
    return ancestorSection === null || !main.contains(ancestorSection);
  });
}

function markVisible(section: HTMLElement): void {
  section.dataset.scrollRevealState = "visible";
}

function currentFragmentTarget(): HTMLElement | null {
  const encodedId = window.location.hash.slice(1);
  if (encodedId.length === 0) return null;

  try {
    return document.getElementById(decodeURIComponent(encodedId));
  } catch {
    return null;
  }
}

export function ScrollRevealController() {
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  useLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    if (pathname === previousPathname) return;

    const main = document.querySelector<HTMLElement>(".public-layout > main");
    main?.querySelectorAll<HTMLElement>(finiteRevealSelector).forEach((element) => {
      element.dataset.finiteRevealState = "complete";
    });
  }, [pathname]);

  useEffect(() => {
    const sections = topLevelPublicSections();
    if (sections.length === 0) return;

    const mediaQuery = typeof window.matchMedia === "function"
      ? window.matchMedia(reducedMotionQuery)
      : null;
    if (mediaQuery?.matches || typeof window.IntersectionObserver !== "function") {
      sections.forEach(markVisible);
      return;
    }

    const pending = new Set<HTMLElement>();
    const fragmentTarget = currentFragmentTarget();
    for (const section of sections) {
      const bounds = section.getBoundingClientRect();
      const isFragmentSection = fragmentTarget !== null && section.contains(fragmentTarget);
      const isWhollyBelowViewport = bounds.top >= window.innerHeight;
      const isThresholdUnreachable = bounds.height > 0 &&
        window.innerHeight / bounds.height < revealThreshold;
      if (!isWhollyBelowViewport || isFragmentSection || isThresholdUnreachable) {
        markVisible(section);
        continue;
      }

      section.dataset.scrollRevealState = "pending";
      pending.add(section);
    }

    if (pending.size === 0) return;

    let observer: IntersectionObserver | null = null;
    const reveal = (section: HTMLElement): void => {
      if (!pending.delete(section)) return;
      markVisible(section);
      observer?.unobserve(section);
    };
    observer = new IntersectionObserver((entries) => {
      for (const observedEntry of entries) {
        if (observedEntry.isIntersecting && pending.has(observedEntry.target as HTMLElement)) {
          reveal(observedEntry.target as HTMLElement);
        }
      }
    }, observerOptions);

    pending.forEach((section) => observer?.observe(section));

    const revealFocusedSection = (event: Event): void => {
      if (!(event.target instanceof Node)) return;
      for (const section of pending) {
        if (section.contains(event.target)) {
          reveal(section);
          return;
        }
      }
    };
    const revealFragmentSection = (): void => {
      const target = currentFragmentTarget();
      if (target === null) return;
      for (const section of pending) {
        if (section.contains(target)) {
          reveal(section);
          return;
        }
      }
    };
    const revealForReducedMotion = (event: MediaQueryListEvent): void => {
      if (!event.matches) return;
      for (const section of [...pending]) reveal(section);
      observer?.disconnect();
    };

    document.addEventListener("focusin", revealFocusedSection);
    window.addEventListener("hashchange", revealFragmentSection);
    mediaQuery?.addEventListener("change", revealForReducedMotion);

    return () => {
      observer?.disconnect();
      document.removeEventListener("focusin", revealFocusedSection);
      window.removeEventListener("hashchange", revealFragmentSection);
      mediaQuery?.removeEventListener("change", revealForReducedMotion);
      pending.forEach(markVisible);
      pending.clear();
    };
  }, [pathname]);

  return null;
}
