
import {CognitoIdentityProvider} from '@aws-sdk/client-cognito-identity-provider'

import {config, username_allowed, username_valid, setup_handler} from './utils'


interface AvailableInput {
    username:string
}


interface AvailableOutput {
    valid:boolean
    available:boolean
}


export const handler = setup_handler<AvailableInput>(async (raw_input, ip)
        :Promise<AvailableOutput> => {
    // Report whether given username is available for rego or not

    // Validate input types
    const input:AvailableInput = {
        username: String(raw_input.username),
    }

    // Confirm username valid
    if (!username_valid(input.username)){
        return {valid: false, available: false}
    }

    // Confirm username allowed
    if (!username_allowed(input.username)){
        return {valid: true, available: false}
    }

    // See if exists yet
    const user_pools = new CognitoIdentityProvider({region: config.region})
    try {
        await user_pools.adminGetUser({
            UserPoolId: config.user_pool,
            Username: input.username,
        })
    } catch (error){
        if (error instanceof Error && error.name === 'UserNotFoundException'){
            // No user exists with that username yet
            return {valid: true, available: true}
        }
        // Any other error is a bug
        throw error
    }
    // User exists...
    return {valid: true, available: false}
})
