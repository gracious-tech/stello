/* eslint-disable @typescript-eslint/no-explicit-any -- needed when prop no longer exists */

import {expect} from '@playwright/test'
import {openDB, StoreNames} from 'idb/with-async-ittr-cjs'

import {NativeBrowser} from '../../services/native/native_browser'
import {to_12_from_0, _to1_creates} from './migrations'
import {to_12_from_1plus, to_12_from_1plus_async} from './migrations_pre12'
import {AppDatabaseConnection, AppDatabaseSchema, VersionChangeTransaction} from './types'


// GLOBAL MOCKS

// Implement self (node does not have by default)
global.self = global as Window & typeof globalThis

// Fake crypto that returns a constant string 'crypto_key' when generateKey is called
global.crypto = ({subtle: {generateKey: async () => 'crypto_key'}}) as unknown as Crypto

// Some migrations use String.replaceAll
// @ts-ignore Doesn't need to fully mock
String.prototype.replaceAll = function(old_val:string, new_val:string){
    return this.split(old_val).join(new_val)
}

// Some migrations access app_native
global.app_native = new NativeBrowser()
global.app_native.read_file = async () => new ArrayBuffer(0)


// STORE SPECS


interface StoresSpec {
    [name:string]:{
        key_path:string|string[],
        indexes:{
            [name:string]: string|string[]
        }
    }
}


export const STORES_V12 = {
    contacts: {
        key_path: 'id',
        indexes: {
            by_service_account: 'service_account',
            by_address: 'address',
        },
    },
    copies: {
        key_path: 'id',
        indexes: {
            by_msg: 'msg_id',
            by_contact: 'contact_id',
            by_resp_token: 'resp_token',
        },
    },
    drafts: {
        key_path: 'id',
        indexes: {},
    },
    groups: {
        key_path: 'id',
        indexes: {
            by_service_account: 'service_account',
        },
    },
    messages: {
        key_path: 'id',
        indexes: {},
    },
    oauths: {
        key_path: 'id',
        indexes: {
            by_issuer_id: ['issuer', 'issuer_id'],
        },
    },
    profiles: {
        key_path: 'id',
        indexes: {},
    },
    reactions: {
        key_path: 'id',
        indexes: {
            by_msg: 'msg_id',
            by_contact: 'contact_id',
        },
    },
    reads: {
        key_path: 'id',
        indexes: {
            by_msg: 'msg_id',
        },
    },
    replies: {
        key_path: 'id',
        indexes: {
            by_msg: 'msg_id',
            by_contact: 'contact_id',
        },
    },
    request_address: {
        key_path: 'contact',
        indexes: {},
    },
    request_resend: {
        key_path: ['contact', 'message'],
        indexes: {},
    },
    sections: {
        key_path: 'id',
        indexes: {},
    },
    state: {
        key_path: 'key',
        indexes: {},
    },
    unsubscribes: {
        key_path: ['profile', 'contact'],
        indexes: {
            by_profile: 'profile',
            by_contact: 'contact',
        },
    },
}


export const STORES_V19 = {
    subscribe_forms: {
        key_path: 'id',
        indexes: {
            by_profile: 'profile',
        },
    },
    request_subscribe: {
        key_path: 'id',
        indexes: {},
    },
}


export const STORES_LATEST = {...STORES_V12, ...STORES_V19}


// UTILS


function expect_toEqualSet(iterable1:Iterable<unknown>, iterable2:Iterable<unknown>){
    // Wrapper for expecting two iterables to have the same members (ignoring order)
    expect(new Set(iterable1)).toEqual(new Set(iterable2))
}


export async function open_db(name:string, version:number,
        migrate_fn:(transaction:VersionChangeTransaction, old_version:number)=>void,
        migrate_async_fn:(db:AppDatabaseConnection, old_version:number)=>Promise<void>=async()=>{}){
    // Mimic usual database connection
    let old_version_cache:number
    const db_conn = await openDB<AppDatabaseSchema>(name, version, {
        upgrade(db, old_version, new_version, transaction){
            old_version_cache = old_version
            void migrate_fn(transaction, old_version)
        },
    })
    await migrate_async_fn(db_conn, old_version_cache!)
    return db_conn
}


export async function test_stores(db:AppDatabaseConnection, spec:StoresSpec){
    // Test database stores are setup properly
    // NOTE Loops iter db props rather than spec for better typing (keys tested before looping)

    // Confirm all stores exist
    expect_toEqualSet(db.objectStoreNames, Object.keys(spec))

    for (const store_name of db.objectStoreNames){
        const store = db.transaction(store_name).objectStore(store_name)
        const props = spec[store_name]!

        // Confirm key path for each store is correct
        expect(store.keyPath).toEqual(props.key_path)

        // Confirm all indexes for store exist
        expect_toEqualSet(store.indexNames, Object.keys(props.indexes))

        for (const index_name of store.indexNames){

            // Confirm all indexes have correct key paths
            expect(store.index(index_name).keyPath).toEqual(props.indexes[index_name])
        }
    }
}


// PRE-V12 MIGRATIONS


export async function to_12_from_1(){
    // Test migrating from 1 (assuring all 1-12 migrations run properly)

    // Run store/index creates for version 1
    let db = await open_db('to_12_from_1', 1, async transaction => {
        await _to1_creates(transaction)
        // Must create oauths store early so can add data to it
        const oauths = transaction.db.createObjectStore('oauths', {keyPath: 'id'})
        oauths.createIndex('by_issuer_id', ['issuer', 'issuer_id'])
    })

    // DATA

    const data:Record<string, {before:unknown, after:unknown}> = {

        contacts: {
            before: {
                id: 'id',
            },
            after: {
                id: 'id',
                service_account: null,
                service_id: null,
                multiple: false,
            },
        },

        groups: {
            before: {
                id: 'id',
            },
            after: {
                id: 'id',
                service_account: null,
                service_id: null,
            },
        },

        replies: {
            before: {
                id: 'id',
                read: false,
            },
            after: {
                id: 'id',
                subsection_id: null,
                read: true,
                archived: false,
            },
        },

        copies: {
            before: {
                id: 'id',
            },
            after: {
                id: 'id',
                contact_multiple: false,
                expired: false,
                secret_sse: 'crypto_key' as unknown as CryptoKey,
            },
        },

        reactions: {
            before: {
                id: 'id',
                copy_id: 'copy_id',
                section_id: 'section_id',
                read: false,
            },
            after: {
                id: 'copy_id-section_id-null',
                copy_id: 'copy_id',
                section_id: 'section_id',
                subsection_id: null,
                read: true,
                archived: false,
                replied: false,
            },
        },

        drafts: {
            before: {
                id: 'id',
                sections: ['section'],
                options_identity: {},
            },
            after: {
                id: 'id',
                sections: [['section']],
                options_identity: {
                    invite_image: null,
                },
            },
        },

        messages: {
            before: {
                id: 'id',
                draft: {
                    sections: ['section'],
                    options_identity: {},
                    options_security: {},
                },
            },
            after: {
                id: 'id',
                expired: false,
                lifespan: Infinity,
                max_reads: Infinity,
                draft: {
                    sections: [['section']],
                    options_identity: {
                        invite_image: null,
                    },
                    options_security: {},
                },
            },
        },

        sections: {
            before: {
                id: 'id',
                half_width: true,  // To be removed
                content: {
                    type: 'video',
                },
            },
            after: {
                id: 'id',
                respondable: true,
                content: {
                    type: 'video',
                    caption: '',
                },
            },
        },

        oauths: {
            before: {
                id: 'id',
                issuer: 'microsoft',
            },
            after: undefined,
        },

        profiles: {
            before: {
                id: 'id',
                setup_step: 1,
                smtp: {
                    port: '587',
                },
                host: {
                    credentials_responder: {},  // To be deleted
                },
                host_state: {
                    displayer_config_uploaded: true,
                    responder_config_uploaded: true,
                },
                options: {},
                msg_options_identity: {
                    invite_tmpl_email: 'CONTACT|SENDER|SUBJECT|LINK',
                },
                smtp_providers: {},  // To be deleted
            },
            after: {
                id: 'id',
                setup_step: 0,
                smtp: {
                    oauth: null,
                    port: 587,
                    starttls: true,
                },
                host: {},
                host_state: {
                    secret: 'crypto_key',
                    displayer_config_uploaded: false,
                    responder_config_uploaded: false,
                },
                options: {
                    reply_invite_image: 'default_invite_image_blob',
                    reply_invite_tmpl_email:
                        "<p>Hi <span data-mention data-id='contact_hello'></span>,</p>"
                        + "<p><span data-mention data-id='sender_name'>"
                        + "</span> has replied to you.</p>",
                    reaction_options: ['like', 'love', 'yay', 'pray', 'laugh', 'wow', 'sad'],
                },
                msg_options_identity: {
                    invite_image: 'default_invite_image_blob',
                    invite_tmpl_email: '<span data-mention data-id="contact_hello"></span>|'
                        + '<span data-mention data-id="sender_name"></span>|'
                        + '<span data-mention data-id="msg_title"></span>|',
                },
            },
        },
    }

    // Save initial data to db
    for (const [store_name, obj] of Object.entries(data)){
        await db.put(store_name as StoreNames<AppDatabaseSchema>, obj.before as any)
    }

    // Save additional records
    await db.put('reactions', {
        id: 'deleteme',
        copy_id: null,  // Records with no copy_id get deleted
    } as any)

    // Close and reopen db so can apply migrations
    db.close()
    db = await open_db('to_12_from_1', 12, to_12_from_1plus, to_12_from_1plus_async)

    // Confirm all stores are as expected
    await test_stores(db, STORES_V12)

    // Confirm all data is as expected
    for (const store_name of Object.keys(data)){
        const id = store_name === 'reactions' ? 'copy_id-section_id-null' : 'id'
        const obj = await db.get(store_name as StoreNames<AppDatabaseSchema>, id)
        expect(obj).toEqual(data[store_name]!.after)
    }

    // Test additional records
    expect(await db.get('reactions', 'deleteme')).toEqual(undefined)
}


export async function to_12_from_11(){
    // Test migrating from 11 (assures all 1-12 migrations are rerun safe)

    // Run store/index creates for versions 1-11
    let db = await open_db('to_12_from_11', 11, to_12_from_0)

    // DATA

    const data:Record<string, unknown> = {

        contacts: {
            id: 'id',
            service_account: 'unchanged',
            service_id: 'unchanged',
            multiple: true,
        },

        groups: {
            id: 'id',
            service_account: 'unchanged',
            service_id: 'unchanged',
        },

        replies: {
            id: 'id',
            subsection_id: 'unchanged',
            read: false,
            archived: true,
        },

        copies: {
            id: 'id',
            contact_multiple: true,
            expired: true,
            secret_sse: 'unchanged' as unknown as CryptoKey,
        },

        reactions: {
            id: 'copy_id-section_id-subsection_id',
            copy_id: 'copy_id',
            section_id: 'section_id',
            subsection_id: 'subsection_id',
            read: false,
            archived: true,
            replied: true,
        },

        drafts: {
            id: 'id',
            sections: [['section']],
            options_identity: {invite_image: 'unchanged'},
        },

        messages: {
            id: 'id',
            expired: true,
            lifespan: 77,
            max_reads: 77,
            draft: {
                sections: [['section']],
                options_identity: {invite_image: 'unchanged'},
                options_security: {},
            },
        },

        sections: {
            id: 'id',
            respondable: false,
            content: {
                type: 'video',
                caption: 'unchanged',
            },
        },

        oauths: {
            id: 'id',  // Shouldn't be deleted as not created before v11
            issuer: 'microsoft',
        },

        profiles: {
            id: 'id',
            setup_step: null,
            smtp: {
                oauth: 'id',  // Must match existing oauth's id
                port: 587,
                starttls: false,
            },
            host: {},
            host_state: {
                secret: 'unchanged',
                displayer_config_uploaded: false,
                responder_config_uploaded: false,
            },
            options: {
                reply_invite_image: 'unchanged',
                reply_invite_tmpl_email:
                    'CONTACT <span data-mention data-id="contact_hello"></span>',
                reaction_options: ['unchanged'],
            },
            msg_options_identity: {
                invite_image: 'unchanged',
                invite_tmpl_email:
                    'CONTACT <span data-mention data-id="contact_hello"></span>',
            },
        },

        reads: {
            id: 'id',
        },

        request_address: {
            contact: 'id',
        },

        request_resend: {
            contact: 'id',
            message: 'id',
        },

        state: {
            key: 'id',
        },

        unsubscribes: {
            profile: 'id',
            contact: 'id',
        },
    }

    // Save initial data to db
    for (const [store_name, obj] of Object.entries(data)){
        await db.put(store_name as StoreNames<AppDatabaseSchema>, obj as any)
    }

    // Close and reopen db so can apply migrations
    db.close()
    db = await open_db('to_12_from_11', 12, to_12_from_1plus, to_12_from_1plus_async)

    // Confirm all stores are as expected
    await test_stores(db, STORES_V12)

    // Confirm data hasn't changed
    // NOTE Loops through existing store names to ensure all accounted for
    for (const store_name of db.objectStoreNames){
        let id:string|[string, string]|IDBKeyRange = 'id'
        if (store_name === 'reactions')
            id = 'copy_id-section_id-subsection_id'
        if (store_name === 'request_resend' || store_name === 'unsubscribes')
            id = ['id', 'id']
        const obj = await db.get(store_name, id)
        expect(obj).toEqual(data[store_name])
        // If test data undefined, will actually succeed by finding no record, so throw if so
        // NOTE store_name used in comparison so easier to debug when fails
        expect(obj && store_name).toEqual(store_name)
    }
}
