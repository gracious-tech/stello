
import {describe, expect, test} from 'vitest'

import {generate_key_sym, generate_key_asym, import_key_sym, import_key_asym, export_key,
    password_to_key, encrypt_sym, decrypt_sym, encrypt_asym, decrypt_asym, encrypt_asym_primitive,
    decrypt_asym_primitive, random_buffer, generate_token, generate_hash, confirm_hash}
    from './crypt'
import {string_to_utf8, utf8_to_string} from './coding'
import {buffers_equal} from './buffers'


// RSA keys are slow to generate so share a single pair
const asym_pair = generate_key_asym(true, ['encrypt', 'decrypt'])


describe('keys', () => {

    test('generate_key_sym defaults and short option', async () => {
        const key = await generate_key_sym()
        expect(key.extractable).toBe(false)
        expect(key.usages).toEqual(['encrypt'])
        expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
        const short = await generate_key_sym(true, ['encrypt'], true)
        expect((short.algorithm as AesKeyAlgorithm).length).toBe(128)
    })

    test('sym key export/import roundtrip', async () => {
        const key = await generate_key_sym(true, ['encrypt', 'decrypt'])
        const raw = await export_key(key)
        expect(raw.byteLength).toBe(32)
        const imported = await import_key_sym(raw)
        const encrypted = await encrypt_sym(string_to_utf8('x'), key)
        expect(utf8_to_string(await decrypt_sym(encrypted, imported))).toBe('x')
    })

    test('asym public key export/import roundtrip', async () => {
        const pair = await asym_pair
        const spki = await export_key(pair.publicKey)
        const imported = await import_key_asym(spki)
        const encrypted = await encrypt_asym_primitive(string_to_utf8('secret'), imported)
        expect(utf8_to_string(await decrypt_asym_primitive(encrypted, pair.privateKey)))
            .toBe('secret')
    })

    // SECURITY Keys must not be extractable unless explicitly requested
    test('generated and imported keys are not extractable by default', async () => {
        const pair = await generate_key_asym()
        expect(pair.privateKey.extractable).toBe(false)
        const sym_raw = await export_key(await generate_key_sym(true))
        expect((await import_key_sym(sym_raw)).extractable).toBe(false)
        const spki = await export_key((await asym_pair).publicKey)
        expect((await import_key_asym(spki)).extractable).toBe(false)
    })

    test('password_to_key is deterministic for same salt', async () => {
        const salt = random_buffer(16)
        const key1 = await password_to_key('pass', salt)
        const key2 = await password_to_key('pass', salt)
        const encrypted = await encrypt_sym(string_to_utf8('data'), key1)
        expect(utf8_to_string(await decrypt_sym(encrypted, key2))).toBe('data')
    })

    test('password_to_key with different password fails to decrypt', async () => {
        const salt = random_buffer(16)
        const encrypted = await encrypt_sym(string_to_utf8('data'),
            await password_to_key('pass', salt))
        await expect(decrypt_sym(encrypted, await password_to_key('wrong', salt)))
            .rejects.toThrow('Failed to decrypt')
    })
})


describe('encryption', () => {

    test('encrypt_sym prepends unique iv', async () => {
        const key = await generate_key_sym(true, ['encrypt', 'decrypt'])
        const data = string_to_utf8('hello')
        const a = await encrypt_sym(data, key)
        const b = await encrypt_sym(data, key)
        expect(a.byteLength).toBe(12 + 5 + 16)  // iv + data + tag
        expect(buffers_equal(a, b)).toBe(false)
    })

    test('decrypt_sym throws normal Error for tampered data', async () => {
        const key = await generate_key_sym(true, ['encrypt', 'decrypt'])
        const encrypted = new Uint8Array(await encrypt_sym(string_to_utf8('hello'), key))
        encrypted[15] = encrypted[15]! ^ 1
        await expect(decrypt_sym(encrypted.buffer, key)).rejects.toThrow(Error)
    })

    test('encrypt_asym supports data larger than rsa limit', async () => {
        const pair = await asym_pair
        const big = new Uint8Array(10_000).fill(7).buffer
        const json = await encrypt_asym(big, pair.publicKey)
        expect(Object.keys(JSON.parse(json) as object).sort())
            .toEqual(['encrypted_data', 'encrypted_key'])
        expect(buffers_equal(await decrypt_asym(json, pair.privateKey), big)).toBe(true)
    })

    test('decrypt_asym_primitive wraps DOMException', async () => {
        const pair = await asym_pair
        await expect(decrypt_asym_primitive(new ArrayBuffer(512), pair.privateKey))
            .rejects.toThrow('Failed to decrypt')
    })
})


describe('tokens and hashes', () => {

    test('generate_token is url safe and expected length', () => {
        const token = generate_token()
        expect(token).toMatch(/^[A-Za-z0-9_-]{20}$/)
        expect(generate_token(6)).toHaveLength(8)
        expect(generate_token()).not.toBe(token)
    })

    test('random_buffer has given size', () => {
        expect(random_buffer(7).byteLength).toBe(7)
    })

    test('hash confirms with correct input only', async () => {
        const input = string_to_utf8('input')
        const hash = await generate_hash(input)
        expect(hash.byteLength).toBe(16 + 32)
        expect(await confirm_hash(hash, input)).toBe(true)
        expect(await confirm_hash(hash, string_to_utf8('other'))).toBe(false)
    })

    test('unsalted hash is deterministic', async () => {
        const input = string_to_utf8('input')
        const a = await generate_hash(input, 0)
        const b = await generate_hash(input, 0)
        expect(buffers_equal(a, b)).toBe(true)
        expect(await confirm_hash(a, input, 0)).toBe(true)
    })
})
