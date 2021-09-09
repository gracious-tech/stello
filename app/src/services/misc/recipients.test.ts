
import {test, expect} from '@playwright/test'

import {get_final_recipients} from './recipients'


test.describe('get_final_recipients', () => {

    interface WrapperArgs {
        contacts:(string|[string, string])[]  // id or [id, address]
        groups?:Record<string, string[]>
        unsubscribes?:[string, string][]
        include_groups?:string[]
        exclude_groups?:string[]
        include_contacts?:string[]
        exclude_contacts?:string[]
    }

    function wrapper(args:WrapperArgs):string[]{
        // Wrapper for get_final_recipients that makes testing much easier
        const partial_draft_record = {
            profile: 'active',
            recipients: {
                include_contacts: args.include_contacts ?? [],
                include_groups: args.include_groups ?? [],
                exclude_contacts: args.exclude_contacts ?? [],
                exclude_groups: args.exclude_groups ?? [],
            },
        }
        return get_final_recipients(
            partial_draft_record,
            args.contacts.map(item => typeof item === 'string' ?
                {id: item, address: ''} : {id: item[0], address: item[1]}),
            Object.entries(args.groups ?? {}).map(([id, contacts]) => ({id, contacts})),
            (args.unsubscribes ?? [])
                .map(([profile, contact]) => ({profile, contact})),
        )
    }

    test('no_contacts_exist', () => {
        expect(wrapper({
            contacts: [],
            include_contacts: ['c1'],
        })).toEqual([])
    })

    test('no_contacts_included', () => {
        expect(wrapper({
            contacts: ['c1'],
        })).toEqual([])
    })

    test('empty_group_included', () => {
        expect(wrapper({
            contacts: ['c1'],
            groups: {g1: []},
            include_groups: ['g1'],
        })).toEqual([])
    })

    test('include_contacts', () => {
        expect(wrapper({
            contacts: ['c1', 'c2'],
            include_contacts: ['c1', 'c2'],
        })).toEqual(['c1', 'c2'])
    })

    test('include_group', () => {
        expect(wrapper({
            contacts: ['c1', 'c2'],
            groups: {g1: ['c1', 'c2']},
            include_groups: ['g1'],
        })).toEqual(['c1', 'c2'])
    })

    test('include_all_group', () => {
        expect(wrapper({
            contacts: ['c1', 'c2'],
            include_groups: ['all'],
        })).toEqual(['c1', 'c2'])
    })

    test('exclude_contacts', () => {
        expect(wrapper({
            contacts: ['c1', 'c2', 'c3', 'c4'],
            groups: {g1: ['c1', 'c2']},
            include_groups: ['g1'],
            include_contacts: ['c3', 'c4'],
            exclude_contacts: ['c1', 'c3'],
        })).toEqual(['c2', 'c4'])
    })

    test('exclude_group', () => {
        expect(wrapper({
            contacts: ['c1', 'c2', 'c3'],
            groups: {g1: ['c1', 'c2']},
            include_groups: ['all'],
            exclude_groups: ['g1'],
        })).toEqual(['c3'])
    })

    test('include_contact_overrides_exclude_group', () => {
        expect(wrapper({
            contacts: ['c1'],
            groups: {g1: ['c1']},
            exclude_groups: ['g1'],
            include_contacts: ['c1'],
        })).toEqual(['c1'])
    })

    test('excludes_exclude_duplicates', () => {
        // NOTE This was a real bug earlier where only one copy of id removed and duplicates left in
        expect(wrapper({
            contacts: ['c1', 'c2','c3'],
            groups: {g1: ['c1', 'c2','c3'], g2: ['c1', 'c2','c3'], g3: ['c1']},
            unsubscribes: [['active', 'c3']],
            include_groups: ['g1', 'g2'],
            exclude_groups: ['g3'],
            exclude_contacts: ['c2'],
        })).toEqual([])
    })

    test('dedup_contacts', () => {
        expect(wrapper({
            contacts: ['c1', 'c2', 'c3'],
            include_groups: ['all'],
            include_contacts: ['c1'],
        })).toEqual(['c1', 'c2', 'c3'])
    })

    test('dedup_addresses', () => {
        expect(wrapper({
            contacts: ['c1', ['c2', 'address1'], ['c3', 'address1']],
            include_groups: ['all'],
        })).toEqual(['c1', 'c2'])
    })

    test('unsubscribes', () => {
        expect(wrapper({
            contacts: ['c1', 'c2', 'c3'],
            unsubscribes: [['active', 'c1'], ['other', 'c2'], ['active', 'c3']],
            include_groups: ['all'],
            include_contacts: ['c3'],  // Overrides unsubscribe
        })).toEqual(['c2', 'c3'])
    })

})
