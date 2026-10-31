
// Shared coverage options for collecting app component coverage via monocart

import path from 'path'

import type {CoverageReportOptions} from 'monocart-coverage-reports'


export const coverage_options:CoverageReportOptions = {
    name: "App E2E Coverage",
    outputDir: path.resolve(__dirname, '../../../coverage/e2e_app'),
    // NOTE Istanbul-based reports only count lines in <script> (V8 ones count whole .vue files)
    reports: ['v8', 'text-summary', 'json-summary', 'json', 'lcovonly'],
    sourceFilter: (source_path:string) => {
        // Only report on app components (services are covered by unit tests)
        // NOTE Called both before and after `sourcePath` is applied
        return source_path.includes('src/components/')
    },
    sourcePath: (file_path:string) => {
        // Make paths relative to project root for readability
        return file_path.startsWith('src/') ? `app/${file_path}` : file_path
    },
}


export function keep_entry(url:string):boolean{
    // Whether a V8 coverage entry is app source code (excluding Vue template/style submodules)
    if (!url.startsWith('http://localhost:')){
        return false  // Also excludes init scripts which have no url
    }
    const parsed = new URL(url)
    return parsed.hostname === 'localhost' && parsed.pathname.startsWith('/src/components/')
        && !parsed.search.includes('type=')
}
