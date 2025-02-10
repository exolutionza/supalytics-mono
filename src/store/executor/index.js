// executeWidget.js

import { createAsyncThunk } from '@reduxjs/toolkit';
import _ from 'lodash';
import { websocketService } from '@/services/websocket-service';

// Import pieces from our slices
import {
  setWidgetMetadata,
  setWidgetComplete,
  setWidgetError,
  setWidgetStreamingStatus,
  setWidgetLastUsedParams,
} from '@/store/slices/widgets';

import { updateGlobalOutput } from '@/store/slices/global-outputs';

// Import the serialization logic
import { serializeOutputData } from './serializers';

/**
 * If you want a function to gather raw param data for comparison:
 */
function gatherRawParams(widgetId, state) {
  const widgetTemplates = state.templates?.byWidget?.[widgetId] ?? [];
  const { globalOutputs } = state;

  const rawParams = {};
  widgetTemplates.forEach((t) => {
    const paramName = t.variable_key || t.variable_id;
    const val = t.index != null
      ? pickIndexed(globalOutputs[t.variable_id], t.index)
      : globalOutputs[t.variable_id];
    rawParams[paramName] = val;
  });
  return rawParams;
}

function pickIndexed(obj, idx) {
  if (Array.isArray(obj)) return obj[idx];
  return obj; // or something more robust
}

/**
 * Instead of scanning ALL widgets, we only re-execute
 * the ones that depend on the changed variables.
 */
function reexecuteIfNeeded(thunkAPI, finishedWidgetId, changedVariableIds = []) {
  const state = thunkAPI.getState();
  const { widgets } = state;
  const { paramDependencies, runtime } = widgets;

  // paramDependencies: { [widgetId]: [varId1, varId2, ...] }
  const widgetsToCheck = new Set();

  changedVariableIds.forEach((varId) => {
    // For each widget => varIdList
    for (const [wId, varIdList] of Object.entries(paramDependencies || {})) {
      if (varIdList.includes(varId)) {
        widgetsToCheck.add(wId);
      }
    }
  });

  widgetsToCheck.forEach((widgetId) => {
    if (widgetId === finishedWidgetId) return; // skip the just-finished widget

    const rt = runtime[widgetId];
    if (!rt) return;

    const newParams = gatherRawParams(widgetId, state);
    const oldParams = rt.lastUsedParams || {};

    if (!_.isEqual(newParams, oldParams)) {
      thunkAPI.dispatch(executeWidget({ widgetId }));
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
        serializedParams[t.variable_key || t.variable_id] =
          serializeOutputData(outputData, t);
      });

      // Store the rawParams in runtime
      thunkAPI.dispatch(
        setWidgetLastUsedParams({ widgetId, lastUsedParams: rawParams })
      );

      // Connect & execute (WebSocket endpoint is just an example)
      const socket = await websocketService.connect(`/api/execute/${widget.id}`);
      socket.send(
        JSON.stringify({
          type: 'EXECUTE_REQUEST',
          payload: {
            queryId: widget.query_id,
            parameters: serializedParams
          }
        })
      );

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'METADATA':
            thunkAPI.dispatch(
              setWidgetMetadata({
                widgetId,
                metadata: {
                  columns: message.payload.columns,
                  columnOrder: message.payload.columns.map((c) => c.name),
                  totalRows: message.payload.totalRows
                }
              })
            );
            break;

          case 'COMPLETE': {
            thunkAPI.dispatch(
              setWidgetComplete({ widgetId, summary: message.payload })
            );

            // ---------------------------------------------------------------------------------
            // TODO:
            // Suppose the backend includes some keys in message.payload (e.g., "foo", "bar")
            // that you want to store in globalOutputs. We'll compare old vs. new values.
            // If they differ, we do updateGlobalOutput(...) and add them to changedVars.
            // ---------------------------------------------------------------------------------
            const changedVars = [];
            const globalOutputsState = thunkAPI.getState().globalOutputs;

              // Now re-check only widgets that depend on any changed variables
            if (changedVars.length > 0) {
              reexecuteIfNeeded(thunkAPI, widgetId, changedVars);
            }

            socket.close();
            break;
          }

          // case 'BATCH':
          //   thunkAPI.dispatch(
          //     processDataBatch({
          //       widgetId,
          //       batch: {
          //         rows: message.payload.rows,
          //         rowOrder:
          //           message.payload.rowOrder ||
          //           message.payload.rows.map((_, idx) => idx)
          //       }
          //     })
          //   );
          //   break;
          
          case 'ERROR':
            thunkAPI.dispatch(
              setWidgetError({ widgetId, error: message.payload.error })
            );
            socket.close();
            break;
        }
      };

      socket.onerror = () => {
        thunkAPI.dispatch(
          setWidgetError({ widgetId, error: 'WebSocket connection error' })
        );
      };

      socket.onclose = () => {
        thunkAPI.dispatch(
          setWidgetStreamingStatus({ widgetId, isStreaming: false })
        );
      };

      return { widgetId, status: 'streaming' };
    } catch (error) {
      return thunkAPI.rejectWithValue({ error: error.message });
    }
  }
);
