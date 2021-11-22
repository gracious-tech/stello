
import {randomUUID, createHash} from 'crypto'

import {CognitoIdentityProvider, paginateListUsers} from '@aws-sdk/client-cognito-identity-provider'

import {config, username_allowed, username_valid, setup_handler} from './utils'


export interface CreateInput {
    username:string
    hashed_email:string
    plan:'c'|'other'
}


interface CreateOutput {
    error?:'username_invalid'|'username_taken'|'ip_limit_day'|'ip_limit_fortnight'
    password?:string
}


export const handler = setup_handler<CreateInput>(async (raw_input, ip):Promise<CreateOutput> => {
    // Create user

    /* SECURITY Regarding email address verification...
        Email addresses are not verified during account creation as no need to
            Addresses are hashed before request made, so no privacy issues
            Normal users are protected from spelling mistakes by Stello before creating account
            Malicious users can easily create infinite address variations anyway
                infinite+123@gmail.com
                infinite123@custom.domain
            Malicious users using someone else's address only grant that person permission to delete
        Instead addresses are verified during the only account action available: deletion
            User says what their address and username are
            Email address is validated to belong to the user (usual token send system)
            Address is hashed and compared with the hash stored for that user
                Account deleted if a match
            If user forgot their username
                Compute hash for every user in system and identify accounts they own
    */

    // Validate input types
    const input:CreateInput = {
        username: String(raw_input['username']),
        plan: raw_input['plan'] === 'other' ? 'other' : 'c',
        hashed_email: String(raw_input['hashed_email']),
    }

    // Confirm username valid
    if (!username_valid(input.username)){
        return {error: 'username_invalid'}
    }

    // Confirm username allowed
    if (!username_allowed(input.username)){
        return {error: 'username_taken'}
    }

    // Prepare client
    const user_pools = new CognitoIdentityProvider({region: config.region})

    // Hash ip so cannot be used to locate the user
    // SECURITY hashing ips isn't foolproof as due to limited number, computing every hash is doable
    //          so hashing only intended to provide basic protection
    //          Real protection comes from deleting the hash when it's no longer needed
    // NOTE Salt is same for every ip for comparison performance (weakens security but see above)
    const hashed_ip = createHash('sha256').update(`stello:${ip}`).digest().toString('base64')

    // Ensure username not taken, and throttle creations per ip
    const day_in_ms = 1000 * 60 * 60 * 24
    const day_ago = new Date().getTime() - day_in_ms
    const fortnight_ago = new Date().getTime() - day_in_ms * 14
    let creations_day = 0
    let creations_fortnight = 0
    const user_lister = paginateListUsers({client: user_pools}, {
        UserPoolId: config.user_pool,
    })
    for await (const users of user_lister){
        for (const user of users.Users ?? []){
            // Confirm username not taken
            if (user.Username === input.username){
                return {error: 'username_taken'}
            }
            // Prevent abuse by limiting creations per ip
            const user_hashed_ip =
                user.Attributes!.find(attr => attr.Name === 'dev:custom:hashed_ip')?.Value
            if (user_hashed_ip === hashed_ip){
                const created = user.UserCreateDate!.getTime()
                if (created > day_ago){
                    creations_day += 1
                    if (creations_day > 10){  // e.g. allows 10 people in one meeting to all signup
                        return {error: 'ip_limit_day'}
                    }
                }
                if (created > fortnight_ago){
                    creations_fortnight += 1
                    if (creations_fortnight > 20){  // e.g. allows an org to create many long term
                        return {error: 'ip_limit_fortnight'}
                    }
                }
            }
        }
    }

    // Create the user with given username
    await user_pools.adminCreateUser({
        UserPoolId: config.user_pool,
        Username: input.username,
        UserAttributes: [
            {Name: 'custom:hashed_email', Value: input.hashed_email},
            {Name: 'dev:custom:hashed_email_init', Value: input.hashed_email},
            {Name: 'dev:custom:hashed_ip', Value: hashed_ip},
            {Name: 'dev:custom:plan', Value: input.plan},
        ],
        MessageAction: 'SUPPRESS',  // Don't email user a welcome message (not that it could...)
    })

    // Skip requiring the user to change the password
    const password = randomUUID()
    await user_pools.adminSetUserPassword({
        UserPoolId: config.user_pool,
        Username: input.username,
        Password: password,
        Permanent: true,
    })

    // Return the generated password to requestor
    return {password}
})
