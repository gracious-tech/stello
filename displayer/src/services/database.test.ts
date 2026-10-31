
import {describe, expect, test, vi} from 'vitest'

import {database} from './database'


describe('database', () => {

    // Dict storage
    test('dict get/set/get_all', async () => {
        await database.connect()
        expect(await database.dict_get('missing')).toBe(null)
        await database.dict_set('a', 1)
        await database.dict_set('b', {x: 'y'})
        expect(await database.dict_get('a')).toBe(1)
        expect(await database.dict_get_all()).toMatchObject({a: 1, b: {x: 'y'}})
    })

    // Message history
    test('messages are sorted by published date', async () => {
        await database.connect()
        const record = (id:string, date:string) =>
            ({id, secret_url64: 's', title: id, published: new Date(date)})
        await database.message_set(record('new', '2024-02-01'))
        await database.message_set(record('old', '2024-01-01'))
        expect((await database.message_get_all()).map(m => m.id)).toEqual(['old', 'new'])
    })

    // Reactions
    test('reactions are keyed by subsection or else section', async () => {
        await database.connect()
        expect(await database.reaction_get('sect')).toBe(null)
        await database.reaction_set('msg', 'sect', null, 'like')
        await database.reaction_set('msg', 'sect', 'sub', 'love')
        expect(await database.reaction_get('sect')).toBe('like')
        expect(await database.reaction_get('sub')).toBe('love')
        await database.reaction_remove('sect')
        expect(await database.reaction_get('sect')).toBe(null)
    })

    // Replies
    test('replies are listed per subsect in date order', async () => {
        await database.connect()
        vi.useFakeTimers({toFake: ['Date']})
        vi.setSystemTime(new Date('2024-01-02'))
        await database.reply_add('m1', null, null)
        vi.setSystemTime(new Date('2024-01-01'))
        await database.reply_add('m1', null, null)
        await database.reply_add('m1', 'sect', null)
        await database.reply_add('m1', 'sect', 'sub')
        vi.useRealTimers()
        const dates = await database.reply_list('m1', null, null)
        expect(dates.map(d => d.toISOString().slice(0, 10))).toEqual(['2024-01-01', '2024-01-02'])
        expect(await database.reply_list('m1', 'sect', null)).toHaveLength(1)
        expect(await database.reply_list('m1', 'sect', 'sub')).toHaveLength(1)
        expect(await database.reply_list('m2', null, null)).toHaveLength(0)
    })
})
