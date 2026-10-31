
// Shared fixtures for app E2E tests: network sandbox, native shim, coverage and seeding helpers

import {test as base, expect, Locator, Page, Route} from '@playwright/test'
import MCR from 'monocart-coverage-reports'

import {coverage_options, keep_entry} from './coverage'
import {NATIVE_SHIM} from './native_shim'


// Path to in-browser seed module as served by Vite (root is app/)
// NOTE Lives in app/src so it's type checked with the app's tsconfig
export const SEED_MODULE = '/src/services/e2e_seed.test_utils.ts'


// Ids of records created by the in-browser `seed_full()`
export interface SeedResult {
    profile:string
    contacts:string[]
    groups:string[]
    draft:string
    messages:string[]
    sections:Record<string, string>
}


// Console errors that are expected and not a sign of a bug
const IGNORED_ERRORS = [
    /Failed to load resource/,  // Requests blocked by the network sandbox
    /\[vite\]/,
    /Download the Vue Devtools/,
    /OS encryption unavailable/,  // Expected when running in a browser rather than Electron
]


async function handle_route(route:Route):Promise<void>{
    // Only allow requests to the local dev server (and data/blob urls); fake AWS; block all else
    const url = new URL(route.request().url())
    if (['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'https:'
            && url.protocol !== 'http:'){
        return route.continue()
    }
    if (url.hostname.endsWith('.amazonaws.com')){
        return fake_aws(route, url)
    }
    return route.abort('blockedbyclient')
}


async function fake_aws(route:Route, url:URL):Promise<void>{
    // Respond to AWS requests as an empty but working account (only what tests need)
    const method = route.request().method()
    if (method === 'GET' && url.searchParams.get('list-type') === '2'){
        return route.fulfill({status: 200, contentType: 'application/xml', body:
            '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>'
            + '<IsTruncated>false</IsTruncated><KeyCount>0</KeyCount></ListBucketResult>'})
    }
    if (method === 'GET' && url.searchParams.get('x-id') === 'ListBuckets'){
        return route.fulfill({status: 200, contentType: 'application/xml', body:
            '<ListAllMyBucketsResult><Buckets></Buckets></ListAllMyBucketsResult>'})
    }
    if (url.hostname === 'iam.amazonaws.com'
            && route.request().postData()?.includes('Action=ListUsers')){
        return route.fulfill({status: 200, contentType: 'text/xml', body:
            '<ListUsersResponse><ListUsersResult><Users></Users><IsTruncated>false</IsTruncated>'
            + '</ListUsersResult></ListUsersResponse>'})
    }
    if (route.request().postData()?.includes('Action=DescribeRegions')){
        return route.fulfill({status: 200, contentType: 'text/xml', body:
            '<DescribeRegionsResponse><regionInfo><item><regionName>us-west-2</regionName>'
            + '</item></regionInfo></DescribeRegionsResponse>'})
    }
    const target = route.request().headers()['x-amz-target'] ?? ''
    if (target.endsWith('.GetParameter')){
        return route.fulfill({status: 200, contentType: 'application/x-amz-json-1.1',
            body: JSON.stringify({Parameter: {Value: "US West (Oregon)"}})})
    }
    if (target){
        return route.fulfill({status: 200, contentType: 'application/x-amz-json-1.1', body: '{}'})
    }
    if (method === 'GET' || method === 'HEAD'){
        return route.fulfill({status: 404, contentType: 'application/xml', body:
            '<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>'})
    }
    return route.fulfill({status: 200, body: ''})
}


export interface AppFixture {
    // Errors logged by the page during the test (asserted empty after each test)
    errors:string[]
    // Load the app with splash screens dismissed and optional seeded data
    open(options?:{seed?:'none'|'profile'|'incomplete_profile'|'full', path?:string,
        state?:Record<string, unknown>}):Promise<SeedResult|null>
    // Navigate within the app via its hash router (waiting for route transition to end)
    goto(path:string):Promise<void>
}


export const test = base.extend<{app:AppFixture}>({

    page: async ({page}, use) => {
        // Sandbox network, collect coverage, then save coverage once test done
        await page.context().route('**/*', handle_route)
        await page.addInitScript({content: NATIVE_SHIM})
        await page.coverage.startJSCoverage({resetOnNavigation: false})
        await use(page)
        const coverage = (await page.coverage.stopJSCoverage()).filter(e => keep_entry(e.url))
        await MCR(coverage_options).add(coverage)
    },

    app: async ({page}, use) => {
        // Track JS errors so tests fail on unexpected exceptions
        const errors:string[] = []
        page.on('pageerror', error => errors.push(error.stack ?? `${error.name}: ${error.message}`))
        page.on('console', msg => {
            const text = msg.text()
            if (msg.type() === 'error' && !IGNORED_ERRORS.some(r => r.test(text))){
                errors.push(text)
            }
        })

        // Expose helpers
        const fixture:AppFixture = {
            errors,
            open: async (options={}) => {
                const seed = options.seed ?? 'full'
                await page.goto('/')
                await wait_for_app(page)
                const state = {show_splash_welcome: false, show_splash_disclaimer: false,
                    ...options.state}
                const result = await app_eval<SeedResult|null>(page, `
                    const m = await import('${SEED_MODULE}')
                    await m.seed_state(${JSON.stringify(state)})
                    if ('${seed}' === 'full'){
                        return m.seed_full()
                    } else if ('${seed}' !== 'none'){
                        await m.seed_profile('${seed}' === 'profile')
                    }
                    return null
                `)
                await page.goto('/#' + (options.path ?? '/'))
                await page.reload()
                await wait_for_app(page)
                return result
            },
            goto: async (path:string) => {
                await page.goto('/#' + path)
                await expect(page.locator('.docked')).toHaveCount(1)  // Wait for transition
            },
        }
        await use(fixture)

        // Fail if any unexpected JS errors occurred
        expect(errors, "JS errors during test").toEqual([])
    },
})


export async function wait_for_app(page:Page):Promise<void>{
    // Wait for Vue to mount the app
    // NOTE Must be a function as app's CSP blocks string evaluation within waitForFunction
    await page.waitForFunction(() => !!(globalThis as {app_vue?:unknown}).app_vue, null,
        {timeout: 60 * 1000})
    await expect(page.locator('.v-application')).toBeVisible()
}


export async function menu_action(page:Page, scope:Locator|string, label:string):Promise<void>{
    // Click an item in the first "more" menu within given scope
    // NOTE Force as some list items are repositioned continually so are never "stable"
    // NOTE Retries as menus opened during a route transition get closed again
    // NOTE String scopes are resolved within the current route (old one may be transitioning)
    await expect(page.locator('.docked')).toHaveCount(1)
    const scope_locator = typeof scope === 'string' ? page.locator('.docked').locator(scope) : scope
    const menu = page.locator('.menuable__content__active')
    await expect(async () => {
        if (!await menu.count()){
            await scope_locator.locator('.menu-more-btn').first().click({force: true})
        }
        await expect(menu.getByText(label, {exact: true})).toBeVisible({timeout: 2000})
    }).toPass({timeout: 20 * 1000})
    await menu.getByText(label, {exact: true}).click()
    await expect(menu).toHaveCount(0)  // Wait for menu to close so next one is distinct
}


export function select_field(page:Page, label:string):Locator{
    // Locate a Vuetify select by its label (clicking the input itself is unreliable)
    return page.locator('.v-select', {has: page.locator('label', {hasText: label})}).last()
        .locator('.v-select__slot')
}


export async function native_calls(page:Page):Promise<string[][]>{
    // Get record of calls made to the native platform shim
    return page.evaluate<string[][]>('self.e2e_native_calls')
}


export async function app_eval<T>(page:Page, code:string):Promise<T>{
    // Evaluate an async function body in page with access to app globals (db, store, vue)
    return page.evaluate<T>(`(async () => {${code}})()`)
}


export {expect}
