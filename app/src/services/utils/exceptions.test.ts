
import {describe, expect, test} from 'vitest'

import {CustomError, MustReconnect, MustInterpret, type_of, catch_only, silence, drop,
    validate_chars, error_to_string, ensure_string} from './exceptions'


describe('custom errors', () => {

    test('subclasses keep name and prototype', () => {
        const error = new MustReconnect('url')
        expect(error).toBeInstanceOf(MustReconnect)
        expect(error).toBeInstanceOf(CustomError)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('MustReconnect')
        expect(error.message).toBe('url')
    })

    test('MustInterpret stores data and stringifies it as message', () => {
        const error = new MustInterpret({status: 500})
        expect(error.data).toEqual({status: 500})
        expect(error.message).toBe('{"status":500}')
    })
})


describe('helpers', () => {

    test('type_of distinguishes null and array', () => {
        expect(type_of(null)).toBe('null')
        expect(type_of([])).toBe('array')
        expect(type_of({})).toBe('object')
        expect(type_of('')).toBe('string')
        expect(type_of(undefined)).toBe('undefined')
    })

    test('catch_only rethrows other errors', () => {
        expect(() => catch_only(MustReconnect, new MustReconnect())).not.toThrow()
        expect(() => catch_only(MustReconnect, new Error('x'))).toThrow('x')
    })

    test('silence swallows errors', () => {
        expect(silence(() => {throw new Error()})).toBeUndefined()
        expect(silence((a:number) => a * 2, [2])).toBe(4)
    })

    test('drop resolves undefined on rejection', async () => {
        await expect(drop(Promise.reject(new Error()))).resolves.toBeUndefined()
        await expect(drop(Promise.resolve(1))).resolves.toBe(1)
    })

    test('validate_chars throws for invalid chars', () => {
        expect(() => validate_chars('abc-1', 'a-z0-9\\-')).not.toThrow()
        expect(() => validate_chars('ab c', 'a-z')).toThrow('Invalid characters')
    })

    test('error_to_string handles many types', () => {
        expect(error_to_string(new MustReconnect('m'))).toMatch(/^Error type: MustReconnect\nm/)
        expect(error_to_string({a: 1})).toContain('"a": 1')
        expect(error_to_string('text')).toBe('Error type: string\ntext')
        expect(error_to_string(null)).toBe('Error type: object\nnull')
        // Circular structures can't be stringified but must never throw
        const circular:Record<string, unknown> = {}
        circular['self'] = circular
        expect(error_to_string(circular)).toBe('Error type: Object\n')
    })

    test('ensure_string', () => {
        expect(ensure_string('a')).toBe('a')
        expect(ensure_string('')).toBe('')
        expect(ensure_string(null, true)).toBe(null)
        expect(ensure_string(undefined)).toBe('')
        expect(() => ensure_string(5)).toThrow('not a string')
    })
})
