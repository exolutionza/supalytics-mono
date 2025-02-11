// selectors.js
import { createSelector, createSelectorCreator, lruMemoize } from 'reselect';
import isEqual from 'lodash/isEqual';
import { selectAllWidgets, selectWidgetById } from './slices/widgets';
import { selectAllDashboards, selectDashboardById } from './slices/dashboards';
import { selectAllWidgetLocations } from './slices/widget-locations';

/** Base Selectors **/
export const selectWidgetsRuntime = (state) =>
  (state.widgets && state.widgets.runtime) || {};

export const selectWidgetsEntities = (state) =>
  (state.widgets && state.widgets.entities) || {};

/** Widget Data Selectors **/
export const createWidgetFullDataSelector = (widgetId) => {
  // Input selectors: extract widget and its runtime data.
  const widgetSelector = (state) => selectWidgetById(state, widgetId);
  const runtimeSelector = (state) =>
    selectWidgetsRuntime(state)[widgetId] || null;
  // Combine into a new object.
  return createSelector(
    [widgetSelector, runtimeSelector],
    (widget, runtime) => ({ widget, runtime })
  );
};

/**
 * createWidgetOrderedDataSelector – returns widget data with columns obtained solely from metadata.
 * If no metadata columns are provided, returns an empty columns array.
 */
export const createWidgetOrderedDataSelector = (widgetId) => {
  const fullDataSelector = createWidgetFullDataSelector(widgetId);
  return createSelector([fullDataSelector], ({ runtime }) => {
    if (!runtime || !runtime.rows) {
      console.debug(
        `[Selector] Widget ${widgetId} returning default empty data (no runtime or rows)`
      );
      return {
        rows: [],
        columns: [],
        isStreaming: runtime ? runtime.isStreaming : false,
        batchCount: runtime ? runtime.batchCount : 0,
        error: runtime ? runtime.error : null,
        summary: runtime ? runtime.summary : null,
      };
    }
    // Get columns only from metadata.
    const columns =
      runtime.metadata && runtime.metadata.columns;

    if (!columns) {
      console.debug(
        `[Selector] Widget ${widgetId} returning default empty data (no columns)`
      );
      return {
        rows: [],
        columns: [],
        isStreaming: runtime.isStreaming,
        batchCount: runtime.batchCount,
        error: runtime.error,
        summary: runtime.summary,
      };
    }
    // Map rows using the provided metadata columns.
    const mappedRows = runtime.rowOrder.map((idx) => {
      const rowArray = runtime.rows[idx];
      return columns.reduce((acc, col, colIndex) => {
        acc[col] = rowArray[colIndex];
        return acc;
      }, {});
    });
    console.log("RUNTIME ROWS: ", mappedRows, columns);

    return {
      rows: mappedRows,
      columns,
      isStreaming: runtime.isStreaming,
      batchCount: runtime.batchCount,
      error: runtime.error,
      summary: runtime.summary,
    };
  });
};

export const createWidgetProgressSelector = (widgetId) => {
  const fullDataSelector = createWidgetFullDataSelector(widgetId);
  return createSelector([fullDataSelector], ({ runtime }) => ({
    totalRows:
      (runtime && runtime.metadata && runtime.metadata.totalRows) || 0,
    receivedRows: (runtime && runtime.receivedRows) || 0,
    progress:
      runtime && runtime.metadata && runtime.metadata.totalRows
        ? (runtime.receivedRows / runtime.metadata.totalRows) * 100
        : 0,
    isComplete:
      runtime &&
      runtime.metadata &&
      runtime.metadata.totalRows != null &&
      runtime.receivedRows === runtime.metadata.totalRows,
    isStreaming: (runtime && runtime.isStreaming) || false,
  }));
};

export const createWidgetStreamingStatusSelector = (widgetId) => {
  const fullDataSelector = createWidgetFullDataSelector(widgetId);
  return createSelector([fullDataSelector], ({ runtime }) => ({
    isStreaming: (runtime && runtime.isStreaming) || false,
    batchCount: (runtime && runtime.batchCount) || 0,
    hasError: !!(runtime && runtime.error),
    error: (runtime && runtime.error) || null,
    hasData:
      runtime &&
      runtime.rows &&
      Array.isArray(runtime.rows) &&
      runtime.rows.length > 0,
    totalRows:
      (runtime && runtime.metadata && runtime.metadata.totalRows) || 0,
    receivedRows: (runtime && runtime.receivedRows) || 0,
    isExecuted: runtime !== null,
  }));
};

/** Dashboard Selectors **/
// Use deep equality for memoization.
const createDeepEqualSelector = createSelectorCreator(lruMemoize, isEqual);
export const selectDashboardWidgets = (dashboardId) =>
  createDeepEqualSelector(
    [selectAllWidgets],
    (widgets) => widgets.filter((widget) => widget.dashboard_id === dashboardId)
  );
export const selectWidgetsForDashboard = selectDashboardWidgets;

export const selectExecutionStatuses = createSelector(
  [selectWidgetsRuntime],
  (runtime) => {
    const statuses = {};
    Object.keys(runtime).forEach((widgetId) => {
      const widgetRuntime = runtime[widgetId];
      statuses[widgetId] = {
        isExecuted: !!widgetRuntime,
        isStreaming:
          widgetRuntime && widgetRuntime.isStreaming
            ? widgetRuntime.isStreaming
            : false,
        hasError: !!(widgetRuntime && widgetRuntime.error),
      };
    });
    return statuses;
  }
);

/** Location Selectors **/
export const selectRelevantLocations = (screenSize) =>
  createSelector(
    [selectAllWidgetLocations],
    (locations = []) => locations.filter((loc) => loc.screen_size === screenSize)
  );

/** Safe Selectors **/
export const safeSelectAllWidgets = (state) => selectAllWidgets(state) || [];
export const safeSelectWidgetById = (state, id) =>
  selectWidgetById(state, id) || null;
export const safeSelectAllDashboards = (state) => selectAllDashboards(state) || [];
export const safeSelectDashboardById = (state, id) =>
  selectDashboardById(state, id) || null;
