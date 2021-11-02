
import {waitUntilBucketExists} from '@aws-sdk/client-s3'
import {waitUntilRoleExists} from '@aws-sdk/client-iam'
import {GetFunctionCommandOutput, waitUntilFunctionExists} from '@aws-sdk/client-lambda'

import app_config from '@/app_config.json'
import {HostUserAwsBase} from '@/services/hosts/aws_user_base'
import {HostCloud, HostUser} from '@/services/hosts/types'
import {Task} from '@/services/tasks/tasks'
import {buffer_to_hex} from '@/services/utils/coding'
import {sleep} from '@/services/utils/async'
import {untar} from '@/services/misc'
import {displayer_asset_type, HostPermissionError, HOST_STORAGE_VERSION} from './common'
import {maxWaitTime, AwsError, no404, HostStorageGeneratedAws} from '@/services/hosts/aws_common'


export class HostUserAws extends HostUserAwsBase implements HostUser {

    cloud:HostCloud = 'aws'
    declare generated:HostStorageGeneratedAws

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

    async update_services(task:Task):Promise<void>{
        // Ensure host services setup properly (sets up all services, not just storage)
        // NOTE Will create if storage doesn't exist, or fail if storage id taken by third party
        task.upcoming(11)
        try {
            // Run rest of tasks in parallel
            await task.expected(
                this._setup_bucket_configure(),
                this._setup_resp_bucket(),
                this._setup_lambda_role().then(async () => {
                    await task.expected(this._setup_lambda())  // Relies on lambda role
                    await task.expected(this._setup_gateway())  // Relies on lambda
                }),
                this._setup_sns(),
            )

            // Setup displayer last since relies on bucket creation finishing and gateway existing
            await task.expected(this._setup_displayer())

            // Update setup version tag on bucket to mark setup as completing successfully
            await task.expected(this.s3.putBucketTagging({
                Bucket: this.bucket,
                Tagging: {TagSet: [
                    {Key: 'stello', Value: this.bucket},  // To not overwrite existing
                    {Key: 'stello-version', Value: `${HOST_STORAGE_VERSION}`},
                ]},
            }))

        } catch (error){
            // Convert permission errors into a generic form so app can handle differently
            throw (error as AwsError)?.name === 'Forbidden'
                ? new HostPermissionError((error as AwsError)?.message) : error
        }
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
            this._get_api_id().then(
                (api_id):unknown => api_id && no404(this.gateway.deleteApi({ApiId: api_id}))),
            no404(this.lambda.deleteFunction({FunctionName: this._lambda_id})),
            no404(this.sns.deleteTopic({TopicArn: await this._get_topic_arn()})),
            no404(this.iam.deleteRolePolicy({RoleName: this._lambda_role_id, PolicyName: 'stello'}))
                .then(() => no404(this.iam.deleteRole({RoleName: this._lambda_role_id}))),
        )

        // Once deleted everything (except user and permissions boundary), revoke own access
        // NOTE May not exist if this method is being called by HostManager
        await no404(this.iam.deleteAccessKey({
            UserName: this._user_id,
            AccessKeyId: this.generated.credentials.accessKeyId,
        }))
    }


    // PRIVATE (generic)

    async _get_topic_arn():Promise<string>{
        // SNS always requires the account id in topic arns
        const account_id = await this._get_account_id()
        return `arn:aws:sns:${this.region}:${account_id}:${this._topic_id}`
    }

    async _get_lambda_arn():Promise<string>{
        // Lambda arn must include account id (at least for permissions policies)
        const account_id = await this._get_account_id()
        return `arn:aws:lambda:${this.region}:${account_id}:function:${this._lambda_id}`
    }

    async _get_lambda_role_arn():Promise<string>{
        // Arn with account required when creating lambda
        const account_id = await this._get_account_id()
        return `arn:aws:iam::${account_id}:role/${this._lambda_role_id}`
    }

    async _get_lambda_boundary_arn():Promise<string>{
        // Arn with account required when creating lambda role
        const account_id = await this._get_account_id()
        return `arn:aws:iam::${account_id}:policy/${this._lambda_boundary_id}`
    }

    async _get_api_id():Promise<string|undefined>{
        // Get the id for API gateway
        // NOTE May be provided already in generated prop, otherwise auto-detect
        if (!this.generated.api_id){
            // NOTE ResourceTypeFilters does not work (seems to be an AWS bug) so manually filtering
            const resp = await this.tagging.getResources({
                TagFilters: [{Key: 'stello', Values: [this.bucket]}]})
            const arn = (resp.ResourceTagMappingList ?? [])
                .map(i => i.ResourceARN?.split(':') ?? [])  // Get ARN parts
                .filter(i => i[2] === 'apigateway')[0]  // Only match API gateway
                // Should only be one if any `[0]`
            this.generated.api_id = arn?.[5]?.split('/')[2]  // Extract gateway id part
        }
        return this.generated.api_id
    }


    // PRIVATE (setup)

    async _setup_displayer():Promise<void>{
        // Upload displayer, configured with deployment config

        // Get list of files in displayer tar
        const files = await untar(await self.app_native.read_file('displayer.tar'))

        // Start uploading displayer assets and collect promises that resolve with their path
        const uploads:Promise<string>[] = []
        let index_contents:Uint8Array
        for (const file of files){

            // Actual files have type ''|'0' (others may be directory etc)
            if (file.type !== '' && file.type !== '0'){
                continue
            }

            // Index should be uploaded last so that assets are ready (important for updates)
            if (file.name === 'index.html'){
                index_contents = new Uint8Array(file.buffer)
                continue
            }

            // Upload
            uploads.push(this.s3.putObject({
                Bucket: this.bucket,
                Key: file.name,
                ContentType: displayer_asset_type(file.name),
                ContentEncoding: 'gzip',
                Body: new Uint8Array(file.buffer),
            }).then(() => file.name))
        }

        // Once other files have been uploaded, can upload index and remove old assets
        await Promise.all(uploads).then(async upload_paths => {

            // Upload the index
            await this.s3.putObject({
                Bucket: this.bucket,
                Key: '_',
                ContentType: 'text/html',
                ContentEncoding: 'gzip',
                Body: index_contents,
            })

            // List all old assets
            // NOTE Pagination not used since limit is 1000
            const list_resp = await this.s3.listObjectsV2({
                Bucket: this.bucket,
                Prefix: 'displayer/',
            })
            const old_assets = list_resp.Contents?.filter(item => !upload_paths.includes(item.Key!))
            if (!old_assets?.length){
                return
            }

            // Delete old assets (and wait till all deleted)
            const delete_resp = await this.s3.deleteObjects({
                Bucket: this.bucket,
                Delete: {
                    Objects: old_assets.map(asset => ({Key: asset.Key})),
                    Quiet: true,  // Don't bother returning success data
                },
            })

            // Delete request may still have errors, even if doesn't throw itself
            if (delete_resp.Errors?.length){
                throw new Error("Could not delete all objects")
            }
        })
    }

    async _setup_bucket_configure():Promise<void>{
        // Ensure bucket is correctly configured
        // NOTE The following tasks conflict (409 errors) and cannot be run in parallel

        // Ensure bucket creation has finished, as these tasks rely on it (not just securing id)
        await waitUntilBucketExists({client: this.s3, maxWaitTime}, {Bucket: this.bucket})

        // Set tag
        await this.s3.putBucketTagging({
            Bucket: this.bucket,
            Tagging: {TagSet: [{Key: 'stello', Value: this.bucket}]},
        })

        // Set encryption config
        // SECURITY Sensitive data already encrypted, but this may still help some assets
        await this.s3.putBucketEncryption({
            Bucket: this.bucket,
            ServerSideEncryptionConfiguration: {
                Rules: [{ApplyServerSideEncryptionByDefault: {SSEAlgorithm: 'AES256'}}],
            },
        })

        // Generate list of expiry rules for possible lifespan values (1 day - 2 years)
        // NOTE Limit is 1,000 rules
        const rules = [...Array(365 * 2).keys()].map(n => n + 1).map(n => {
            return {
                Status: 'Enabled',
                Expiration: {Days: n},
                Filter: {Tag: {Key: 'stello-lifespan', Value: `${n}`}},
            }
        })

        // Include zero rule, just in case (shouldn't ever be used; 1 day value since 0 invalid)
        rules.push({
            Status: 'Enabled',
            Expiration: {Days: 1},
            Filter: {Tag: {Key: 'stello-lifespan', Value: '0'}},
        })

        // Set expiry policies
        await this.s3.putBucketLifecycleConfiguration({
            Bucket: this.bucket,
            LifecycleConfiguration: {Rules: rules},
        })

        // Set access policy
        await this.s3.putBucketPolicy({
            Bucket: this.bucket,
            Policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: {Effect: 'Allow', Principal: '*', Action: 's3:GetObject',
                    Resource: `${this._bucket_arn}/*`},
            }),
        })
    }

    async _setup_resp_bucket():Promise<void>{
        // Create and configure responses bucket
        // NOTE Configure tasks can't be run in parallel

        // Ensure bucket has been created
        try {
            await this.s3.headBucket({Bucket: this._bucket_resp_id})
        } catch (error){
            if (!(error instanceof Error) || error.name !== 'NotFound'){
                throw error
            }
            await this.s3.createBucket({Bucket: this._bucket_resp_id})
        }
        await waitUntilBucketExists({client: this.s3, maxWaitTime},
            {Bucket: this._bucket_resp_id})

        // Set tag
        await this.s3.putBucketTagging({
            Bucket: this._bucket_resp_id,
            Tagging: {TagSet: [{Key: 'stello', Value: this.bucket}]},
        })

        // Set encryption config
        // SECURITY Responses already encrypted, but can't do any harm!
        await this.s3.putBucketEncryption({
            Bucket: this._bucket_resp_id,
            ServerSideEncryptionConfiguration: {
                Rules: [{ApplyServerSideEncryptionByDefault: {SSEAlgorithm: 'AES256'}}],
            },
        })
    }

    async _setup_gateway():Promise<void>{
        // Tell lambda that gateway has permission to invoke it
        const account_id = await this._get_account_id()
        const api_id = await this._get_api_id()
        try {
            await this.lambda.addPermission({
                FunctionName: this._lambda_id,
                StatementId: 'gateway',
                Action: 'lambda:InvokeFunction',
                Principal: 'apigateway.amazonaws.com',
                // NOTE Special ARN for executing gateway (has separate arn for regular config)
                SourceArn: `arn:aws:execute-api:${this.region}:${account_id}:${api_id!}/*`,
            })
        } catch (error){
            if ((error as AwsError)?.$metadata?.httpStatusCode !== 409){
                throw error
            }
        }
    }

    async _setup_lambda_role():Promise<void>{
        // Create IAM role for the lambda function to assume

        // Ensure role exists
        try {
            await this.iam.createRole({
                RoleName: this._lambda_role_id,
                Tags: [{Key: 'stello', Value: this.bucket}],
                PermissionsBoundary: await this._get_lambda_boundary_arn(),
                AssumeRolePolicyDocument: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [
                        // Allow lambda functions to assume this role
                        // SECURITY Can't seem to restrict to a specific lambda, but not an issue
                        //      since need root access to set the `Role` on the lambda anyway
                        {Effect: 'Allow', Principal: {Service: 'lambda.amazonaws.com'},
                            Action: 'sts:AssumeRole'},
                    ],
                }),
            })
        } catch (error){
            if ((error as AwsError)?.name !== 'EntityAlreadyExists'){
                throw error
            }
        }

        // May need to wait if still creating role
        await waitUntilRoleExists({client: this.iam, maxWaitTime},
            {RoleName: this._lambda_role_id})

        // What the function will be allowed to do
        const statements = [

            // Allow getting/modifying tags and deleting objects (for applying max reads)
            {Effect: 'Allow', Resource: `${this._bucket_arn}/*`,
                Action: ['s3:GetObjectTagging', 's3:PutObjectTagging', 's3:DeleteObject']},

            // Put responses and list how many
            {Effect: 'Allow', Resource: this._bucket_resp_arn, Action: ['s3:ListBucket']},
            {Effect: 'Allow', Resource: `${this._bucket_resp_arn}/*`,
                Action: ['s3:GetObject', 's3:PutObject']},

            // Publish notifications to SNS topic
            {Effect: 'Allow', Resource: await this._get_topic_arn(), Action: ['sns:Publish']},
        ]

        // Update the policy
        await this.iam.putRolePolicy({
            RoleName: this._lambda_role_id,
            PolicyName: 'stello',
            PolicyDocument: JSON.stringify({Version: '2012-10-17', Statement: statements}),
        })

        // Lambda requires a significant amount of time before it can discover this role
        await sleep(12000)
    }

    _setup_lambda_config_has_changed(fn_config:Record<string, unknown>,
            fn_config_env:Record<string, string>, resp:GetFunctionCommandOutput):boolean{
        // Return boolean for whether function config has changed since last updated

        // Compare simple config values
        for (const key in fn_config){
            if ((resp.Configuration as Record<string, unknown>)?.[key] !== fn_config[key]){
                return true
            }
        }

        // Compare env vars
        for (const key in fn_config_env){
            if (resp.Configuration?.Environment?.Variables?.[key] !== fn_config_env[key]){
                return true
            }
        }

        return false
    }

    async _setup_lambda():Promise<void>{
        // Setup lambda for handling recipient responses
        // SECURITY Lambda code managed by admin rather than user to prevent malicious code uploads

        // Load code so can deploy or compare
        const fn_code = new Uint8Array(await self.app_native.read_file('responder_aws.zip'))

        // Function config that can be used in a create or update request
        const fn_config = {
            FunctionName: this._lambda_id,
            Runtime: 'python3.9',
            Role: await this._get_lambda_role_arn(),
            Handler: 'responder.entry',
            Timeout: 5,
            MemorySize: 128,  // Smallest possible
        }
        const fn_config_env = {
            stello_env: 'production',
            stello_version: app_config.version,
            stello_msgs_bucket: this.bucket,
            stello_topic_arn: await this._get_topic_arn(),
            stello_region: this.region,
            stello_rollbar_responder: import.meta.env.VITE_ROLLBAR_RESPONDER,
        }

        // Try get current function's config, else create function
        let resp:GetFunctionCommandOutput
        try {
            resp = await this.lambda.getFunction({FunctionName: this._lambda_id})
        } catch (error){
            if ((error as AwsError)?.$metadata?.httpStatusCode === 404){
                // Function doesn't exist, so create and return when done
                await this.lambda.createFunction({
                    ...fn_config,
                    Environment: {Variables: fn_config_env},
                    Code: {ZipFile: fn_code},
                    Tags: {stello: this.bucket},
                })
                await waitUntilFunctionExists(
                    {client: this.lambda, maxWaitTime},
                    {FunctionName: this._lambda_id},
                )
                return
            }
            // An error actually occured
            throw error
        }

        // May need to wait for function still if recently created
        if (resp.Configuration!.StateReasonCode === 'Creating'){
            await waitUntilFunctionExists(
                {client: this.lambda, maxWaitTime},
                {FunctionName: this._lambda_id},
            )
        }

        // See if need to update the function's config
        if (this._setup_lambda_config_has_changed(fn_config, fn_config_env, resp)){
            await this.lambda.updateFunctionConfiguration({
                ...fn_config,
                Environment: {Variables: fn_config_env},
            })
        }

        // See if need to update the function's code
        const code_digest = buffer_to_hex(await crypto.subtle.digest('SHA-256', fn_code))
        if (resp.Configuration!.CodeSha256 !== code_digest){
            await this.lambda.updateFunctionCode({
                FunctionName: this._lambda_id,
                ZipFile: fn_code,
            })
        }
    }

    async _setup_sns():Promise<void>{
        // Setup SNS topic for notifying about responses
        try {
            await this.sns.createTopic({
                Name: this._topic_id,
                Tags: [{Key: 'stello', Value: this.bucket}],
            })
        } catch (error){
            if ((error as AwsError)?.name !== 'EntityAlreadyExists'){
                throw error
            }
        }
    }

    // PRIVATE (deletion)

    async _delete_bucket(bucket:string):Promise<void>{
        // Delete a bucket
        await this._delete_objects(bucket)
        await no404(this.s3.deleteBucket({Bucket: bucket}))
    }
}
