
import {createHash} from 'crypto'

import {AdminCreateUserCommand, AdminGetUserCommand, AdminSetUserPasswordCommand,
    CognitoIdentityProviderClient, ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider'
import {mockClient} from 'aws-sdk-client-mock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import type {APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context}
    from 'aws-lambda'


// Env config must be set before modules are imported
vi.hoisted(() => {
    process.env['stello_env'] = 'development'
    process.env['stello_version'] = '1.0.0'
    process.env['stello_region'] = 'us-west-2'
    process.env['stello_rollbar'] = 'token'
    process.env['stello_user_pool'] = 'pool1'
})


// Mock Rollbar so its handler wrapper is a pass-through
const rollbar = vi.hoisted(() => ({error: vi.fn(), config: null as unknown}))
vi.mock('rollbar', () => ({default: {init: (config:unknown) => {
    rollbar.config = config
    return {error: rollbar.error, lambdaHandler: (handler:unknown) => handler}
}}}))


import {Abort, config, CustomError, setup_handler, username_allowed, username_valid}
    from './utils'
import {handler as available_handler} from './handle_available'
import {handler as create_handler} from './handle_create'


// NOTE aws-sdk-client-mock types are for a newer SDK than host/accounts uses
const cognito = mockClient(CognitoIdentityProviderClient as never)


type Handler = (event:APIGatewayProxyEventV2, context:Context)=>
    Promise<APIGatewayProxyStructuredResultV2>


async function call(handler:unknown, body:unknown, ip='1.2.3.4'){
    // Call a lambda handler with given JSON body and return parsed output
    const event = {
        body: typeof body === 'string' ? body : JSON.stringify(body),
        requestContext: {http: {sourceIp: ip}},
    } as unknown as APIGatewayProxyEventV2
    const result = await (handler as Handler)(event, {} as Context)
    return {
        status: result.statusCode,
        body: result.body ? JSON.parse(result.body) as Record<string, unknown> : null,
    }
}


function hash_ip(ip:string){
    // Same hashing as handle_create
    return createHash('sha256').update(`stello:${ip}`).digest().toString('base64')
}


// Reset mocks between tests
beforeEach(() => {
    cognito.reset()
    rollbar.error.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
    vi.restoreAllMocks()
})


describe('utils', () => {

    // Config loaded from env
    test('config', () => {
        expect(config).toEqual({dev: true, env: 'development', version: '1.0.0',
            region: 'us-west-2', rollbar: 'token', user_pool: 'pool1'})
        expect(rollbar.config).toMatchObject({transmit: false, codeVersion: 'v1.0.0'})
    })

    // Valid usernames are lowercase alphanumeric with inner hyphens, 2-60 chars
    test.each([
        ['ab', true],
        ['a-b', true],
        ['abc123', true],
        ['a'.repeat(60), true],
        ['a'.repeat(61), false],
        ['a', false],
        ['', false],
        ['-ab', false],
        ['ab-', false],
        ['Ab', false],
        ['a_b', false],
        ['a.b', false],
        ['xn--80ak6aa92e', true],
    ])('username_valid(%s) = %s', (username, valid) => {
        expect(username_valid(username)).toBe(valid)
    })

    // Reserved and misleading names are not allowed
    test.each([
        ['john', true],
        ['www', false],
        ['admin', false],
        ['support', false],
        ['stello', false],
        ['my-stello-news', false],
        ['gracious-tech', false],
        ['gracioustech', false],
        ['gracious', true],
    ])('username_allowed(%s) = %s', (username, allowed) => {
        expect(username_allowed(username)).toBe(allowed)
    })

    // Custom errors keep their names and prototypes
    test('CustomError', () => {
        const error = new Abort('stop')
        expect(error).toBeInstanceOf(Abort)
        expect(error).toBeInstanceOf(CustomError)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('Abort')
        expect(error.message).toBe('stop')
    })

    // Output is JSON encoded
    test('setup_handler success', async () => {
        const inner = vi.fn(async (input:{a:number}, ip:string) => ({got: input.a, ip}))
        const result = await call(setup_handler(inner), {a: 1}, '5.6.7.8')
        expect(result).toEqual({status: 200, body: {got: 1, ip: '5.6.7.8'}})
    })

    // Errors give a generic 400 and are reported (unless Abort)
    test('setup_handler errors', async () => {
        const failing = setup_handler(async () => {throw new Error('bug')})
        expect(await call(failing, {})).toEqual({status: 400, body: null})
        expect(rollbar.error).toHaveBeenCalledTimes(1)
        const aborting = setup_handler(async () => {throw new Abort('expected')})
        expect(await call(aborting, {})).toEqual({status: 400, body: null})
        expect(rollbar.error).toHaveBeenCalledTimes(1)
        const non_error = setup_handler(async () => {throw 'string'})
        expect(await call(non_error, {})).toEqual({status: 400, body: null})
        expect(rollbar.error).toHaveBeenCalledTimes(2)
    })

    // Invalid JSON body is a 400
    test('setup_handler invalid json', async () => {
        const result = await call(setup_handler(async () => ({})), '{not json')
        expect(result.status).toBe(400)
    })
})


describe('handle_available', () => {

    // Invalid usernames
    test('invalid', async () => {
        expect((await call(available_handler, {username: 'A'})).body)
            .toEqual({valid: false, available: false})
        expect((await call(available_handler, {username: 'a b'})).body)
            .toEqual({valid: false, available: false})
    })

    // Reserved usernames
    test('not allowed', async () => {
        expect((await call(available_handler, {username: 'admin'})).body)
            .toEqual({valid: true, available: false})
        expect(cognito.calls()).toHaveLength(0)
    })

    // Available when user doesn't exist
    test('available', async () => {
        cognito.on(AdminGetUserCommand as never).rejects(
            Object.assign(new Error('not found'), {name: 'UserNotFoundException'}))
        expect((await call(available_handler, {username: 'john'})).body)
            .toEqual({valid: true, available: true})
        expect(cognito.call(0).args[0].input).toEqual({UserPoolId: 'pool1', Username: 'john'})
    })

    // Taken when user exists
    test('taken', async () => {
        cognito.on(AdminGetUserCommand as never).resolves({Username: 'john'})
        expect((await call(available_handler, {username: 'john'})).body)
            .toEqual({valid: true, available: false})
    })

    // Other errors fail the request
    test('other error', async () => {
        cognito.on(AdminGetUserCommand as never).rejects(new Error('throttled'))
        expect((await call(available_handler, {username: 'john'})).status).toBe(400)
    })
})


describe('handle_create', () => {

    const day = 1000 * 60 * 60 * 24

    function user(username:string, ip:string|null, age_ms:number){
        // Create a user record as returned by ListUsers
        return {
            Username: username,
            UserCreateDate: new Date(Date.now() - age_ms),
            Attributes: ip ? [{Name: 'dev:custom:hashed_ip', Value: hash_ip(ip)}] : [],
        }
    }

    function list_users(...pages:ReturnType<typeof user>[][]){
        // Mock ListUsers returning given pages
        let chain = cognito.on(ListUsersCommand as never)
        pages.forEach((users, i) => {
            const next = i < pages.length - 1 ? `token${i}` : undefined
            chain = chain.resolvesOnce({Users: users, PaginationToken: next})
        })
    }

    // Invalid input rejected
    test('invalid username', async () => {
        expect((await call(create_handler, {username: '-x-'})).body)
            .toEqual({error: 'username_invalid'})
        expect((await call(create_handler, {username: 'www'})).body)
            .toEqual({error: 'username_taken'})
    })

    // Successfully creates user with hashed details and returns password
    test('creates user', async () => {
        list_users([user('other', null, 0)])
        cognito.on(AdminCreateUserCommand as never).resolves({})
        cognito.on(AdminSetUserPasswordCommand as never).resolves({})
        const result = await call(create_handler,
            {username: 'john', hashed_email: 'hash', plan: 'other'}, '9.9.9.9')
        expect(result.status).toBe(200)
        expect(result.body!['password']).toMatch(/^[0-9a-f-]{36}$/)
        const create = cognito.commandCalls(AdminCreateUserCommand as never)[0]!
        expect(create.args[0].input).toEqual({
            UserPoolId: 'pool1',
            Username: 'john',
            UserAttributes: [
                {Name: 'custom:hashed_email', Value: 'hash'},
                {Name: 'dev:custom:hashed_email_init', Value: 'hash'},
                {Name: 'dev:custom:hashed_ip', Value: hash_ip('9.9.9.9')},
                {Name: 'dev:custom:plan', Value: 'other'},
            ],
            MessageAction: 'SUPPRESS',
        })
        const set_password = cognito.commandCalls(AdminSetUserPasswordCommand as never)[0]!
        expect(set_password.args[0].input).toEqual({UserPoolId: 'pool1', Username: 'john',
            Password: result.body!['password'], Permanent: true})
    })

    // Unknown plans default to 'c'
    test('default plan', async () => {
        list_users([])
        cognito.on(AdminCreateUserCommand as never).resolves({})
        cognito.on(AdminSetUserPasswordCommand as never).resolves({})
        await call(create_handler, {username: 'john', hashed_email: 'h', plan: 'premium'})
        const input = cognito.commandCalls(AdminCreateUserCommand as never)[0]!.args[0].input as
            {UserAttributes:{Name:string, Value:string}[]}
        expect(input.UserAttributes[3]).toEqual({Name: 'dev:custom:plan', Value: 'c'})
    })

    // Existing usernames are rejected (across pages)
    test('username taken', async () => {
        list_users([user('a', null, 0)], [user('john', null, 0)])
        expect((await call(create_handler, {username: 'john', hashed_email: 'h'})).body)
            .toEqual({error: 'username_taken'})
        expect(cognito.commandCalls(AdminCreateUserCommand as never)).toHaveLength(0)
    })

    // Max 10 per day per ip
    test('ip day limit', async () => {
        const users = Array.from({length: 11}, (_, i) => user(`u${i}`, '1.1.1.1', 1000))
        list_users(users)
        expect((await call(create_handler, {username: 'john', hashed_email: 'h'}, '1.1.1.1'))
            .body).toEqual({error: 'ip_limit_day'})
    })

    // 10 in a day is still ok, and other ips aren't counted
    test('ip day limit not reached', async () => {
        const users = [
            ...Array.from({length: 10}, (_, i) => user(`u${i}`, '1.1.1.1', 1000)),
            ...Array.from({length: 30}, (_, i) => user(`o${i}`, '2.2.2.2', 1000)),
        ]
        list_users(users)
        cognito.on(AdminCreateUserCommand as never).resolves({})
        cognito.on(AdminSetUserPasswordCommand as never).resolves({})
        const result = await call(create_handler, {username: 'john', hashed_email: 'h'}, '1.1.1.1')
        expect(result.body!['password']).toBeTruthy()
    })

    // Max 20 per fortnight per ip
    test('ip fortnight limit', async () => {
        const users = Array.from({length: 21}, (_, i) => user(`u${i}`, '1.1.1.1', day * 3))
        list_users(users)
        expect((await call(create_handler, {username: 'john', hashed_email: 'h'}, '1.1.1.1'))
            .body).toEqual({error: 'ip_limit_fortnight'})
    })

    // Old creations don't count
    test('old creations ignored', async () => {
        const users = Array.from({length: 30}, (_, i) => user(`u${i}`, '1.1.1.1', day * 15))
        list_users(users)
        cognito.on(AdminCreateUserCommand as never).resolves({})
        cognito.on(AdminSetUserPasswordCommand as never).resolves({})
        const result = await call(create_handler, {username: 'john', hashed_email: 'h'}, '1.1.1.1')
        expect(result.status).toBe(200)
    })

    // Failure to create gives 400
    test('create failure', async () => {
        list_users([])
        cognito.on(AdminCreateUserCommand as never).rejects(new Error('UsernameExistsException'))
        expect((await call(create_handler, {username: 'john', hashed_email: 'h'})).status)
            .toBe(400)
    })
})

