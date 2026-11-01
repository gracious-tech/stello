// Compatibility tests: messages and configs stored by every past version must still display
// See fixtures/compat/README.md

import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'

import App from '../components/App.vue'
import {mock_fetch, set_store_state} from '../../tests/unit_utils'
import {compat_versions, read_fixture, serve_app_fixture, AppFixture}
    from '../../tests/unit_compat'
import {database} from './database'
import {displayer_config} from './displayer_config'
import {get_form_data} from './subscribe_forms'
import {store} from './store'
import type {PublishedContentText} from '@/shared/shared_types'


beforeAll(async () => {
    await database.connect()
})

beforeEach(async () => {
    // Fresh db and state
    for (const name of ['dict', 'messages', 'reactions', 'replies'] as const){
        await database._conn.clear(name)
    }
    set_store_state()
    displayer_config.responder = null
    displayer_config.error = null
    vi.stubGlobal('Image', class {
        set src(_value:string){}
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


// Test this version can always be read (so fail if fixtures are ever missing)
test('fixtures exist', () => {
    expect(compat_versions('app.json').length).toBeGreaterThan(0)
})


describe.each(compat_versions('app.json'))('data stored by %s', version => {

    const app = read_fixture<AppFixture>(version, 'app.json')

    // Open the message as a recipient would via their invite link
    async function open_message(){
        serve_app_fixture(mock_fetch(), app)
        self.location.hash = `#${app.view_hash}`
        await store.process_hash()
        await vi.waitFor(() => {
            if (!store.state.msg?.data && !store.state.msg?.data_error){
                throw new Error("Not loaded")
            }
        })
    }

    // Copy, its config and its assets decrypt and parse
    test('message and config can be read', async () => {
        await open_message()
        expect(store.state.msg!.data_error).toBe(null)
        const data = store.state.msg!.data!
        expect(data.title).toBe("Compat message")
        expect(data.sections).toHaveLength(5)
        const text = (data.sections[0]![0].content as PublishedContentText).html
        expect(text).toContain("<strong>compat</strong>")
        expect(text).toContain("Compat Sender")
        expect(displayer_config.error).toBe(null)
        expect(displayer_config.responder).toMatch(/responder\/$/)
        expect(displayer_config.resp_key_public).not.toBe(null)

        // Assets (images, files and page images)
        for (const id of ['img1', 'img2', app.ids.sections.file, app.ids.sections.page]){
            expect(await store.get_asset(id), id).not.toBe(null)
        }
    })

    // Whole message renders without errors
    test('message renders', async () => {
        const errors = vi.spyOn(console, 'error')
        await open_message()
        const wrapper = mount(App, {attachTo: self.document.body})
        await flushPromises()
        expect(wrapper.text()).toContain("Hi Compat, compat text from Compat Sender")
        expect(wrapper.text()).toContain("Caption one")
        expect(wrapper.text()).toContain("Page headline")
        // NOTE happy-dom can't load iframes (video) or provide canvas (chart), which isn't a bug
        const env_errors = ["Iframe page loading is disabled", "Failed to create chart"]
        const real_errors = errors.mock.calls.filter(args => !env_errors.some(
            env_error => String(args[0]).includes(env_error)))
        expect(real_errors).toEqual([])
        wrapper.unmount()
    })

    // Subscribe form config can be read
    test('subscribe form can be read', async () => {
        serve_app_fixture(mock_fetch(), app)
        const form = await get_form_data(app.ids.form)
        expect(form?.text).toBe("Subscribe to compat")
        expect(form?.config_secret_url64).toBe(app.keys.shared_secret)
    })
})
