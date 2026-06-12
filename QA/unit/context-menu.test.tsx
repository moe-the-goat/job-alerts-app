import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Check, Shield } from "lucide-react";
import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/ui/context-menu";

function makeItems(onApplied = vi.fn(), onBlock = vi.fn()): ContextMenuItem[] {
  return [
    { id: "applied", label: "Mark Applied", icon: Check, kbd: ["A"], onSelect: onApplied },
    {
      id: "block",
      label: "Block company",
      icon: Shield,
      destructive: true,
      onSelect: onBlock,
    },
  ];
}

describe("<ContextMenu />", () => {
  it("stays closed until right-click", () => {
    render(<ContextMenu items={makeItems()}>row content</ContextMenu>);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens on right-click and lists every item", () => {
    render(<ContextMenu items={makeItems()}>row content</ContextMenu>);
    fireEvent.contextMenu(screen.getByText("row content"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Mark Applied/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Block company/ })).toBeInTheDocument();
  });

  it("fires onSelect when an item is clicked, then closes", () => {
    const onApplied = vi.fn();
    render(<ContextMenu items={makeItems(onApplied)}>row content</ContextMenu>);
    fireEvent.contextMenu(screen.getByText("row content"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Mark Applied/ }));
    expect(onApplied).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("supports keyboard: arrows move, Enter selects, Escape closes", () => {
    const onApplied = vi.fn();
    const onBlock = vi.fn();
    render(
      <ContextMenu items={makeItems(onApplied, onBlock)}>row content</ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText("row content"));
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onBlock).toHaveBeenCalledOnce();
    expect(onApplied).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByText("row content"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("skips disabled items during keyboard navigation", () => {
    const onApplied = vi.fn();
    const items: ContextMenuItem[] = [
      { id: "a", label: "First (disabled)", disabled: true, onSelect: vi.fn() },
      { id: "b", label: "Second", onSelect: onApplied },
    ];
    render(<ContextMenu items={items}>row content</ContextMenu>);
    fireEvent.contextMenu(screen.getByText("row content"));
    // Initial active item skips the disabled first entry.
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Enter" });
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("opens anchored from an explicit trigger button", () => {
    render(
      <ContextMenu
        items={makeItems()}
        trigger={(open) => (
          <button type="button" onClick={(e) => open(e.currentTarget)}>
            more
          </button>
        )}
      >
        row content
      </ContextMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
