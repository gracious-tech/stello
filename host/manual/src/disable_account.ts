
import {S3} from '@aws-sdk/client-s3'
import {CloudFormation} from '@aws-sdk/client-cloudformation'
import {CognitoIdentityProvider} from '@aws-sdk/client-cognito-identity-provider'

import {url64_to_buffer, string_to_utf8} from './utils/coding'
import {confirm_hash} from './utils/crypt'

import type {AdminGetUserCommandOutput} from '@aws-sdk/client-cognito-identity-provider'


export async function no404<T>(request:Promise<T>):Promise<T|undefined>{
    // Helper for ignoring 404 errors (which usually signify already deleted)
    return request.catch(error => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (error?.$metadata?.httpStatusCode === 404){
            return undefined  // Ignoring 404s
        }
        throw error
    })
}


export async function delete_objects(s3:S3, bucket:string, prefix=''):Promise<void>{
    // Delete all the objects in a bucket

    // Keep listing objects until none remain (don't need true pagination in that sense)
    while (true){

        // List any/all objects
        const list_resp = await no404(s3.listObjectsV2({Bucket: bucket, Prefix: prefix}))
        if (!list_resp?.Contents?.length){
            return
        }

        // Delete the objects listed
        const delete_resp = await s3.deleteObjects({
            Bucket: bucket,
            Delete: {
                Objects: list_resp.Contents.map(object => {
                    return {Key: object.Key}
                }),
                Quiet: true,  // Don't bother returning success data
            },
        })

        // Delete request may still have errors, even if doesn't throw itself
        if (delete_resp.Errors?.length){
            throw new Error("Could not delete all objects")
        }
    }
}


async function disable_account(region:string, stack:string, username:string, email:string,
        purge:boolean):Promise<null|'username'|'email'>{
    // Disable account if email used for that username
    // SECURITY Assumes consent already manually verified by email

    // Get resource ids via stack name
    const cf = new CloudFormation({region})
    const resources = (await cf.listStackResources({StackName: stack})).StackResourceSummaries!
    const user_pool = resources.find(i => i.LogicalResourceId === 'UserPool')!.PhysicalResourceId!
    const msgs_bucket =
        resources.find(i => i.LogicalResourceId === 'MessagesBucket')!.PhysicalResourceId!
    const resp_bucket =
        resources.find(i => i.LogicalResourceId === 'ResponsesBucket')!.PhysicalResourceId!

    // See if given username matches an account
    const user_pools = new CognitoIdentityProvider({region})
    let user:AdminGetUserCommandOutput
    try {
        user = await user_pools.adminGetUser({
            UserPoolId: user_pool,
            Username: username,
        })
    } catch (error){
        if (error instanceof Error && error.name === 'UserNotFoundException'){
            // No user exists with that username
            return 'username'
        }
        // Any other error is a bug
        throw error
    }

    // See if provided email matches hash for user's email
    const email_buf = string_to_utf8(email)
    const hashed_email64 =
            user.UserAttributes!.find(attr => attr.Name === 'custom:hashed_email')!.Value!
    const user_email_match = await confirm_hash(url64_to_buffer(hashed_email64), email_buf)

    // See if provided email matches hash for user's initial email
    // SECURITY Since initial email is checked too, if initial now used by someone else they could
    //    disable account, but low risk and user can just create a new account
    const hashed_email_init64 =
        user.UserAttributes!.find(attr => attr.Name === 'dev:custom:hashed_email_init')!.Value!
    const init_email_match = await confirm_hash(url64_to_buffer(hashed_email_init64), email_buf)

    // Confirm provided email is used by the account
    if (!user_email_match && !init_email_match){
        return 'email'  // Error - no match
    }

    // Disable the user so they can't sign in any more
    await user_pools.adminDisableUser({UserPoolId: user_pool, Username: username})

    // Disable responses by deleting existing ones and deleting config files
    const s3 = new S3({region})
    await delete_objects(s3, msgs_bucket, `config/${username}/`)
    if (purge){
        // Optionally also delete all messages (or otherwise let them expire naturally)
        await delete_objects(s3, msgs_bucket, `messages/${username}/`)
    }
    await delete_objects(s3, resp_bucket, `config/${username}/`)
    await delete_objects(s3, resp_bucket, `responses/${username}/`)

    // Success
    return null
}


// Execute
const arg_region = process.argv[2] ?? ''
const arg_stack = process.argv[3] ?? ''
const arg_username = process.argv[4] ?? ''
const arg_email = process.argv[5] ?? ''
const arg_purge = process.argv[6] === 'purge'
disable_account(arg_region, arg_stack, arg_username, arg_email, arg_purge).then(error => {
    if (error === null){
        console.info("Successfully disabled account")
    } else if (error === 'email'){
        console.error(`Email address does not match account: ${arg_email}`)
    } else if (error === 'username'){
        console.error(`User does not exist: ${arg_username}`)
    } else {
        throw error
    }
}).catch(unknown_error => {
    console.error(unknown_error)
})
