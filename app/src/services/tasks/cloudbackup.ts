
import {Task} from './tasks'
import {concurrent} from '@/services/utils/async'
import {OAuth} from '../database/oauths'
import {oauth_request} from './oauth'
import {import_database} from '../backup/database'
import {run_database_backup} from '../backup/generic'
import {encrypt_sym, decrypt_sym, password_to_key, random_buffer} from '../utils/crypt'
import {MustReauthenticate, MustWait, MustRecover, MustInterpret, MustMakeSpace}
    from '../utils/exceptions'
import {buffer_to_base64, base64_to_buffer, string_to_utf8, utf8_to_string} from '../utils/coding'

// NOTE All Drive filenames are prefixed with backup_ to avoid potential future clashes


export async function cloudbackup_size_estimates():Promise<{database:string, all:string}>{
    // Estimate cloud backup sizes for each level by measuring total Internal Files
    const database_mb = 5
    const size_total = await self.app_native.user_file_size_total('Internal Files')
    const all_mb = database_mb + Math.ceil(size_total / 1000 / 1000)
    return {
        database: `~${database_mb} MB`,
        all: `~${all_mb} MB`,
    }
}


interface BackupMeta {
    salt:string  // Must be available unencrypted to recover using only password
    dbid:string  // Needed to avoid accidently overwriting a backup for new Stello db
}


async function get_meta(oauth:OAuth, drive_map:Map<string, string>)
        :Promise<BackupMeta|null>{
    // Fetch and parse the backup metadata file from Drive, or return null if it doesn't exist
    const existing_id = drive_map.get('backup_meta.json')
    if (!existing_id){
        return null
    }
    const buffer = await drive_download_file_google(oauth, existing_id)
    return JSON.parse(utf8_to_string(buffer)) as BackupMeta
}


async function create_meta_and_init_key(oauth:OAuth, dbid:string, password:string):Promise<void>{
    // Create fresh key and metadata with a new random salt

    // Create the key using password and salt
    const salt = random_buffer(16)
    const key = await password_to_key(password, salt)
    self.app_store.commit('dict_set', ['cloudbackup_key', key])

    // Upload meta file to record dbid and salt so can recover with only password
    const meta:BackupMeta = {
        dbid,
        salt: buffer_to_base64(salt),
    }
    await drive_upload_file_google(oauth, 'backup_meta.json', string_to_utf8(JSON.stringify(meta)))
}



// GOOGLE DRIVE API HELPERS


async function drive_request_google(oauth:OAuth, path:string, params?:Record<string, string>,
        method='GET', body?:Blob):Promise<Response>{
    // Make a Drive API request, interpreting common error codes
    const url = `https://www.googleapis.com/${path}`
    const resp = await oauth_request(oauth, url, params, method, body)
    if (resp.ok){
        return resp
    }
    if (resp.status === 401){
        throw new MustReauthenticate()  // Token expired or revoked
    } else if (resp.status === 403){
        // Check if the error is due to storage quota being exceeded
        const body_403 = await resp.json() as {error?:{errors?:{reason?:string}[]}}
        const reason = body_403?.error?.errors?.[0]?.reason
        if (reason === 'storageQuotaExceeded'){
            throw new MustMakeSpace()
        }
        throw new MustReauthenticate()  // Insufficient scope (e.g. Drive permission not granted)
    } else if (resp.status === 404){
        throw new MustRecover()  // File deleted externally
    } else if (resp.status === 429){
        throw new MustWait()  // Rate limited
    } else if (resp.status >= 500 && resp.status < 600){
        throw new MustWait()  // Transient server error
    }
    throw new MustInterpret({status: resp.status, body: await resp.json() as unknown})
}


export async function get_backup_dbid(oauth:OAuth):Promise<string|null>{
    // Get the dbid from Drive backup metadata, querying for meta.json directly by name
    const resp = await drive_request_google(oauth, 'drive/v3/files', {
        spaces: 'appDataFolder',
        q: "name='backup_meta.json'",
    })
    const json = await resp.json() as {files:{id:string}[]}
    const file_id = json.files[0]?.id
    if (!file_id)
        return null
    const buffer = await drive_download_file_google(oauth, file_id)
    return (JSON.parse(utf8_to_string(buffer)) as BackupMeta).dbid
}


export async function drive_wipe_all_google(oauth:OAuth):Promise<void>{
    // Delete all files in the app's Drive appDataFolder
    const files = await drive_list_files_google(oauth)
    await Promise.all(files.map(f => drive_delete_file_google(oauth, f.id)))
}


async function drive_list_files_google(oauth:OAuth):Promise<{id:string, name:string}[]>{
    // List all files in the app's Drive appDataFolder, paginating through all results
    const files:({id:string, name:string})[] = []
    let page_token:string|undefined
    do {
        const params:Record<string, string> = {
            spaces: 'appDataFolder',
            pageSize: '1000',
        }
        if (page_token){
            params['pageToken'] = page_token
        }
        const resp = await drive_request_google(oauth, 'drive/v3/files', params)
        const json = await resp.json() as {files:{id:string, name:string}[], nextPageToken?:string}
        files.push(...json.files)
        page_token = json.nextPageToken
    } while (page_token)
    return files
}


async function drive_upload_file_google(oauth:OAuth, name:string, buffer:ArrayBuffer)
        :Promise<string>{
    // Upload a file to the app's Drive appDataFolder, returning the new file id
    // NOTE Drive allows duplicate filenames — always delete existing file before re-uploading

    // This meta is required by Google Drive to use the appDataFolder
    const meta = JSON.stringify({name, parents: ['appDataFolder']})

    // Multipart format is required by Google Drive for adding the metadata to the file
    const boundary = 'stello_backup_boundary'
    const body = new Blob(
        [
            `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
            meta,
            `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
            buffer,
            `\r\n--${boundary}--`,
        ],
        {type: `multipart/related; boundary=${boundary}`},
    )
    const resp = await drive_request_google(oauth, 'upload/drive/v3/files',
        {uploadType: 'multipart'}, 'POST', body)
    const json = await resp.json() as {id:string}
    return json.id
}


async function drive_delete_file_google(oauth:OAuth, file_id:string):Promise<void>{
    // Delete a file from Drive by id (404 means already deleted, which is fine)
    try {
        await drive_request_google(oauth, `drive/v3/files/${file_id}`, undefined, 'DELETE')
    } catch(error){
        if (!(error instanceof MustRecover)){
            throw error
        }
    }
}


async function drive_download_file_google(oauth:OAuth, file_id:string):Promise<ArrayBuffer>{
    // Download a Drive file's content
    // NOTE alt=media needed to ensure contents is in response body
    const resp = await drive_request_google(oauth, `drive/v3/files/${file_id}`, {alt: 'media'})
    return resp.arrayBuffer()
}


// TASK FUNCTIONS


export async function storage_oauth_setup(task:Task):Promise<void>{
    // A task for storing the OAuth connection after auth'ing and enabling cloud storage
    const [oauth_id] = task.params as [string]
    const oauth = await self.app_db.oauths.get(oauth_id)
    if (!oauth){
        throw task.abort("No longer have access to Google account")
    }

    // Refuse to enable cloud storage unless the storage scope was actually granted
    // Google's consent screen lets users deselect individual scopes, so verify before committing
    if (!oauth.scope_sets.includes('storage')){
        throw task.abort("Google Drive permission was not granted")
    }

    self.app_store.commit('dict_set', ['storage_oauth', oauth.id])
}


export async function cloudbackup_sync(task:Task):Promise<void>{
    // Back up the database (and optionally Internal Files) to Google Drive

    const oauth_id = self.app_store.state.storage_oauth as string|null
    const oauth = oauth_id ? await self.app_db.oauths.get(oauth_id) : undefined
    if (!oauth){
        throw task.abort("No longer have access to Google account")
    }

    task.label = "Backing up to Google Drive"
    task.show_count = true
    task.fix_oauth = oauth_id

    // If starting a fresh backup, wipe Drive first so everything re-encrypts with the given key
    const [fresh_backup_password] = task.options as [string?]
    let drive_files = await drive_list_files_google(oauth)
    if (fresh_backup_password !== undefined){
        await Promise.all(drive_files.map(f => drive_delete_file_google(oauth, f.id)))
        drive_files = []
        self.app_store.commit('dict_set', ['cloudbackup_key', null])
    }

    // Maintain map between file names and internal Google ids
    const drive_map = new Map(drive_files.map(f => [f.name, f.id]))

    // Get or create backup metadata, aborting silently if from a different database
    const current_dbid = self.app_store.state.dbid
    const meta = await get_meta(oauth, drive_map)
    if (!meta){
        // First sync or force resync — create meta and derive the key from the new salt
        await create_meta_and_init_key(oauth, current_dbid, fresh_backup_password ?? '')
    } else if (meta.dbid !== current_dbid){
        throw task.abort("Backup belongs to a different database")
    }

    // Get the key (new or existing)
    const key = self.app_store.state.cloudbackup_key as CryptoKey

    // Save local backup and reuse the exported buffer for the encrypted cloud upload
    const db_buffer = await run_database_backup()

    // Database backup — delete old copy first then upload fresh (Drive doesn't overwrite by name)
    task.upcoming(1)
    const existing_db_id = drive_map.get('backup_database.json')
    if (existing_db_id){
        await drive_delete_file_google(oauth, existing_db_id)
    }
    const encrypted_db = await encrypt_sym(db_buffer, key)
    await task.expected(drive_upload_file_google(oauth, 'backup_database.json', encrypted_db))

    // Internal Files sync — reconcile backup_files_* against local files
    // When level is 'database', the desired set is empty so any existing backup_files_* are deleted
    const local_names = self.app_store.state.cloudbackup === 'all'
        ? new Set(await self.app_native.user_file_list('Internal Files'))
        : new Set<string>()
    const drive_internal = drive_files.filter(f => f.name.startsWith('backup_files_'))

    // Internal Files are immutable (see blobstore.ts) so only sync new/deleted, not changed
    // Drive names are prefixed, so strip prefix when comparing against local names
    const drive_name_set = new Set(
        drive_internal.map(f => f.name.slice('backup_files_'.length)))
    const to_delete = drive_internal.filter(
        f => !local_names.has(f.name.slice('backup_files_'.length)))
    const to_upload = [...local_names].filter(name => !drive_name_set.has(name))

    // We know in advance how many subtasks there will be
    task.upcoming(to_delete.length + to_upload.length)

    // Add subtasks
    const delete_tasks = to_delete.map(file =>
        () => task.expected(drive_delete_file_google(oauth, file.id)))
    const upload_tasks = to_upload.map(name => async () => {
        const raw = await self.app_native.user_file_read(`Internal Files/${name}`)
        if (raw === null)
            throw new Error(`Blob file not found: ${name}`)
        const encrypted = await encrypt_sym(raw, key)
        await task.expected(drive_upload_file_google(oauth, `backup_files_${name}`, encrypted))
    })
    await concurrent([...delete_tasks, ...upload_tasks])

    // Record completion time after all files are done successfully
    self.app_store.commit('dict_set', ['cloudbackup_last', new Date()])
}


export async function cloudbackup_restore_direct(oauth_id:string, password:string)
        :Promise<{added:number, skipped:number}>{
    // Restore the database from a Google Drive backup (standalone, not via task manager)

    // Validate that we still have a usable OAuth token
    const oauth = await self.app_db.oauths.get(oauth_id)
    if (!oauth){
        throw new Error("No longer have access to Google account")
    }

    // Fetch the Drive file list and locate the metadata
    const drive_files = await drive_list_files_google(oauth)
    const drive_map = new Map(drive_files.map(f => [f.name, f.id]))

    // Validate the backup metadata exists and belongs to a different database
    const meta = await get_meta(oauth, drive_map)
    if (!meta){
        throw new Error("No backup metadata found — backup may be corrupted")
    }
    if (meta.dbid === self.app_store.state.dbid){
        throw new Error("Backup is from this database — restore is only for new installations")
    }

    // Derive the encryption key from the meta salt and supplied password
    const key = await password_to_key(password, base64_to_buffer(meta.salt))

    // Download and decrypt the database backup
    const db_file = drive_files.find(f => f.name === 'backup_database.json')
    if (!db_file){
        throw new Error("No database backup found on Google Drive")
    }
    const encrypted = await drive_download_file_google(oauth, db_file.id)
    let buffer:ArrayBuffer
    try {
        buffer = await decrypt_sym(encrypted, key)
    } catch {
        throw new Error("Incorrect password — cannot decrypt backup")
    }

    // Import database and record result
    const result = await import_database(buffer)

    // Restore Internal Files if backed up (decrypt and write each to local storage)
    const internal_files = drive_files.filter(f => f.name.startsWith('backup_files_'))
    await concurrent(internal_files.map(file => async () => {
        const encrypted_file = await drive_download_file_google(oauth, file.id)
        const raw = await decrypt_sym(encrypted_file, key)
        const local_name = file.name.slice('backup_files_'.length)
        await self.app_native.user_file_write(`Internal Files/${local_name}`, raw)
    }))

    return result
}
