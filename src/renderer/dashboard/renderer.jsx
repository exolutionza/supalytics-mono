import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createSelector } from '@reduxjs/toolkit';

// Thunks / Slices
import {
  fetchWidgetsForDashboard,
  fetchWidgetTemplatesForDashboard
} from '@/store/slices/widgets';

import {
  fetchWidgetLocations,
  upsertWidgetLocation,
  selectAllWidgetLocations
} from '@/store/slices/widget-locations';

// Selectors
import { selectWidgetsForDashboard } from '@/store/selectors';

import useGridLayout from './useGridLayout';
import WidgetSwitcher from '@/renderer/widgets/widget-switcher';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Create reselect-based "factory" selector for relevant locations */
const createSelectRelevantLocations = (screenSize) =>
  createSelector([selectAllWidgetLocations], (locations) =>
    locations.filter((loc) => loc.screen_size === screenSize)
  );

function DashboardRenderer({ dashboardId, screenSize = 'desktop' }) {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(true);

  // 1) Build stable selector for relevantLocations
  const relevantLocationsSelector = useMemo(
    () => createSelectRelevantLocations(screenSize),
    [screenSize]
  );
  const relevantLocations = useSelector(relevantLocationsSelector);

  // 2) Get all widgets for this dashboard
  const widgets = useSelector((state) =>
    selectWidgetsForDashboard(dashboardId)(state)
  );

  // 3) Fetch data on mount / screenSize change
  const fetchData = useCallback(async () => {
    if (!dashboardId) return;
    setIsLoading(true);

    try {
      await Promise.all([
        dispatch(fetchWidgetsForDashboard(dashboardId)),
        dispatch(fetchWidgetTemplatesForDashboard(dashboardId)),
        dispatch(fetchWidgetLocations({ dashboardId, screenSize }))
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, dashboardId, screenSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 4) Build initial layout from Redux data (or empty if loading)
  const initialLayout = useMemo(() => {
    if (isLoading || !widgets?.length) {
      return [];
    }
    return widgets.map((widget, index) => {
      const loc = relevantLocations.find((row) => row.widget_id === widget.id);
      if (loc) {
        return {
          id: widget.id,
          x: loc.x,
          y: loc.y,
          w: loc.width,
          h: loc.height,
          static: !!loc.config?.pinned,
        };
      }
      // fallback
      return {
        id: widget.id,
        x: (index * 4) % 12,
        y: Math.floor((index * 4) / 12) * 2,
        w: 4,
        h: 4,
        static: false,
      };
    });
  }, [isLoading, widgets, relevantLocations]);

  // 5) use one-time init in the hook
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

  // 6) Global mouse listeners
  const handleMove = useCallback((e) => {
    onMouseMoveDrag(e);
    onMouseMoveResize(e);
  }, [onMouseMoveDrag, onMouseMoveResize]);

  const handleUp = useCallback((e) => {
    onMouseUpDrag(e);
    onMouseUpResize(e);
  }, [onMouseUpDrag, onMouseUpResize]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [handleMove, handleUp]);

  // 7) Compare new layout vs. old layout, only upsert changed items
  const prevLayoutRef = useRef([]); // store the last layout we processed

  useEffect(() => {
    if (!layout || !layout.length) {
      return;
    }

    const prevLayout = prevLayoutRef.current;
    // We'll find any items that changed x,y,w,h, or pinned
    const changedItems = layout.filter((item) => {
      const oldItem = prevLayout.find((o) => o.id === item.id);
      if (!oldItem) {
        // didn't exist before => definitely changed
        return true;
      }
      // Compare relevant fields
      const pinnedChanged = !!oldItem.static !== !!item.static;
      return (
        oldItem.x !== item.x ||
        oldItem.y !== item.y ||
        oldItem.w !== item.w ||
        oldItem.h !== item.h ||
        pinnedChanged
      );
    });

    if (changedItems.length > 0) {
      // console.log('Changed items => upsert:', changedItems);
      changedItems.forEach((changed) => {
        const existingLoc = relevantLocations.find((l) => l.widget_id === changed.id);
        dispatch(
          upsertWidgetLocation({
            id: existingLoc?.id,
            widget_id: changed.id,
            screen_size: screenSize,
            x: changed.x,
            y: changed.y,
            width: changed.w,
            height: changed.h,
            config: { pinned: !!changed.static }
          })
        );
      });
    }

    // Update ref for next time
    prevLayoutRef.current = layout.map((i) => ({ ...i })); // copy so we don't mutate
  }, [layout, dispatch, relevantLocations, screenSize]);

  if (isLoading) {
    return <div className="p-4">Loading Dashboard...</div>;
  }

  const cellWidth = rowHeight + margin[0];
  const cellHeight = rowHeight + margin[1];

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">
        Dashboard {dashboardId} ({screenSize})
      </h2>

      <div
        className="relative bg-gray-50 border border-gray-200 rounded"
        style={{
          width: cols * cellWidth,
          minHeight: '80vh'
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
              className={`group absolute rounded shadow-sm ${
                pinned ? 'bg-orange-100' : 'bg-gray-100 hover:cursor-move'
              }`}
              style={{
                left,
                top,
                width,
                height,
                overflow: 'hidden'
              }}
              onMouseDown={(e) => {
                if (!pinned) {
                  onMouseDownDrag(e, item.id);
                }
              }}
            >
              <div className="w-full h-full p-2 relative flex flex-col">
                {/* Widget content */}
                <div className="flex-1 bg-white rounded p-2 overflow-auto">
                  <WidgetSwitcher widgetId={item.id} />
                </div>

                {/* Pin/unpin button */}
                <div
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => togglePin(item.id)}
                  >
                    {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Resize handle (hidden if pinned) */}
                {!pinned && (
                  <div
                    className="absolute bottom-2 right-2 w-5 h-5 opacity-0 group-hover:opacity-100
                      transition-opacity cursor-se-resize rounded border border-gray-300
                      bg-white flex items-center justify-center"
                    onMouseDown={(e) => onMouseDownResize(e, item.id)}
                  >
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

export default React.memo(DashboardRenderer);
