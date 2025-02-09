import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import supabase from '@/services/supabase-client';
import { websocketService } from '@/services/websocket-service';

const dashboardsAdapter = createEntityAdapter({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const dashboardInitialState = dashboardsAdapter.getInitialState({
  loading: false,
  error: null,
  initialized: false,
});

export const fetchDashboards = createAsyncThunk(
  'dashboards/fetchAll',
  async (organizationId) => {
    const { data, error } = await supabase
      .from('dashboards')
      .select('*')
      .eq('organization_id', organizationId);
    if (error) throw new Error(error.message);
    return data;
  }
);

const dashboardSlice = createSlice({
  name: 'dashboards',
  initialState: dashboardInitialState,
  reducers: {
    setInitialized(state, action) {
      state.initialized = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboards.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboards.fulfilled, (state, action) => {
        state.loading = false;
        dashboardsAdapter.setAll(state, action.payload);
      })
      .addCase(fetchDashboards.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

const widgetsAdapter = createEntityAdapter({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const widgetInitialState = widgetsAdapter.getInitialState({
  runtime: {},
  loading: false,
  error: null,
});

export const fetchWidgetsForDashboard = createAsyncThunk(
  'widgets/fetchForDashboard',
  async (dashboardId) => {
    const { data, error } = await supabase
      .from('widgets')
      .select('*')
      .eq('dashboard_id', dashboardId);
    if (error) throw new Error(error.message);
    return data;
  }
);

export const executeWidget = createAsyncThunk(
  'widgets/executeWidget',
  async ({ widgetId }, thunkAPI) => {
    try {
      const state = thunkAPI.getState();
      const widget = state.widgets.entities[widgetId];
      if (!widget) {
        return thunkAPI.rejectWithValue({ error: 'Widget not found' });
      }

      const widgetTemplates = state.templates?.byWidget?.[widgetId];
      if (!widgetTemplates) {
        return thunkAPI.rejectWithValue({ error: 'No templates defined for widget' });
      }

      const socket = await websocketService.connect(`/api/execute/${widget.id}`);
      
      socket.send(JSON.stringify({
        type: 'EXECUTE_REQUEST',
        payload: {
          queryId: widget.query_id,
          templates: widgetTemplates,
        }
      }));

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'METADATA': {
            const { columns, totalRows } = message.payload;
            thunkAPI.dispatch(setWidgetMetadata({
              widgetId,
              metadata: {
                columns,
                columnOrder: columns.map(col => col.name),
                totalRows
              }
            }));
            break;
          }

          case 'BATCH': {
            const { rows, rowOrder } = message.payload;
            thunkAPI.dispatch(processDataBatch({
              widgetId,
              batch: {
                rows,
                rowOrder: rowOrder || rows.map((_, idx) => idx)
              }
            }));
            break;
          }
          
          case 'COMPLETE':
            thunkAPI.dispatch(setWidgetComplete({
              widgetId,
              summary: message.payload
            }));
            socket.close();
            break;
          
          case 'ERROR':
            thunkAPI.dispatch(setWidgetError({
              widgetId,
              error: message.payload.error
            }));
            socket.close();
            break;
        }
      };

      socket.onerror = () => {
        thunkAPI.dispatch(setWidgetError({
          widgetId,
          error: 'WebSocket connection error'
        }));
      };

      socket.onclose = () => {
        thunkAPI.dispatch(setWidgetStreamingStatus({
          widgetId,
          isStreaming: false
        }));
      };

      return {
        widgetId,
        status: 'streaming'
      };
    } catch (error) {
      return thunkAPI.rejectWithValue({ error: error.message });
    }
  }
);

const widgetSlice = createSlice({
  name: 'widgets',
  initialState: widgetInitialState,
  reducers: {
    resetWidgetRuntime(state, action) {
      const widgetId = action.payload;
      state.runtime[widgetId] = {
        isStreaming: false,
        rows: [],
        rowOrder: [],
        metadata: null,
        receivedRows: 0,
        error: null,
        batchCount: 0,
        summary: null
      };
    },

    processDataBatch(state, action) {
      const { widgetId, batch } = action.payload;
      const runtime = state.runtime[widgetId] || {
        isStreaming: true,
        rows: [],
        rowOrder: [],
        metadata: null,
        receivedRows: 0,
        error: null,
        batchCount: 0,
        summary: null
      };

      runtime.rows.push(...batch.rows);
      runtime.rowOrder.push(...batch.rowOrder);
      runtime.receivedRows += batch.rows.length;
      runtime.batchCount++;
      state.runtime[widgetId] = runtime;
    },

    setWidgetMetadata(state, action) {
      const { widgetId, metadata } = action.payload;
      if (!state.runtime[widgetId]) {
        state.runtime[widgetId] = {
          isStreaming: true,
          rows: [],
          rowOrder: [],
          metadata: null,
          receivedRows: 0,
          error: null,
          batchCount: 0,
          summary: null
        };
      }
      state.runtime[widgetId].metadata = metadata;
    },

    setWidgetComplete(state, action) {
      const { widgetId, summary } = action.payload;
      state.runtime[widgetId].isStreaming = false;
      state.runtime[widgetId].summary = summary;
    },

    setWidgetError(state, action) {
      const { widgetId, error } = action.payload;
      state.runtime[widgetId].isStreaming = false;
      state.runtime[widgetId].error = error;
    },

    setWidgetStreamingStatus(state, action) {
      const { widgetId, isStreaming } = action.payload;
      if (state.runtime[widgetId]) {
        state.runtime[widgetId].isStreaming = isStreaming;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWidgetsForDashboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWidgetsForDashboard.fulfilled, (state, action) => {
        state.loading = false;
        widgetsAdapter.setAll(state, action.payload);
        action.payload.forEach((widget) => {
          state.runtime[widget.id] = {
            isStreaming: false,
            rows: [],
            rowOrder: [],
            metadata: null,
            receivedRows: 0,
            error: null,
            batchCount: 0,
            summary: null
          };
        });
      })
      .addCase(fetchWidgetsForDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

const globalOutputsSlice = createSlice({
  name: 'globalOutputs',
  initialState: {},
  reducers: {
    updateGlobalOutput(state, action) {
      const { key, value } = action.payload;
      state[key] = value;
    },
  },
});

import { createSelector } from '@reduxjs/toolkit';

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

export const { updateGlobalOutput } = globalOutputsSlice.actions;
export const { setInitialized } = dashboardSlice.actions;
export const {
  resetWidgetRuntime,
  processDataBatch,
  setWidgetMetadata,
  setWidgetComplete,
  setWidgetError,
  setWidgetStreamingStatus
} = widgetSlice.actions;

export const slicesReducer = {
  dashboards: dashboardSlice.reducer,
  widgets: widgetSlice.reducer,
  globalOutputs: globalOutputsSlice.reducer,
};

export { dashboardsAdapter, widgetsAdapter };