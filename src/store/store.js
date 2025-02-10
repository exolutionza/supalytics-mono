// store.js

import { configureStore } from '@reduxjs/toolkit';
import { slicesReducer } from './slices';

export const store = configureStore({
  reducer: slicesReducer,
  // middleware, devTools, etc. if you want
});

export default store;
