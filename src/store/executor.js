// executeWidget.js

import { createAsyncThunk } from '@reduxjs/toolkit';
import _ from 'lodash';
import { websocketService } from '@/services/websocket-service';

// Import pieces from our slices
import {
  processDataBatch,
  setWidgetMetadata,
  setWidgetComplete,
  setWidgetError,
  setWidgetStreamingStatus,
  setWidgetLastUsedParams
} from './slices'; // from the combined file

// Import the serialization logic
import { serializeOutputData } from './templates';

/**
 * If you want a function to gather raw param data for comparison:
 */
function gatherRawParams(widgetId, state) {
  const widgetTemplates = state.templates?.byWidget?.[widgetId] ?? [];
  const { globalOutputs } = state;

  const rawParams = {};
  widgetTemplates.forEach((t) => {
    const paramName = t.variable_key || t.variable_id;
    const val = t.index != null ? pickIndexed(globalOutputs[t.variable_id], t.index)
                                : globalOutputs[t.variable_id];
    rawParams[paramName] = val;
  });
  return rawParams;
}
function pickIndexed(obj, idx) {
  // same approach as findValueByIndex, or a simpler version if you only store arrays
  if (Array.isArray(obj)) return obj[idx];
  return obj;
}

/**
 * reexecuteIfNeeded logic (deep compare):
 */
function reexecuteIfNeeded(thunkAPI, finishedWidgetId) {
  const state = thunkAPI.getState();
  const { widgets } = state;

  Object.keys(widgets.entities).forEach((wid) => {
    if (wid === finishedWidgetId) return; // skip the one that just finished

    const runtime = widgets.runtime[wid];
    if (!runtime) return;

    const newParams = gatherRawParams(wid, state);
    const oldParams = runtime.lastUsedParams || {};

    if (!_.isEqual(newParams, oldParams)) {
      // Dispatch a new execute
      thunkAPI.dispatch(executeWidget({ widgetId: wid }));
    }
  });
}

/**
 * The main thunk that runs a query over WebSocket
 */
export const executeWidget = createAsyncThunk(
  'widgets/executeWidget',
  async ({ widgetId }, thunkAPI) => {
    try {
      const state = thunkAPI.getState();
      const widget = state.widgets.entities[widgetId];
      if (!widget) {
        return thunkAPI.rejectWithValue({ error: 'Widget not found' });
      }

      // Gather raw params for storing in lastUsedParams
      const rawParams = gatherRawParams(widgetId, state);

      // Also create serialized params for sending
      const widgetTemplates = state.templates?.byWidget?.[widgetId] ?? [];
      if (!widgetTemplates.length) {
        return thunkAPI.rejectWithValue({ error: 'No templates for widget' });
      }

      const serializedParams = {};
      widgetTemplates.forEach((t) => {
        const outputData = state.globalOutputs[t.variable_id];
        serializedParams[t.variable_key || t.variable_id] = serializeOutputData(outputData, t);
      });

      // Store the rawParams in runtime
      thunkAPI.dispatch(setWidgetLastUsedParams({ widgetId, lastUsedParams: rawParams }));

      // Connect & execute
      const socket = await websocketService.connect(`/api/execute/${widget.id}`);
      socket.send(JSON.stringify({
        type: 'EXECUTE_REQUEST',
        payload: {
          queryId: widget.query_id,
          parameters: serializedParams
        }
      }));

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'METADATA':
            thunkAPI.dispatch(setWidgetMetadata({
              widgetId,
              metadata: {
                columns: message.payload.columns,
                columnOrder: message.payload.columns.map((c) => c.name),
                totalRows: message.payload.totalRows,
              }
            }));
            break;

          case 'BATCH':
            thunkAPI.dispatch(processDataBatch({
              widgetId,
              batch: {
                rows: message.payload.rows,
                rowOrder: message.payload.rowOrder ||
                  message.payload.rows.map((_, idx) => idx),
              },
            }));
            break;

          case 'COMPLETE':
            thunkAPI.dispatch(setWidgetComplete({ widgetId, summary: message.payload }));
            socket.close();
            reexecuteIfNeeded(thunkAPI, widgetId);
            break;

          case 'ERROR':
            thunkAPI.dispatch(setWidgetError({ widgetId, error: message.payload.error }));
            socket.close();
            break;
        }
      };

      socket.onerror = () => {
        thunkAPI.dispatch(setWidgetError({ widgetId, error: 'WebSocket connection error' }));
      };

      socket.onclose = () => {
        thunkAPI.dispatch(setWidgetStreamingStatus({ widgetId, isStreaming: false }));
      };

      return { widgetId, status: 'streaming' };
    } catch (error) {
      return thunkAPI.rejectWithValue({ error: error.message });
    }
  }
);
