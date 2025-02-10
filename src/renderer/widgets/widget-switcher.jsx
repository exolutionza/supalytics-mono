import React from 'react';
import { useSelector } from 'react-redux';
import { selectWidgetProgress, selectWidgetOrderedData, selectWidgetById } from '@/store/selectors';

import BasicWidget from './basic-widget';

const WidgetSwitcher = ({ widgetId }) => {
  const widget = useSelector((state) => selectWidgetById(state, widgetId));
  const data = useSelector((state) => selectWidgetOrderedData(widgetId));
  const { isStreaming, progress, receivedRows, totalRows } = useSelector((state) => 
    selectWidgetProgress(widgetId)
  );

  if (!widget) {
    return <div className="p-4 text-red-500">Invalid widget</div>;
  }

  if (isStreaming) {
    return (
      <div className="p-4">
        <div className="mb-2">Loading... {progress.toFixed(1)}%</div>
        <div className="text-sm text-gray-500">
          Received {receivedRows} of {totalRows} rows
        </div>
      </div>
    );
  }
  console.log("HEREEE")
  switch (widget.type) {
    case 'BasicWidget':
      return <BasicWidget widget={widget} data={data} />;
    default:
      return (
        <div className="p-4 text-yellow-500">
          Unsupported widget type: {widget.type}
        </div>
      );
  }
};

export default WidgetSwitcher;