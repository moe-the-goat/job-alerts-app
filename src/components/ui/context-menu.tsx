"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "./kbd";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Shortcut hint rendered as keycaps on the right edge. */
  kbd?: string[];
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface MenuState {
  open: boolean;
  x: number;
  y: number;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  /** The surface the menu belongs to. Right-click anywhere inside opens it. */
  children: React.ReactNode;
  className?: string;
  /**
   * Renders an explicit trigger (e.g. a "⋯" button) that opens the menu
   * anchored at the trigger instead of the pointer.
   */
  trigger?: (open: (anchor: HTMLElement) => void) => React.ReactNode;
}

/**
 * Headless context menu — no positioning library. Glassmorphic float with
 * a translucent 1px edge and the overlay shadow token for z-separation.
 *
 * Keyboard contract: ArrowUp/Down cycle, Home/End jump, Enter/Space select,
 * Escape closes and restores focus to where it was.
 */
export function ContextMenu({
  items,
  children,
  className,
  trigger,
}: ContextMenuProps) {
  const [menu, setMenu] = React.useState<MenuState>({ open: false, x: 0, y: 0 });
  const [activeIndex, setActiveIndex] = React.useState(0);
  // Where focus returns when the menu closes. State (not a ref) so the
  // open/close callbacks stay ref-free and safe to hand out during render.
  const [restoreEl, setRestoreEl] = React.useState<HTMLElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const enabledIndexes = React.useMemo(
    () => items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0),
    [items],
  );

  const close = React.useCallback(() => {
    setMenu((m) => ({ ...m, open: false }));
    restoreEl?.focus?.();
    setRestoreEl(null);
  }, [restoreEl]);

  const openAt = React.useCallback(
    (x: number, y: number) => {
      setRestoreEl(document.activeElement as HTMLElement | null);
      setActiveIndex(enabledIndexes[0] ?? 0);
      setMenu({ open: true, x, y });
    },
    [enabledIndexes],
  );

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    openAt(e.clientX, e.clientY);
  }

  const openFromTrigger = React.useCallback(
    (anchor: HTMLElement) => {
      const rect = anchor.getBoundingClientRect();
      openAt(rect.right, rect.bottom + 4);
    },
    [openAt],
  );

  // Clamp into the viewport once the menu has a measurable size.
  React.useLayoutEffect(() => {
    if (!menu.open || !menuRef.current) return;
    const el = menuRef.current;
    const { width, height } = el.getBoundingClientRect();
    const maxX = window.innerWidth - width - 8;
    const maxY = window.innerHeight - height - 8;
    const x = Math.max(8, Math.min(menu.x, maxX));
    const y = Math.max(8, Math.min(menu.y, maxY));
    if (x !== menu.x || y !== menu.y) setMenu((m) => ({ ...m, x, y }));
    el.focus();
  }, [menu.open, menu.x, menu.y]);

  React.useEffect(() => {
    if (!menu.open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menu.open, close]);

  function step(direction: 1 | -1) {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(activeIndex);
    const next =
      enabledIndexes[
        (pos + direction + enabledIndexes.length) % enabledIndexes.length
      ];
    setActiveIndex(next);
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    // Keys handled here must not leak to page-level shortcut listeners
    // (the results grid binds Enter / Escape / arrows on window).
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        step(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        step(-1);
        break;
      case "Home":
        e.preventDefault();
        e.stopPropagation();
        if (enabledIndexes.length > 0) setActiveIndex(enabledIndexes[0]);
        break;
      case "End":
        e.preventDefault();
        e.stopPropagation();
        if (enabledIndexes.length > 0) {
          setActiveIndex(enabledIndexes[enabledIndexes.length - 1]);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        e.stopPropagation();
        select(items[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
    }
  }

  function select(item: ContextMenuItem | undefined) {
    if (!item || item.disabled) return;
    close();
    item.onSelect();
  }

  return (
    <div className={className} onContextMenu={onContextMenu}>
      {children}
      {trigger?.(openFromTrigger)}
      {menu.open && (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-activedescendant={`menu-item-${activeIndex}`}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "row-detail-enter fixed z-50 min-w-[210px] rounded-lg p-1 outline-none",
            "bg-[var(--bg-overlay)]/90 backdrop-blur-md",
            "ring-1 ring-inset ring-[rgba(205,217,229,0.09)]",
            "shadow-[var(--shadow-overlay)]",
          )}
          style={{ left: menu.x, top: menu.y }}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const isActive = i === activeIndex;
            return (
              <button
                key={item.id}
                id={`menu-item-${i}`}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onMouseEnter={() => !item.disabled && setActiveIndex(i)}
                onClick={() => select(item)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] outline-none",
                  "transition-colors duration-150",
                  item.destructive
                    ? "text-[var(--danger-400)]"
                    : "text-[var(--text-secondary)]",
                  isActive &&
                    !item.disabled &&
                    (item.destructive
                      ? "bg-[var(--danger-400)]/10 text-[var(--danger-400)]"
                      : "bg-[var(--bg-hover)] text-[var(--text-primary)]"),
                  item.disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="flex-1 truncate">{item.label}</span>
                {item.kbd && <Kbd keys={item.kbd} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
