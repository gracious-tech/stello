// @vitest-environment happy-dom
// Tests for app-level services: errors, misc, router, native_browser

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import Vue from 'vue'
import VueRouter from 'vue-router'

import {setup_globals, MockStore} from '@/../tests/unit_utils'
import {debounce, debounce_method, debounce_set, debug, time_between, generate_lifespan_options,
    lifespan_days_to_text, untar, SECTION_IMAGE_WIDTH} from './misc'
import {NativeBrowser} from './native/native_browser'


// Fake rollbar so error reporting can be inspected
const rollbar = vi.hoisted(() => ({
    instances: [] as {options:Record<string, unknown>, error:ReturnType<typeof vi.fn>,
        critical:ReturnType<typeof vi.fn>}[],
}))
vi.mock('rollbar/src/browser/core', () => ({
    default: class {
        error = vi.fn(() => ({uuid: 'uuid1'}))
        critical = vi.fn()
        constructor(public options:Record<string, unknown>){
            rollbar.instances.push(this)
        }
    },
}))


// Fake untar worker that replies with given messages
const worker = vi.hoisted(() => ({replies: [] as unknown[]}))
vi.mock('js-untar/src/untar-worker.js?worker', () => ({
    default: class {
        onmessage:((event:{data:unknown})=>void)|null = null
        onerror:unknown = null
        terminate = vi.fn()
        postMessage(){
            for (const data of worker.replies){
                setTimeout(() => this.onmessage!({data}))
            }
        }
    },
}))


Vue.use(VueRouter)
Vue.config.productionTip = false
Vue.config.devtools = false

let store:MockStore

beforeEach(async () => {
    ({store} = await setup_globals())
    document.body.innerHTML = ''
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllEnvs()
})


describe('misc', () => {

    test('debounce helpers delay calls', () => {
        vi.useFakeTimers()
        const fn = vi.fn()
        const debounced = debounce(fn, 100)
        debounced()
        debounced()
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledTimes(1)

        // Decorators
        const method_descriptor = {value: vi.fn()}
        debounce_method(50)(null, 'm', method_descriptor)
        ;(method_descriptor.value as ()=>void)()
        ;(method_descriptor.value as ()=>void)()
        vi.advanceTimersByTime(50)
        const set_spy = vi.fn()
        const set_descriptor:PropertyDescriptor = {set: set_spy}
        debounce_set()(null, 's', set_descriptor)
        set_descriptor.set!(1)
        vi.advanceTimersByTime(500)
        expect(set_spy).toHaveBeenCalledWith(1)
    })

    test('debug only logs outside production', () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
        debug('x')
        expect(spy).toHaveBeenCalledWith('x')
        vi.stubEnv('MODE', 'production')
        debug('y')
        expect(spy).toHaveBeenCalledTimes(1)
    })

    test('time_between', () => {
        const now = new Date(2020, 0, 10)
        expect(time_between(new Date(2020, 0, 8), now)).toBe('2 days ago')
        expect(time_between(new Date(2020, 0, 12), now)).toBe('in 2 days')
        expect(time_between(new Date(2020, 0, 12), now, false)).toBe('2 days')
    })

    test('lifespan options', () => {
        expect(SECTION_IMAGE_WIDTH).toBe(1400)
        expect(generate_lifespan_options().at(-1)!.text).toBe('No expiry')
        expect(generate_lifespan_options(30).at(-1)!.value).toBe(28)
        expect(lifespan_days_to_text(14)).toBe('2 weeks')
        expect(lifespan_days_to_text(11)).toBe('11 days')
    })

    test('untar collects files until complete', async () => {
        const file = {name: 'a', type: '0', buffer: new ArrayBuffer(1)}
        worker.replies = [{type: 'extract', data: file}, {type: 'complete'}]
        expect(await untar(new ArrayBuffer(0))).toEqual([file])
        worker.replies = [{type: 'error'}]
        await expect(untar(new ArrayBuffer(0))).rejects.toThrow('error')
    })
})


describe('errors', () => {

    test('setup rollbar, report errors and show fail bar for critical', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const errors = await import('./errors')
        const instance = rollbar.instances.at(-1)!

        // Reporting returns id
        expect(self.app_report_error(new Error('x'))).toBe('uuid1')
        expect(instance.error).toHaveBeenCalled()

        // Vue errors are critical
        Vue.config.errorHandler!(new Error('vue'), new Vue(), 'render')
        expect(instance.critical).toHaveBeenCalledTimes(1)
        Vue.config.warnHandler!('warn', new Vue(), 'trace')
        expect(instance.critical).toHaveBeenCalledTimes(2)

        // onSendCallback redacts file paths and shows fail bar for critical
        const callback = instance.options['onSendCallback'] as
            (u:boolean, a:unknown, p:Record<string, unknown>)=>void
        const base = new URL('./', self.location.href).href.slice(0, -1)
        const payload:Record<string, unknown> = {level: 'critical', uuid: 'id9',
            body: {trace: `${base}/file.js`}}
        callback(true, [], payload)
        expect(JSON.stringify(payload['body'])).toContain('file:///redacted/file.js')
        expect(document.querySelector('.reload-bar.fail')!.textContent).toContain('A problem')
        expect(document.querySelector('.reload-bar a')!.getAttribute('href')).toContain('id9')

        // Only one bar shown
        callback(true, [], {level: 'critical', uuid: 'id10'})
        expect(document.querySelectorAll('.reload-bar')).toHaveLength(1)

        // Non-critical doesn't show bar
        document.body.innerHTML = ''
        callback(true, [], {level: 'error'})
        expect(document.querySelector('.reload-bar')).toBe(null)

        // Reload button reloads
        callback(true, [], {level: 'critical', uuid: 'x'})
        const reload = vi.fn()
        vi.spyOn(location, 'reload').mockImplementation(reload)
        ;(document.querySelector('.reload-bar button') as HTMLButtonElement).click()
        expect(reload).toHaveBeenCalled()

        // Database version errors show explanation
        const version_error = Object.assign(new Error(), {name: 'VersionError'})
        expect(() => errors.handle_db_error(version_error)).toThrow()
        expect(document.querySelector('.version-error')).not.toBe(null)
        expect(() => errors.handle_db_error('other')).toThrow()
    })
})


describe('router', () => {

    test('guards redirect to trailing slash, close dialogs and track prev route', async () => {
        vi.stubEnv('MODE', 'production')
        const {get_router} = await import('./router')
        const router = get_router(store as never)
        const resolve = vi.fn()
        store.state.tmp.dialog = {component: {}, resolve}
        // Vue Router 3 rejects push() whenever a guard redirects, even though it succeeds
        await router.push('/contacts').catch(() => undefined)
        expect(router.currentRoute.path).toBe('/contacts/')
        expect(resolve).toHaveBeenCalled()
        await router.push('/drafts/abc/')
        expect(router.currentRoute.params['draft_id']).toBe('abc')
        expect(store.commit).toHaveBeenCalledWith('tmp_set', ['prev_route',
            expect.objectContaining({path: '/contacts/'})])
    })

    test('non-trailing-slash navigation throws in development', async () => {
        vi.stubEnv('MODE', 'development')
        const {get_router} = await import('./router')
        const router = get_router(store as never)
        await expect(router.push('/about')).rejects.toThrow('does not end with a slash')
    })
})


describe('NativeBrowser', () => {

    test('non-op implementations', async () => {
        const native = new NativeBrowser()
        expect(native.get_paths().sep).toBe('/')
        await expect(native.app_file_read('x')).rejects.toThrow('unsupported')
        expect(await native.user_file_list('x')).toEqual([])
        expect(await native.user_file_size_total('x')).toBe(0)
        await expect(native.user_file_read('x')).rejects.toThrow('unsupported')
        await native.user_file_write('x', new ArrayBuffer(0))
        await native.user_file_remove('x')
        native.restart_after_update()
        expect(await native.dns_mx('x')).toEqual([])
        expect(await native.os_encrypt('x')).toBe(null)
        expect(await native.os_decrypt(new ArrayBuffer(0))).toBe(null)
        expect(await native.html_to_pdf('', '')).toBe(null)
        expect((await native.test_email_settings({} as never))!.code).toBe('unsupported')
        await expect(native.smtp_send({} as never, {} as never)).rejects.toThrow('unsupported')
        native.on_update_ready(() => undefined)
        native.on_oauth(() => undefined)
    })
})
