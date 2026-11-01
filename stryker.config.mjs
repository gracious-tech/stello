// Mutation testing config (checks unit tests actually detect changes to core code)
// WARN Only run via .bin/audit_mutation (runs in a throwaway worktree since mutates in place)

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
    testRunner: 'vitest',
    vitest: {
        configFile: 'vitest.config.mts',
    },
    // Core logic where undetected changes would most likely break things for users
    mutate: [
        'app/src/services/tasks/sending.ts',
        'app/src/services/tasks/configs.ts',
        'app/src/services/tasks/responses.ts',
        'app/src/services/tasks/tasks.ts',
        'app/src/services/utils/crypt.ts',
        'app/src/services/misc/invites.ts',
        'app/src/services/email/utils.ts',
        'displayer/src/services/displayer_config.ts',
        'displayer/src/services/responses.ts',
        'displayer/src/services/env.ts',
    ],
    coverageAnalysis: 'perTest',
    reporters: ['clear-text', 'progress', 'html'],
    htmlReporter: {fileName: 'coverage/mutation/index.html'},
    // NOTE Copying the repo to a sandbox is impractical with each sub-package's node_modules
    inPlace: true,
    tempDirName: '.stryker-tmp',
    concurrency: 4,
    timeoutMS: 30000,
}
