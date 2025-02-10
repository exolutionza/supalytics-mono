// slices.js
import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter
} from '@reduxjs/toolkit';
import supabase from '@/services/supabase-client';
import _ from 'lodash'; // for deep comparisons

/* ===========================================================================
   DASHBOARDS SLICE
   =========================================================================== */
const dashboardsAdapter = createEntityAdapter({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const dashboardsInitialState = dashboardsAdapter.getInitialState({
  loading: false,
  error: null,
  initialized: false
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

const dashboardsSlice = createSlice({
  name: 'dashboards',
  initialState: dashboardsInitialState,
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

/* ===========================================================================
   GLOBAL OUTPUTS SLICE
   =========================================================================== */
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

/* ===========================================================================
   WIDGETS SLICE
   =========================================================================== */
const widgetsAdapter = createEntityAdapter({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const widgetsInitialState = widgetsAdapter.getInitialState({
  loading: false,
  error: null,
  runtime: {},
  // ADDED: This is our new map of widget -> [variable_ids]
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

// ADDED: New thunk to fetch widget_templates for the same dashboard
export const fetchWidgetTemplatesForDashboard = createAsyncThunk(
  'widgets/fetchTemplatesForDashboard',
  async (dashboardId) => {
    // For example, we can do a sub-select or multiple queries.
    // We'll assume a single query that returns all widget_templates for the widgets in that dashboard.
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
    return data; // array of { id, widget_id, query_parameter_id, variable_id, variable_key, ... }
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

    // ADDED: A new reducer to store widget dependency info
    setWidgetDependencies(state, action) {
      // action.payload should be an object like: { [widgetId]: [varId1, varId2, ...], ... }
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
        // Initialize runtime
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

      // ADDED: When templates are fetched, build the paramDependencies map.
      .addCase(fetchWidgetTemplatesForDashboard.fulfilled, (state, action) => {
        const templates = action.payload; // array of widget_templates rows
        const depMap = {};
        templates.forEach((t) => {
          const wId = t.widget_id;
          if (!depMap[wId]) {
            depMap[wId] = [];
          }
          // Avoid duplicates if you have multiple param references to the same variable
          if (!depMap[wId].includes(t.variable_id)) {
            depMap[wId].push(t.variable_id);
          }
        });

        state.paramDependencies = depMap;
      })
      .addCase(fetchWidgetTemplatesForDashboard.rejected, (state, action) => {
        // You might want to store an error or handle accordingly
        state.error = action.error.message;
      });
  },
});

/* ===========================================================================
   EXPORTS
   =========================================================================== */
// From dashboards
export const { setInitialized } = dashboardsSlice.actions;

// From globalOutputs
export const { updateGlobalOutput } = globalOutputsSlice.actions;

// From widgets
export const {
  resetWidgetRuntime,
  processDataBatch,
  setWidgetMetadata,
  setWidgetComplete,
  setWidgetError,
  setWidgetStreamingStatus,
  setWidgetLastUsedParams,
  setWidgetDependencies // ADDED
} = widgetsSlice.actions;

// Combine slices for store
export const slicesReducer = {
  dashboards: dashboardsSlice.reducer,
  widgets: widgetsSlice.reducer,
  globalOutputs: globalOutputsSlice.reducer
};

// Export the adapters if needed by selectors
export { dashboardsAdapter, widgetsAdapter };
