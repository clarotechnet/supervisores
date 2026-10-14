interface AnchorBox {
  left: number;
  top: number;
  bottom: number;
}

// Fixed overlays use the trigger's viewport coordinates, not a page-wide
// hardcoded right/top. Leave a small gutter and flip only when necessary.
export function filterPopoverPosition(
  anchor: AnchorBox,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const gutter = 8;
  const gap = 8;
  const width = Math.min(menu.width, Math.max(0, viewport.width - gutter * 2));
  const below = Math.max(0, viewport.height - gutter - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - gap - gutter);
  const flip = menu.height > below && above > below;
  const maxHeight = flip ? above : below;
  const height = Math.min(menu.height, maxHeight);
  return {
    left: Math.max(gutter, Math.min(anchor.left, viewport.width - gutter - width)),
    top: Math.max(gutter, flip ? anchor.top - gap - height : anchor.bottom + gap),
    maxHeight,
  };
}
