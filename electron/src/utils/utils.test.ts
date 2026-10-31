
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {app, electron_mock} from '../electron.test_utils'


vi.mock('electron', () => import('../electron.test_utils'))
vi.mock('check-disk-space', () => ({default: vi.fn()}))


// Serve a fake config.json (it's only generated during packaging) and pass through other reads
const fs_hooks = vi.hoisted(() => ({config_json: '{"rollbar_electron":"t","hosted_api":"h"}'}))
vi.mock('fs', async import_original => {
    const actual = await import_original<typeof import('fs')>()
    return {
        ...actual,
        readFileSync: ((path:string, ...args:unknown[]) => {
            if (String(path).endsWith('/src/config.json')){
                return fs_hooks.config_json
            }
            return (actual.readFileSync as (...a:unknown[])=>unknown)(path, ...args)
        }) as typeof actual.readFileSync,
    }
})


// Each test gets fresh modules (most of these modules have import-time side effects)
beforeEach(() => {
    vi.resetModules()
})


describe('async', () => {

    // sleep() resolves after the given delay
    test('sleep waits for given ms', async () => {
        vi.useFakeTimers()
        const {sleep} = await import('./async.js')
        let done = false
        void sleep(100).then(() => {done = true})
        await vi.advanceTimersByTimeAsync(99)
        expect(done).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        expect(done).toBe(true)
        vi.useRealTimers()
    })
})


describe('config', () => {

    // Config is loaded from the json file next to the bundle
    test('loads CONFIG and resolves paths from src root', async () => {
        const {CONFIG, get_path, TESTING} = await import('./config.js')
        expect(CONFIG).toEqual({rollbar_electron: 't', hosted_api: 'h'})
        expect(get_path('assets/icon.png')).toBe(join(import.meta.dirname, '..', 'assets/icon.png'))
        expect(get_path()).toBe(join(import.meta.dirname, '..') + '/')
        expect(typeof TESTING).toBe('boolean')
    })
})


describe('warning', () => {

    // The readme is written into the given dir
    test('write_warning_file writes readme', async () => {
        const {write_warning_file, readme_filename} = await import('./warning.js')
        const dir = join(electron_mock.root, 'warning')
        mkdirSync(dir, {recursive: true})
        write_warning_file(dir)
        const contents = readFileSync(join(dir, readme_filename), 'utf8')
        expect(contents).toContain('CLOSE STELLO before copying/moving this folder')
    })
})


describe('immobile_config', () => {

    const config_path = () => join(electron_mock.paths['appData']!, 'stello', 'immobile_config.json')

    // Start each test without a config file
    beforeEach(() => {
        electron_mock.paths['appData'] = join(electron_mock.root, `appData${Math.random()}`)
    })

    // No file means nothing remembered
    test('read returns null when no config', async () => {
        const {read_immobile_config} = await import('./immobile_config.js')
        expect(read_immobile_config()).toBe(null)
    })

    // Writing and reading round trips
    test('write then read returns dir', async () => {
        const mod = await import('./immobile_config.js')
        mod.write_immobile_config('/some/dir')
        expect(mod.read_immobile_config()).toBe('/some/dir')
        expect(JSON.parse(readFileSync(config_path(), 'utf8'))).toEqual({files_dirs: ['/some/dir']})
    })

    // Writing null clears remembered dirs
    test('write null clears', async () => {
        const mod = await import('./immobile_config.js')
        mod.write_immobile_config('/some/dir')
        mod.write_immobile_config(null)
        expect(mod.read_immobile_config()).toBe(null)
    })

    // Corrupt or incomplete files are treated as empty
    test('corrupt or partial config returns null', async () => {
        const mod = await import('./immobile_config.js')
        mkdirSync(mod.immobile_config_dir, {recursive: true})
        writeFileSync(config_path(), '{not json')
        expect(mod.read_immobile_config()).toBe(null)
        writeFileSync(config_path(), '{}')
        expect(mod.read_immobile_config()).toBe(null)
    })
})


describe('store', () => {

    const store_path = () => join(electron_mock.paths['userData']!, 'stello_store.json')

    // Each test gets its own userData dir
    beforeEach(() => {
        electron_mock.paths['userData'] = join(electron_mock.root, `userData${Math.random()}`)
        mkdirSync(electron_mock.paths['userData'], {recursive: true})
    })

    // A new store is created with current version
    test('creates store file when missing', async () => {
        const {default: store} = await import('./store.js')
        expect(store.state).toEqual({version: '1.2.3'})
        expect(JSON.parse(readFileSync(store_path(), 'utf8'))).toEqual({version: '1.2.3'})
    })

    // Existing state is loaded over the defaults
    test('loads existing state', async () => {
        writeFileSync(store_path(), JSON.stringify({version: '1.0.0', window_maximized: true}))
        const {default: store} = await import('./store.js')
        expect(store.state).toEqual({version: '1.0.0', window_maximized: true})
    })

    // A corrupted file gets overwritten with defaults
    test('overwrites corrupted store', async () => {
        writeFileSync(store_path(), 'corrupt{')
        const {default: store} = await import('./store.js')
        expect(store.state).toEqual({version: '1.2.3'})
        expect(JSON.parse(readFileSync(store_path(), 'utf8'))).toEqual({version: '1.2.3'})
    })

    // save() persists changes
    test('save persists state', async () => {
        const {default: store} = await import('./store.js')
        store.state.window_maximized = true
        store.save()
        expect(JSON.parse(readFileSync(store_path(), 'utf8')).window_maximized).toBe(true)
    })
})


describe('misc', () => {

    // Mock paths to avoid import-time discovery logic
    beforeEach(() => {
        vi.doMock('./paths.js', () => ({data_dir: '/data'}))
    })
    afterEach(() => {
        vi.doUnmock('./paths.js')
    })

    // Percent is calculated from free/size
    test('get_free_space returns percent free', async () => {
        const {default: check_disk_space} = await import('check-disk-space')
        vi.mocked(check_disk_space).mockResolvedValue({free: 25, size: 200} as never)
        const {get_free_space} = await import('./misc.js')
        expect(await get_free_space()).toBe(12.5)
        expect(check_disk_space).toHaveBeenCalledWith('/data')
    })

    // Errors default to 100% so the user isn't blocked
    test('get_free_space defaults to 100 on error', async () => {
        const {default: check_disk_space} = await import('check-disk-space')
        vi.mocked(check_disk_space).mockRejectedValue(new Error('fail'))
        const {get_free_space} = await import('./misc.js')
        expect(await get_free_space()).toBe(100)
    })
})


// Confirm temporary files were actually created in the mock's root dir
test('mock root exists', () => {
    expect(existsSync(electron_mock.root)).toBe(true)
    expect(app.getVersion()).toBe('1.2.3')
})

