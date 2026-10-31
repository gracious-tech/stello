
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'


// Handlers registered on self by the module
type Handlers = Record<string, (event:unknown) => void>


function report(error:unknown):Promise<void>{
    // Call report fn which is async even though typed as returning void
    return self.app_report_error(error) as unknown as Promise<void>
}


async function load_module():Promise<Handlers>{
    // Import a fresh copy of the module, capturing the event handlers it registers
    const handlers:Handlers = {}
    vi.spyOn(self, 'addEventListener').mockImplementation((type:string, handler:unknown) => {
        handlers[type] = handler as (event:unknown) => void
    })
    vi.resetModules()
    await import('./init_errors')
    return handlers
}


// Parts of a Rollbar report that tests check
interface RollbarBody {
    data:{level:string, body:{message:{body:string}}, request:{url:string}}
}


function rollbar_bodies(fetch_mock:ReturnType<typeof vi.fn>):RollbarBody[]{
    // Get the JSON bodies of all reports sent to Rollbar
    return fetch_mock.mock.calls.map(
        call => JSON.parse((call[1] as RequestInit).body as string) as RollbarBody)
}


describe('init_errors', () => {

    let fetch_mock:ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.useFakeTimers()
        fetch_mock = vi.fn(() => Promise.resolve(new Response()))
        vi.stubGlobal('fetch', fetch_mock)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        self.app_failed = false
        self.app_browser_supported = true
        self.app_hash = '#hash'
        self.document.body.innerHTML = '<div id="app"><svg class="loading"></svg></div>'
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })


    // REPORTING

    test('reports are delayed until 3s after start and throttled', async () => {
        await load_module()
        expect(self.app_report_error_critical).toBe(true)
        const first = report(new Error("first"))
        void report("throttled")
        expect(fetch_mock).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(3000)
        await first
        expect(fetch_mock).toHaveBeenCalledOnce()
        expect(fetch_mock.mock.calls[0]![0]).toBe('http://localhost:7777/')
        const body = rollbar_bodies(fetch_mock)[0]!
        expect(body.data.level).toBe('critical')
        expect(body.data.body.message.body).toContain("first")
        expect(body.data.request.url).toBe(self.location.origin)

        // After throttle period, non-critical reports go through immediately
        self.app_report_error_critical = false
        await vi.advanceTimersByTimeAsync(3000)
        await report("second")
        expect(fetch_mock).toHaveBeenCalledTimes(2)
        const second = rollbar_bodies(fetch_mock)[1]!
        expect(second.data.level).toBe('error')
        expect(second.data.body.message.body).toBe("second")
    })

    test('reports go to rollbar in production', async () => {
        vi.stubEnv('PROD', true)
        await load_module()
        await vi.advanceTimersByTimeAsync(3000)
        await report("prod")
        expect(fetch_mock.mock.calls[0]![0]).toBe('https://api.rollbar.com/api/1/item/')
        vi.unstubAllEnvs()
    })

    test('no reports for unsupported browsers', async () => {
        await load_module()
        self.app_browser_supported = false
        await vi.advanceTimersByTimeAsync(3000)
        await report("x")
        expect(fetch_mock).not.toHaveBeenCalled()
    })


    // VISUAL FAILURE

    test('network failure shows splash with retry, and only first failure counts', async () => {
        await load_module()
        const reload = vi.spyOn(self.location, 'reload').mockImplementation(() => undefined)
        self.location.hash = ''
        self.app_fail_visual(true)
        expect(self.app_failed).toBe(true)
        expect(self.location.hash).toBe('#hash')
        expect(self.document.querySelector('.fail-splash h1')?.textContent)
            .toBe("Could not download message")
        self.document.querySelector<HTMLButtonElement>('.fail-splash button')!.click()
        expect(reload).toHaveBeenCalled()

        // Second failure ignored
        self.app_fail_visual()
        expect(self.document.querySelector('.fail-bar')).toBe(null)
    })

    test('other failures show a bar and remove loading animation', async () => {
        await load_module()
        const reload = vi.spyOn(self.location, 'reload').mockImplementation(() => undefined)
        self.app_fail_visual()
        expect(self.document.querySelector('.fail-bar')).not.toBe(null)
        expect(self.document.querySelector('#app > svg.loading')).toBe(null)
        self.document.querySelector<HTMLButtonElement>('.fail-bar button')!.click()
        expect(reload).toHaveBeenCalled()
    })

    test('unsupported browsers show unsupported splash', async () => {
        await load_module()
        const splash = vi.spyOn(self, 'app_splash_unsupported').mockImplementation(() => undefined)
        self.app_browser_supported = false
        self.app_fail_visual()
        expect(splash).toHaveBeenCalled()
    })


    // GLOBAL HANDLERS

    test('uncaught errors are reported unless ignored', async () => {
        const handlers = await load_module()
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        const fail = vi.spyOn(self, 'app_fail_visual').mockImplementation(() => undefined)

        handlers['error']!({error: new Error("at @safari-extension://x")})
        expect(report).not.toHaveBeenCalled()

        handlers['error']!({message: "msg only"})
        expect(report).toHaveBeenLastCalledWith(expect.stringContaining("msg only"))
        handlers['error']!({})
        expect(report).toHaveBeenLastCalledWith(expect.stringContaining("unknown"))
        expect(fail).toHaveBeenCalledTimes(2)
    })

    test('unhandled rejections are reported unless ignored', async () => {
        const handlers = await load_module()
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        const fail = vi.spyOn(self, 'app_fail_visual').mockImplementation(() => undefined)

        handlers['unhandledrejection']!({reason: new Error(
            "IDBFactory.open() called in an invalid security context")})
        expect(report).not.toHaveBeenCalled()

        handlers['unhandledrejection']!({reason: new Error("boom")})
        expect(report).toHaveBeenCalledWith(expect.stringContaining("boom"))
        expect(fail).toHaveBeenCalledOnce()
    })

    test('CSP violations are reported without visual failure', async () => {
        const handlers = await load_module()
        const report = vi.spyOn(self, 'app_report_error').mockImplementation(() => undefined)
        const fail = vi.spyOn(self, 'app_fail_visual').mockImplementation(() => undefined)
        handlers['securitypolicyviolation']!({blockedURI: 'https://x', violatedDirective: 'img'})
        expect(report).toHaveBeenCalledWith("CSP error: https://x violated img")
        expect(fail).not.toHaveBeenCalled()
    })
})
