import { createSelector, createSelectorCreator, defaultMemoize } from 'reselect';
import isEqual from 'lodash/isEqual';
import { flatten } from 'lodash';

// Create deep equality selector for complex comparisons
const createDeepEqualSelector = createSelectorCreator(defaultMemoize, isEqual);

// Base state selectors
const getDashboard = state => state.biTool.dashboard;
const getWidgets = state => state.biTool.dashboard.widgets;
const getWidgetData = state => state.biTool.dashboard.widgetData;
const getWidgetColumns = state => state.biTool.dashboard.widgetColumns;
const getWidgetTemplates = state => state.biTool.dashboard.widgetTemplates;
const getWidgetVariables = state => state.biTool.dashboard.widgetVariables;
const getWidgetLoading = state => state.biTool.dashboard.widgetIsLoading;
const getWidgetGroupIndices = state => state.biTool.dashboard.widgetSelectedGroupMemberIndex;
const getWidgetGroupMaxIndices = state => state.biTool.dashboard.widgetSelectedGroupMemberMaxIndex;

// Status selectors
export const selectInitialized = createSelector(
  getDashboard,
  dashboard => dashboard.initialized
);

export const selectReportMode = createSelector(
  getDashboard,
  dashboard => dashboard.reportMode
);

export const selectEmbedMode = createSelector(
  getDashboard,
  dashboard => dashboard.embedMode
);

// Widget selectors
export const selectAllWidgets = createDeepEqualSelector(
  getWidgets,
  widgets => widgets
);

export const selectWidgetById = createSelector(
  getWidgets,
  (_, widgetId) => widgetId,
  (widgets, widgetId) => widgetId ? widgets[widgetId] : null
);

// Loading selectors
export const selectAnyWidgetLoading = createSelector(
  getWidgetLoading,
  loadingStates => Object.values(loadingStates).includes(true)
);

export const selectWidgetLoading = () => createSelector(
  getWidgetLoading,
  (_, widgetId) => widgetId,
  (loadingStates, widgetId) => loadingStates[widgetId] || false
);

export const selectWidgetDependentsLoading = () => createSelector(
  getDashboard,
  (_, widgetId) => widgetId,
  (dashboard, widgetId) => {
    const widget = dashboard.widgets[widgetId];
    if (!widget?.arguments?.templates) return false;

    return Object.values(widget.arguments.templates)
      .filter(template => template.widgetId)
      .some(template => dashboard.widgetIsLoading[template.widgetId]);
  }
);

// Data selectors
export const selectWidgetData = () => createSelector(
  getWidgetData,
  (_, widgetId) => widgetId,
  (data, widgetId) => data[widgetId]
);

export const selectWidgetColumns = () => createSelector(
  getWidgetColumns,
  (_, widgetId) => widgetId,
  (columns, widgetId) => columns[widgetId]
);

// Template selectors
export const selectWidgetTemplates = () => createSelector(
  getWidgetTemplates,
  templates => templates
);

export const selectWidgetTemplate = () => createSelector(
  getWidgetTemplates,
  (_, widgetId) => widgetId,
  (templates, widgetId) => templates[widgetId]
);

// Variable selectors
export const selectAllWidgetVariables = createDeepEqualSelector(
  getWidgetVariables,
  variables => variables
);

export const selectWidgetVariable = () => createSelector(
  getWidgetVariables,
  (_, widgetId) => widgetId,
  (variables, widgetId) => variables[widgetId]
);

// Group selectors
export const selectWidgetGroup = () => createSelector(
  getWidgets,
  (_, widgetId) => widgetId,
  (widgets, widgetId) => {
    const widget = widgets[widgetId];
    return widget?.arguments?.group || null;
  }
);

export const selectWidgetGroupMembers = () => createSelector(
  getWidgets,
  (_, widgetId) => widgetId,
  (widgets, widgetId) => {
    const widget = widgets[widgetId];
    if (!widget?.arguments?.group) return null;

    return Object.entries(widget.arguments.group)
      .map(([_, item]) => ({
        id: item.id,
        widget: widgets[item.id] || null,
        gridLocation: item.gridLocation,
        row: item.row,
        label: item.label
      }));
  }
);

export const selectGroupMemberIndex = () => createSelector(
  getWidgetGroupIndices,
  (_, widgetId) => widgetId,
  (indices, widgetId) => indices[widgetId] || 0
);

export const selectGroupMemberMaxIndex = () => createSelector(
  getWidgetGroupMaxIndices,
  (_, widgetId) => widgetId,
  (maxIndices, widgetId) => maxIndices[widgetId] || 0
);

// Layout selectors
export const selectWidgetLayout = createSelector(
  getWidgets,
  widgets => {
    const layouts = {};
    const renderableWidgets = Object.values(widgets)
      .filter(widget => widget.arguments.location);

    renderableWidgets.forEach(widget => {
      const location = widget.arguments.location;
      if (!location) return;

      if ('x' in location) {
        // Single layout
        layouts.lg = layouts.lg || [];
        layouts.lg.push({
          ...location,
          i: widget.id
        });
      } else {
        // Responsive layouts
        Object.entries(location).forEach(([breakpoint, position]) => {
          layouts[breakpoint] = layouts[breakpoint] || [];
          layouts[breakpoint].push({
            ...position,
            i: widget.id
          });
        });
      }
    });

    return {
      widgets: renderableWidgets,
      layouts
    };
  }
);

// Export selectors
export const selectExportableWidgets = createSelector(
  [getWidgets, getWidgetData],
  (widgets, data) => {
    const allowedTypes = ['BasicTable', 'BasicQuickStats', 'BasicApexChart'];
    
    return Object.entries(widgets)
      .filter(([_, widget]) => allowedTypes.includes(widget.arguments.type))
      .map(([id, widget]) => ({
        name: widget.name,
        data: data[id]
      }));
  }
);

// Dependency selectors
export const selectWidgetDependencies = () => createSelector(
  [getWidgets, getWidgetVariables],
  (_, widgetId) => widgetId,
  (widgets, variables, widgetId) => {
    const widget = widgets[widgetId];
    if (!widget?.arguments?.templates) return null;

    return Object.entries(widget.arguments.templates)
      .filter(([_, template]) => template.variableId || template.widgetId)
      .reduce((acc, [key, template]) => {
        const id = template.variableId || template.widgetId;
        acc[key] = variables[id];
        return acc;
      }, {});
  }
);

export const selectWidgetDependencyIds = () => createSelector(
  getWidgets,
  (_, widgetId) => widgetId,
  (widgets, widgetId) => {
    const widget = widgets[widgetId];
    if (!widget) return [];

    let widgetIdsToCheck = [];

    // Check group dependencies
    if (widget.arguments?.group) {
      widgetIdsToCheck = widget.arguments.group
        .filter(item => item.id)
        .filter(item => {
          const groupWidget = widgets[item.id];
          return groupWidget?.arguments?.type !== "BasicWidgetGroup" && 
                 groupWidget?.arguments?.type !== "BasicWidgetStepper";
        })
        .map(item => item.id);
    } else if (
      widget.arguments?.type !== "BasicWidgetGroup" && 
      widget.arguments?.type !== "BasicWidgetStepper"
    ) {
      widgetIdsToCheck = [widgetId];
    }

    // Check template dependencies
    const templateDependencies = widgetIdsToCheck
      .map(id => {
        const w = widgets[id];
        if (!w?.arguments?.templates) return [];

        return Object.values(w.arguments.templates)
          .filter(template => template.widgetId)
          .filter(template => {
            const depWidget = widgets[template.widgetId];
            return depWidget?.arguments?.type !== "BasicWidgetGroup" && 
                   depWidget?.arguments?.type !== "BasicWidgetStepper";
          })
          .map(template => template.widgetId);
      });

    const flatDependencies = flatten(templateDependencies).filter(Boolean);
    if (flatDependencies.length === 0) return [];

    return [...new Set(flatDependencies.map(id => widgets[id]))];
  }
);

// Layout export selector
export const selectExportLayout = createSelector(
  getWidgets,
  widgets => {
    const layouts = {};
    const renderableWidgets = Object.values(widgets)
      .filter(widget => widget.arguments.location);

    renderableWidgets.forEach(widget => {
      let offsetHeight = 0;
      
      if (widget.arguments.type === "BasicWidgetGroupStepper") {
        const groupLength = widget.arguments.group?.length || 0;
        
        Object.entries(widget.arguments.location).forEach(([breakpoint, position]) => {
          layouts[breakpoint] = layouts[breakpoint] || [];
          layouts[breakpoint].push({
            x: position.x,
            y: position.y,
            w: position.w,
            h: position.h * groupLength + offsetHeight,
            i: widget.id
          });
          offsetHeight += groupLength > 0 ? (groupLength - 1) * position.h : 0;
        });
      } else if (widget.arguments.location) {
        if ('x' in widget.arguments.location) {
          const position = widget.arguments.location;
          layouts.lg = layouts.lg || [];
          layouts.lg.push({
            x: position.x,
            y: position.y,
            w: position.w,
            h: position.h + offsetHeight,
            i: widget.id
          });
        } else {
          Object.entries(widget.arguments.location).forEach(([breakpoint, position]) => {
            layouts[breakpoint] = layouts[breakpoint] || [];
            layouts[breakpoint].push({
              x: position.x,
              y: position.y,
              w: position.w,
              h: position.h + offsetHeight,
              i: widget.id
            });
          });
        }
      }
    });

    return {
      widgets: renderableWidgets,
      layouts
    };
  }
);