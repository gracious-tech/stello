
import {resolve} from 'path'

import chroma from 'chroma-js'
import {describe, expect, test, vi} from 'vitest'

import {colors} from './colors.ts'
import {generate_theme} from './theme_generation.ts'

import type {AppConfig} from './types.ts'


// Capture writes rather than overwriting real config files
const writes = vi.hoisted(() => ({} as Record<string, string>))
vi.mock('fs', async import_original => {
    const actual = await import_original<typeof import('fs')>()
    return {
        ...actual,
        writeFileSync: (path:string, data:string) => {writes[path] = data},
    }
})


function base_config():AppConfig{
    // Minimal config for theme generation
    return {
        version: '1.0.0',
        theme_codes: {
            primary: ['blue_grey', 'p700'],
            accent: ['green', 'a400'],
            error: ['red', 'a700'],
        },
        codename: 'stello',
        domain: 'stello.news',
        name: 'Stello',
        short_name: 'Stello',
        description: 'desc',
        author: {name: 'GT', email: 'x@y.z'},
    }
}


describe('colors', () => {

    // All colors are valid hex codes
    test('all values are hex colors', () => {
        for (const shades of Object.values(colors)){
            for (const hex of Object.values(shades)){
                expect(hex).toMatch(/^#[0-9a-f]{6}$/)
            }
        }
        expect(colors['red']!['p500']).toBe('#f44336')
    })
})


describe('generate_theme', () => {

    // Base colors come from material codes
    test('base colors and variations', () => {
        const config = base_config()
        generate_theme(config)
        const theme = config.theme as unknown as Record<string, string>
        expect(theme['primary']).toBe(colors['blue_grey']!['p700'])
        expect(theme['accent']).toBe(colors['green']!['a400'])
        expect(theme['error']).toBe(colors['red']!['a700'])
        expect(theme['primary_lighter']).toBe(chroma(theme['primary']!).brighten().hex())
        expect(theme['primary_darker']).toBe(chroma(theme['primary']!).darken().hex())
    })

    // Every color has an on_ text color with sufficient contrast
    test('on_ colors have enough contrast', () => {
        const config = base_config()
        generate_theme(config)
        const theme = config.theme as unknown as Record<string, string>
        for (const key of ['primary', 'accent', 'error', 'primary_lighter', 'accent_darker']){
            const text = theme[`on_${key}`]!
            expect(text).toMatch(/^rgba\(/)
            expect(chroma.contrast(theme[key]!, text)).toBeGreaterThanOrEqual(3)
        }
    })

    // Light colors get dark text and dark colors get light text
    test('text color depends on background', () => {
        const config = base_config()
        config.theme_codes.primary = ['grey', 'p50']
        config.theme_codes.accent = ['grey', 'p900']
        generate_theme(config)
        const theme = config.theme as unknown as Record<string, string>
        expect(theme['on_primary']).toBe('rgba(0, 0, 0, 0.87)')
        expect(theme['on_accent']).toBe('rgba(255, 255, 255, 0.87)')
    })

    // Numeric versions available for every key
    test('_num variants', () => {
        const config = base_config()
        generate_theme(config)
        const theme = config.theme as unknown as Record<string, string>
        expect(theme['primary_num']).toBe(chroma(theme['primary']!).rgb().join(', '))
        expect(theme['on_primary_num']).toMatch(/^\d+, \d+, \d+$/)
        const non_num = Object.keys(theme).filter(k => !k.endsWith('_num'))
        expect(non_num).toHaveLength(18)  // 3 base * 3 variants * (color + on_color)
        expect(Object.keys(theme)).toHaveLength(36)
    })
})


describe('apply', () => {

    // Script writes configs for app, electron and displayer
    test('writes all configs', async () => {
        await import('./apply.ts')
        const app_path = resolve(import.meta.dirname, '../app/src/app_config.json')
        const electron_path = resolve(import.meta.dirname, '../electron/app_config.json')
        const displayer_path = resolve(import.meta.dirname, '../displayer/src/app_config.json')
        expect(Object.keys(writes).sort()).toEqual([app_path, displayer_path, electron_path].sort())

        // App/electron get full config including theme
        const app = JSON.parse(writes[app_path]!) as AppConfig
        expect(writes[electron_path]).toBe(writes[app_path])
        expect(app.codename).toBe('stello')
        expect(app.version).toMatch(/^\d+\.\d+\.\d+$/)
        expect(app.theme!.primary).toMatch(/^#/)

        // Displayer only gets non-sensitive subset
        const displayer = JSON.parse(writes[displayer_path]!) as Record<string, unknown>
        expect(Object.keys(displayer).sort())
            .toEqual(['author', 'codename', 'domain', 'name', 'version'])
        expect(displayer['version']).toBe(app.version)
    })
})

