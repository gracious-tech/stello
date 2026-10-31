
// Test-only native platform injected before app loads (app only uses NativeBrowser if unset)
// Stores user files in IndexedDB so blobs survive reloads, and reads app files from dev server
// NOTE Plain JS source as it's injected via page.addInitScript() into the browser as-is


export const NATIVE_SHIM = `
(() => {

    // Only apply to the app itself (not iframes, some of which are sandboxed without storage)
    if (self !== self.top){
        return
    }

    // Open (or create) a separate db just for user files
    const files_db = new Promise((resolve, reject) => {
        const request = self.indexedDB.open('e2e_native_files', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('files')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })

    // Helper for running a single request against the files store
    const files_request = (mode, fn) => files_db.then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction('files', mode)
        const request = fn(transaction.objectStore('files'))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () => reject(transaction.error)
    }))

    // Helper for listing the direct children of a dir
    const list_dir = async path => {
        const prefix = path.endsWith('/') ? path : path + '/'
        const keys = await files_request('readonly', store => store.getAllKeys())
        return keys.filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length))
            .filter(k => !k.includes('/'))
    }

    // Record of calls so tests can assert native features were used
    self.e2e_native_calls = []

    self.app_native = {
        get_paths: () => ({
            files_dir: '/e2e/files',
            data_dir: '/e2e/data',
            internal_files_dir: '/e2e/files/Internal Files',
            sep: '/',
        }),
        app_file_read: async path => {
            const resp = await self.fetch('/' + path)
            if (!resp.ok){
                throw new Error(\`App file missing: \${path}\`)
            }
            return resp.arrayBuffer()
        },
        user_file_list: list_dir,
        user_file_size_total: async path => {
            let total = 0
            for (const name of await list_dir(path)){
                const data = await files_request('readonly', s => s.get(\`\${path}/\${name}\`))
                total += data ? data.byteLength : 0
            }
            return total
        },
        user_file_read: async path => {
            const data = await files_request('readonly', store => store.get(path))
            return data ?? null
        },
        user_file_write: async (path, data) => {
            await files_request('readwrite', store => store.put(data, path))
        },
        user_file_remove: async path => {
            await files_request('readwrite', store => store.delete(path))
        },
        restart_after_update: () => {
            self.e2e_native_calls.push(['restart_after_update'])
        },
        dns_mx: async host => [],
        os_encrypt: async secret => null,
        os_decrypt: async encrypted => null,
        html_to_pdf: async (html, filename) => {
            self.e2e_native_calls.push(['html_to_pdf', filename])
            return null
        },
        test_email_settings: async (settings, auth) => {
            self.e2e_native_calls.push(['test_email_settings', settings.host])
            return settings.pass === 'bad' ? {code: 'auth', details: "Bad password"} : null
        },
        smtp_send: async (settings, email) => {
            self.e2e_native_calls.push(['smtp_send', email.to.address, email.subject])
            return null
        },
        on_update_ready: handler => {
            self.e2e_trigger_update = handler
        },
        on_oauth: handler => {
            self.e2e_trigger_oauth = handler
        },
    }
})()
`
