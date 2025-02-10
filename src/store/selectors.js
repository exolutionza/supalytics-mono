// selectors.js
import { createSelector } from '@reduxjs/toolkit';
import { dashboardsAdapter, widgetsAdapter } from './slices';

/**
 * DASHBOARD SELECTORS
 * -------------------
 * We can get the 'selectById' / 'selectAll' from the dashboardsAdapter.
 */
export const {
  selectById: selectDashboardById,
  selectAll: selectAllDashboards,
} = dashboardsAdapter.getSelectors((state) => state.dashboards);

/**
 * WIDGET SELECTORS
 * ----------------
 * We do the same for the widgetsAdapter.
 */
export const {
  selectById: selectWidgetById,
  selectAll: selectAllWidgets,
} = widgetsAdapter.getSelectors((state) => state.widgets);

/**
 * Example: Return only the widgets that belong to a specific dashboard.
 */
export const selectWidgetsForDashboard = (dashboardId) =>
  createSelector(
    selectAllWidgets,
    (widgets) => widgets.filter((widget) => widget.dashboard_id === dashboardId)
  );

/**
 * Combine the widget entity with its runtime data (streaming state, rows, etc.).
 */
export const selectWidgetFullData = (widgetId) =>
  createSelector(
    (state) => selectWidgetById(state, widgetId),
    (state) => state.widgets.runtime[widgetId],
    (widget, runtime) => ({ widget, runtime })
  );

/**
 * Return the widget's rows in the correct order, plus metadata for columns, etc.
 */
export const selectWidgetOrderedData = (widgetId) =>
  createSelector(
    selectWidgetFullData(widgetId),
    ({ runtime }) => {
      if (!runtime?.rows || !runtime?.metadata?.columnOrder) {
        return null;
      }
      const orderedRows = runtime.rowOrder.map(idx => runtime.rows[idx]);
      return {
        rows: orderedRows,
        columns: runtime.metadata.columnOrder,
        isStreaming: runtime.isStreaming,
        batchCount: runtime.batchCount,
        error: runtime.error,
        summary: runtime.summary
      };
    }
  );

/**
 * Return progress info for streaming widgets:
 *   - how many rows total vs. how many received so far
 *   - a numeric progress (0-100)
 */
export const selectWidgetProgress = (widgetId) =>
  createSelector(
    selectWidgetFullData(widgetId),
    ({ runtime }) => ({
      totalRows: runtime?.metadata?.totalRows ?? 0,
      receivedRows: runtime?.receivedRows ?? 0,
      progress: runtime?.metadata?.totalRows
        ? (runtime.receivedRows / runtime.metadata.totalRows) * 100
        : 0,
      isComplete: runtime?.receivedRows === runtime?.metadata?.totalRows,
      isStreaming: runtime?.isStreaming ?? false
    })
  );

/**
 * Grab just the metadata (column definitions, total row count, etc.)
 */
export const selectWidgetMetadata = (widgetId) =>
  createSelector(
    selectWidgetFullData(widgetId),
    ({ runtime }) => runtime?.metadata ?? null
  );

/**
 * Return a simple object describing streaming status (are we streaming? did we error? etc.)
 */
export const selectWidgetStreamingStatus = (widgetId) =>
  createSelector(
    selectWidgetFullData(widgetId),
    ({ runtime }) => ({
      isStreaming: runtime?.isStreaming ?? false,
      batchCount: runtime?.batchCount ?? 0,
      hasError: !!runtime?.error,
      error: runtime?.error ?? null,
      hasData: (runtime?.rows?.length ?? 0) > 0,
      totalRows: runtime?.metadata?.totalRows ?? 0,
      receivedRows: runtime?.receivedRows ?? 0
    })
  );
