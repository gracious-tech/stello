
import {HostUserAwsBase} from '@/services/hosts/aws_user_base'
import {HostUser} from '@/services/hosts/types'
import {Task} from '@/services/tasks/tasks'


export class HostUserAws extends HostUserAwsBase implements HostUser {

    _gateway_id_cache:string|undefined = undefined

    async update_email(address:string){
        // Subscribe user to notifications for responses

        // Remove existing subscription if any
        const account_id = await this._get_account_id()
        const topic_arn = `arn:aws:sns:${this.region}:${account_id}:${this._topic_id}`
        const list_resp = await this.sns.listSubscriptionsByTopic({
            TopicArn: topic_arn,
        })
        for (const sub of list_resp.Subscriptions ?? []){
            // NOTE Expecting only one subscription in this loop at most
            if (sub.Endpoint === address){
                // Already subscribed so just finish
                return
            }
            if (!sub.SubscriptionArn?.startsWith('arn:')){
                // ARN value is "PendingConfirmation" when haven't confirmed yet
                continue  // Can't unsubscribe if haven't confirmed it yet
            }
            await this.sns.unsubscribe({SubscriptionArn: sub.SubscriptionArn})
        }

        // Create subscription
        // NOTE Still create even if mode 'none' so don't have to confirm email later if change
        await this.sns.subscribe({
            TopicArn: topic_arn,
            Protocol: 'email',
            Endpoint: address,
        })
    }

    async delete_services(task:Task):Promise<void>{
        // Delete services for this storage set
        task.upcoming(7)

        // Delete services
        await task.expected(
            // Buckets
            this._delete_bucket(this.bucket),
            this._delete_bucket(this._bucket_resp_id),
            // Other
            this._get_api_id().then(api_id => api_id && this.gateway.deleteApi({ApiId: api_id})),
            no404(this.lambda.deleteFunction({FunctionName: this._lambda_id})),
            no404(this.sns.deleteTopic({TopicArn: await this._get_topic_arn()})),
            no404(this.iam.deleteRolePolicy({RoleName: this._lambda_role_id, PolicyName: 'stello'}))
                .then(() => no404(this.iam.deleteRole({RoleName: this._lambda_role_id}))),
        )

        // Delete user last, as a consistant way of knowing if all services deleted
        await task.expected(this._delete_user(this._user_id))
    }

    async _delete_bucket(bucket:string):Promise<void>{
        // Delete a bucket
        await this._empty_bucket(bucket)
        await no404(this.s3.deleteBucket({Bucket: bucket}))
    }

    async _empty_bucket(bucket:string):Promise<void>{
        // Delete all the objects in a bucket

        // Keep listing objects until none remain (don't need true pagination in that sense)
        while (true){

            // List any/all objects
            const list_resp = await no404(this.s3.listObjectsV2({Bucket: bucket}))
            if (!list_resp?.Contents?.length){
                return
            }

            // Delete the objects listed
            const delete_resp = await this.s3.deleteObjects({
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

    async _delete_user(user_id:string):Promise<void>{
        // Completely delete a user

        // User's policy must first be deleted
        await no404(this.iam.deleteUserPolicy({UserName: user_id, PolicyName: 'stello'}))

        // Must also first delete any keys
        await this._delete_user_keys(user_id)

        // Can now finally delete the user
        await no404(this.iam.deleteUser({UserName: user_id}))
    }

    async _delete_user_keys(user_id:string):Promise<void>{
        // Delete all user's access keys
        const existing = await no404(this.iam.listAccessKeys({UserName: user_id}))
        if (!existing){
            return
        }
        await Promise.all((existing.AccessKeyMetadata ?? []).map(key => {
            return this.iam.deleteAccessKey({
                UserName: user_id,
                AccessKeyId: key.AccessKeyId,
            })
        }))
    }

    async _get_api_id():Promise<string|undefined>{
        // Get the id for API gateway (null if doesn't exist)
        if (!this._gateway_id_cache){
            // NOTE ResourceTypeFilters does not work (seems to be an AWS bug) so manually filtering
            const resp = await this.tagging.getResources({
                TagFilters: [{Key: 'stello', Values: [this.bucket]}]})
            const arn = (resp.ResourceTagMappingList ?? [])
                .map(i => i.ResourceARN?.split(':') ?? [])  // Get ARN parts
                .filter(i => i[2] === 'apigateway')[0]  // Only match API gateway
                // Should only be one if any `[0]`
            this._gateway_id_cache = arn?.[5]?.split('/')[2]  // Extract gateway id part
        }
        return this._gateway_id_cache
    }
}


interface AwsError extends Error {
    $metadata?:{
        httpStatusCode?:number
    }
}


async function no404<T>(request:Promise<T>):Promise<T|undefined>{
    // Helper for ignoring 404 errors (which usually signify already deleted)
    return request.catch(error => {
        if (error instanceof Error && (error as AwsError).$metadata?.httpStatusCode === 404){
            return undefined  // Ignoring 404s
        }
        throw error
    })
}
