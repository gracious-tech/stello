
// Shared fixtures for app unit tests (fresh db, in-memory native platform, minimal store)

import 'fake-indexeddb/auto'
import {vi} from 'vitest'

import {Database} from '@/services/database/database'
import {migrate, migrate_async, DATABASE_VERSION} from '@/services/database/migrations'
import {open_db} from '@/services/database/migrations.test_utils'
import {NativeBrowser} from '@/services/native/native_browser'
import {nested_objects_set} from '@/services/utils/objects'
import {generate_token} from '@/services/utils/crypt'

import type {AppStoreState} from '@/services/store/types'


// Counter so every db has a unique name and tests never share state
let db_counter = 0


export async function new_db():Promise<Database>{
    // Create a fresh fully-migrated database and make it the global app db
    const conn = await open_db(`test_${db_counter++}_${generate_token()}`, DATABASE_VERSION,
        migrate, migrate_async)
    const db = new Database(conn)
    self.app_db = db
    return db
}


export class MemoryNative extends NativeBrowser {
    // Native platform that stores user files in memory so file logic can be tested

    files = new Map<string, ArrayBuffer>()
    removed:string[] = []
    app_files = new Map<string, ArrayBuffer>()

    override async app_file_read(path:string):Promise<ArrayBuffer>{
        return this.app_files.get(path) ?? new Uint8Array([1, 2, 3]).buffer
    }

    override async user_file_list(path:string):Promise<string[]>{
        // List immediate children of the given dir
        const prefix = path ? `${path}/` : ''
        const names = new Set<string>()
        for (const key of this.files.keys()){
            if (key.startsWith(prefix)){
                names.add(key.slice(prefix.length).split('/')[0]!)
            }
        }
        return [...names]
    }

    override async user_file_size_total(path:string):Promise<number>{
        let total = 0
        for (const [key, value] of this.files){
            if (key.startsWith(`${path}/`)){
                total += value.byteLength
            }
        }
        return total
    }

    override async user_file_read(path:string):Promise<ArrayBuffer|null>{
        return this.files.get(path) ?? null
    }

    override async user_file_write(path:string, data:ArrayBuffer):Promise<void>{
        this.files.set(path, data)
    }

    override async user_file_remove(path:string):Promise<void>{
        // Removes file or whole dir
        this.removed.push(path)
        for (const key of [...this.files.keys()]){
            if (key === path || key.startsWith(`${path}/`)){
                this.files.delete(key)
            }
        }
    }
}


export function new_native():MemoryNative{
    // Create a fresh in-memory native platform and make it the global one
    const native = new MemoryNative()
    self.app_native = native
    return native
}


export interface MockStore {
    state:AppStoreState
    commit:ReturnType<typeof vi.fn>
    dispatch:ReturnType<typeof vi.fn>
}


export function new_store(state:Partial<AppStoreState>={}):MockStore{
    // Create a minimal store supporting the mutations services use, and make it the global one
    const full_state = {
        dbid: 'test_dbid',
        backups: 'all',
        dark: false,
        dark_message: false,
        default_profile: null,
        default_template: null,
        default_contacts: null,
        manager_aws_key_id: '',
        manager_aws_max_lifespan: Infinity,
        fallback_secret: null,
        storage_oauth: null,
        cloudbackup: null,
        cloudbackup_key: null,
        cloudbackup_last: null,
        usage_installed: null,
        usage_opens: 0,
        usage_sends: 0,
        show_splash_welcome: true,
        show_splash_disclaimer: true,
        show_guide_default: true,
        show_blobstore_migrate: true,
        show_cloudbackup_suggest: true,
        dismissed_dbids: [],
        dismissed_features: '',
        tmp: {
            viewport_width: 1000,
            viewport_height: 1000,
            snackbar: null,
            dialog: null,
            prev_route: null,
            prev_state_contacts: null,
            cut_section: null,
            closing: false,
            restore_backup: null,
            unread_replies: {},
            unread_reactions: {},
            uploaded: null,
            invited: null,
            manager_aws_key_secret: '',
        },
        ...state,
    } as AppStoreState

    const store:MockStore = {
        state: full_state,
        commit: vi.fn((type:string, payload:[string|MinOne<string>, unknown]) => {
            const [key, value] = payload
            if (type === 'dict_set'){
                // NOTE Assertion gives `[key]` a tuple type so is needed (rule's false positive)
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                const keys = (Array.isArray(key) ? key : [key]) as MinOne<string>
                nested_objects_set(full_state, keys, value)
            } else if (type === 'tmp_set'){
                (full_state.tmp as Record<string, unknown>)[key as string] = value
            }
        }),
        dispatch: vi.fn(async () => undefined),
    }
    self.app_store = store as unknown as typeof self.app_store
    return store
}


export function mock_report_error(){
    // Replace global error reporter with a spy
    const spy = vi.fn((error:unknown) => 'report_id')
    self.app_report_error = spy
    return spy
}


export async function setup_globals(state:Partial<AppStoreState>={}){
    // Convenience for setting up all globals at once
    const native = new_native()
    const store = new_store(state)
    const report_error = mock_report_error()
    const db = await new_db()
    return {native, store, report_error, db}
}


export function json_response(data:unknown, status=200):Response{
    // Create a fetch Response with a JSON body
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
    })
}
