// Generates displayer compatibility fixtures (run via .bin/generate_compat)
// Records requests the displayer sends the responder, for any version only the app has generated
// See fixtures/compat/README.md

import {expect, test, vi} from 'vitest'

import {mock_fetch, set_store_state} from '../../tests/unit_utils'
import {compat_versions, read_fixture, serve_app_fixture, AppFixture}
    from '../../tests/unit_compat'
import {database} from './database'
import {displayer_config} from './displayer_config'
import {respond_address, respond_reaction, respond_read, respond_reply, respond_resend,
    respond_subscribe, respond_subscription} from './responses'
import {store} from './store'


// Version being generated is the one with only an app fixture so far
const version = compat_versions('app.json', 'displayer.json').at(-1)


test.skipIf(!version)('generate displayer fixtures', async () => {
    await database.connect()
    const app = read_fixture<AppFixture>(version!, 'app.json')

    // Load message and config from the app's fixture
    const fetch_mock = mock_fetch()
    serve_app_fixture(fetch_mock, app)
    vi.stubGlobal('Image', class {
        set src(_value:string){}
    })
    set_store_state()
    self.location.hash = `#${app.view_hash}`
    await store.process_hash()
    await vi.waitFor(() => {
        if (!store.state.msg?.data){
            throw new Error("Not loaded")
        }
    })

    // Capture every request sent to the responder
    const requests:Record<string, unknown> = {}
    for (const type of ['read', 'reply', 'reaction', 'subscription', 'address', 'resend',
            'subscribe']){
        fetch_mock.routes[`${displayer_config.responder!}${type}`] = (init:RequestInit) => {
            requests[type] = JSON.parse(init.body as string) as unknown
            return new Response('{}')
        }
    }
    const token = app.ids.resp_token
    await respond_read(token, app.ids.copy, true)
    await respond_reply(token, "Compat reply", app.ids.sections.text, null)
    await respond_reaction(token, 'like', app.ids.sections.images, 'img1')
    await respond_subscription(token, false, app.encrypted_address)
    await respond_address(token, 'new@example.com', app.encrypted_address)
    await respond_resend(token, "Compat resend reason")
    await respond_subscribe(app.ids.form, 'subscriber@example.com', "Compat Subscriber",
        "Compat subscribe message")

    // Write fixture (as a new file snapshot)
    await expect(JSON.stringify({version, requests}, null, 4) + '\n')
        .toMatchFileSnapshot(`../../../fixtures/compat/${version!}/displayer.json`)
})
