import React, { useEffect } from "react";
import useGridLayout from "./useGridLayout";

// Lucide icons
import { Pin, PinOff } from "lucide-react";

// shadcn/ui - Adjust import paths as needed in your project
import { Button } from "@/components/ui/button";

const initialLayout = [
  { id: "a", x: 0, y: 0, w: 3, h: 2 },
  { id: "b", x: 3, y: 0, w: 3, h: 2 },
  { id: "c", x: 6, y: 0, w: 3, h: 2 }
];

export default function TestGridPage() {
  const {
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
  } = useGridLayout(initialLayout, {
    cols: 12,
    rowHeight: 80,
    margin: [10, 10]
  });

  // Listen globally for drag/resize moves and up
  useEffect(() => {
    const handleMove = (e) => {
      onMouseMoveDrag(e);
      onMouseMoveResize(e);
    };
    const handleUp = (e) => {
      onMouseUpDrag(e);
      onMouseUpResize(e);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [onMouseMoveDrag, onMouseMoveResize, onMouseUpDrag, onMouseUpResize]);

  const cellWidth = rowHeight + margin[0];
  const cellHeight = rowHeight + margin[1];

  return (
    <div className="p-6">
      <div
        className="relative bg-muted"
        style={{
          width: cols * cellWidth,
          minHeight: "80vh"
        }}
      >
        {layout.map((item) => {
          const pinned = !!item.static;
          const left = item.x * cellWidth;
          const top = item.y * cellHeight;
          const width = item.w * cellWidth;
          const height = item.h * cellHeight;

          return (
            <div
              key={item.id}
              className={`
                group absolute overflow-hidden rounded-md shadow-sm
                ${pinned ? "bg-orange-100" : "bg-gray-100 hover:cursor-move"}
              `}
              style={{
                left,
                top,
                width,
                height
              }}
              // Only allow drag if not pinned
              onMouseDown={(e) => {
                if (!pinned) onMouseDownDrag(e, item.id);
              }}
            >
              {/* Content: Fill entire area, your custom UI here */}
              <div className="w-full h-full p-1 relative">
                {/* Example placeholder content */}
                <div className="w-full h-full bg-white flex items-center justify-center rounded">
                  <span className="text-gray-600 pointer-events-none select-none">
                    ID: {item.id}
                    <br />
                    {pinned ? "Pinned" : "Drag or Resize me"}
                  </span>
                </div>

                {/* Pin button (top-right). Visible on hover */}
                <div
                  className={`
                    absolute top-2 right-2 opacity-0
                    group-hover:opacity-100 transition-opacity
                  `}
                  // Stop propagation so we can click the button
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => togglePin(item.id)}
                  >
                    {pinned ? (
                      <PinOff className="w-4 h-4" />
                    ) : (
                      <Pin className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Resize handle (bottom-right). Hidden if pinned. Visible on hover */}
                {!pinned && (
                  <div
                    className={`
                      absolute bottom-2 right-2 w-5 h-5
                      opacity-0 group-hover:opacity-100
                      transition-opacity cursor-se-resize
                      rounded border border-border
                      flex items-center justify-center
                      bg-white
                    `}
                    onMouseDown={(e) => onMouseDownResize(e, item.id)}
                  >
                    {/* Just an icon or lines. Using lucide `Move` or `CornerRightDown` is an option.
                        For a subtle handle, we can do a diagonal line pattern: */}
                    <svg
                      viewBox="0 0 8 8"
                      width="12"
                      height="12"
                      className="text-gray-400"
                    >
                      <path
                        d="M1 7L7 1"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
