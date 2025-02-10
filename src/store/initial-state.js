// initialState.js
import { dashboardsAdapter, widgetsAdapter } from './slices';

/**
 * Create a unified initialState for your store, leveraging
 * your entity adapters plus any extra flags or sub-objects.
 */
const initialState = {
  dashboards: dashboardsAdapter.getInitialState({
    loading: false,
    error: null,
    initialized: false,
  }),

  widgets: widgetsAdapter.getInitialState({
    loading: false,
    error: null,
    // 'runtime' holds per-widget streaming/query data
    runtime: {}
  }),

  // Global outputs for cross-widget data
  globalOutputs: {},

  // If you store widget templates in Redux, you can nest them here
  templates: {
    byWidget: {}
  }
};

export default initialState;
