"use client";

/**
 * A route template (not a layout) re-mounts on every tab navigation, so the
 * per-tab body fades up on each switch while the surrounding workspace layout —
 * masthead, stats cluster, and tabs — stays fixed. Reduced motion collapses the
 * animation via the global rule in globals.css.
 */
export default function WorkspaceTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="route-in">{children}</div>;
}
