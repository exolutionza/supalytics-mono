import { createSelector } from '@reduxjs/toolkit';
import { dashboardsAdapter, widgetsAdapter } from './slices';

export const {
  selectById: selectDashboardById,
  selectAll: selectAllDashboards,
} = dashboardsAdapter.getSelectors((state) => state.dashboards);

export const {
  selectById: selectWidgetById,
  selectAll: selectAllWidgets,
} = widgetsAdapter.getSelectors((state) => state.widgets);

export const selectWidgetsForDashboard = (dashboardId) =>
  createSelector(
    selectAllWidgets,
    (widgets) => widgets.filter((widget) => widget.dashboard_id === dashboardId)
  );

export const selectWidgetFullData = (widgetId) =>
  createSelector(
    (state) => selectWidgetById(state, widgetId),
    (state) => state.widgets.runtime[widgetId],
    (widget, runtime) => ({ widget, runtime })
  );

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

export const selectWidgetMetadata = (widgetId) =>
  createSelector(
    selectWidgetFullData(widgetId),
    ({ runtime }) => runtime?.metadata ?? null
  );

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