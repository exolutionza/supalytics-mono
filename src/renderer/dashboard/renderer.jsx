// DashboardRenderer.jsx
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
  const executionQueueRef = useRef(new Set());
  const executionInProgressRef = useRef(false);
  const lastExecutionTimeRef = useRef({});
  const initialLoadCompletedRef = useRef(false);

  // Create memoized selectors based on dashboardId and screenSize.
  const dashboardWidgetsSelector = useMemo(
    () => selectWidgetsForDashboard(dashboardId),
    [dashboardId]
  );
  const locationsSelector = useMemo(
    () => selectRelevantLocations(screenSize),
    [screenSize]
  );

  // Use the dashboard widgets selector.
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

  // Use the execution statuses selector.
  const widgetStatuses = useSelector(selectExecutionStatuses, _.isEqual);

  // Use the locations selector.
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

  const layout = useMemo(() => {
    if (!widgets?.length) return [];
    return widgets.map((widget, index) => {
      const loc = relevantLocations.find(
        (row) => row.widget_id === widget.id
      );
      if (loc) {
        return {
          i: widget.id.toString(),
          x: loc.x,
          y: loc.y,
          w: loc.width,
          h: loc.height,
          static: !!loc.config?.pinned,
        };
      }
      return {
        i: widget.id.toString(),
        x: (index * 4) % 12,
        y: Math.floor((index * 4) / 12) * 2,
        w: 4,
        h: 4,
        static: false,
      };
    });
  }, [widgets, relevantLocations]);

  const onLayoutChange = useCallback(
    (newLayout) => {
      if (!mountedRef.current) return;
      newLayout.forEach((item) => {
        const existingLoc = relevantLocations.find(
          (l) => l.widget_id === item.i
        );
        dispatch(
          upsertWidgetLocation({
            id: existingLoc?.id,
            widget_id: item.i,
            screen_size: screenSize,
            x: item.x,
            y: item.y,
            width: item.w,
            height: item.h,
            config: { pinned: !!item.static },
          })
        );
      });
    },
    [dispatch, relevantLocations, screenSize]
  );

  const togglePin = useCallback(
    (widgetId) => {
      if (!mountedRef.current) return;
      const updatedLayout = layout.map((item) => {
        if (item.i === widgetId.toString()) {
          return { ...item, static: !item.static };
        }
        return item;
      });
      onLayoutChange(updatedLayout);
    },
    [layout, onLayoutChange]
  );

  if (isInitialLoad) {
    return <div className="p-4">Loading Dashboard...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">
        Dashboard {dashboardId} ({screenSize})
      </h2>
      <div className="bg-gray-50 border border-gray-200 rounded">
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={80}
          width={1200}
          margin={[10, 10]}
          onLayoutChange={onLayoutChange}
          draggableHandle=".drag-handle"
        >
          {layout.map((item) => {
            const pinned = !!item.static;
            return (
              <div
                key={item.i}
                className={`group rounded shadow-sm ${
                  pinned ? 'bg-orange-100' : 'bg-gray-100'
                }`}
              >
                <div className="w-full h-full p-2 relative flex flex-col">
                  <div
                    className={`drag-handle w-full h-6 ${
                      pinned ? '' : 'cursor-move'
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
                      {pinned ? (
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
