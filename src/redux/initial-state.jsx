// initialState.js
const initialState = {
    dashboard: {
      // Core dashboard info
      info: {
        id: '',
        name: '',
        organizationId: ''
      },
  
      // Status flags
      initialized: false,
      reportMode: false,
      embedMode: false,
  
      // Widget collections
      widgets: {},
      widgetData: {},
      widgetColumns: {},
      widgetTemplates: {},
      widgetVariables: {},
  
      // Widget loading states
      widgetIsLoading: {},
      widgetExecutorControllers: {},
  
      // Widget group states
      widgetSelectedGroupMemberIndex: {},
      widgetSelectedGroupMemberMaxIndex: {}
    }
  };
  
  export default initialState;