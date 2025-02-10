import React from "react";
import ChartRenderer from "@/renderer/widgets/chart-renderer";

export default function ChartsDemoPage() {
  // 1. LINE CHART
  const lineChartConfig = {
    type: "line",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May"],
      datasets: [
        {
          label: "Revenue",
          data: [120, 200, 150, 80, 250],
          borderColor: "rgba(75, 192, 192, 1)",
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          fill: true,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true },
      },
    },
  };

  // 2. BAR CHART
  const barChartConfig = {
    type: "bar",
    data: {
      labels: ["Red", "Blue", "Yellow", "Green", "Purple", "Orange"],
      datasets: [
        {
          label: "Votes",
          data: [12, 19, 3, 5, 2, 3],
          backgroundColor: [
            "rgba(255, 99, 132, 0.5)",
            "rgba(54, 162, 235, 0.5)",
            "rgba(255, 206, 86, 0.5)",
            "rgba(75, 192, 192, 0.5)",
            "rgba(153, 102, 255, 0.5)",
            "rgba(255, 159, 64, 0.5)",
          ],
          borderColor: [
            "rgba(255, 99, 132, 1)",
            "rgba(54, 162, 235, 1)",
            "rgba(255, 206, 86, 1)",
            "rgba(75, 192, 192, 1)",
            "rgba(153, 102, 255, 1)",
            "rgba(255, 159, 64, 1)",
          ],
          borderWidth: 1,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true },
      },
    },
  };

  // 3. PIE CHART
  const pieChartConfig = {
    type: "pie",
    data: {
      labels: ["Red", "Blue", "Yellow"],
      datasets: [
        {
          label: "Colors",
          data: [300, 50, 100],
          backgroundColor: [
            "rgba(255, 99, 132, 0.7)",
            "rgba(54, 162, 235, 0.7)",
            "rgba(255, 206, 86, 0.7)",
          ],
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  };

  // 4. DOUGHNUT CHART
  const doughnutChartConfig = {
    type: "doughnut",
    data: {
      labels: ["Desktop", "Tablet", "Mobile"],
      datasets: [
        {
          data: [55, 25, 20],
          backgroundColor: [
            "rgba(255, 159, 64, 0.7)",
            "rgba(153, 102, 255, 0.7)",
            "rgba(75, 192, 192, 0.7)",
          ],
        },
      ],
    },
    options: {},
  };

  // 5. POLAR AREA CHART
  const polarAreaChartConfig = {
    type: "polarArea",
    data: {
      labels: ["A", "B", "C", "D"],
      datasets: [
        {
          data: [11, 16, 7, 3],
          backgroundColor: [
            "rgba(255, 99, 132, 0.5)",
            "rgba(75, 192, 192, 0.5)",
            "rgba(255, 205, 86, 0.5)",
            "rgba(201, 203, 207, 0.5)",
          ],
        },
      ],
    },
    options: {},
  };

  // 6. RADAR CHART
  const radarChartConfig = {
    type: "radar",
    data: {
      labels: ["Eating", "Drinking", "Sleeping", "Designing", "Coding", "Cycling", "Running"],
      datasets: [
        {
          label: "Person A",
          data: [65, 59, 90, 81, 56, 55, 40],
          borderColor: "rgba(255, 99, 132, 1)",
          backgroundColor: "rgba(255, 99, 132, 0.2)",
        },
        {
          label: "Person B",
          data: [28, 48, 40, 19, 96, 27, 100],
          borderColor: "rgba(54, 162, 235, 1)",
          backgroundColor: "rgba(54, 162, 235, 0.2)",
        },
      ],
    },
    options: {},
  };

  // 7. BUBBLE CHART
  const bubbleChartConfig = {
    type: "bubble",
    data: {
      datasets: [
        {
          label: "Bubbles 1",
          data: [
            { x: 20, y: 30, r: 15 },
            { x: 40, y: 10, r: 10 },
          ],
          backgroundColor: "rgba(255, 99, 132, 0.5)",
        },
        {
          label: "Bubbles 2",
          data: [
            { x: 10, y: 50, r: 10 },
            { x: 30, y: 20, r: 20 },
          ],
          backgroundColor: "rgba(54, 162, 235, 0.5)",
        },
      ],
    },
    options: {
      scales: {
        x: { min: 0, max: 50 },
        y: { min: 0, max: 60 },
      },
    },
  };

  // 8. SCATTER CHART
  const scatterChartConfig = {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Scatter Example",
          data: [
            { x: -10, y: 0 },
            { x: 0, y: 3 },
            { x: 10, y: 5 },
            { x: 15, y: -2 },
          ],
          borderColor: "rgba(255, 99, 132, 1)",
          backgroundColor: "rgba(255, 99, 132, 0.2)",
        },
      ],
    },
    options: {
      scales: {
        x: { type: "linear", position: "bottom" },
      },
    },
  };

  // 9. MIXED CHART (e.g., bar + line)
  const mixedChartConfig = {
    type: "bar", // The base type can be set to "bar", but we can mix line datasets
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May"],
      datasets: [
        {
          type: "bar",
          label: "Bar Dataset",
          data: [10, 20, 30, 40, 50],
          backgroundColor: "rgba(255, 159, 64, 0.7)",
        },
        {
          type: "line",
          label: "Line Dataset",
          data: [50, 40, 30, 20, 10],
          borderColor: "rgba(54, 162, 235, 1)",
          backgroundColor: "rgba(54, 162, 235, 0.2)",
          fill: true,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true },
      },
    },
  };

  return (
    <div className="p-4 space-y-8">
      <h1 className="text-xl font-bold mb-4">Charts Demo</h1>

      <ChartRenderer config={lineChartConfig} />
      <ChartRenderer config={barChartConfig} />
      <ChartRenderer config={pieChartConfig} />
      <ChartRenderer config={doughnutChartConfig} />
      <ChartRenderer config={polarAreaChartConfig} />
      <ChartRenderer config={radarChartConfig} />
      <ChartRenderer config={bubbleChartConfig} />
      <ChartRenderer config={scatterChartConfig} />
      <ChartRenderer config={mixedChartConfig} />
    </div>
  );
}
