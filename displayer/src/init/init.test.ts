
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import type {App} from 'vue'


// Mock dependencies so only init's own logic is tested
const mocks = vi.hoisted(() => ({
    connect: vi.fn(() => Promise.resolve()),
    store_init: vi.fn(() => Promise.resolve()),
    i18n: {locale: '', messages: {} as Record<string, unknown>},
}))
vi.mock('./init_errors', () => ({}))
vi.mock('../components/App.vue', () => ({default: {render: () => null}}))
vi.mock('../services/database', () => ({database: {connect: mocks.connect}}))
vi.mock('../services/store', () => ({store: {init: mocks.store_init}}))
vi.mock('petite-vue-i18n', () => ({
    createI18n: ({locale}:{locale:string}) => {
        mocks.i18n.locale = locale
        return {
            install: () => undefined,
            global: {
                setLocaleMessage: (key:string, value:unknown) => {
                    mocks.i18n.messages[key] = value
                },
            },
        }
    },
}))


async function run_init(language='en-US'):Promise<App>{
    // Run init with the given browser language and wait for app to mount
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(language)
    vi.resetModules()
    mocks.i18n.messages = {}
    await import('./init')
    await vi.waitFor(() => expect(self.app_store).toBeDefined())
    return self.app_vue
}


describe('init', () => {

    beforeEach(() => {
        self.document.body.innerHTML = '<div id="app"></div>'
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        self.app_store = undefined as unknown as typeof self.app_store
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    // Bootstrapping
    test('connects db, inits store and mounts app', async () => {
        const app = await run_init()
        expect(mocks.connect).toHaveBeenCalled()
        expect(mocks.store_init).toHaveBeenCalled()
        expect(self.app_db).toBeDefined()
        expect(app._container).toBe(self.document.querySelector('#app'))
        expect(app.component('AppBtn')).toBeDefined()
        expect(app.component('AppProgress')).toBeDefined()
    })

    // Locales
    test('english does not load any locale messages', async () => {
        await run_init('en-US')
        expect(mocks.i18n.locale).toBe('en')
        expect(mocks.i18n.messages).toEqual({})
    })

    test('supported locale messages are loaded', async () => {
        await run_init('fr-FR')
        expect(mocks.i18n.locale).toBe('fr')
        await vi.waitFor(() => expect(mocks.i18n.messages['fr']).toBeDefined())
    })

    test('traditional chinese regions use zh-hant', async () => {
        await run_init('zh-TW')
        expect(mocks.i18n.locale).toBe('zh-hant')
        await run_init('zh-CN')
        expect(mocks.i18n.locale).toBe('zh')
    })

    // Vue error handling
    test('vue errors are reported and fail visually', async () => {
        const app = await run_init()
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        const fail = vi.spyOn(self, 'app_fail_visual').mockImplementation(() => undefined)
        app.config.errorHandler!(new Error("boom"), null, 'render')
        expect(report).toHaveBeenCalledWith(expect.stringContaining("(Error in Vue render)"))
        expect(fail).toHaveBeenCalled()
    })

    // Vue warning handling
    test('vue warnings are reported, ignoring Vue 2 compat ones from shared', async () => {
        const app = await run_init()
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        const fail = vi.spyOn(self, 'app_fail_visual').mockImplementation(() => undefined)

        app.config.warnHandler!('Property "$listeners" was accessed', null, 'at <SharedX>')
        expect(report).not.toHaveBeenCalled()

        app.config.warnHandler!('Something odd', null, 'at <AppMessage>')
        expect(report).toHaveBeenCalledWith(expect.stringContaining("(Vue warning)"))
        expect(fail).toHaveBeenCalledOnce()

        // Warnings don't visibly fail in production
        vi.stubEnv('MODE', 'production')
        app.config.warnHandler!('Something odd', null, 'at <AppMessage>')
        expect(report).toHaveBeenCalledTimes(2)
        expect(fail).toHaveBeenCalledOnce()
    })
})
