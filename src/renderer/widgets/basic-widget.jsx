// basic-widget.jsx
import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  createWidgetFullDataSelector,
  createWidgetOrderedDataSelector,
  createWidgetStreamingStatusSelector,
} from '@/store/selectors';

const BasicWidget = ({ widgetId }) => {
  const widgetDataSelector = useMemo(
    () => createWidgetFullDataSelector(widgetId),
    [widgetId]
  );
  const orderedDataSelector = useMemo(
    () => createWidgetOrderedDataSelector(widgetId),
    [widgetId]
  );
  const streamingStatusSelector = useMemo(
    () => createWidgetStreamingStatusSelector(widgetId),
    [widgetId]
  );

  const { widget } = useSelector(widgetDataSelector);
  const data = useSelector(orderedDataSelector);
  const { isStreaming, error } = useSelector(streamingStatusSelector);
  console.log("DATASELECTOR: ", data)

  if (!widget) {
    return (
      <div className="p-4 border rounded-lg">
        <div className="text-gray-500">Widget not found</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border rounded-lg">
        <h3 className="text-lg font-medium mb-2">{widget.name}</h3>
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 border rounded-lg">
        <h3 className="text-lg font-medium mb-2">{widget.name}</h3>
        <div className="text-gray-500">Loading data...</div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-medium mb-4">{widget.name}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {data.columns.map((column) => (
                <th
                  key={column}
                  className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {data.columns.map((column) => {
                  const value = row[column];
                  return (
                    <td
                      key={column}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                    >
                      {value != null ? value.toString() : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {widget.showSummary && data.summary && (
        <div className="mt-4 p-4 bg-gray-50 rounded">
          <h4 className="text-sm font-medium mb-2">Summary</h4>
          <pre className="text-xs">{JSON.stringify(data.summary, null, 2)}</pre>
        </div>
      )}
      {isStreaming && (
        <div className="mt-2 text-sm text-gray-500">Updating data...</div>
      )}
    </div>
  );
};

export default React.memo(BasicWidget);
