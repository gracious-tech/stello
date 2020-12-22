
const path = require('path')

module.exports = {
    esbuildTarget: 'es2015',
    optimizeDeps: {
        include: [
            'core-js/features/string/replace-all',
        ],
    },
}
