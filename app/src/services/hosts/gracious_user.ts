
import {CognitoIdentity} from '@aws-sdk/client-cognito-identity'
import {CognitoIdentityProvider} from '@aws-sdk/client-cognito-identity-provider'

import {Task} from '@/services/tasks/tasks'
import {HostCloud, HostUser} from '@/services/hosts/types'
import {HostUserAwsBase} from '@/services/hosts/aws_user_base'
import {request_json} from '../utils/http'
import {generate_hash} from '../utils/crypt'
import {string_to_utf8, buffer_to_url64, jwt_to_object} from '../utils/coding'
import {CustomError} from '@/services/utils/exceptions'
import {HostCredentialsAws, RequestHandler} from '@/services/hosts/aws_common'


// Types
export type AccountPlan = 'c'|'other'
export interface HostStorageGeneratedGracious {
    credentials:HostCredentialsAws
    username:string
    password:string
}


// Constants
const REGION = import.meta.env.VITE_HOSTED_REGION
const USER_POOL = import.meta.env.VITE_HOSTED_USER_POOL
const USER_POOL_CLIENT = import.meta.env.VITE_HOSTED_USER_POOL_CLIENT
const USER_POOL_PROVIDER = `cognito-idp.${REGION}.amazonaws.com/${USER_POOL}`
const IDENTITY_POOL = import.meta.env.VITE_HOSTED_IDENTITY_POOL
const API_URL = import.meta.env.VITE_HOSTED_API


export class HostUserGracious extends HostUserAwsBase implements HostUser {

    cloud:HostCloud = 'gracious'
    declare generated:HostStorageGeneratedGracious

    async update_email(address:string){
        // Change the email hash stored in the user object
        const login = await new_login(this.generated.username, this.generated.password)
        const user_pools = new CognitoIdentityProvider({region: REGION,
            requestHandler: new RequestHandler()})
        await user_pools.updateUserAttributes({
            AccessToken: login.AccessToken,
            UserAttributes: [{
                Name: 'custom:hashed_email',
                Value: buffer_to_url64(await generate_hash(string_to_utf8(address))),
            }],
        })
    }

    async update_services(task:Task):Promise<void>{
        // Not needed
    }

    async delete_services(task:Task):Promise<void>{
        // Delete all objects belonging to user
        await this._delete_objects(this.bucket, `messages/${this.user}/`)
        await this.s3.deleteObject({Bucket: this.bucket, Key: `config/${this.user}/config`})
        await this._delete_objects(this._bucket_resp_id, `responses/${this.user}/`)
        await this.s3.deleteObject({Bucket: this._bucket_resp_id, Key: `config/${this.user}/config`})
    }
}


export async function username_available(username:string){
    // Check if a username is available
    type AvailableResp = {valid:boolean, available:boolean}
    return request_json<AvailableResp>(`${API_URL}accounts/available`, {
        method: 'POST',
        json: {username},
    })
}


// The possible errors create function may return
type create_errors = 'username_invalid'|'username_taken'|'ip_limit_day'|'ip_limit_fortnight'


export class AccountsCreateError extends CustomError {
    // Create error expects error code as the message
    override message!:create_errors
}


export async function create_account(username:string, email:string, plan:AccountPlan){
    // Create new user
    type CreateOutput = {error?:create_errors, password?:string}
    const resp = await request_json<CreateOutput>(`${API_URL}accounts/create`, {
        method: 'POST',
        json: {
            username,
            hashed_email: buffer_to_url64(await generate_hash(string_to_utf8(email))),
            plan,
        },
    })

    // Throw for errors
    if (resp.error){
        throw new AccountsCreateError(resp.error)  // Pass error code as the message
    }

    // Get first tokens
    const login = await new_login(username, resp.password!)

    // Get the federated id (identity pool id) of the user (required when getting aws credentials)
    const identity_pools = new CognitoIdentity({region: REGION,
        requestHandler: new RequestHandler()})
    const id = await identity_pools.getId({
        IdentityPoolId: IDENTITY_POOL,
        Logins: {
            [USER_POOL_PROVIDER]: login.IdToken!,
        },
    })

    return {
        password: resp.password!,
        federated_id: id.IdentityId!,
        id_token: login.IdToken!,
        id_token_expires: login.id_token_expires,
    }
}


export async function new_login(username:string, password:string){
    // Login to Cognito user pool and return tokens (valid for 1 day)
    const user_pools = new CognitoIdentityProvider({region: REGION,
        requestHandler: new RequestHandler()})
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
    const identity_pools = new CognitoIdentity({region: REGION,
        requestHandler: new RequestHandler()})
    const resp = await identity_pools.getCredentialsForIdentity({
        IdentityId: federated_id,
        Logins: {
            [USER_POOL_PROVIDER]: id_token,
        },
    })
    return {
        accessKeyId: resp.Credentials!.AccessKeyId!,
        secretAccessKey: resp.Credentials!.SecretKey!,
        sessionToken: resp.Credentials!.SessionToken!,
    }
}
