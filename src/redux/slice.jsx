// dashboardSlice.js
import { createSlice } from '@reduxjs/toolkit';
import initialState from './initialState';

// move to supabase
// import { Executor } from '../cog/bitool/executor';
// import WidgetStore from '../cog/bitool/widget/Store';

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    // Status reducers
    setInitialized: (state, { payload }) => {
      state.dashboard.initialized = payload;
    },
    setReportMode: (state, { payload }) => {
      state.dashboard.reportMode = payload;
    },
    setEmbedMode: (state, { payload }) => {
      state.dashboard.embedMode = payload;
    },

    // Widget reducers
    setWidgets: (state, { payload }) => {
      state.dashboard.widgets = payload.widgets;
    },
    updateWidget: (state, { payload }) => {
      state.dashboard.widgets[payload.id] = payload.widget;
    },
    
    // Widget state reducers
    setWidgetLoading: (state, { payload }) => {
      state.dashboard.widgetIsLoading[payload.id] = payload.isLoading;
    },
    setWidgetExecutor: (state, { payload }) => {
      state.dashboard.widgetExecutorControllers[payload.id] = payload.controller;
    },
    setWidgetData: (state, { payload }) => {
      state.dashboard.widgetData[payload.id] = payload.data;
    },
    setWidgetColumns: (state, { payload }) => {
      state.dashboard.widgetColumns[payload.id] = payload.columns;
    },
    setWidgetTemplate: (state, { payload }) => {
      state.dashboard.widgetTemplates[payload.id] = payload.data;
    },

    // Variable reducers
    setWidgetVariable: (state, { payload }) => {
      if (!state.dashboard.reportMode) {
        state.dashboard.widgetVariables[payload.id] = payload.data;
      }
    },
    setWidgetVariables: (state, { payload }) => {
      Object.entries(payload).forEach(([key, value]) => {
        state.dashboard.widgetVariables[key] = value;
      });
    },

    // Group reducers
    setWidgetGroupMemberIndex: (state, { payload }) => {
      state.dashboard.widgetSelectedGroupMemberIndex[payload.id] = payload.index;
    },
    setWidgetGroupMemberMaxIndex: (state, { payload }) => {
      state.dashboard.widgetSelectedGroupMemberMaxIndex[payload.id] = payload.index;
    }
  }
});

// Thunk Actions
export const initDashboard = (dashboardId, reportMode, embedMode) => async (dispatch) => {
  try {
    dispatch(dashboardSlice.actions.setInitialized(false));
    
    if (reportMode) dispatch(dashboardSlice.actions.setReportMode(reportMode));
    if (embedMode) dispatch(dashboardSlice.actions.setEmbedMode(embedMode));

    // const response = await WidgetStore.FindAll({
    //   dashboardId,
    //   report: reportMode || embedMode
    // });

    const widgets = response.widgets.reduce((acc, widget) => ({
      ...acc,
      [widget.id]: widget
    }), {});

    dispatch(dashboardSlice.actions.setWidgets({ widgets }));
    dispatch(initWidgets());
  } catch (error) {
    console.error('Failed to initialize dashboard:', error);
    // Here you might want to dispatch an error action
  }
};

export const initWidgets = () => async (dispatch, getState) => {
  try {
    const { biTool: { dashboard: { widgets } } } = getState();

    // Initialize all widgets
    Object.values(widgets).forEach(widget => {
      // Reset widget state
      dispatch(dashboardSlice.actions.setWidgetData({ id: widget.id, data: null }));
      dispatch(dashboardSlice.actions.setWidgetColumns({ id: widget.id, columns: null }));
      dispatch(dashboardSlice.actions.setWidgetTemplate({ 
        id: widget.id, 
        data: widget.arguments.templates 
      }));
      dispatch(dashboardSlice.actions.setWidgetVariable({ id: widget.id, data: null }));

      // Handle templates
      if (widget.arguments.templates) {
        Object.values(widget.arguments.templates).forEach(template => {
          if (template?.variableId) {
            dispatch(dashboardSlice.actions.setWidgetVariable({ 
              id: widget.id, 
              data: null 
            }));
          }
        });
      }

      // Handle groups
      if (widget.arguments.type?.toLowerCase().includes('group')) {
        dispatch(dashboardSlice.actions.setWidgetGroupMemberIndex({ 
          id: widget.id, 
          index: 0 
        }));
        dispatch(dashboardSlice.actions.setWidgetGroupMemberMaxIndex({ 
          id: widget.id, 
          index: 0 
        }));
      }
    });

    dispatch(dashboardSlice.actions.setInitialized(true));
  } catch (error) {
    console.error('Failed to initialize widgets:', error);
    // Here you might want to dispatch an error action
  }
};

export const executeWidget = (widget, template, controller) => async (dispatch, getState) => {
  try {
    dispatch(dashboardSlice.actions.setWidgetLoading({ id: widget.id, isLoading: true }));

    let results = {
      columns: [],
      data: {},
      Errors: null
    };

    if (widget.arguments.executorArgs && template) {
    //   results = await Executor.ExecuteOne({
    //     report: getState().biTool.dashboard.embedMode,
    //     connectorId: widget.arguments.executorArgs.connectorId,
    //     queryId: widget.arguments.executorArgs.queryId,
    //     templates: template,
    //     controller
    //   });
    }

    if (results.Errors && results.Errors !== 'finished early') {
      console.error('Widget execution error:', results.Errors);
    }

    dispatch(dashboardSlice.actions.setWidgetData({ id: widget.id, data: results.data }));
    dispatch(dashboardSlice.actions.setWidgetColumns({ id: widget.id, columns: results.columns }));

    if (results.Errors !== 'finished early') {
      dispatch(dashboardSlice.actions.setWidgetLoading({ id: widget.id, isLoading: false }));
    }

    if (!results.data) {
      dispatch(dashboardSlice.actions.setWidgetVariable({ id: widget.id, data: null }));
    }
  } catch (error) {
    console.error('Failed to execute widget:', error);
    dispatch(dashboardSlice.actions.setWidgetLoading({ id: widget.id, isLoading: false }));
    // Here you might want to dispatch an error action
  }
};

export const updateWidgetVariable = (id, data) => 
  dashboardSlice.actions.setWidgetVariable({ id, data });

export const updateWidget = (id, widget) => async (dispatch) => {
  try {
    dispatch(dashboardSlice.actions.setWidgetTemplate({
      id,
      data: widget.arguments.templates
    }));
    
    dispatch(dashboardSlice.actions.setWidgetData({
      id,
      data: null
    }));
    
    dispatch(dashboardSlice.actions.setWidgetVariable({
      id,
      data: null
    }));

    if (widget.arguments.type.toLowerCase().includes('group')) {
      dispatch(dashboardSlice.actions.setWidgetGroupMemberIndex({
        id: widget.id,
        index: 0
      }));
    }

    dispatch(dashboardSlice.actions.updateWidget({ id, widget }));
  } catch (error) {
    console.error('Failed to update widget:', error);
    // Here you might want to dispatch an error action
  }
};

export const { actions, reducer } = dashboardSlice;
export default dashboardSlice;