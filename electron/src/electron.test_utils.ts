
// Mock of the Electron API (main and renderer) for unit tests
// NOTE A single instance is stored globally so it survives vi.resetModules() within a test file

import {EventEmitter} from 'node:events'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {vi} from 'vitest'


type Handler = (...args:unknown[])=>unknown


// Mock of a BrowserWindow instance and its webContents
export class MockBrowserWindow extends EventEmitter {

    static instances:MockBrowserWindow[] = []
    static getAllWindows = vi.fn(() => MockBrowserWindow.instances.filter(w => !w.destroyed))

    options:Record<string, unknown>
    destroyed = false
    minimized = false
    maximized = false
    current_url = ''
    window_open_handler:Handler|null = null
    headers_filter:unknown = null
    headers_listener:Handler|null = null
    contents = new EventEmitter()

    loadFile = vi.fn(async (path:string) => {this.current_url = `file://${path}`})
    loadURL = vi.fn(async (url:string) => {this.current_url = url})
    maximize = vi.fn(() => {this.maximized = true})
    isMaximized = vi.fn(() => this.maximized)
    isMinimized = vi.fn(() => this.minimized)
    restore = vi.fn(() => {this.minimized = false})
    show = vi.fn()
    close = vi.fn(() => {this.destroyed = true})
    destroy = vi.fn(() => {this.destroyed = true})
    setMenuBarVisibility = vi.fn()
    getNormalBounds = vi.fn(() => ({x: 1, y: 2, width: 1300, height: 900}))

    webContents = {
        on: (event:string, listener:Handler) => this.contents.on(event, listener),
        send: vi.fn(),
        openDevTools: vi.fn(),
        getURL: () => this.current_url,
        printToPDF: vi.fn(async () => Buffer.from('%PDF')),
        setWindowOpenHandler: (handler:Handler) => {this.window_open_handler = handler},
        session: {
            webRequest: {
                onHeadersReceived: (filter:unknown, listener:Handler) => {
                    this.headers_filter = filter
                    this.headers_listener = listener
                },
            },
        },
    }

    constructor(options:Record<string, unknown>){
        super()
        this.options = options
        MockBrowserWindow.instances.push(this)
    }
}


// Create the mock module
function create_electron_mock(){

    // Temporary dir that mock app paths are within
    const root = mkdtempSync(join(tmpdir(), 'stello-electron-test-'))
    const paths:Record<string, string> = {
        home: join(root, 'home'),
        appData: join(root, 'appData'),
        userData: join(root, 'appData', 'Stello'),
        documents: join(root, 'home', 'Documents'),
    }

    // App
    const app = Object.assign(new EventEmitter(), {
        name: 'Stello',
        isPackaged: false,
        version: '1.2.3',
        app_path: join(root, 'install', 'resources', 'app.asar'),
        ready: true,
        getPath: vi.fn((name:string) => {
            const path = paths[name]
            if (!path){
                throw new Error(`Unknown path: ${name}`)
            }
            return path
        }),
        setPath: vi.fn((name:string, value:string) => {paths[name] = value}),
        getAppPath: vi.fn(() => app.app_path),
        getVersion: vi.fn(() => app.version),
        getLocale: vi.fn(() => 'en-US'),
        isReady: vi.fn(() => app.ready),
        whenReady: vi.fn(() => Promise.resolve()),
        exit: vi.fn(),
        quit: vi.fn(),
        relaunch: vi.fn(),
        requestSingleInstanceLock: vi.fn(() => true),
        enableSandbox: vi.fn(),
        setAppUserModelId: vi.fn(),
        isInApplicationsFolder: vi.fn(() => true),
        commandLine: {appendSwitch: vi.fn()},
    })

    // IPC (main side)
    const ipc_handlers:Record<string, Handler> = {}
    const ipc_listeners:Record<string, Handler> = {}
    const ipcMain = {
        handle: vi.fn((name:string, handler:Handler) => {ipc_handlers[name] = handler}),
        on: vi.fn((name:string, handler:Handler) => {ipc_listeners[name] = handler}),
    }

    // IPC (renderer side)
    const ipcRenderer = {
        sendSync: vi.fn(),
        invoke: vi.fn(),
        on: vi.fn(),
    }

    // Other modules
    const dialog = {
        showMessageBoxSync: vi.fn((options:object) => 0),
        showMessageBox: vi.fn(async (options:object) => ({response: 0})),
        showOpenDialogSync: vi.fn(() => undefined as string[]|undefined),
        showSaveDialog: vi.fn(async () => ({filePath: undefined as string|undefined})),
        showErrorBox: vi.fn(),
    }
    const default_session = {clearStorageData: vi.fn(async () => undefined)}
    const test_session = {clearStorageData: vi.fn(async () => undefined)}
    const session = {
        defaultSession: default_session,
        fromPartition: vi.fn(() => test_session),
    }
    const shell = {openExternal: vi.fn(async (url:string) => undefined)}
    const screen = {getAllDisplays: vi.fn(() => [{bounds: {width: 1920, height: 1080}}])}
    const safeStorage = {
        isEncryptionAvailable: vi.fn(() => true),
        encryptString: vi.fn((secret:string) => Buffer.from(`enc:${secret}`)),
        decryptString: vi.fn((buffer:Buffer) => buffer.toString().replace('enc:', '')),
    }
    const Menu = {
        buildFromTemplate: vi.fn((template:unknown) => ({template})),
        setApplicationMenu: vi.fn(),
    }
    const contextBridge = {exposeInMainWorld: vi.fn()}

    return {
        root, paths, ipc_handlers, ipc_listeners, test_session, default_session,
        module: {
            app, ipcMain, ipcRenderer, dialog, session, shell, screen, safeStorage, Menu,
            contextBridge, BrowserWindow: MockBrowserWindow,
        },
    }
}


// Reuse same instance for whole test file
const global_obj = globalThis as {__electron_mock?:ReturnType<typeof create_electron_mock>}
export const electron_mock = global_obj.__electron_mock ??= create_electron_mock()


// Exports that mimic the electron module
export const {app, ipcMain, ipcRenderer, dialog, session, shell, screen, safeStorage, Menu,
    contextBridge, BrowserWindow} = electron_mock.module
export default electron_mock.module


// Replacement for utils/config.ts (whose config.json only exists when packaged)
// NOTE Properties are mutable so tests can change them (e.g. TESTING)
interface ConfigMock {
    TESTING:boolean
    get_path:(sub_path?:string)=>string
    CONFIG:{rollbar_electron:string, hosted_api:string}
}
const global_config = globalThis as {__config_mock?:ConfigMock}
export const config_mock:ConfigMock = global_config.__config_mock ??= {
    TESTING: false,
    get_path: (sub_path='') => join(import.meta.dirname, sub_path),
    CONFIG: {rollbar_electron: 'token', hosted_api: 'https://api.example/'},
}


// Call a registered ipcMain.handle() handler
export function invoke(name:string, ...args:unknown[]):Promise<unknown>{
    const handler = electron_mock.ipc_handlers[name]
    if (!handler){
        throw new Error(`No handler for ${name}`)
    }
    return Promise.resolve(handler({}, ...args))
}

