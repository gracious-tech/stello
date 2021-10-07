
import Rollbar from 'rollbar'
import type {APIGatewayProxyHandlerV2} from 'aws-lambda'


export const config = (() => {
    // Config loaded from env
    const is_dev = process.env['stello_env'] === 'development'
    return {
        dev: is_dev,
        env: process.env['stello_env']!,
        version: process.env['stello_version']!,
        region: process.env['stello_region']!,
        rollbar: process.env['stello_rollbar']!,
        user_pool: process.env['stello_user_pool']!,
    }
})()


export function username_valid(username:string){
    // Whether username has valid chars and length
    /* SECURITY Allows for punycode and doesn't guard against homograph attacks
        https://en.wikipedia.org/wiki/IDN_homograph_attack
        Because...
            1. Link only visible after message already opened, so not significant for most readers
            2. Messages are sent via other channels that have own validation (email/signal/etc)
            3. Browsers already have builtin homograph warnings better than Stello could achieve
    */
    // NOTE Regex enforces min 2 chars
    // NOTE subdomain limit is 63
    return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(username) && username.length <= 60
}


export function username_allowed(username:string){
    // Whether username is allowed or not (even if valid chars)

    const forbidden = [
        // Used internally already
        'releases', 'at', 'mail',
        // Could be used in future, or could trick users to believe they belong to Stello/GT
        'www', 'smtp', 'pop', 'imap', 'ftp',
        'api', 'admin', 'dev', 'beta', 'secure', 'update',
        'login', 'signin', 'signup', 'payment', 'donate', 'account', 'billing', 'pay',
        'help', 'support', 'blog', 'news', 'about', 'info', 'contact', 'search', 'official',
    ]

    // Forbidden patterns (for very specific words)
    const forbidden_patterns = [
        // Could trick users
        /gracious.*tech/, /stello/,
    ]

    // Tests
    if (forbidden.includes(username)){
        return false
    }
    for (const pattern of forbidden_patterns){
        if (pattern.test(username)){
            return false
        }
    }
    return true
}


export class CustomError extends Error {
    // Bridge for extending Error while keeping prototype and name
    constructor(message?:string){
        super(message)
        this.name = new.target.name
        Object.setPrototypeOf(this, new.target.prototype)
    }
}


export class Abort extends CustomError {}


const rollbar = Rollbar.init({
    // Setup Rollbar
    environment: config.env,
    accessToken: config.rollbar,
    captureUncaught: true,
    captureUnhandledRejections: true,
    codeVersion: 'v' + config.version,  // 'v' to match git tags
    autoInstrument: false,  // SECURITY Don't track use via telemetry to protect privacy
    payload: {
        platform: 'client',  // Allows using public client token since all other components do too
        server: {
            root: '/var/task',  // Required to trigger matching to source code
        },
    },
})


export function setup_handler<T>(inner_handler:(input:T, ip:string)=>Promise<unknown>){
    // Setup a handler with input/output parsing and exception handling

    const handler:APIGatewayProxyHandlerV2 = async (event, context) => {

        // Process event and catch exceptions
        try {
            // Parse input
            const ip = event.requestContext.http.sourceIp
            const input = JSON.parse(event.body!) as T
            const output = await inner_handler(input, ip)
            return {
                statusCode: 200,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(output),
            }
        } catch (error){
            // For debugging during development
            if (error instanceof Error){
                console.error(`${error.name}: ${error.message}`)  // SAM cuts off message otherwise
            }
            console.error(error)  // For sake of strack trace
            // For debugging in production
            if (! (error instanceof Abort)){
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                rollbar.error(error as any)
            }
        }
        // SECURITY Never reveal whether client or server error, just that it didn't work
        return {'statusCode': 400}
    }

    // Also wrap with Rollbar (otherwise errors not caught properly)
    // @ts-ignore Rollbar's types are wrong
    return rollbar.lambdaHandler(handler)
}
