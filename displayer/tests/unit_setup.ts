// Setup run before every displayer unit test file

import 'fake-indexeddb/auto'
import {afterEach, vi} from 'vitest'
import {config, enableAutoUnmount} from '@vue/test-utils'

import AppBtn from '@/components/AppBtn.vue'
import AppProgress from '@/components/AppProgress.vue'


// Translation function just returns the original text
config.global.mocks = {$t: (text:string) => text}

// Components registered globally by init.ts
config.global.components = {AppBtn, AppProgress}

// Ignore Vue 2 compatibility warnings from shared components (same as init.ts)
config.global.config.warnHandler = (msg, vm, trace) => {
    if (trace.includes('<Shared') && msg.includes('$listeners')){
        return
    }
    console.warn(`[Vue warn]: ${msg}${trace}`)
}

// Unmount components after each test so they don't react to later state changes
enableAutoUnmount(afterEach)


// Lottie requires a real canvas so replace with a fake player
vi.mock('lottie-web/build/player/lottie_light', () => ({
    default: {
        loadAnimation: vi.fn(() => ({
            goToAndPlay: vi.fn(),
            goToAndStop: vi.fn(),
            destroy: vi.fn(),
        })),
    },
}))


// Globals normally set by index.html and init_errors.ts
self.app_hash = ''
self.app_failed = false
self.app_browser_supported = true
self.app_report_error_critical = true
self.app_report_error = () => undefined
self.app_fail_visual = () => undefined
self.app_splash_unsupported = () => undefined
