// @vitest-environment happy-dom

import {beforeEach, describe, expect, test, vi} from 'vitest'
import Vue from 'vue'
import Vuex, {Store} from 'vuex'

import {setup_globals} from '@/../tests/unit_utils'
import {Database} from '@/services/database/database'
import {get_store} from './store'
import {get_initial_state} from './store_state'
import type {AppStoreState, StateTmpDialog} from './types'


Vue.use(Vuex)
Vue.config.productionTip = false
Vue.config.devtools = false


let db:Database

beforeEach(async () => {
    ({db} = await setup_globals())
    vi.stubGlobal('matchMedia', () => ({matches: true}))
})


describe('get_initial_state', () => {

    test('defaults overridden by stored values (including nested) and obsolete keys ignored',
            async () => {
        await db.state.set({key: 'dbid', value: 'stored_id'})
        await db.state.set({key: 'tmp$manager_aws_key_secret', value: 'nested'})
        await db.state.set({key: 'obsolete$key', value: 1})
        const state = await get_initial_state(db)
        expect(state.dbid).toBe('stored_id')
        expect(state.tmp.manager_aws_key_secret).toBe('nested')
        expect(state.dark).toBe(false)  // matchMedia light matches
        expect(state.backups).toBe('all')
    })
})


describe('store', () => {

    let store:Store<AppStoreState>

    beforeEach(async () => {
        store = await get_store(db)
    })

    test('dict_set updates state and persists', async () => {
        store.commit('dict_set', ['dbid', 'abc'])
        store.commit('dict_set', [['tmp', 'manager_aws_key_secret'], 'x'])
        expect(store.state.dbid).toBe('abc')
        await new Promise(resolve => setTimeout(resolve, 10))
        const stored = await db.state.list()
        expect(stored).toContainEqual({key: 'dbid', value: 'abc'})
        expect(stored).toContainEqual({key: 'tmp$manager_aws_key_secret', value: 'x'})
    })

    test('tmp mutations', () => {
        store.commit('tmp_set', ['closing', true])
        expect(store.state.tmp.closing).toBe(true)
        store.commit('tmp_new', ['unread_replies', 'r1', true])
        expect(store.state.tmp.unread_replies).toEqual({r1: true})
        store.commit('tmp_set', ['cut_section', []])
        store.commit('tmp_add', ['cut_section', 'x'])
        expect(store.state.tmp.cut_section).toEqual(['x'])
    })

    test('show_snackbar accepts string or object', async () => {
        await store.dispatch('show_snackbar', 'hello')
        expect(store.state.tmp.snackbar).toEqual({msg: 'hello'})
        await store.dispatch('show_snackbar', {msg: 'x', btn_label: 'y'})
        expect(store.state.tmp.snackbar).toEqual({msg: 'x', btn_label: 'y'})
    })

    test('show_dialog resolves when closed and clears state', async () => {
        const promise = store.dispatch('show_dialog', {component: {}}) as Promise<unknown>
        await Promise.resolve()
        const dialog = store.state.tmp.dialog!
        expect(dialog).not.toBe(null)
        dialog.resolve!('value')
        expect(await promise).toBe('value')
        await Promise.resolve()
        expect(store.state.tmp.dialog).toBe(null)
    })

    test('new dialog replaces existing non-persistent one', async () => {
        const first = store.dispatch('show_dialog', {component: {}}) as Promise<unknown>
        await Promise.resolve()
        const second = store.dispatch('show_dialog', {component: {}}) as Promise<unknown>
        expect(await first).toBeUndefined()
        await Promise.resolve()
        expect(store.state.tmp.dialog).not.toBe(null)  // Second still open
        store.state.tmp.dialog!.resolve!()
        await second
    })

    test('persistent dialog is not replaced by non-persistent', async () => {
        void store.dispatch('show_waiting', 'Waiting...')
        await Promise.resolve()
        const persistent = store.state.tmp.dialog as StateTmpDialog
        expect(persistent.persistent).toBe(true)
        expect(persistent.props).toEqual({title: 'Waiting...'})
        expect(await store.dispatch('show_dialog', {component: {}})).toBeUndefined()
        expect(store.state.tmp.dialog).toBe(persistent)
        await store.dispatch('close_dialog')
        expect(store.state.tmp.dialog).toBe(null)
    })

    test('set_dark updates vuetify', async () => {
        self.app_vue = {$vuetify: {theme: {dark: false}}} as unknown as Vue
        await store.dispatch('set_dark', true)
        expect(store.state.dark).toBe(true)
        expect(self.app_vue.$vuetify.theme.dark).toBe(true)
    })

    test('viewport size updated on resize', () => {
        Object.defineProperty(document.documentElement, 'clientWidth', {value: 123,
            configurable: true})
        self.dispatchEvent(new Event('resize'))
        expect(store.state.tmp.viewport_width).toBe(123)
    })
})
