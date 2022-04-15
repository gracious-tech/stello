// Modules required by SharedChart for dynamic import

import plugin_datalabels from 'chartjs-plugin-datalabels'
import plugin_annotation from 'chartjs-plugin-annotation'
import {Chart, LineController, BarController, CategoryScale, LinearScale, BarElement, PointElement,
    LineElement, ArcElement, DoughnutController, Filler, Tooltip} from 'chart.js'


// Register all the modules Stello charts require
Chart.register(
    BarController,
    LineController,
    DoughnutController,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    ArcElement,
    Filler,
    Tooltip,
    plugin_datalabels,
    plugin_annotation,
)


// Old browsers will need ResizeObserver polyfill
const exports = {Chart, plugin_datalabels, plugin_annotation}
let exports_promise = Promise.resolve(exports)
if (! ('ResizeObserver' in window)){
    exports_promise = import('@juggle/resize-observer').then(polyfill => {
        window.ResizeObserver = polyfill.ResizeObserver
        return exports
    })
}

// Export promise to prevent access to modules until polyfill (if needed) has been applied
export {exports_promise}
