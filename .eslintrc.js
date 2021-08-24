
module.exports = {
    root: true,
    parser: 'vue-eslint-parser',
    parserOptions: {
        parser: '@typescript-eslint/parser',
        // vue-eslint-parser passes all options to @typescript-eslint/parser instead
        tsconfigRootDir: __dirname,
        // Treat all files using component tsconfig, and node for everything else
        project: [
            './tsconfig.json',
            './app/src/tsconfig.json',
            './displayer/src/tsconfig.json',
            './tsconfig_base.jsonc',  // Hack for still parsing non-matching (eg .js files)
        ],
        extraFileExtensions: ['.vue'],
    },
    plugins: [
        '@typescript-eslint',
        'import',
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:import/recommended',
        'plugin:import/typescript',
        'plugin:vue/recommended',
        'plugin:vue/vue3-recommended',
    ],
    rules: {
        // Disable as are not problems at all
        '@typescript-eslint/no-extra-semi': 'off',  // Conflicts with 'semi' rule
        '@typescript-eslint/no-empty-interface': 'off',  // Empty interfaces may be expanded later
        '@typescript-eslint/no-non-null-assertion': 'off',  // trailing ! can be useful
        '@typescript-eslint/require-await': 'off',  // Some fns async to match spec or await later
        '@typescript-eslint/no-empty-function': 'off',  // Empty fns may be used to match a spec
        // Disable as already covered by other audits (such as tsc)
        'import/no-unresolved': 'off',  // Vite imports complex and already handled by tsc
        // Default to error but should be warnings
        'no-empty': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-return': 'warn',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/ban-ts-comment': 'warn',
        '@typescript-eslint/ban-types': 'warn',
        // TODO revert below to error once 'any' type cases dealt with, as also checks invalid code
        '@typescript-eslint/restrict-template-expressions': 'warn',
        // Enable
        'semi': ['warn', 'never', {beforeStatementContinuationChars: 'always'}],
        // Need customisation
        'no-constant-condition': ['error', {checkLoops: false}],  // while (true) useful at times
        'prefer-const': ['warn', {destructuring: 'all'}],  // Allows `let [a, b]` if only `a` const
        '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],  // Unused args (eg event) ok
        '@typescript-eslint/no-misused-promises': ['error', {'checksVoidReturn': false}],
            // Trying to refactor async fns to please checksVoidReturn is more trouble than worth
    },
}