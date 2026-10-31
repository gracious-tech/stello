
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {join, sep} from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {app, electron_mock} from '../electron.test_utils'


vi.mock('electron', () => import('../electron.test_utils'))


// Locations used by a scenario
interface Dirs {
    base:string
    documents:string
    install:string
}


async function load(setup?:(dirs:Dirs)=>void, packaged=false){
    // Load paths module fresh for a new filesystem scenario
    const base = mkdtempSync(join(electron_mock.root, 'paths-'))
    const dirs = {
        base,
        documents: join(base, 'home', 'Documents'),
        install: join(base, 'opt', 'Stello'),
    }
    Object.assign(electron_mock.paths, {
        home: join(base, 'home'),
        documents: dirs.documents,
        appData: join(base, 'appData'),
        userData: join(base, 'appData', 'Stello'),
    })
    app.app_path = join(dirs.install, 'resources', 'app.asar')
    app.isPackaged = packaged
    mkdirSync(join(dirs.install, 'resources'), {recursive: true})
    setup?.(dirs)
    vi.resetModules()
    return import('./paths.js')
}


function make_data(dir:string){
    // Create an internal data dir that looks used (has IndexedDB)
    mkdirSync(join(dir, 'IndexedDB'), {recursive: true})
}


function remember(dirs:Dirs, files_dir:string){
    // Write an immobile config that remembers the given files dir
    mkdirSync(join(dirs.base, 'appData', 'stello'), {recursive: true})
    writeFileSync(join(dirs.base, 'appData', 'stello', 'immobile_config.json'),
        JSON.stringify({files_dirs: [files_dir]}))
}


// Restore state changed by tests
afterEach(() => {
    vi.unstubAllEnvs()
    app.getPath.mockClear()
})


describe('data/files dir discovery', () => {

    // A fresh install uses Documents/Stello Files
    test('defaults to Documents when nothing exists', async () => {
        let dirs!:Dirs
        const paths = await load(d => {dirs = d})
        expect(paths.files_dir).toBe(join(dirs.documents, 'Stello Files'))
        expect(paths.data_dir).toBe(join(dirs.documents, 'Stello Files', 'Internal Data'))
        expect(paths.is_portable).toBe(false)
        expect(paths.files_dir_missing).toBe(false)
        expect(paths.linux_package_type).toBe(null)
        expect(paths.app_path).toBe(join(dirs.install, 'resources'))
    })

    // Data next to the app means portable mode
    test('portable data takes priority', async () => {
        let dirs!:Dirs
        const paths = await load(d => {
            dirs = d
            make_data(join(d.documents, 'Stello Files', 'Internal Data'))
            make_data(join(d.install, 'Stello Files', 'Internal Data'))
        })
        expect(paths.is_portable).toBe(true)
        expect(paths.files_dir).toBe(join(dirs.install, 'Stello Files'))
        expect(paths.data_dir).toBe(join(dirs.install, 'Stello Files', 'Internal Data'))
    })

    // Old portable location is still portable
    test('old portable data dir', async () => {
        let dirs!:Dirs
        const paths = await load(d => {
            dirs = d
            make_data(join(d.install, 'stello_data'))
        })
        expect(paths.is_portable).toBe(true)
        expect(paths.data_dir).toBe(join(dirs.install, 'stello_data'))
        expect(paths.files_dir).toBe(join(dirs.install, 'Stello Files'))
    })

    // Long-term users may still have data in userData
    test('old userData location used when only one existing', async () => {
        let dirs!:Dirs
        const paths = await load(d => {
            dirs = d
            make_data(join(d.base, 'appData', 'Stello'))
        })
        expect(paths.data_dir).toBe(join(dirs.base, 'appData', 'Stello'))
        expect(paths.files_dir).toBe(join(dirs.documents, 'Stello Files'))
        expect(paths.is_portable).toBe(false)
    })

    // A user-moved folder is found via the immobile config
    test('remembered location is used', async () => {
        let dirs!:Dirs
        const paths = await load(d => {
            dirs = d
            const moved = join(d.base, 'elsewhere', 'Stello Files')
            make_data(join(moved, 'Internal Data'))
            remember(d, moved)
        })
        const moved = join(dirs.base, 'elsewhere', 'Stello Files')
        expect(paths.files_dir).toBe(moved)
        expect(paths.data_dir).toBe(join(moved, 'Internal Data'))
        expect(paths.files_dir_missing).toBe(false)
    })

    // A remembered folder that no longer exists is flagged as missing
    test('remembered location that is missing is flagged', async () => {
        const paths = await load(d => {
            remember(d, join(d.base, 'gone', 'Stello Files'))
        })
        expect(paths.files_dir_missing).toBe(true)
    })

    // Some systems have no documents dir
    test('falls back to appData when documents unavailable', async () => {
        let dirs!:Dirs
        const paths = await load(d => {
            dirs = d
            delete electron_mock.paths['documents']
        })
        expect(paths.files_dir).toBe(join(dirs.base, 'appData', 'Stello Files'))
    })
})


describe('app_path when packaged', () => {

    // deb/rpm packages store a package-type file next to app.asar
    test('linux package', async () => {
        let dirs!:Dirs
        const paths = await load(d => {
            dirs = d
            writeFileSync(join(d.install, 'resources', 'package-type'), 'deb\n')
        }, true)
        expect(paths.linux_package_type).toBe('deb')
        expect(paths.app_path).toBe(dirs.install)
    })

    // AppImage runs from tmp location so env var gives real location
    test('appimage env', async () => {
        vi.stubEnv('APPIMAGE', '/apps/Stello.AppImage')
        const paths = await load(undefined, true)
        expect(paths.app_path).toBe('/apps/Stello.AppImage')
    })

    // Windows portable exe also gives real location via env
    test('portable exe env', async () => {
        vi.stubEnv('APPIMAGE', '')
        vi.stubEnv('PORTABLE_EXECUTABLE_FILE', 'C:/Stello.exe')
        const paths = await load(undefined, true)
        expect(paths.app_path).toBe('C:/Stello.exe')
    })

    // Mac apps are a dir three levels up from app.asar
    test('mac app bundle', async () => {
        vi.stubEnv('APPIMAGE', '')
        vi.stubEnv('PORTABLE_EXECUTABLE_FILE', '')
        let dirs!:Dirs
        const paths = await load(d => {dirs = d}, true)
        expect(paths.app_path).toBe(join(dirs.install, '..'))
    })
})


describe('restrict_path', () => {

    // Relative paths within root are allowed and made absolute
    test('allows paths within root', async () => {
        const {restrict_path} = await load()
        expect(restrict_path('/root', 'a/b.txt')).toBe(`/root${sep}a${sep}b.txt`)
        expect(restrict_path('/root', '')).toBe('/root')
        expect(restrict_path('/root', 'a/../b')).toBe(`/root${sep}b`)
    })

    // Escaping the root is not allowed
    test('rejects paths outside root', async () => {
        const {restrict_path} = await load()
        expect(() => restrict_path('/root', '../etc/passwd')).toThrow('outside of')
        expect(() => restrict_path('/root', '/etc/passwd')).toThrow('outside of')
        expect(() => restrict_path('/root', '../rootsibling')).toThrow('outside of')
    })
})

