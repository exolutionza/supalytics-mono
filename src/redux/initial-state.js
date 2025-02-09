// initialState.js
import { dashboardsAdapter, widgetsAdapter } from './slices';

const initialState = {
  dashboards: dashboardsAdapter.getInitialState({
    loading: false,
    error: null,
    initialized: false,
    reportMode: false,
    embedMode: false
  }),

  widgets: widgetsAdapter.getInitialState({
    loading: false,
    error: null,
    runtime: {},  // Runtime state for each widget
    templates: {}, // Templates for each widget
    variables: {}  // Variables for each widget
  }),

  // Global outputs for sharing data between widgets
  globalOutputs: {},

  // App-wide settings
  settings: {
    organizationId: '',
    reportMode: false,
    embedMode: false
  }
};

// Helper to create initial runtime state for a widget
export const createInitialWidgetRuntime = () => ({
  isStreaming: false,
  rows: [],
  rowOrder: [],
  metadata: null,
  receivedRows: 0,
  error: null,
  batchCount: 0,
  summary: null
});

export default initialState;