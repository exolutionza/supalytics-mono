// src/components/BasicWidget.js
import React from 'react';
import { useSelector } from 'react-redux';
import { selectWidgetOrderedData } from '@/store/selectors';

const BasicWidget = ({ widget }) => {
  // Grab all widget data (rows + metadata) from Redux
  const widgetData = useSelector((state) => selectWidgetOrderedData(widget.id)(state));

  // If we have no data (rows or metadata), display a fallback
  if (!widgetData) {
    return (
      <div className="p-4 border rounded-lg">
        <h3 className="text-lg font-medium mb-2">{widget.name}</h3>
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  const { rows, columns, summary } = widgetData;

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-medium mb-4">{widget.name}</h3>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {columns.map((column) => (
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
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td
                    key={column}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                  >
                    {row[column]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {widget.showSummary && summary && (
        <div className="mt-4 p-4 bg-gray-50 rounded">
          <h4 className="text-sm font-medium mb-2">Summary</h4>
          <pre className="text-xs">{JSON.stringify(summary, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default BasicWidget;
