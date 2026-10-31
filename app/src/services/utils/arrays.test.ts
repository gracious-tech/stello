
import {describe, expect, test} from 'vitest'

import {sort, remove_item, remove_value, remove_match, remove_matches, get_last} from './arrays'


describe('sort', () => {

    test('sorts numbers numerically rather than as strings', () => {
        const array = [10, 2, 1, 33]
        sort(array)
        expect(array).toEqual([1, 2, 10, 33])
    })

    test('sorts dates chronologically', () => {
        const a = new Date(2020, 0, 1)
        const b = new Date(2021, 0, 1)
        const c = new Date(2019, 0, 1)
        const array = [a, b, c]
        sort(array)
        expect(array).toEqual([c, a, b])
    })

    test('sorts strings case-insensitively', () => {
        const array = ['b', 'C', 'a']
        sort(array)
        expect(array).toEqual(['a', 'b', 'C'])
    })

    test('sorts by property and descending', () => {
        const array = [{n: 1}, {n: 3}, {n: 2}]
        sort(array, 'n', false)
        expect(array.map(i => i.n)).toEqual([3, 2, 1])
    })

    test('sorts by array index', () => {
        const array = [['x', 2], ['y', 1]]
        sort(array, 1)
        expect(array).toEqual([['y', 1], ['x', 2]])
    })

    test('does nothing for empty array', () => {
        const array:number[] = []
        sort(array)
        expect(array).toEqual([])
    })
})


describe('remove helpers', () => {

    test('remove_item removes only first occurrence and reports existence', () => {
        const array = [1, 2, 2, 3]
        expect(remove_item(array, 2)).toBe(true)
        expect(array).toEqual([1, 2, 3])
        expect(remove_item(array, 9)).toBe(false)
    })

    test('remove_value removes all occurrences and returns count', () => {
        const array = [1, 2, 2, 3, 2]
        expect(remove_value(array, 2)).toBe(3)
        expect(array).toEqual([1, 3])
    })

    test('remove_match returns removed item or undefined', () => {
        const array = [{id: 1}, {id: 2}]
        expect(remove_match(array, i => i.id === 2)).toEqual({id: 2})
        expect(remove_match(array, i => i.id === 9)).toBeUndefined()
        expect(array).toEqual([{id: 1}])
    })

    test('remove_matches removes and returns all matches', () => {
        const array = [1, 2, 3, 4]
        expect(remove_matches(array, i => i % 2 === 0).sort()).toEqual([2, 4])
        expect(array).toEqual([1, 3])
    })

    test('get_last returns last item or undefined', () => {
        expect(get_last([1, 2, 3])).toBe(3)
        expect(get_last([])).toBeUndefined()
    })
})
