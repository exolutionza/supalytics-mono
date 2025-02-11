// WidgetSwitcher.js
import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectWidgetById, selectWidgetStreamingStatus } from '@/store/slices/widgets';
import { executeWidget } from '@/store/executor';
import BasicWidget from './basic-widget';

// Loading component to avoid repetition
const LoadingState = () => (
  <div className="p-4 border rounded-lg bg-gray-50">
    <div className="flex items-center space-x-2">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-gray-600">Loading data...</span>
    </div>
  </div>
);

// Error component for consistent error display
const ErrorState = ({ error }) => (
  <div className="p-4 border rounded-lg bg-red-50">
    <div className="flex items-center space-x-2 text-red-600">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{error}</span>
    </div>
  </div>
);

const WidgetSwitcher = ({ widgetId }) => {
  const dispatch = useDispatch();

  // Get widget data
  const widget = useSelector(
    state => selectWidgetById(state, widgetId),
    (prev, next) => prev?.id === next?.id && prev?.type === next?.type
  );

  // Get streaming status using the new selector
  const { isStreaming, status, isExecuted, error } = useSelector(
    state => selectWidgetStreamingStatus(state, widgetId),
    (prev, next) => 
      prev.isStreaming === next.isStreaming && 
      prev.status === next.status &&
      prev.isExecuted === next.isExecuted &&
      prev.error === next.error
  );

  // Effect to handle initial execution
  useEffect(() => {
    if (!widget) return;

    const shouldExecute = !isStreaming && !isExecuted && !error;
    
    if (shouldExecute) {
      console.log(`[WidgetSwitcher] Initiating execution for widget ${widgetId}`);
      const executePromise = dispatch(executeWidget({ widgetId }));
      
      // Handle potential execution errors
      executePromise.catch(error => {
        console.error(`[WidgetSwitcher] Execution failed for widget ${widgetId}:`, error);
      });
    }
  }, [widget?.id, isStreaming, isExecuted, error, dispatch, widgetId]);

  // Early return for missing widget
  if (!widget) {
    return (
      <ErrorState error="Widget not found" />
    );
  }

  // Handle different states
  if (error) {
    return <ErrorState error={error} />;
  }

  // if (isStreaming || status === 'executing') {
  //   return <LoadingState />;
  // }

  // Render appropriate widget type
  switch (widget.type) {
    case 'BasicWidget':
      return (
        <div className="relative">
          <BasicWidget widgetId={widgetId} />
          {/* Optional refresh button */}
          <button 
            onClick={() => dispatch(executeWidget({ widgetId }))}
            className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 rounded-full"
            title="Refresh widget"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      );
    default:
      return (
        <div className="p-4 border rounded-lg bg-yellow-50">
          <div className="flex items-center space-x-2 text-yellow-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Unsupported widget type: {widget.type}</span>
          </div>
        </div>
      );
  }
};

// Memoize with explicit check for widgetId changes only
export default React.memo(WidgetSwitcher, (prevProps, nextProps) => {
  return prevProps.widgetId === nextProps.widgetId;
});