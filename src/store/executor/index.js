// executor.js
import { createAsyncThunk } from '@reduxjs/toolkit';
import _ from 'lodash';
import { websocketService } from './websocket';
import {
  setWidgetMetadata,
  setWidgetComplete,
  setWidgetError,
  setWidgetStreamingStatus,
  setWidgetLastUsedParams,
  processDataBatch,
  resetWidgetRuntime,
} from '@/store/slices/widgets';
import { updateGlobalOutput } from '@/store/slices/global-outputs';
import { serializeOutputData, serializeWidgetParams } from './serializers';

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
  return obj;
}

// Safe cleanup function
function safeCleanup(cleanup) {
  try {
    if (typeof cleanup === 'function') {
      cleanup();
    }
  } catch (error) {
    console.error('[Executor] Error during cleanup:', error);
  }
}

export const executeWidget = createAsyncThunk(
  'widgets/executeWidget',
  async ({ widgetId }, thunkAPI) => {
    let cleanup = null;
    let rowIndex = 0;
    let isFinished = false;
    
    try {
      const state = thunkAPI.getState();
      const widget = state.widgets.entities[widgetId];
      
      if (!widget) {
        throw new Error('Widget not found');
      }

      // Check if widget is already executing
      const widgetRuntime = state.widgets.runtime[widgetId];
      if (widgetRuntime?.isStreaming) {
        console.log(`[Executor] Widget ${widgetId} is already streaming, skipping execution`);
        return;
      }

      console.log(`[Executor] Starting execution for widget ${widgetId}`);

      // Reset widget state before starting
      thunkAPI.dispatch(resetWidgetRuntime(widgetId));

      // Set initial streaming status
      thunkAPI.dispatch(setWidgetStreamingStatus({ 
        widgetId, 
        isStreaming: true,
        status: 'executing',
        isExecuted: false
      }));

      // Gather and serialize params
      const rawParams = gatherRawParams(widgetId, state);
      const serializedParams = serializeWidgetParams(widgetId, state);

      // Store the rawParams
      thunkAPI.dispatch(
        setWidgetLastUsedParams({ widgetId, lastUsedParams: rawParams })
      );

      // Generate a unique stream ID
      const streamId = `widget-${widgetId}-${Date.now()}`;

      return await new Promise((resolve, reject) => {
        const handleMessage = (message) => {
          if (isFinished) {
            console.log(`[Executor] Ignoring message after completion for widget ${widgetId}`);
            return;
          }

          try {
            console.log(`[Executor] Received message type: ${message.type} for widget ${widgetId}`);
            
            switch (message.type) {
              case 'metadata':
                thunkAPI.dispatch(
                  setWidgetMetadata({
                    widgetId,
                    metadata: message.payload.metadata
                  })
                );
                break;

              case 'row':
                if (message.payload.data) {
                  thunkAPI.dispatch(
                    processDataBatch({
                      widgetId,
                      batch: {
                        rows: [message.payload.data],
                        rowOrder: [rowIndex++]
                      }
                    })
                  );
                }
                break;

              case 'complete':
                isFinished = true;
                console.log(`[Executor] Widget ${widgetId} execution completed`);
                
                // Update widget state
                thunkAPI.dispatch(setWidgetComplete({ 
                  widgetId,
                  summary: message.payload
                }));

                // Ensure streaming is stopped
                thunkAPI.dispatch(setWidgetStreamingStatus({ 
                  widgetId, 
                  isStreaming: false,
                  status: 'complete',
                  isExecuted: true
                }));

                // Clear global output
                thunkAPI.dispatch(updateGlobalOutput({
                  widgetId,
                  data: null
                }));

                safeCleanup(cleanup);
                cleanup = null;

                resolve(message.payload);
                break;

              case 'error':
                isFinished = true;
                console.error(`[Executor] Widget ${widgetId} execution error:`, message.payload.error);
                
                // Set error state
                thunkAPI.dispatch(setWidgetError({ 
                  widgetId, 
                  error: message.payload.error 
                }));

                // Ensure streaming is stopped
                thunkAPI.dispatch(setWidgetStreamingStatus({ 
                  widgetId, 
                  isStreaming: false,
                  status: 'error',
                  isExecuted: false
                }));

                safeCleanup(cleanup);
                cleanup = null;

                reject(new Error(message.payload.error));
                break;

              case 'status':
                if (!isFinished && message.payload.status !== 'complete') {
                  thunkAPI.dispatch(setWidgetStreamingStatus({ 
                    widgetId, 
                    isStreaming: true,
                    status: message.payload.status,
                    isExecuted: false
                  }));
                }
                break;

              default:
                console.warn(`[Executor] Unhandled message type: ${message.type}`);
                break;
            }
          } catch (error) {
            console.error('[Executor] Error handling message:', error);
            if (!isFinished) {
              isFinished = true;
              safeCleanup(cleanup);
              cleanup = null;
              reject(error);
            }
          }
        };

        try {
          // Execute query using websocket service and check returned cleanup
          const result = websocketService.executeQuery(
            'ws://localhost:8080/ws',
            widget.query_id,
            serializedParams,
            streamId,
            handleMessage
          );

          // Save cleanup function if one was returned
          if (typeof result === 'function') {
            cleanup = result;
          } else if (result && typeof result.cleanup === 'function') {
            cleanup = result.cleanup;
          } else {
            console.warn('[Executor] No cleanup function returned from websocket service');
          }
        } catch (error) {
          console.error(`[Executor] Failed to execute widget ${widgetId}:`, error);
          
          thunkAPI.dispatch(setWidgetError({ 
            widgetId, 
            error: error.message 
          }));

          thunkAPI.dispatch(setWidgetStreamingStatus({ 
            widgetId, 
            isStreaming: false,
            status: 'error',
            isExecuted: false
          }));

          reject(error);
        }

        // Handle thunk abortion
        thunkAPI.signal.addEventListener('abort', () => {
          console.log(`[Executor] Widget ${widgetId} execution aborted`);
          
          isFinished = true;
          safeCleanup(cleanup);
          cleanup = null;

          thunkAPI.dispatch(setWidgetStreamingStatus({ 
            widgetId, 
            isStreaming: false,
            status: 'aborted',
            isExecuted: false
          }));

          reject(new Error('Widget execution aborted'));
        });
      });

    } catch (error) {
      console.error(`[Executor] Unhandled error executing widget ${widgetId}:`, error);
      
      thunkAPI.dispatch(setWidgetStreamingStatus({ 
        widgetId, 
        isStreaming: false,
        status: 'error',
        isExecuted: false
      }));

      throw error;
    } finally {
      safeCleanup(cleanup);
    }
  }
);