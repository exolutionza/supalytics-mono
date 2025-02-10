// chart-setup.js
import {
    Chart as ChartJS,
    // Scales
    CategoryScale,
    LinearScale,
    LogarithmicScale,
    TimeScale,
    RadialLinearScale,
    // Elements
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    // Extras
    Title,
    Tooltip,
    Legend,
  } from "chart.js";
  
  // Zoom plugin
  import zoomPlugin from "chartjs-plugin-zoom";
  
  // Register Chart.js components
  ChartJS.register(
    CategoryScale,
    LinearScale,
    LogarithmicScale,
    TimeScale,
    RadialLinearScale,
  
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
  
    Title,
    Tooltip,
    Legend,
    zoomPlugin
  );
  
  ChartJS.defaults.responsive = true;
  ChartJS.defaults.maintainAspectRatio = false;
  
  export default ChartJS;
  