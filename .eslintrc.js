
module.exports = {
    root: true,
    parser: 'vue-eslint-parser',
    parserOptions: {
        parser: '@typescript-eslint/parser',
        // vue-eslint-parser passes all options to @typescript-eslint/parser instead
        tsconfigRootDir: __dirname,
        // Treat all files using component tsconfig, and node for everything else
        project: ['./*/tsconfig.json', './tsconfig_node.jsonc'],
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
        '@typescript-eslint/no-empty-interface': 'off',  // Empty interfaces may be expanded later
        // Disable as already covered by other audits (such as tsc)
        'import/no-unresolved': 'off',  // Vite imports complex and already handled by tsc
        // Default to error but should be warnings
        'no-empty': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/ban-ts-comment': 'warn',
        '@typescript-eslint/no-floating-promises': 'warn',
        // Need customisation
        'prefer-const': ['warn', {destructuring: 'all'}],  // Allows `let [a, b]` if only `a` const
        '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],  // Unused args (eg event) ok
    }
}
