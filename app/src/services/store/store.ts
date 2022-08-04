
import Vue from 'vue'
import {Store, StoreOptions} from 'vuex'

import DialogGenericWait from '@/components/dialogs/generic/DialogGenericWait.vue'
import {nested_objects_set} from '@/services/utils/objects'
import {get_initial_state, KEY_SEPARATOR} from './store_state'
import {AppStoreState, StateTmpDialog} from './types'
import {Database} from '@/services/database/database'


export async function get_store(db:Database):Promise<Store<AppStoreState>>{
    // Returns an instance of the store

    // Init store
    const store = new Store(await get_store_options(db))

    // Update viewport dimensions whenever size changes
    self.addEventListener('resize', () => {
        store.commit('tmp_set', ['viewport_width', self.document.documentElement.clientWidth])
        store.commit('tmp_set', ['viewport_height', self.document.documentElement.clientHeight])
    })

    return store
}


async function get_store_options(db:Database):Promise<StoreOptions<AppStoreState>>{return {

    // NOTE Mutations allowed directly on `state` since Vuex is painful to use
    // TODO Convert from Vuex to a custom store

    state: await get_initial_state(db),

    mutations: {

        dict_set(state, [key_or_keys, value]:[string|MinOne<string>, unknown]):void{
            // Both set a value in the store and save it in the db

            // May have been given single key string, so convert to array to make simpler
            // NOTE Copy key_or_keys so original preserved for Vuex debugger to access
            const keys = Array.isArray(key_or_keys) ? key_or_keys.slice() : [key_or_keys]

            // Set in store
            nested_objects_set(state, keys as MinOne<string>, value)

            // Save in db
            // NOTE Below is async but does not affect app at all so ok in mutation
            const db_key = keys.join(KEY_SEPARATOR)
            void db.state.set({key: db_key, value})
        },

        tmp_set(state, [key, value]:[string, unknown]):void{
            // Set a value in the store's tmp object (not saved to db)
            state.tmp[key] = value
        },

        tmp_new(state, [container, key, value]:[string, string, unknown]):void{
            // Add a new property (or set existing) on a containing object
            Vue.set(state.tmp[container], key, value)
        },

        tmp_add(state, [key, item]:[string, unknown]):void{
            // Append an item to an array in tmp object
            state.tmp[key].push(item)
        },
    },

    actions: {

        async show_snackbar({commit}, arg:string|object):Promise<void>{
            // Display a message in a snackbar, and optionally include button
            commit('tmp_set', ['snackbar', typeof arg === 'string' ? {msg: arg} : arg])
        },

        async show_dialog({state, commit}, dialog:StateTmpDialog):Promise<unknown>{
            // Show the specified dialog

            // If a dialog is already open, try close it
            if (state.tmp.dialog){
                // If existing dialog is persistant and requested one isn't, assume more important
                if (state.tmp.dialog.persistent && !dialog.persistent){
                    return  // Ignore request to open dialog
                } else {
                    state.tmp.dialog.resolve!()
                }
            }

            // Create a new promise that is resolved with a value when dialog closed
            const p = new Promise(resolve => {
                // Add resolve fn to dialog object
                // WARN Must keep object same (no ...) so can compare below with ===
                dialog.resolve = resolve
                commit('tmp_set', ['dialog', dialog])
            })

            // Automatically clear the dialog state when closed
            void p.then(() => {
                // WARN Must only clear if is own state (could have been replaced already)
                if (state.tmp.dialog === dialog){
                    commit('tmp_set', ['dialog', null])
                }
            })

            return p
        },

        close_dialog({commit}){
            // Close any existing dialog
            commit('tmp_set', ['dialog', null])
        },

        show_waiting({dispatch}, title:string):void{
            // Show a waiting dialog that cannot be closed by user interaction
            void dispatch('show_dialog', {
                component: DialogGenericWait,
                persistent: true,
                props: {title},
            } as StateTmpDialog)
        },

        set_dark({commit}, value:boolean):void{
            // Change the value of dark and tell Vuetify about it
            commit('dict_set', ['dark', value])
            self.app_vue.$vuetify.theme.dark = value
        },
    },
}}
