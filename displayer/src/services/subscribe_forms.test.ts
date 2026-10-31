
import {afterEach, describe, expect, test, vi} from 'vitest'

import {encrypt_json, mock_fetch, new_secret} from '../../tests/unit_utils'
import {get_form_data} from './subscribe_forms'
import {buffer_to_url64} from './utils/coding'


const FORMS_URL = '/dev/config/_user/subscribe'


describe('get_form_data', () => {

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    // Finds the form that decrypts
    test('returns the form that decrypts with the id', async () => {
        const other = await new_secret()
        const secret = await new_secret()
        const form = {id: 'f', text: "Hi", accept_message: true, config_secret_url64: 'c'}
        mock_fetch({[FORMS_URL]: Response.json([
            buffer_to_url64(await encrypt_json({id: 'other'}, other.key)),
            buffer_to_url64(await encrypt_json(form, secret.key)),
        ])})
        expect(await get_form_data(secret.url64)).toEqual(form)
    })

    // No matches
    test('returns null when no form decrypts', async () => {
        const other = await new_secret()
        const secret = await new_secret()
        mock_fetch({[FORMS_URL]: Response.json([
            buffer_to_url64(await encrypt_json({id: 'other'}, other.key)),
        ])})
        expect(await get_form_data(secret.url64)).toBe(null)
    })

    // Failures
    test('returns null for invalid id or failed request', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        mock_fetch()
        expect(await get_form_data('bad')).toBe(null)
        expect(await get_form_data((await new_secret()).url64)).toBe(null)
    })
})
