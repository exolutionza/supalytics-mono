// store/slices/globalOutputsSlice.js
import { createSlice } from '@reduxjs/toolkit';

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

export const { updateGlobalOutput } = globalOutputsSlice.actions;
export const globalOutputsReducer = globalOutputsSlice.reducer;