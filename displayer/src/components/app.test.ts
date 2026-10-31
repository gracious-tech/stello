
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'

import App from './App.vue'
import AppBtn from './AppBtn.vue'
import AppDialog from './AppDialog.vue'
import AppFooter from './AppFooter.vue'
import AppHistory from './AppHistory.vue'
import AppMessage from './AppMessage.vue'
import AppUnsubscribed from './AppUnsubscribed.vue'
import DialogChangeAddress from './DialogChangeAddress.vue'
import DialogResend from './DialogResend.vue'
import DialogUnsub from './DialogUnsub.vue'
import {make_copy, make_msg, set_store_state} from '../../tests/unit_utils'
import {database} from '@/services/database'
import {displayer_config} from '@/services/displayer_config'
import {store} from '@/services/store'


beforeAll(async () => {
    await database.connect()
})

beforeEach(() => {
    set_store_state()
    displayer_config.responder = null
    displayer_config.error = null
    displayer_config.allow_replies = false
    displayer_config.allow_resend_requests = false
})

afterEach(() => {
    vi.restoreAllMocks()
})


describe('App', () => {

    // No message
    test('shows prompt when no message', () => {
        const wrapper = mount(App, {attachTo: self.document.body})
        expect(wrapper.find('h1.no_msg').text()).toBe("Click original link to view message")
        expect(wrapper.classes()).toContain('style-modern')
    })

    // With message
    test('shows message and toggles dark mode', async () => {
        store._state.msg = make_msg()
        const toggle = vi.spyOn(store, 'toggle_dark')
        const wrapper = mount(App, {attachTo: self.document.body})
        expect(wrapper.find('.content').exists()).toBe(true)
        expect(wrapper.classes()).not.toContain('dark')
        await wrapper.find('.dark_toggle').trigger('click')
        expect(toggle).toHaveBeenCalled()
        expect(wrapper.classes()).toContain('dark')
        await flushPromises()
        expect(self.document.documentElement.style.backgroundColor).toBeDefined()
    })
})


describe('AppBtn', () => {

    // States
    test('disabled while in progress and shows error class', () => {
        const wrapper = mount(AppBtn, {props: {progress: true, error: true},
            slots: {default: "Go"}})
        expect(wrapper.find('button').attributes('disabled')).toBeDefined()
        expect(wrapper.classes()).toEqual(expect.arrayContaining(['error', 'progress']))
        expect(wrapper.text()).toBe("Go")
    })

    test('enabled by default', () => {
        const wrapper = mount(AppBtn)
        expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    })
})


describe('AppDialog', () => {

    // Hidden by default
    test('renders nothing without a dialog', () => {
        expect(mount(AppDialog).find('.overlay').exists()).toBe(false)
    })

    // Showing and closing
    test('renders dialog component and closes on overlay click', async () => {
        store._state.msg = make_msg()
        const wrapper = mount(AppDialog)
        store.dialog_open(DialogUnsub, {encrypted_address: 'x'})
        await flushPromises()
        expect(wrapper.find('.dialog h2').text()).toBe("Unsubscribe")
        expect(self.document.body.style.overflowY).toBe('hidden')
        await wrapper.find('.dialog').trigger('click')  // Not self so not closed
        expect(store.state.dialog).not.toBe(null)
        await wrapper.find('.overlay').trigger('click')
        expect(store.state.dialog).toBe(null)
        await flushPromises()
        expect(self.document.body.style.overflowY).toBe('auto')
    })

    // Persistent dialogs
    test('persistent dialog not closed by overlay click', async () => {
        store._state.msg = make_msg()
        const wrapper = mount(AppDialog)
        store.dialog_open(DialogUnsub, {}, true)
        await flushPromises()
        await wrapper.find('.overlay').trigger('click')
        expect(store.state.dialog).not.toBe(null)
    })
})


describe('AppFooter', () => {

    // Requires data
    test('hidden until message decrypted', () => {
        store._state.msg = make_msg({data: null})
        expect(mount(AppFooter).find('.footer').exists()).toBe(false)
    })

    // Subscription links
    test('subscription and address links when responder available', async () => {
        displayer_config.responder = 'https://r/'
        store._state.msg = make_msg()
        const update = vi.spyOn(store, 'update_subscribed').mockResolvedValue()
        const wrapper = mount(AppFooter)
        const links = wrapper.findAll('a')
        expect(links.map(a => a.text())).toEqual(["Unsubscribe", "Change email address"])
        await links[0]!.trigger('click')
        expect(update).toHaveBeenCalledWith(false)
        await links[1]!.trigger('click')
        expect(store.state.dialog?.component).toBe(DialogChangeAddress)
        expect(store.state.dialog?.props).toEqual({old_address: 'old@example.com'})
    })

    test('resubscribe label when unsubscribed and no address link if none', () => {
        displayer_config.responder = 'https://r/'
        store._state.msg = make_msg({data: make_copy({contact_address: ''})})
        store._state.dict.unsubscribed = ['token']
        const links = mount(AppFooter).findAll('a')
        expect(links.map(a => a.text())).toEqual(["Resubscribe"])
        expect(links[0]!.classes()).toContain('unsubscribed')
    })

    test('no subscription links without permission or responder', () => {
        displayer_config.responder = 'https://r/'
        store._state.msg = make_msg({data: make_copy({permission_subscription: false})})
        expect(mount(AppFooter).findAll('a')).toHaveLength(0)
        displayer_config.responder = null
        store._state.msg = make_msg()
        expect(mount(AppFooter).findAll('a')).toHaveLength(0)
    })

    // Credit
    test('shows Stello credit only on stello.news domains', () => {
        store._state.msg = make_msg()
        vi.spyOn(self.location, 'hostname', 'get').mockReturnValue('user.stello.news')
        expect(mount(AppFooter).text()).toContain("Created with")
    })
})


describe('AppHistory', () => {

    // History fixture
    const item = (id:string, day:number) => ({id, secret_url64: `s${id}`, title: `T${id}`,
        published: new Date(2024, 0, day)})

    // Hidden
    test('hidden when current message not in history', () => {
        store._state.history = [item('a', 1)]
        store._state.msg = make_msg({id: 'other'})
        expect(mount(AppHistory).html()).toBe('<!--v-if-->')
    })

    // Middle of history
    test('shows prev and next and loads them', async () => {
        store._state.history = [item('a', 1), item('b', 2), item('c', 3)]
        store._state.msg = make_msg({id: 'b'})
        const change = vi.spyOn(store, 'change_msg').mockResolvedValue()
        const wrapper = mount(AppHistory)
        expect(wrapper.find('.published').text()).toContain('2024')
        expect(wrapper.find('.prev a').text()).toContain("Ta")
        expect(wrapper.find('.next a').text()).toContain("Tc")
        await wrapper.find('.prev a').trigger('click')
        expect(store.state.transition).toBe('prev')
        expect(change).toHaveBeenLastCalledWith('a', 'sa', "Ta", item('a', 1).published)
        await wrapper.find('.next a').trigger('click')
        expect(store.state.transition).toBe('next')
        expect(change).toHaveBeenLastCalledWith('c', 'sc', "Tc", item('c', 3).published)
    })

    // Ends of history
    test('first item has no prev and last has no next', () => {
        store._state.history = [item('a', 1), item('b', 2)]
        store._state.msg = make_msg({id: 'a'})
        let wrapper = mount(AppHistory)
        expect(wrapper.find('.prev').exists()).toBe(false)
        expect(wrapper.find('.next').exists()).toBe(true)
        store._state.msg = make_msg({id: 'b'})
        wrapper = mount(AppHistory)
        expect(wrapper.find('.prev').exists()).toBe(true)
        expect(wrapper.find('.next').exists()).toBe(false)
    })

    test('only one item shows date without navigation', () => {
        store._state.history = [item('a', 1)]
        store._state.msg = make_msg({id: 'a'})
        const wrapper = mount(AppHistory)
        expect(wrapper.find('.published').exists()).toBe(true)
        expect(wrapper.find('.history').exists()).toBe(false)
    })
})


describe('AppMessage', () => {

    // Loading
    test('shows progress while loading', () => {
        store._state.msg = make_msg({data: null, title: "Old title",
            published: new Date(2024, 0, 1)})
        const wrapper = mount(AppMessage)
        expect(wrapper.find('h1').text()).toBe("Old title")
        expect(wrapper.find('svg.loading').exists()).toBe(true)
    })

    // Network and corrupted errors can be retried
    test('network and corrupted errors offer retry', async () => {
        const get = vi.spyOn(store, 'get_msg_data').mockResolvedValue()
        store._state.msg = make_msg({data: null, data_error: 'network'})
        let wrapper = mount(AppMessage)
        expect(wrapper.find('h2.error').text()).toContain("Download interrupted")
        await wrapper.find('button').trigger('click')
        expect(get).toHaveBeenCalled()
        store._state.msg = make_msg({data: null, data_error: 'corrupted'})
        wrapper = mount(AppMessage)
        expect(wrapper.find('h2.error').text()).toContain("Could not read message")
        expect(wrapper.find('button').text()).toBe("Retry")
    })

    // Expired
    test('expired offers resend request only if allowed', async () => {
        store._state.msg = make_msg({data: null, data_error: 'expired'})
        let wrapper = mount(AppMessage)
        expect(wrapper.find('h2.error').text()).toBe("Message has expired")
        expect(wrapper.find('button').exists()).toBe(false)
        displayer_config.allow_resend_requests = true
        wrapper = mount(AppMessage)
        await wrapper.find('button').trigger('click')
        expect(store.state.dialog?.component).toBe(DialogResend)
    })

    test('unknown error value', () => {
        store._state.msg = make_msg({data: null, data_error: 'x' as 'network'})
        expect(mount(AppMessage).find('h2.error').text()).toBe("Unknown error")
    })

    // Loaded
    test('renders contents when loaded', () => {
        store._state.msg = make_msg()
        const wrapper = mount(AppMessage)
        expect(wrapper.find('.no_data').exists()).toBe(false)
    })
})


describe('AppUnsubscribed', () => {

    // Config errors
    test('shows config error messages', async () => {
        const wrapper = mount(AppUnsubscribed)
        expect(wrapper.find('.unsubscribed').exists()).toBe(false)
        const cases = {network: "Network issue detected", decrypt: "Invalid URL",
            inactive: "This account is no longer active"} as const
        for (const [error, text] of Object.entries(cases)){
            displayer_config.error = error as keyof typeof cases
            await flushPromises()
            expect(wrapper.find('.alert').text()).toBe(text)
        }
    })

    // Unsubscribed
    test('shows unsubscribed with undo', async () => {
        store._state.msg = make_msg()
        store._state.dict.unsubscribed = ['token']
        const update = vi.spyOn(store, 'update_subscribed').mockResolvedValue()
        const wrapper = mount(AppUnsubscribed)
        expect(wrapper.find('.alert').text()).toContain("You've unsubscribed")
        await wrapper.find('a').trigger('click')
        expect(update).toHaveBeenCalledWith(true)
    })
})
