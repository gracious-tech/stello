
import {CognitoIdentity} from '@aws-sdk/client-cognito-identity'
import {CognitoIdentityProvider} from '@aws-sdk/client-cognito-identity-provider'

import {request_json} from '../utils/http'
import {generate_hash} from '../utils/crypt'
import {string_to_utf8, buffer_to_url64, jwt_to_object} from '../utils/coding'


// Types
export type AccountPlan = 'christian'|'other'


// Constants
const REGION = import.meta.env.VITE_HOSTED_REGION
const USER_POOL = import.meta.env.VITE_HOSTED_USER_POOL
const USER_POOL_CLIENT = import.meta.env.VITE_HOSTED_USER_POOL_CLIENT
const USER_POOL_PROVIDER = `cognito-idp.${REGION}.amazonaws.com/${USER_POOL}`
const IDENTITY_POOL = import.meta.env.VITE_HOSTED_IDENTITY_POOL
const API_URL = import.meta.env.VITE_HOSTED_API


export async function username_available(username:string){
    // Check if a username is available
    type AvailableResp = {valid:boolean, available:boolean}
    return request_json<AvailableResp>(`${API_URL}accounts/available`, {
        method: 'POST',
        json: {username},
    })
}


export async function create_account(username:string, email:string, plan:AccountPlan){
    // Create new user
    type CreateResp = {password:string}
    const resp = await request_json<CreateResp>(`${API_URL}accounts/create`, {
        method: 'POST',
        json: {
            username,
            hashed_email: buffer_to_url64(await generate_hash(string_to_utf8(email))),
            plan,
        },
    })

    // Get first tokens
    const login = await new_login(username, resp.password)

    // Get the federated id (identity pool id) of the user (required when getting aws credentials)
    const identity_pools = new CognitoIdentity({region: REGION})
    const id = await identity_pools.getId({
        IdentityPoolId: IDENTITY_POOL,
        Logins: {
            [USER_POOL_PROVIDER]: login.IdToken!,
        },
    })

    return {
        password: resp.password,
        federated_id: id.IdentityId!,
        id_token: login.IdToken!,
        id_token_expires: login.id_token_expires,
    }
}


export async function change_email(username:string, password:string, email:string):Promise<void>{
    // Change the email hash stored in the user object
    const login = await new_login(username, password)
    const user_pools = new CognitoIdentityProvider({region: REGION})
    await user_pools.updateUserAttributes({
        AccessToken: login.AccessToken,
        UserAttributes: [{
            Name: 'hashed_email',
            Value: buffer_to_url64(await generate_hash(string_to_utf8(email))),
        }],
    })
}


export async function new_login(username:string, password:string){
    // Login to Cognito user pool and return tokens (valid for 1 day)
    const user_pools = new CognitoIdentityProvider({region: REGION})
    const login = await user_pools.initiateAuth({
        ClientId: USER_POOL_CLIENT,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
        },
    })

    // Extract expiry info from id token
    const id_token_data = jwt_to_object(login.AuthenticationResult!.IdToken!) as {exp:number}
    const id_token_expires = id_token_data.exp * 1000

    return {
        ...login.AuthenticationResult,
        id_token_expires,
    }
}


export async function new_credentials(federated_id:string, id_token:string){
    // Get temporary AWS credentials (valid for 1 hour)
    // NOTE Expiration not considered as assumed any task will complete within an hour
    const identity_pools = new CognitoIdentity({region: REGION})
    const resp = await identity_pools.getCredentialsForIdentity({
        IdentityId: federated_id,
        Logins: {
            [USER_POOL_PROVIDER]: id_token,
        },
    })
    return {
        key_id: resp.Credentials!.AccessKeyId!,
        key_secret: resp.Credentials!.SecretKey!,
        key_session: resp.Credentials!.SessionToken!,
    }
}
