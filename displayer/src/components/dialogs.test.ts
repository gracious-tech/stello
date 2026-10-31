
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'

import DialogChangeAddress from './DialogChangeAddress.vue'
import DialogResend from './DialogResend.vue'
import DialogSubscribe from './DialogSubscribe.vue'
import DialogUnsub from './DialogUnsub.vue'
import {make_msg, set_store_state} from '../../tests/unit_utils'
import {store} from '@/services/store'
import * as responses from '@/services/responses'


// Mock responses so can control success
vi.mock('@/services/responses', () => ({
    respond_address: vi.fn(),
    respond_resend: vi.fn(),
    respond_subscribe: vi.fn(),
    respond_subscription: vi.fn(),
    respond_read: vi.fn(),
}))


function deferred(){
    // Create a promise that can be resolved externally
    let resolve!:(value:boolean) => void
    const promise = new Promise<boolean>(r => {resolve = r})
    return {promise, resolve}
}


beforeEach(() => {
    set_store_state()
    store._state.msg = make_msg({resp_token: 'tok'})
    store.dialog_open(DialogUnsub)  // So can detect closing
})

afterEach(() => {
    vi.restoreAllMocks()
})


describe('DialogChangeAddress', () => {

    // Initial state
    test('shows old address and requires valid new address', async () => {
        const wrapper = mount(DialogChangeAddress, {props: {old_address: 'old@x.com'}})
        expect(wrapper.find('p').text()).toContain('old@x.com')
        const submit = wrapper.findAll('button')[1]!
        expect(submit.attributes('disabled')).toBeDefined()
        await wrapper.find('input').setValue('new@x.com')
        expect(submit.attributes('disabled')).toBeUndefined()
    })

    // Success
    test('sends response and closes on success', async () => {
        const request = deferred()
        vi.mocked(responses.respond_address).mockReturnValue(request.promise)
        const wrapper = mount(DialogChangeAddress, {props: {encrypted_address: 'enc'}})
        expect(wrapper.find('p').exists()).toBe(false)
        await wrapper.find('input').setValue('new@x.com')
        await wrapper.findAll('button')[1]!.trigger('click')
        expect(wrapper.find('svg.loading').exists()).toBe(true)
        expect(responses.respond_address).toHaveBeenCalledWith('tok', 'new@x.com', 'enc')
        request.resolve(true)
        await flushPromises()
        expect(store.state.dialog).toBe(null)
    })

    // Failure
    test('shows error on failure', async () => {
        vi.mocked(responses.respond_address).mockResolvedValue(false)
        const wrapper = mount(DialogChangeAddress)
        await wrapper.find('input').setValue('new@x.com')
        await wrapper.findAll('button')[1]!.trigger('click')
        await flushPromises()
        expect(wrapper.findAll('button')[1]!.classes()).toContain('error')
        expect(store.state.dialog).not.toBe(null)
    })

    // Cancel
    test('cancel closes', async () => {
        await mount(DialogChangeAddress).findAll('button')[0]!.trigger('click')
        expect(store.state.dialog).toBe(null)
    })
})


describe('DialogResend', () => {

    // Placeholders must be replaced
    test('requires placeholders to be replaced and includes title', async () => {
        store._state.msg!.title = "News"
        const wrapper = mount(DialogResend, {attachTo: self.document.body})
        const textarea = wrapper.find('textarea')
        expect((textarea.element as HTMLTextAreaElement).value).toContain('"News"')
        const submit = wrapper.findAll('button')[1]!
        expect(submit.attributes('disabled')).toBeDefined()
        await textarea.setValue("Please resend")
        expect(submit.attributes('disabled')).toBeUndefined()
    })

    // Success and failure
    test('sends reason and closes on success, error on failure', async () => {
        vi.mocked(responses.respond_resend).mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true)
        const wrapper = mount(DialogResend, {attachTo: self.document.body})
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value)
            .toContain("this message")
        await wrapper.find('textarea').setValue("Please resend")
        await wrapper.findAll('button')[1]!.trigger('click')
        await flushPromises()
        expect(responses.respond_resend).toHaveBeenCalledWith('tok', "Please resend")
        expect(wrapper.findAll('button')[1]!.classes()).toContain('error')
        await wrapper.findAll('button')[1]!.trigger('click')
        await flushPromises()
        expect(store.state.dialog).toBe(null)
    })

    // Cancel
    test('cancel closes', async () => {
        await mount(DialogResend).findAll('button')[0]!.trigger('click')
        expect(store.state.dialog).toBe(null)
    })
})


describe('DialogSubscribe', () => {

    // Form fixture
    const form = {id: 'form', text: '<b>Join</b>', accept_message: true,
        config_secret_url64: 'c'}

    // Display
    test('renders form html and message field only if accepted', () => {
        let wrapper = mount(DialogSubscribe, {props: {form}})
        expect(wrapper.find('.intro b').text()).toBe("Join")
        expect(wrapper.find('textarea').exists()).toBe(true)
        wrapper = mount(DialogSubscribe, {props: {form: {...form, accept_message: false}}})
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    // Validation
    test('requires name and valid address', async () => {
        const wrapper = mount(DialogSubscribe, {props: {form}})
        const submit = wrapper.findAll('button')[1]!
        const [name, address] = wrapper.findAll('input')
        await name!.setValue("Name")
        expect(submit.attributes('disabled')).toBeDefined()
        await address!.setValue('a@b.co')
        expect(submit.attributes('disabled')).toBeUndefined()
    })

    // Success
    test('submits and clears fields on success', async () => {
        vi.mocked(responses.respond_subscribe).mockResolvedValue(true)
        const wrapper = mount(DialogSubscribe, {props: {form}, attachTo: self.document.body})
        const [name, address] = wrapper.findAll('input')
        await name!.setValue("Name")
        await address!.setValue('a@b.co')
        await wrapper.find('textarea').setValue("Hi")
        await wrapper.findAll('button')[1]!.trigger('click')
        await flushPromises()
        expect(responses.respond_subscribe).toHaveBeenCalledWith('form', 'a@b.co', "Name", "Hi")
        expect((name!.element as HTMLInputElement).value).toBe('')
        expect(wrapper.find('.success').exists()).toBe(true)
        // BUG #subscribe-success-address: address is cleared before the success message
        //      renders it, so it reads " subscribed" instead of "a@b.co subscribed"
        expect(wrapper.find('.success').text()).toBe("a@b.co subscribed")
    })

    // Failure
    test('shows error on failure', async () => {
        vi.mocked(responses.respond_subscribe).mockResolvedValue(false)
        const wrapper = mount(DialogSubscribe, {props: {form}})
        const [name, address] = wrapper.findAll('input')
        await name!.setValue("Name")
        await address!.setValue('a@b.co')
        await wrapper.findAll('button')[1]!.trigger('click')
        await flushPromises()
        expect(wrapper.findAll('button')[1]!.classes()).toContain('error')
        expect(wrapper.find('.success').exists()).toBe(false)
        expect((name!.element as HTMLInputElement).value).toBe("Name")
    })

    // Close
    test('close button closes', async () => {
        await mount(DialogSubscribe, {props: {form}}).findAll('button')[0]!.trigger('click')
        expect(store.state.dialog).toBe(null)
    })
})


describe('DialogUnsub', () => {

    // Confirm
    test('unsubscribes with encrypted address and closes', async () => {
        const update = vi.spyOn(store, 'update_subscribed').mockResolvedValue()
        const wrapper = mount(DialogUnsub, {props: {encrypted_address: 'enc'}})
        await wrapper.findAll('button')[1]!.trigger('click')
        expect(update).toHaveBeenCalledWith(false, 'enc')
        expect(store.state.dialog).toBe(null)
    })

    // Cancel
    test('cancel closes without unsubscribing', async () => {
        const update = vi.spyOn(store, 'update_subscribed')
        await mount(DialogUnsub).findAll('button')[0]!.trigger('click')
        expect(update).not.toHaveBeenCalled()
        expect(store.state.dialog).toBe(null)
    })
})
