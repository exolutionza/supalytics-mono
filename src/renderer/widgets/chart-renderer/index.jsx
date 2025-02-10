import React, { useRef } from "react";
import { Chart as ReactChart } from "react-chartjs-2";
import { Card } from "@/components/ui/card"; // Adjust to match your shadcn/ui import
import "./setup"; // Ensure we import our chart-setup registration file

export default function ChartRenderer({ config }) {
  /**
   * `config` should be a valid Chart.js config object:
   * {
   *   type: "line" | "bar" | "pie" | "doughnut" | "polarArea" | "radar" | "bubble" | "scatter" | "mixed" | ...
   *   data: {
   *     labels: [...],
   *     datasets: [{ ... }]
   *   },
   *   options: {
   *     // all standard Chart.js options
   *     // including plugins, scales, etc.
   *   }
   * }
   */
  const chartRef = useRef(null);

  // Merge default zoom plugin config with whatever the user passed in `config.options.plugins.zoom`
  const mergedOptions = {
    ...config.options,
    plugins: {
      ...config.options?.plugins,
      zoom: {
        // Default pinch/scroll zoom settings
        pan: {
          enabled: true,
          mode: "xy",
        },
        zoom: {
          wheel: {
            enabled: true, // Enable zooming with scroll wheel
          },
          pinch: {
            enabled: true, // Enable zooming with pinch gesture
          },
          mode: "xy",
        },
        // Let user override anything above
        ...config.options?.plugins?.zoom,
      },
    },
  };

  // Final config merged with the user’s
  const chartConfig = {
    type: config.type,
    data: config.data,
    options: mergedOptions,
  };

  // Example: a method to reset zoom
  const resetZoom = () => {
    if (chartRef.current) {
      // `resetZoom` is provided by chartjs-plugin-zoom
      chartRef.current.resetZoom();
    }
  };

  return (
    <Card className="p-4 max-w-full overflow-auto">
      {/* Optional reset zoom button */}
      <div className="flex justify-end mb-2">
        <button
          onClick={resetZoom}
          className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
        >
          Reset Zoom
        </button>
      </div>

      {/* Chart container */}
      <div className="relative w-full h-[400px]">
        {/* react-chartjs-2 chart */}
        <ReactChart ref={chartRef} {...chartConfig} />
      </div>
    </Card>
  );
}
