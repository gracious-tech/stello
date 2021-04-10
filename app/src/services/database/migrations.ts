
import {IDBPTransaction, StoreNames} from 'idb'

import {AppDatabaseSchema, RecordProfile} from './types'


type VersionChangeTransaction = IDBPTransaction<
    AppDatabaseSchema,
    StoreNames<AppDatabaseSchema>[],
    'versionchange'
>


export const DATABASE_VERSION = 5


export async function to5(transaction:VersionChangeTransaction){
    // Order of steps changed so reset all progress to start (settings still saved)
    const profiles:Record<string, RecordProfile> = {}
    for await (const cursor of transaction.objectStore('profiles')){
        profiles[cursor.value.id] = cursor.value
        if (cursor.value.setup_step !== null){  // i.e. not fully setup yet
            cursor.value.setup_step = 0
            cursor.update(cursor.value)
        }
    }
    // Previously didn't store determined expiration values on messages
    for await (const cursor of transaction.objectStore('messages')){
        // NOTE Slight chance profile may have changed or been deleted but low risk
        const profile = profiles[cursor.value.draft.profile]
        cursor.value.lifespan = cursor.value.draft.options_security.lifespan
            ?? profile?.msg_options_security.lifespan ?? Infinity
        cursor.value.max_reads = cursor.value.draft.options_security.max_reads
            ?? profile?.msg_options_security.max_reads ?? Infinity
        cursor.update(cursor.value)
    }
}
