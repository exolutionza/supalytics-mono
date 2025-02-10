// store/slices/dashboardsSlice.js
import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import { supabase } from '@/services/supabase-client';

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

export const { setInitialized } = dashboardsSlice.actions;
export const dashboardsReducer = dashboardsSlice.reducer;

export const {
  selectAll: selectAllDashboards,
  selectById: selectDashboardById,
  selectEntities: selectDashboardEntities,
} = dashboardsAdapter.getSelectors((state) => state.dashboards);