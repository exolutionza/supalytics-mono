import { useState, useCallback, useRef } from "react";

/**
 * Each item in `layout`:
 * {
 *   id: string | number,
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 *   static?: boolean // pinned or not
 * }
 */
export default function useGridLayout(initialLayout, options = {}) {
  const { cols = 12, rowHeight = 30, margin = [10, 10] } = options;

  const [layout, setLayout] = useState(initialLayout);

  // Track dragging and resizing
  const draggingItemRef = useRef(null);
  const resizeItemRef = useRef(null);

  // Mouse offset + item’s initial position/size
  const mouseOffsetRef = useRef({ x: 0, y: 0 });
  const itemStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Collision detection
  const itemsCollide = (a, b) =>
    !(
      a.x + a.w <= b.x ||
      a.x >= b.x + b.w ||
      a.y + a.h <= b.y ||
      a.y >= b.y + b.h
    );

  const getCollisions = useCallback(
    (currentLayout, moving) =>
      currentLayout.filter(
        (it) => it.id !== moving.id && itemsCollide(it, moving)
      ),
    []
  );

  const pushDown = useCallback(
    (draftLayout, movingItem) => {
      const collided = getCollisions(draftLayout, movingItem);
      collided.forEach((colItem) => {
        if (colItem.static) return; // skip pinned items

        const oldY = colItem.y;
        colItem.y = movingItem.y + movingItem.h; // push below
        if (colItem.y !== oldY) {
          draftLayout = pushDown(draftLayout, colItem);
        }
      });
      return draftLayout;
    },
    [getCollisions]
  );

  const resolveCollisions = useCallback(
    (draftLayout, movingItem) => {
      let working = [...draftLayout];
      let changed = true;
      let iteration = 0;
      const maxIterations = draftLayout.length * 5;

      while (changed && iteration < maxIterations) {
        const before = JSON.stringify(working);
        working = pushDown(working, movingItem);
        const after = JSON.stringify(working);
        changed = before !== after;
        iteration++;
      }
      return working;
    },
    [pushDown]
  );

  // Clamp horizontally within cols (no vertical limit)
  const clampItem = useCallback(
    (it) => {
      if (it.x < 0) it.x = 0;
      if (it.x + it.w > cols) it.x = Math.max(cols - it.w, 0);
      if (it.y < 0) it.y = 0;
      return it;
    },
    [cols]
  );

  // ---------------------------------------
  // DRAG
  // ---------------------------------------
  const onMouseDownDrag = useCallback((e, id) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget?.getBoundingClientRect?.();
    if (!rect) return;

    draggingItemRef.current = id;
    mouseOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    setLayout((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item || item.static) return prev;
      itemStartRef.current = { x: item.x, y: item.y, w: item.w, h: item.h };
      return prev;
    });
  }, []);

  const onMouseMoveDrag = useCallback(
    (e) => {
      if (!draggingItemRef.current) return;

      const id = draggingItemRef.current;
      const { x: offsetX, y: offsetY } = mouseOffsetRef.current;
      const cellW = rowHeight + margin[0];
      const cellH = rowHeight + margin[1];

      setLayout((prev) => {
        const idx = prev.findIndex((i) => i.id === id);
        if (idx < 0) return prev;
        let newLayout = [...prev];
        let item = { ...newLayout[idx] };

        const newLeft = e.clientX - offsetX;
        const newTop = e.clientY - offsetY;
        item.x = Math.round(newLeft / cellW);
        item.y = Math.round(newTop / cellH);

        item = clampItem(item);
        newLayout[idx] = item;
        newLayout = resolveCollisions(newLayout, item);
        return newLayout;
      });
    },
    [clampItem, margin, resolveCollisions, rowHeight]
  );

  const onMouseUpDrag = useCallback(() => {
    draggingItemRef.current = null;
  }, []);

  // ---------------------------------------
  // RESIZE
  // ---------------------------------------
  const onMouseDownResize = useCallback((e, id) => {
    e.preventDefault();
    e.stopPropagation();

    resizeItemRef.current = id;
    mouseOffsetRef.current = { x: e.clientX, y: e.clientY };

    setLayout((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item || item.static) return prev;
      itemStartRef.current = { x: item.x, y: item.y, w: item.w, h: item.h };
      return prev;
    });
  }, []);

  const onMouseMoveResize = useCallback(
    (e) => {
      if (!resizeItemRef.current) return;

      const id = resizeItemRef.current;
      const dx = e.clientX - mouseOffsetRef.current.x;
      const dy = e.clientY - mouseOffsetRef.current.y;

      const cellW = rowHeight + margin[0];
      const cellH = rowHeight + margin[1];
      const dCols = Math.round(dx / cellW);
      const dRows = Math.round(dy / cellH);

      const start = itemStartRef.current;
      const newW = Math.max(1, start.w + dCols);
      const newH = Math.max(1, start.h + dRows);

      setLayout((prev) => {
        const idx = prev.findIndex((i) => i.id === id);
        if (idx < 0) return prev;

        let newLayout = [...prev];
        let item = { ...newLayout[idx] };

        item.w = newW;
        item.h = newH;

        // clamp horizontally
        if (item.x + item.w > cols) {
          item.w = cols - item.x;
        }

        newLayout[idx] = item;
        newLayout = resolveCollisions(newLayout, item);
        return newLayout;
      });
    },
    [cols, margin, rowHeight, resolveCollisions]
  );

  const onMouseUpResize = useCallback(() => {
    resizeItemRef.current = null;
  }, []);

  // ---------------------------------------
  // PIN
  // ---------------------------------------
  const togglePin = useCallback((id) => {
    setLayout((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, static: !it.static } : it
      )
    );
  }, []);

  return {
    layout,
    onMouseDownDrag,
    onMouseMoveDrag,
    onMouseUpDrag,
    onMouseDownResize,
    onMouseMoveResize,
    onMouseUpResize,
    togglePin,
    cols,
    rowHeight,
    margin
  };
}
