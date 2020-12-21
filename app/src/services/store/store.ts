
import Vue from 'vue'
import {Store, StoreOptions} from 'vuex'

import {sleep} from '@/services/utils/async'
import {type_of} from '@/services/utils/exceptions'
import {nested_objects_set, nested_objects_update} from '@/services/utils/objects'
import {get_initial_state, KEY_SEPARATOR} from './store_state'
import {AppStoreState, StateTmpDialog} from './types'
import {Database} from '@/services/database/database'
import {Task} from '@/services/tasks'
import {receive_responses} from '../receiving'
import {Sender} from '../sending'


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

    // Strict mode disabled as wouldn't allow manipulation of dialog properties
    // strict: process.env.NODE_ENV !== 'production',  // Expensive, so don't run in production

    state: await get_initial_state(db),

    mutations: {

        dict_set(state, [key_or_keys, value]:[string|string[], any]):void{
            // Both set a value in the store and save it in the db

            // May have been given single key string, so convert to array to make simpler
            // NOTE Copy key_or_keys so original preserved for Vuex debugger to access
            const keys = Array.isArray(key_or_keys) ? key_or_keys.slice() : [key_or_keys]

            // Set in store
            nested_objects_set(state, keys, value)

            // Save in db
            // NOTE Below is async but does not affect app at all so ok in mutation
            const db_key = keys.join(KEY_SEPARATOR)
            db.state.set({key: db_key, value})
        },

        tmp_set(state, [key, value]:[string, any]):void{
            // Set a value in the store's tmp object (not saved to db)
            // If both target and value are objects, do a nested update
            // NOTE Still allows replacement if old or new value is null
            if (type_of(state.tmp[key]) === 'object' && type_of(value) === 'object'){
                nested_objects_update(state.tmp[key], value)
            } else {
                state.tmp[key] = value
            }
        },

        tmp_new(state, [container, key, value]:[string, string, any]):void{
            // Add a new property (or set existing) on a containing object
            Vue.set(state.tmp[container], key, value)
        },

        tmp_add(state, [key, item]:[string, any]):void{
            // Append an item to an array in tmp object
            state.tmp[key].push(item)
        },
    },

    getters: {
        active_tasks(state){
            // Return only tasks that aren't done yet
            return state.tmp.tasks.filter(t => !t.done)
        },
    },

    actions: {

        async show_snackbar({state, commit}, message:string):Promise<void>{
            // Display a message in a snackbar
            if (state.tmp.snackbar){
                // Another message already showing so trigger close and wait a moment
                // TODO In future might wait till its done or create queue system?
                commit('tmp_set', ['snackbar', false])
                await sleep(500)
            }
            commit('tmp_set', ['snackbar_text', message])
            commit('tmp_set', ['snackbar', true])
        },

        show_dialog({commit}, dialog:StateTmpDialog):void{
            // Show the specified dialog
            commit('tmp_set', ['dialog', dialog])
        },

        set_dark({commit}, value:boolean):void{
            // Change the value of dark and tell Vuetify about it
            commit('dict_set', ['dark', value])
            self._app.$vuetify.theme.dark = value
        },

        new_task({commit, getters}, args:any[]=[]):Task{
            // Create a new task
            // TODO Prevent all/some tasks running simultaneously (e.g. two receive tasks)
            const task = new Task(...args)

            // Add given task to end of tasks list
            // Also take opportunity to remove any completed tasks so array doesn't grow forever
            const tasks = [...getters.active_tasks, task]
            commit('tmp_set', ['tasks', tasks])

            // Return the created task
            return task
        },

        async send_message({dispatch}, msg_id:string):Promise<void>{
            // Send a message
            const task:Task = await dispatch('new_task')
            const sender = new Sender(msg_id)
            return task.complete(sender.send(task)).then(email_errors => {
                const actual_errors = email_errors.filter(i => !!i)
                if (actual_errors.length){
                    dispatch('show_snackbar', `Failed to send some emails (check sent folder)`)
                } else {
                    dispatch('show_snackbar', "Message sent successfully")
                }
            })
        },

        async check_for_responses({commit, dispatch, state}):Promise<void>{
            // Check for responses unless already doing so
            if (state.tmp.checking_responses){
                return
            }
            const task:Task = await dispatch('new_task')
            commit('tmp_set', ['checking_responses', true])
            try {
                await receive_responses(task)
            } catch (error){
                // TODO Provide better handling
                dispatch('show_snackbar', `Failed to check for responses (${error})`)
                console.error(error)
                task.done = true
            }
            commit('tmp_set', ['checking_responses', false])
        },
    },
}}
