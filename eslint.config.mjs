
import path from 'path'
import {fileURLToPath} from 'url'

import js from '@eslint/js'
import {includeIgnoreFile} from '@eslint/compat'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vuePlugin from 'eslint-plugin-vue'
import vuePugPlugin from 'eslint-plugin-vue-pug'


const __dirname = path.dirname(fileURLToPath(import.meta.url))


export default [

    // Ignore files listed in .gitignore
    includeIgnoreFile(path.join(__dirname, '.gitignore')),
    // NOTE Avoid linting shared dir twice (lint via displayer since typings work better with Vue 3)
    {ignores: ['app/src/shared/**/*', 'host/manual/src/utils/**/*', '.private/**']},

    // Base recommended rules
    js.configs.recommended,
    // TypeScript: registers plugin, sets @typescript-eslint/parser, applies recommended rules
    ...tsPlugin.configs['flat/recommended'],
    ...tsPlugin.configs['flat/recommended-type-checked'],
    // Vue: overrides parser to vue-eslint-parser for .vue files, applies recommended rules
    ...vuePlugin.configs['flat/recommended'],
    // Vue-Pug: adds Pug template support
    ...vuePugPlugin.configs['flat/recommended'],

    // Enable type-aware rules by pointing to tsconfig (projectService auto-discovers them)
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    // Check files not included in any tsconfig
                    allowDefaultProject: [
                        '.bin/*.ts', '.bin/*.mts', 'eslint.config.mjs',
                        'displayer/public/displayer/*.js',
                    ],
                },
                tsconfigRootDir: __dirname,
            },
        },
    },

    // For .vue files: set @typescript-eslint/parser as inner parser for <script> blocks
    {
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: {
                parser: tsParser,
                extraFileExtensions: ['.vue'],
            },
        },
    },

    // Custom rules applied to all linted file types
    {
        files: ['**/*.js', '**/*.ts', '**/*.vue'],

        rules: {

            // Enable as errors
            'no-promise-executor-return': 'error',
            'no-template-curly-in-string': 'error',
            'no-unreachable-loop': 'error',
            'no-constructor-return': 'error',
            'eqeqeq': 'error',
            'no-eval': 'error',

            // Enable as warnings
            'max-len': ['warn', {code: 100, ignoreUrls: true, ignoreTemplateLiterals: true}],
            'indent': ['warn', 4, {
                SwitchCase: 1,
                FunctionDeclaration: {parameters: 2},
                // eslint doesn't handle class methods well yet, so ignore indenting of their params
                ignoredNodes: ['MethodDefinition Identifier'],
            }],
            'comma-dangle': ['warn', 'always-multiline'],
            'semi': ['warn', 'never', {beforeStatementContinuationChars: 'always'}],
            'no-console': ['warn', {allow: ['warn', 'error', 'info', 'debug']}],  // Non-log allowed

            // Disable as are not problems at all
            '@typescript-eslint/no-non-null-assertion': 'off',  // trailing ! can be useful
            '@typescript-eslint/require-await': 'off',  // Some fns async to match spec or await later
            '@typescript-eslint/no-empty-function': 'off',  // Empty fns may be used to match a spec
            '@typescript-eslint/no-empty-object-type': 'off',  // Used for interfaces
            '@typescript-eslint/explicit-module-boundary-types': 'off',  // TS auto detect saves time
            'vue/html-quotes': 'off',  // Have own preferences for quote choice
            'vue/first-attribute-linebreak': 'off',  // Have own preferences for making lines fit
            'vue/max-attributes-per-line': 'off',  // Fit attributes based on char length not attr num
            'vue/attributes-order': 'off',  // Have own preferences for attribute order
            'vue/no-v-html': 'off',  // Many safe uses

            // Disable as are valid in either Vue 2 or 3 (but not both)
            'vue/no-deprecated-dollar-listeners-api': 'off',
            'vue/no-multiple-template-root': 'off',
            'vue/no-v-for-template-key-on-child': 'off',
            'vue/no-v-for-template-key': 'off',
            'vue/no-deprecated-v-on-native-modifier': 'off',
            '@typescript-eslint/no-redundant-type-constituents': 'off',
            '@typescript-eslint/unbound-method': 'off',  // Affects Vue 2 options API

            // Disable due to unresolvable false positives
            'vue/valid-v-else': 'off',
            'no-undef': 'off',  // TS handles these better
            'vue/no-child-content': 'off',  // Causes crash with pug templates
            'vue/html-indent': 'off',  // Causes crash with pug templates
            '@typescript-eslint/only-throw-error': 'off',  // Project throws for some value passing

            // Default to error but should be warnings
            'no-empty': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-floating-promises': 'warn',
            // TODO revert below to error once 'any' type cases dealt with, as also checks invalid code
            '@typescript-eslint/restrict-template-expressions': 'warn',
            'vue/valid-v-for': 'warn',
            // Very noisy when processing JSON/unknown data where String() conversions are intentional
            '@typescript-eslint/no-base-to-string': 'warn',

            // Need customisation
            'vue/prop-name-casing': ['warn', 'snake_case'],  // Not camel case
            'no-constant-condition': ['error', {checkLoops: false}],  // while (true) useful at times
            'prefer-const': ['warn', {destructuring: 'all'}],  // Allows `let [a, b]` if only `a` const
            '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],  // Unused args (eg event) ok
            // Trying to refactor async fns to please checksVoidReturn is more trouble than worth
            '@typescript-eslint/no-misused-promises': ['error', {checksVoidReturn: false}],
            // There are some issues (such as Vue 2/3 compatibility) that can't be solved otherwise
            '@typescript-eslint/ban-ts-comment': ['error', {'ts-ignore': 'allow-with-description'}],
        },
    },

]
