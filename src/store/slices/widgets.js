// store/slices/widgetsSlice.js
import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import { supabase } from '@/services/supabase-client';

const widgetsAdapter = createEntityAdapter({
  selectId: (widget) => widget.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const widgetsInitialState = widgetsAdapter.getInitialState({
  loading: false,
  error: null,
  runtime: {},
  paramDependencies: {}
});

const createInitialRuntime = () => ({
  isStreaming: false,
  status: null,
  isExecuted: false,
  rows: [],
  rowOrder: [],
  metadata: null,
  receivedRows: 0,
  error: null,
  batchCount: 0,
  summary: null,
  lastUsedParams: {}
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

export const fetchWidgetTemplatesForDashboard = createAsyncThunk(
  'widgets/fetchTemplatesForDashboard',
  async (dashboardId) => {
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
    return data;
  }
);

const widgetsSlice = createSlice({
  name: 'widgets',
  initialState: widgetsInitialState,
  reducers: {
    resetWidgetRuntime(state, action) {
      const widgetId = action.payload;
      state.runtime[widgetId] = createInitialRuntime();
      console.log(`Widget ${widgetId} runtime reset`);
    },
    
    processDataBatch(state, action) {
      const { widgetId, batch } = action.payload;
      const rt = state.runtime[widgetId] || createInitialRuntime();
      
      rt.rows.push(...batch.rows);
      rt.rowOrder.push(...batch.rowOrder);
      rt.receivedRows += batch.rows.length;
      rt.batchCount++;
      state.runtime[widgetId] = rt;
      
      console.log(`Widget ${widgetId} processed batch:`, batch);
    },
    
    setWidgetMetadata(state, action) {
      const { widgetId, metadata } = action.payload;
      if (!state.runtime[widgetId]) {
        state.runtime[widgetId] = createInitialRuntime();
      }
      state.runtime[widgetId].metadata = metadata;
    },
    
    setWidgetComplete(state, action) {
      const { widgetId, summary } = action.payload;
      if (!state.runtime[widgetId]) {
        state.runtime[widgetId] = createInitialRuntime();
      }
      state.runtime[widgetId] = {
        ...state.runtime[widgetId],
        isStreaming: false,
        status: 'complete',
        isExecuted: true,
        summary
      };
    },
    
    setWidgetError(state, action) {
      const { widgetId, error } = action.payload;
      if (!state.runtime[widgetId]) {
        state.runtime[widgetId] = createInitialRuntime();
      }
      state.runtime[widgetId] = {
        ...state.runtime[widgetId],
        isStreaming: false,
        status: 'error',
        isExecuted: false,
        error
      };
    },
    
    setWidgetStreamingStatus(state, action) {
      const { widgetId, isStreaming, status, isExecuted } = action.payload;
      
      // Ensure runtime state exists
      if (!state.runtime[widgetId]) {
        state.runtime[widgetId] = createInitialRuntime();
      }
      
      // Log previous state for debugging
      console.log(`[Widget ${widgetId}] Previous streaming state:`, {
        isStreaming: state.runtime[widgetId].isStreaming,
        status: state.runtime[widgetId].status,
        isExecuted: state.runtime[widgetId].isExecuted
      });
      
      // Update with new state while preserving other fields
      state.runtime[widgetId] = {
        ...state.runtime[widgetId],
        isStreaming: isStreaming ?? false,
        status: status || state.runtime[widgetId].status,
        isExecuted: isExecuted ?? state.runtime[widgetId].isExecuted
      };
      
      // Log new state for debugging
      console.log(`[Widget ${widgetId}] New streaming state:`, {
        isStreaming: state.runtime[widgetId].isStreaming,
        status: state.runtime[widgetId].status,
        isExecuted: state.runtime[widgetId].isExecuted
      });
      console.log(`Widget ${widgetId} streaming status updated:`, { isStreaming, status, isExecuted });
    },
    
    setWidgetLastUsedParams(state, action) {
      const { widgetId, lastUsedParams } = action.payload;
      if (!state.runtime[widgetId]) {
        state.runtime[widgetId] = createInitialRuntime();
      }
      state.runtime[widgetId].lastUsedParams = lastUsedParams;
    },
    
    setWidgetDependencies(state, action) {
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
        action.payload.forEach((widget) => {
          state.runtime[widget.id] = createInitialRuntime();
          console.log(`Widget ${widget.id} initialized`);
        });
      })
      .addCase(fetchWidgetsForDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(fetchWidgetTemplatesForDashboard.fulfilled, (state, action) => {
        const templates = action.payload;
        const depMap = {};
        templates.forEach((t) => {
          const wId = t.widget_id;
          if (!depMap[wId]) {
            depMap[wId] = [];
          }
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

// Debug helper
export const logWidgetState = (state, widgetId) => {
  const runtime = state.widgets.runtime[widgetId];
  console.log(`[Widget ${widgetId}] Current state:`, {
    isStreaming: runtime?.isStreaming,
    status: runtime?.status,
    isExecuted: runtime?.isExecuted,
    error: runtime?.error
  });
};

// Export selectors
export const {
  selectAll: selectAllWidgets,
  selectById: selectWidgetById,
  selectEntities: selectWidgetEntities,
} = widgetsAdapter.getSelectors((state) => state.widgets);

// Custom selectors
export const selectWidgetRuntime = (state, widgetId) => 
  state.widgets.runtime[widgetId] || createInitialRuntime();

export const selectWidgetStreamingStatus = (state, widgetId) => {
  const runtime = selectWidgetRuntime(state, widgetId);
  return {
    isStreaming: runtime.isStreaming,
    status: runtime.status,
    isExecuted: runtime.isExecuted
  };
};

// Export adapter
export { widgetsAdapter };