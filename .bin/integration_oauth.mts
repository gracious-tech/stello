// Sign in to a test Google/Microsoft account and save a refresh token for integration tests
// Usage: node .bin/integration_oauth.mts google|microsoft
// Saves to gitignored .bin/integration.env (only ever use test accounts, as tests modify contacts)

import {createServer} from 'http'
import {createHash, randomBytes} from 'crypto'
import {existsSync, readFileSync, writeFileSync} from 'fs'


// Settings for each issuer (must request all scopes the app uses)
const ISSUERS = {
    google: {
        auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_url: 'https://oauth2.googleapis.com/token',
        scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/contacts',
            'https://www.googleapis.com/auth/drive.appdata'],
        extras: {access_type: 'offline', prompt: 'consent'},
    },
    microsoft: {
        auth_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        scopes: ['openid', 'email', 'offline_access', 'https://graph.microsoft.com/Mail.Send',
            'https://graph.microsoft.com/Contacts.ReadWrite'],
        extras: {prompt: 'select_account'},
    },
} as const
type Issuer = keyof typeof ISSUERS


// Same redirect the app uses in development (registered with both issuers)
const PORT = 44933
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth`
const ENV_FILE = '.bin/integration.env'


// Read the app's OAuth client config from its dev env file
function app_env(name:string):string{
    const env = readFileSync('app/.env.development.local', 'utf8')
    const match = new RegExp(`^${name}=(.*)$`, 'm').exec(env)
    if (!match){
        throw new Error(`${name} missing from app/.env.development.local`)
    }
    return match[1]!.trim()
}


// Save or replace an export line in the integration env file
function save_env(name:string, value:string):void{
    const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split('\n') : []
    const kept = lines.filter(line => line && !line.startsWith(`export ${name}=`))
    kept.push(`export ${name}='${value}'`)
    writeFileSync(ENV_FILE, kept.join('\n') + '\n', {mode: 0o600})
}


// Validate issuer arg
const issuer = process.argv[2] as Issuer
if (!(issuer in ISSUERS)){
    console.error("Usage: node .bin/integration_oauth.mts google|microsoft")
    process.exit(1)
}
const config = ISSUERS[issuer]
const client_id = app_env(`VITE_OAUTH_ID_${issuer.toUpperCase()}`)
const client_secret = issuer === 'google' ? app_env('VITE_OAUTH_SECRET_GOOGLE') : ''

// Wait for redirect with auth code (using PKCE)
const verifier = randomBytes(32).toString('base64url')
const state = randomBytes(16).toString('hex')
const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
        const url = new URL(req.url!, REDIRECT_URI)
        if (url.pathname !== '/oauth'){
            res.end()
            return
        }
        res.end("Done - you can close this tab.")
        server.close()
        const code = url.searchParams.get('code')
        if (url.searchParams.get('state') !== state || !code){
            reject(new Error(url.searchParams.get('error_description') ?? "Auth failed"))
            return
        }
        resolve(code)
    })
    server.listen(PORT, '127.0.0.1', () => {
        const auth = new URL(config.auth_url)
        auth.search = new URLSearchParams({client_id, redirect_uri: REDIRECT_URI, state,
            response_type: 'code', scope: config.scopes.join(' '),
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256', ...config.extras}).toString()
        console.log(`Open this URL and sign in with the TEST account:\n${auth.toString()}`)
    })
})

// Exchange code for tokens
const resp = await fetch(config.token_url, {method: 'POST', body: new URLSearchParams({
    client_id, code, code_verifier: verifier, redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code', ...(client_secret ? {client_secret} : {})})})
const tokens = await resp.json() as {refresh_token?:string, scope?:string, error?:string}
if (!tokens.refresh_token){
    throw new Error(`No refresh token: ${tokens.error ?? resp.status}`)
}

// Ensure every scope was granted (user may untick some)
const granted = (tokens.scope ?? '').split(' ')
const missing = config.scopes.filter(s => s.startsWith('https://') && !granted.includes(s))
if (missing.length){
    throw new Error(`Not all permissions granted: ${missing.join(', ')}`)
}

save_env(`STELLO_IT_${issuer.toUpperCase()}_REFRESH`, tokens.refresh_token)
console.log(`Saved ${issuer} refresh token to ${ENV_FILE}`)
