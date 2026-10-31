
import {describe, expect, test} from 'vitest'

import {decode_hash} from './hash'


describe('decode_hash', () => {

    // Empty hashes
    test('returns null for empty hash or missing config secret', async () => {
        expect(await decode_hash('')).toBe(null)
        expect(await decode_hash('#')).toBe(null)
        expect(await decode_hash('#,msg,secret')).toBe(null)
    })

    // Standard message hash
    test('decodes all parts of a message hash', async () => {
        expect(await decode_hash('#conf,msg_id,sec-ret~,unsub,arg_1')).toEqual({
            config_secret_url64: 'conf',
            msg_id: 'msg_id',
            msg_secret_url64: 'sec-ret~',
            action: 'unsub',
            action_arg: 'arg_1',
            subscribe: null,
        })
    })

    // Optional parts
    test('missing parts are null', async () => {
        expect(await decode_hash('#conf,msg,secret')).toEqual({
            config_secret_url64: 'conf',
            msg_id: 'msg',
            msg_secret_url64: 'secret',
            action: null,
            action_arg: null,
            subscribe: null,
        })
    })

    // Subscribe forms only have one part
    test('single value is treated as a subscribe form id', async () => {
        expect(await decode_hash('#formid')).toEqual({
            config_secret_url64: null,
            msg_id: null,
            msg_secret_url64: null,
            action: null,
            action_arg: null,
            subscribe: 'formid',
        })
    })

    // Some mail clients encode '~'
    test('decodes uri encoded chars', async () => {
        expect((await decode_hash('#conf,msg,se%7Ecret'))?.msg_secret_url64).toBe('se~cret')
    })

    // SECURITY Malicious chars must be rejected
    test('rejects invalid chars in any part', async () => {
        expect(await decode_hash('#co<nf,msg,secret')).toBe(null)
        expect(await decode_hash('#conf,ms"g,secret')).toBe(null)
        expect(await decode_hash('#conf,msg,sec>ret')).toBe(null)
        expect(await decode_hash('#conf,msg,secret,UNSUB')).toBe(null)
        expect(await decode_hash('#conf,msg,secret,unsub,a/b')).toBe(null)
    })
})
