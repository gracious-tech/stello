
import {IAMClient, GetUserCommand, GetUserCommandInput, GetRoleCommand, GetRoleCommandInput}
    from '@aws-sdk/client-iam'
import {WaiterConfiguration, WaiterResult, WaiterState, checkExceptions, createWaiter}
    from "@aws-sdk/util-waiter"


export class StorageBaseAws {

    bucket!:string
    region!:string

    get _bucket_id():string{
        return this.bucket
    }

    get _bucket_arn():string{
        return `arn:aws:s3:::${this.bucket}`
    }

    get _bucket_domain():string{
        return `${this.bucket}.s3-${this.region}.amazonaws.com`
    }

    get _bucket_resp_id():string{
        return `${this.bucket}-stello-responses`
    }

    get _bucket_resp_arn():string{
        return `arn:aws:s3:::${this._bucket_resp_id}`
    }

    get _user_id():string{
        return `stello-${this.bucket}`
    }

    get _topic_id():string{
        return `stello-${this.bucket}`
    }

    get _lambda_id():string{
        return `stello-${this.bucket}`
    }

    get _lambda_role_id():string{
        return `stello-${this.bucket}-lambda`
    }
}


export async function waitUntilUserExists(params:WaiterConfiguration<IAMClient>,
        input:GetUserCommandInput):Promise<WaiterResult>{
    // A waiter for IAM user creation
    // TODO Waiting on https://github.com/aws/aws-sdk-js-v3/issues/2473#issuecomment-864720948
    return checkExceptions(await createWaiter(
        {minDelay: 1, maxDelay: 120, ...params}, input, async (client, cmd_input) => {
            try {
                return {
                    state: WaiterState.SUCCESS,
                    reason: await client.send(new GetUserCommand(cmd_input)),
                }
            } catch (exception){
                return {state: WaiterState.RETRY, reason: exception}
            }
        },
    ))
}


export async function waitUntilRoleExists(params:WaiterConfiguration<IAMClient>,
        input:GetRoleCommandInput):Promise<WaiterResult>{
    // A waiter for IAM role creation
    // TODO Waiting on https://github.com/aws/aws-sdk-js-v3/issues/2473#issuecomment-864720948
    return checkExceptions(await createWaiter(
        {minDelay: 1, maxDelay: 120, ...params}, input, async (client, cmd_input) => {
            try {
                return {
                    state: WaiterState.SUCCESS,
                    reason: await client.send(new GetRoleCommand(cmd_input)),
                }
            } catch (exception){
                return {state: WaiterState.RETRY, reason: exception}
            }
        },
    ))
}
