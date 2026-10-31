
import {afterEach, describe, expect, test, vi} from 'vitest'


async function fresh_env(){
    // Import a fresh instance of env module as values determined on import
    vi.resetModules()
    return import('./env')
}


describe('env', () => {

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    // Dev server
    test('uses dev paths during development', async () => {
        const env = await fresh_env()
        expect(env.MSGS_URL).toBe('/dev/')
        expect(env.USER).toBe('_user')
    })

    // Self-hosted production
    test('uses relative paths when self-hosted', async () => {
        vi.stubEnv('DEV', false)
        const env = await fresh_env()
        expect(env.MSGS_URL).toBe('/')
        expect(env.USER).toBe('_user')
    })

    // Gracious hosted production
    test('uses hosted url and subdomain user when hosted', async () => {
        vi.stubEnv('DEV', false)
        vi.stubEnv('VITE_HOSTED_MSGS_URL', 'https://msgs.example.com/')
        vi.spyOn(self.location, 'hostname', 'get').mockReturnValue('jane.example.com')
        const env = await fresh_env()
        expect(env.MSGS_URL).toBe('https://msgs.example.com/')
        expect(env.USER).toBe('jane')
    })
})
