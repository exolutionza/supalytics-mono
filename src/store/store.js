// store/index.js
import { configureStore } from '@reduxjs/toolkit';

import { dashboardsReducer } from './slices/dashboards';
import { globalOutputsReducer } from './slices/global-outputs';
import { widgetsReducer } from './slices/widgets';
import { widgetLocationsReducer } from './slices/widget-locations';

export const store = configureStore({
  reducer: {
    dashboards: dashboardsReducer,
    globalOutputs: globalOutputsReducer,
    widgets: widgetsReducer,
    widgetLocations: widgetLocationsReducer,
  },
});