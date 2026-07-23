"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light/dark toggle. The theme itself is applied to <html data-theme> by a
 * pre-paint script in the root layout (so there's no flash); this control
 * flips and persists the choice. The current value is read straight from the
 * DOM/system via useSyncExternalStore — the right tool for external mutable
 * state, and it keeps SSR + hydration consistent without setState-in-effect.
 */
// Light is the app default, so an unset data-theme means light — we don't
// read prefers-color-scheme here (it would mislabel the toggle on a dark-OS
// machine where the app is actually showing light).
function getSnapshot(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("themechange", onChange);
  return () => window.removeEventListener("themechange", onChange);
}

export function ThemeToggle({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "onMast";
}) {
  const theme = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "light" as const, // server + first hydration snapshot
  );
  const isDark = theme === "dark";
  const btnRef = React.useRef<HTMLButtonElement>(null);

  function applyTheme(next: "light" | "dark") {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode / storage disabled — the choice just won't persist */
    }
    window.dispatchEvent(new Event("themechange"));
  }

  function toggle() {
    const next = isDark ? "light" : "dark";

    // Progressive enhancement: Chromium reveals the new theme in a circle
    // growing from the button (View Transitions API). Everywhere else, and
    // when the user prefers reduced motion, we just flip instantly.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const startVT = (
      document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      }
    ).startViewTransition;

    if (!startVT || reduce) {
      applyTheme(next);
      return;
    }

    const rect = btnRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const r = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const root = document.documentElement;
    root.style.setProperty("--vt-x", `${x}px`);
    root.style.setProperty("--vt-y", `${y}px`);
    root.style.setProperty("--vt-r", `${r}px`);
    startVT.call(document, () => applyTheme(next));
  }

  const toneClasses =
    tone === "onMast"
      ? "text-[var(--mast-fg)] hover:bg-white/15 focus-visible:ring-white/40"
      : "text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] focus-visible:ring-[var(--ring)]";

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-md",
        "transition-colors outline-none focus-visible:ring-2",
        toneClasses,
        className ?? "",
      ].join(" ")}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
