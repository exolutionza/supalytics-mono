import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import GridLayout from 'react-grid-layout';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import _ from 'lodash';

import {
  fetchWidgetsForDashboard,
  fetchWidgetTemplatesForDashboard,
  setWidgetStreamingStatus,
} from '@/store/slices/widgets';
import {
  fetchWidgetLocations,
  upsertWidgetLocation,
} from '@/store/slices/widget-locations';
import { executeWidget } from '@/store/executor';
import {
  selectWidgetsForDashboard,
  selectExecutionStatuses,
  selectRelevantLocations,
} from '@/store/selectors';
import WidgetSwitcher from '@/renderer/widgets/widget-switcher';

function DashboardRenderer({ dashboardId, screenSize = 'desktop' }) {
  const dispatch = useDispatch();
  const mountedRef = useRef(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [currentLayout, setCurrentLayout] = useState([]);
  const executionQueueRef = useRef(new Set());
  const executionInProgressRef = useRef(false);
  const lastExecutionTimeRef = useRef({});
  const initialLoadCompletedRef = useRef(false);
  const dragStateRef = useRef({ isDragging: false, lastUpdate: null });

  // Create memoized selectors based on dashboardId and screenSize
  const dashboardWidgetsSelector = useMemo(
    () => selectWidgetsForDashboard(dashboardId),
    [dashboardId]
  );
  const locationsSelector = useMemo(
    () => selectRelevantLocations(screenSize),
    [screenSize]
  );

  // Use the dashboard widgets selector
  const widgets = useSelector(
    (state) => {
      try {
        const result = dashboardWidgetsSelector(state);
        if (initialLoadCompletedRef.current) {
          console.debug('[DashboardRenderer] Selected widgets:', {
            count: result.length,
            ids: result.map((w) => w.id),
          });
        }
        return result;
      } catch (err) {
        console.error('[DashboardRenderer] Error selecting widgets:', err);
        return [];
      }
    },
    _.isEqual
  );

  // Use the execution statuses selector
  const widgetStatuses = useSelector(selectExecutionStatuses, _.isEqual);

  // Use the locations selector
  const relevantLocations = useSelector(
    (state) => {
      try {
        return locationsSelector(state);
      } catch (err) {
        console.error('[DashboardRenderer] Error selecting locations:', err);
        return [];
      }
    },
    _.isEqual
  );

  // Initialize currentLayout when relevantLocations load
  useEffect(() => {
    if (relevantLocations.length > 0 && (!currentLayout || currentLayout.length === 0)) {
      const initialLayout = widgets.map((widget) => {
        const loc = relevantLocations.find((row) => row.widget_id === widget.id);
        if (loc) {
          return {
            i: widget.id.toString(),
            x: parseInt(loc.x),
            y: parseInt(loc.y),
            w: parseInt(loc.width),
            h: parseInt(loc.height),
            static: !!loc.config?.pinned,
          };
        }
        return null;
      }).filter(Boolean);
      
      setCurrentLayout(initialLayout);
    }
  }, [relevantLocations, widgets, currentLayout]);

  useEffect(() => {
    console.log('[DashboardRenderer] Component mounted');
    mountedRef.current = true;
    return () => {
      console.log('[DashboardRenderer] Component unmounting');
      mountedRef.current = false;
      executionQueueRef.current.clear();
      executionInProgressRef.current = false;
    };
  }, []);

  const processQueue = useCallback(async () => {
    if (executionInProgressRef.current || !mountedRef.current) return;
    const queueArray = Array.from(executionQueueRef.current);
    if (!queueArray.length) return;
    executionInProgressRef.current = true;
    const currentTime = Date.now();
    try {
      for (const widgetId of queueArray) {
        if (!mountedRef.current) break;
        const lastExecution = lastExecutionTimeRef.current[widgetId] || 0;
        if (currentTime - lastExecution < 5000) continue;
        const status = widgetStatuses[widgetId];
        if (status?.isStreaming) continue;
        try {
          lastExecutionTimeRef.current[widgetId] = currentTime;
          await dispatch(
            setWidgetStreamingStatus({
              widgetId,
              isStreaming: true,
              status: 'executing',
              isExecuted: false,
            })
          );
          const actionResult = await dispatch(executeWidget({ widgetId }));
          if (actionResult.error) {
            throw new Error(actionResult.error.message || 'Execution failed');
          }
          if (mountedRef.current) {
            await dispatch(
              setWidgetStreamingStatus({
                widgetId,
                isStreaming: false,
                status: 'complete',
                isExecuted: true,
              })
            );
          }
        } catch (error) {
          console.error(
            `[DashboardRenderer] Error executing widget ${widgetId}:`,
            error
          );
          if (mountedRef.current) {
            await dispatch(
              setWidgetStreamingStatus({
                widgetId,
                isStreaming: false,
                status: 'error',
                isExecuted: false,
                error: error.message,
              })
            );
          }
        }
        executionQueueRef.current.delete(widgetId);
      }
    } finally {
      executionInProgressRef.current = false;
    }
  }, [dispatch, widgetStatuses]);

  const loadInitialData = useCallback(async () => {
    if (!dashboardId || !mountedRef.current || initialLoadCompletedRef.current)
      return;
    console.log('[DashboardRenderer] Starting initial data load');
    try {
      const results = await Promise.all([
        dispatch(fetchWidgetsForDashboard(dashboardId)),
        dispatch(fetchWidgetTemplatesForDashboard(dashboardId)),
        dispatch(fetchWidgetLocations({ dashboardId, screenSize })),
      ]);
      const allSuccessful = results.every((result) =>
        result.type.endsWith('/fulfilled')
      );
      if (mountedRef.current) {
        setIsInitialLoad(false);
        initialLoadCompletedRef.current = allSuccessful;
      }
    } catch (error) {
      console.error('[DashboardRenderer] Error loading dashboard data:', error);
      if (mountedRef.current) {
        setIsInitialLoad(false);
      }
    }
  }, [dashboardId, dispatch, screenSize]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (
      !widgets.length ||
      !mountedRef.current ||
      !initialLoadCompletedRef.current
    ) {
      return;
    }
    let hasNewExecutions = false;
    widgets.forEach((widget) => {
      const status = widgetStatuses[widget.id];
      const lastExecution = lastExecutionTimeRef.current[widget.id] || 0;
      const currentTime = Date.now();
      const shouldExecute =
        (!status || status.error) &&
        !executionQueueRef.current.has(widget.id) &&
        !status?.isStreaming &&
        currentTime - lastExecution >= 5000;
      if (shouldExecute) {
        executionQueueRef.current.add(widget.id);
        hasNewExecutions = true;
      }
    });
    if (hasNewExecutions) {
      const timer = setTimeout(processQueue, 100);
      return () => clearTimeout(timer);
    }
  }, [widgets, widgetStatuses, processQueue]);

  const updateLocation = useCallback((item, existingLoc) => {
    if (!mountedRef.current) return;

    // Log location update
    console.log('Updating location:', {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h
    });

    dispatch(
      upsertWidgetLocation({
        id: existingLoc?.id,
        widget_id: item.i,
        screen_size: screenSize,
        x: parseInt(item.x),
        y: parseInt(item.y),
        width: parseInt(item.w),
        height: parseInt(item.h),
        config: {
          ...(existingLoc?.config || {}),
          pinned: item.static
        }
      })
    );
  }, [dispatch, screenSize]);

  const layout = useMemo(() => {
    if (!widgets?.length) return [];
    
    return widgets.map((widget, index) => {
      const loc = relevantLocations.find(
        (row) => row.widget_id === widget.id
      );
      
      // First try to use current layout if it exists
      const currentItem = currentLayout.find(item => item.i === widget.id.toString());
      
      if (currentItem) {
        return {
          ...currentItem,
          static: loc?.config?.pinned || false
        };
      }
      
      // Fall back to location from database
      if (loc) {
        return {
          i: widget.id.toString(),
          x: parseInt(loc.x),
          y: parseInt(loc.y),
          w: parseInt(loc.width),
          h: parseInt(loc.height),
          static: !!loc.config?.pinned,
        };
      }
      
      // Default layout if nothing else exists
      return {
        i: widget.id.toString(),
        x: (index * 4) % 12,
        y: Math.floor((index * 4) / 12) * 2,
        w: 4,
        h: 4,
        static: false,
      };
    });
  }, [widgets, relevantLocations, currentLayout]);

  const onLayoutChange = useCallback(
    (newLayout) => {
      if (!mountedRef.current) return;

      // Log layout change
      console.log('Layout changed:', newLayout);

      // Update local layout state immediately
      setCurrentLayout(newLayout.map(item => ({
        ...item,
        x: parseInt(item.x),
        y: parseInt(item.y),
        w: parseInt(item.w),
        h: parseInt(item.h)
      })));
      
      // Only update database if not currently dragging
      if (!dragStateRef.current.isDragging) {
        newLayout.forEach(item => {
          const existingLoc = relevantLocations.find(
            l => l.widget_id === item.i
          );
          updateLocation(item, existingLoc);
        });
      } else {
        // Store the latest layout for when drag ends
        dragStateRef.current.lastUpdate = newLayout;
      }
    },
    [relevantLocations, updateLocation]
  );

  const onDragStart = useCallback(() => {
    dragStateRef.current.isDragging = true;
  }, []);

  const onDragStop = useCallback(() => {
    const { lastUpdate } = dragStateRef.current;
    dragStateRef.current.isDragging = false;

    if (lastUpdate) {
      lastUpdate.forEach(item => {
        const existingLoc = relevantLocations.find(
          l => l.widget_id === item.i
        );
        updateLocation(item, existingLoc);
      });
      dragStateRef.current.lastUpdate = null;
    }
  }, [relevantLocations, updateLocation]);

  const togglePin = useCallback(
    (widgetId) => {
      if (!mountedRef.current) return;

      const updatedLayout = currentLayout.map(item => {
        if (item.i === widgetId.toString()) {
          const newItem = { ...item, static: !item.static };
          const existingLoc = relevantLocations.find(
            l => l.widget_id === widgetId
          );
          updateLocation(newItem, existingLoc);
          return newItem;
        }
        return item;
      });

      setCurrentLayout(updatedLayout);
    },
    [currentLayout, relevantLocations, updateLocation]
  );

  if (isInitialLoad) {
    return <div className="p-4">Loading Dashboard...</div>;
  }

  return (
    <div className="w-full h-full absolute inset-0">
      <div className="bg-gray-50 h-full border border-gray-200 rounded">
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={80}
          width={1200}
          margin={[10, 10]}
          onLayoutChange={onLayoutChange}
          onDragStart={onDragStart}
          onDragStop={onDragStop}
          draggableHandle=".drag-handle"
          isDraggable={true}
          isResizable={true}
          preventCollision={true}     // Change to true to prevent overlap
          compactType={null}         // Change to null to prevent automatic compacting
          verticalCompact={false}    // Disable vertical compacting
          useCSSTransforms={true}
        >
          {layout.map((item) => {
            const widget = widgets.find(w => w.id.toString() === item.i);
            if (!widget) return null;
            
            return (
              <div
                key={item.i}
                className={`group rounded shadow-sm ${
                  item.static ? 'bg-orange-100' : 'bg-gray-100'
                }`}
              >
                <div className="w-full h-full p-2 relative flex flex-col">
                  <div
                    className={`drag-handle w-full h-6 ${
                      item.static ? 'cursor-not-allowed' : 'cursor-move'
                    }`}
                  />
                  <div className="flex-1 bg-white rounded p-2 overflow-auto">
                    <WidgetSwitcher widgetId={item.i} />
                  </div>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => togglePin(item.i)}
                    >
                      {item.static ? (
                        <PinOff className="w-4 h-4" />
                      ) : (
                        <Pin className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </GridLayout>
      </div>
    </div>
  );
}

export default React.memo(DashboardRenderer);