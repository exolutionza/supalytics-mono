// store/slices/widgetsSlice.js
import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import { supabase } from '@/services/supabase-client';
import _ from 'lodash';

const widgetsAdapter = createEntityAdapter({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const widgetsInitialState = widgetsAdapter.getInitialState({
  loading: false,
  error: null,
  runtime: {},
  // Map of widget -> [variable_ids]
  paramDependencies: {}
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

// Fetch widget_templates for the same dashboard
export const fetchWidgetTemplatesForDashboard = createAsyncThunk(
  'widgets/fetchTemplatesForDashboard',
  async (dashboardId) => {
    // Example: sub-select all widgets in this dashboard, then fetch related templates.
    const { data: widgetsData, error: widgetsErr } = await supabase
      .from('widgets')
      .select('id')
      .eq('dashboard_id', dashboardId);

    if (widgetsErr) throw new Error(widgetsErr.message);
    const widgetIds = widgetsData.map((w) => w.id);

    const { data, error } = await supabase
      .from('widget_templates')
      .select('*')
      .in('widget_id', widgetIds);

    if (error) throw new Error(error.message);
    return data; // array of { id, widget_id, variable_id, variable_key, ... }
  }
);

const widgetsSlice = createSlice({
  name: 'widgets',
  initialState: widgetsInitialState,
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
        summary: null,
        lastUsedParams: {}
      };
    },
    processDataBatch(state, action) {
      const { widgetId, batch } = action.payload;
      const rt = state.runtime[widgetId] || {
        isStreaming: true,
        rows: [],
        rowOrder: [],
        metadata: null,
        receivedRows: 0,
        error: null,
        batchCount: 0,
        summary: null,
        lastUsedParams: {}
      };
      rt.rows.push(...batch.rows);
      rt.rowOrder.push(...batch.rowOrder);
      rt.receivedRows += batch.rows.length;
      rt.batchCount++;
      state.runtime[widgetId] = rt;
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
          summary: null,
          lastUsedParams: {}
        };
      }
      state.runtime[widgetId].metadata = metadata;
    },
    setWidgetComplete(state, action) {
      const { widgetId, summary } = action.payload;
      const rt = state.runtime[widgetId];
      if (rt) {
        rt.isStreaming = false;
        rt.summary = summary;
      }
    },
    setWidgetError(state, action) {
      const { widgetId, error } = action.payload;
      const rt = state.runtime[widgetId];
      if (rt) {
        rt.isStreaming = false;
        rt.error = error;
      }
    },
    setWidgetStreamingStatus(state, action) {
      const { widgetId, isStreaming } = action.payload;
      if (state.runtime[widgetId]) {
        state.runtime[widgetId].isStreaming = isStreaming;
      }
    },
    setWidgetLastUsedParams(state, action) {
      const { widgetId, lastUsedParams } = action.payload;
      if (!state.runtime[widgetId]) {
        state.runtime[widgetId] = {
          isStreaming: false,
          rows: [],
          rowOrder: [],
          metadata: null,
          receivedRows: 0,
          error: null,
          batchCount: 0,
          summary: null,
          lastUsedParams: {}
        };
      }
      state.runtime[widgetId].lastUsedParams = lastUsedParams;
    },
    // Store widget dependency info
    setWidgetDependencies(state, action) {
      // Payload: { [widgetId]: [varId1, varId2, ...], ... }
      state.paramDependencies = action.payload;
    },
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
        // Initialize runtime for each widget
        action.payload.forEach((widget) => {
          state.runtime[widget.id] = {
            isStreaming: false,
            rows: [],
            rowOrder: [],
            metadata: null,
            receivedRows: 0,
            error: null,
            batchCount: 0,
            summary: null,
            lastUsedParams: {}
          };
        });
      })
      .addCase(fetchWidgetsForDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(fetchWidgetTemplatesForDashboard.fulfilled, (state, action) => {
        const templates = action.payload; // array of widget_templates rows
        const depMap = {};
        templates.forEach((t) => {
          const wId = t.widget_id;
          if (!depMap[wId]) {
            depMap[wId] = [];
          }
          // Avoid duplicates if multiple param references
          if (!depMap[wId].includes(t.variable_id)) {
            depMap[wId].push(t.variable_id);
          }
        });
        state.paramDependencies = depMap;
      })
      .addCase(fetchWidgetTemplatesForDashboard.rejected, (state, action) => {
        state.error = action.error.message;
      });
  },
});

// Export actions
export const {
  resetWidgetRuntime,
  processDataBatch,
  setWidgetMetadata,
  setWidgetComplete,
  setWidgetError,
  setWidgetStreamingStatus,
  setWidgetLastUsedParams,
  setWidgetDependencies
} = widgetsSlice.actions;

// Export reducer
export const widgetsReducer = widgetsSlice.reducer;

// Export selectors
export const {
  selectAll: selectAllWidgets,
  selectById: selectWidgetById,
  selectEntities: selectWidgetEntities,
} = widgetsAdapter.getSelectors((state) => state.widgets);

// Export adapter if needed
export { widgetsAdapter };