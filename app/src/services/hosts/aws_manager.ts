// Management of sets of storage services
// NOTE Must be reuseable outside of Stello app as well (e.g. automation of new users)

import pako from 'pako'
import untar from 'js-untar'
import {SSM} from '@aws-sdk/client-ssm'
import {IAM} from '@aws-sdk/client-iam'
import {EC2} from '@aws-sdk/client-ec2'
import {SNS} from '@aws-sdk/client-sns'
import {STS} from '@aws-sdk/client-sts'
import {ApiGatewayV2} from '@aws-sdk/client-apigatewayv2'
import {ResourceGroupsTaggingAPI} from '@aws-sdk/client-resource-groups-tagging-api'
import {S3, waitUntilBucketExists} from '@aws-sdk/client-s3'
import {GetFunctionCommandOutput, Lambda, UpdateFunctionConfigurationCommandInput,
    waitUntilFunctionExists} from '@aws-sdk/client-lambda'

import app_config from '@/app_config.json'
import {buffer_to_hex, string_to_utf8} from '@/services/utils/coding'
import {sleep} from '@/services/utils/async'
import {Task} from '@/services/tasks/tasks'
import {DeploymentConfig} from '@/shared/shared_types'
import {StorageBaseAws, waitUntilUserExists, waitUntilRoleExists} from './aws_common'
import {HostCloud, HostCredentials, HostManager, HostManagerStorage, HostPermissionError,
    HostStorageCredentials, HostStorageVersion} from './types'
import {displayer_asset_type} from './common'


export class HostManagerAws implements HostManager {
    // Management access to host's API for setting up new users

    cloud:HostCloud = 'aws'
    credentials:HostCredentials

    ssm:SSM
    s3:S3
    iam:IAM
    ec2:EC2  // Used only to get available regions
    s3_accessible = true

    constructor(credentials:HostCredentials){
        // Requires key with either root access or all necessary permissions for managing users
        this.credentials = credentials

        // Set a default region as some services require it (just to list resources, not create)
        const region = 'us-west-2'

        // Init services
        const aws_creds = {accessKeyId: credentials.key_id, secretAccessKey: credentials.key_secret}
        this.ssm = new SSM({apiVersion: '2014-11-06', credentials: aws_creds, region})
        this.s3 = new S3({apiVersion: '2006-03-01', credentials: aws_creds, region})
        this.iam = new IAM({apiVersion: '2010-05-08', credentials: aws_creds, region})
        this.ec2 = new EC2({apiVersion: '2016-11-15', credentials: aws_creds, region})

        // Give best guess as to whether have permission to head/create buckets or not
        // Used to determine if forbidden errors due to someone else owning bucket or not
        // NOTE Done early on to speed up `bucket_available` results
        this.s3.listBuckets({}).catch(error => {
            // If forbidden then don't have s3:ListAllMyBuckets permission
            // Then assume also don't have permission to headBucket, so can't know if exists or not
            // TODO `error.name` is buggy https://github.com/aws/aws-sdk-js-v3/issues/1596
            this.s3_accessible = error.$metadata.httpStatusCode !== 403
        })
    }

    async list_storages():Promise<HostManagerStorageAws[]>{
        // Get list of instances of HostManagerStorageAws for all detected in host account
        // NOTE Returns instances for any remaining Stello users, regardless if other services exist
        //      Should therefore remove user last, when deleting storage, to ensure full deletion

        // Get all Stello users
        const storages = []
        let marker
        while (true){

            // Get only users under the /stello/ path
            const params = {PathPrefix: '/stello/', Marker: marker}
            const resp = await this.iam.listUsers(params)

            // Extract bucket/region from user's name/path and use to init HostManagerStorageAws
            storages.push(...resp.Users.map(async user => {
                const bucket = user.UserName.slice('stello-'.length)  // 'stello-{id}'
                const region = user.Path.split('/')[2]  // '/stello/{region}/'
                // Fetch completed setup version (else undefined)
                // NOTE Despite mentioning it, listUsers does NOT include tags in results itself
                const tags = await this.iam.listUserTags({UserName: user.UserName})
                let v = parseInt(tags.Tags.find(t => t.Key === 'stello-version')?.Value, 10)
                v = Number.isNaN(v) ? undefined : v
                return new HostManagerStorageAws(this.credentials, bucket, region, v)
            }))

            // Handle pagination
            marker = resp.Marker
            if (!resp.IsTruncated){
                break
            }
        }
        return Promise.all(storages)
    }

    async list_regions():Promise<string[]>{
        /* List regions that are available for use

        AWS stores regions in a public parameter store
        https://docs.aws.amazon.com/systems-manager/latest/userguide
            /parameter-store-public-parameters.html
        However it cannot be known if account has opted into all those regions, as regions created
            after 20 March 2019 must be opted-in to use
        If checking that store you must also filter out non-standard partitions aws-cn/aws-us-gov
            See `/aws/service/global-infrastructure/regions/${region}/partition`
        And then also confirm all the regions have all the required services available
            See `/aws/service/global-infrastructure/services/${service}/regions`

        Where as ec2 has a helpful command for listing all services that are available
            and also whether they have been opted-in to
        It is assumed that an region that supports ec2 would also support the services Stello needs

        */
        const regions_resp = await this.ec2.describeRegions({
            Filters: [{Name: 'opt-in-status', Values: ['opt-in-not-required', 'opted-in']}],
        })
        return regions_resp.Regions.map(region => region.RegionName)
    }

    async get_region_name(region:string):Promise<string>{
        // Return human name for given region
        const path = `/aws/service/global-infrastructure/regions/${region}/longName`
        const resp = await this.ssm.getParameter({Name: path})
        return resp.Parameter.Value
    }

    async bucket_available(bucket:string):Promise<boolean>{
        // See if a storage id is available
        // NOTE Returns false if taken (whether by own account or third party)
        // TODO `error.name` is buggy https://github.com/aws/aws-sdk-js-v3/issues/1596
        try {
            await this.s3.headBucket({Bucket: bucket})
            return false  // Bucket exists and we own it, so not available
        } catch (error){
            if (error.name === 'NotFound'){
                return true  // Bucket doesn't exist, so is available
            } else if (error.$metadata.httpStatusCode === 301){
                return false  // Bucket exists in a different region to the request
            } else if (error.$metadata.httpStatusCode === 403){
                // Was not allowed to access the bucket
                if (this.s3_accessible){
                    return false  // Can access S3 so bucket must be owned by someone else
                }
                throw new HostPermissionError(error)  // Should have been allowed but wasn't
            }
            // Error not a permissions issue, so reraise
            throw error
        }
    }

    new_storage(bucket:string, region:string):HostManagerStorageAws{
        // Create instance for a new storage set of services (without actually doing anything yet)
        return new HostManagerStorageAws(this.credentials, bucket, region)
    }
}


export class HostManagerStorageAws extends StorageBaseAws implements HostManagerStorage {

    cloud:HostCloud = 'aws'
    credentials:HostCredentials
    version:number

    tagging:ResourceGroupsTaggingAPI
    iam:IAM
    s3:S3
    gateway:ApiGatewayV2
    lambda:Lambda
    sns:SNS
    sts:STS

    _account_id_cache:string
    _gateway_id_cache:string

    constructor(credentials:HostCredentials, bucket:string, region:string, version?:number){
        super()

        // Store args
        this.credentials = credentials
        this.bucket = bucket
        this.region = region
        this.version = version

        // Init services
        const aws_creds = {accessKeyId: credentials.key_id, secretAccessKey: credentials.key_secret}
        this.tagging = new ResourceGroupsTaggingAPI({apiVersion: '2017-01-26',
            credentials: aws_creds, region})
        this.iam = new IAM({apiVersion: '2010-05-08', credentials: aws_creds, region})
        this.s3 = new S3({apiVersion: '2006-03-01', credentials: aws_creds, region})
        this.gateway = new ApiGatewayV2({apiVersion: '2018-11-29', credentials: aws_creds, region})
        this.lambda = new Lambda({apiVersion: '2015-03-31', credentials: aws_creds, region})
        this.sns = new SNS({apiVersion: '2010-03-31', credentials: aws_creds, region})
        this.sts = new STS({apiVersion: '2011-06-15', credentials: aws_creds, region})
    }

    get up_to_date():boolean{
        // Whether storage's services are up to date
        return this.version >= HostStorageVersion
    }

    async setup_services(task:Task):Promise<void>{
        // Ensure host services setup properly (sets up all services, not just storage)
        // NOTE Will create if storage doesn't exist, or fail if storage id taken by third party
        task.upcoming(11)
        try {
            // Ensure bucket created, as everything else pointless if can't create
            // NOTE Don't need to wait for ready state though, can work on other tasks without that
            await task.expected(this._setup_bucket_create())

            // Ensure user created first, as detecting storages depends on it
            // NOTE May need to manually resolve if bucket created but nothing else (can't detect)
            await task.expected(this._setup_user_create())

            // Run rest of tasks in parallel
            await task.expected(
                this._setup_bucket_configure(),
                this._setup_resp_bucket(),
                this._setup_user_configure(),
                this._setup_lambda_role().then(async () => {
                    await task.expected(this._setup_lambda())  // Relies on lambda role
                    await task.expected(this._setup_gateway())  // Relies on lambda
                }),
                this._setup_sns(),
            )

            // Setup displayer last since relies on bucket creation finishing and gateway existing
            await task.expected(this._setup_displayer())

            // Update setup version tag on user to mark setup as completing successfully
            await task.expected(this.iam.tagUser({
                UserName: this._user_id,
                Tags: [{Key: 'stello-version', Value: `${HostStorageVersion}`}],
            }))

        } catch (error){
            // Convert permission errors into a generic form so app can handle differently
            throw error?.name === 'Forbidden' ? new HostPermissionError(error) : error
        }
    }

    async new_credentials():Promise<HostStorageCredentials>{
        // Generate the credentials the user needs to have to access the storage (remove existing)
        // NOTE AWS only allows 2 keys to exist per user

        // First delete existing keys
        await this._delete_user_keys(this._user_id)

        // Create new key
        const user_key = await this.iam.createAccessKey({UserName: this._user_id})

        // Return credentials
        return {
            credentials: {
                key_id: user_key.AccessKey.AccessKeyId,
                key_secret: user_key.AccessKey.SecretAccessKey,
            },
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
            this._get_api_id().then(api_id => api_id && this.gateway.deleteApi({ApiId: api_id})),
            no404(this.lambda.deleteFunction({FunctionName: this._lambda_id})),
            no404(this.sns.deleteTopic({TopicArn: await this._get_topic_arn()})),
            no404(this.iam.deleteRolePolicy({RoleName: this._lambda_role_id, PolicyName: 'stello'}))
                .then(() => no404(this.iam.deleteRole({RoleName: this._lambda_role_id}))),
        )

        // Delete user last, as a consistant way of knowing if all services deleted
        await task.expected(this._delete_user(this._user_id))
    }

    // PRIVATE METHODS

    async _get_account_id():Promise<string>{
        // Some requests strictly require the account id to be specified
        if (!this._account_id_cache){
            this._account_id_cache = (await this.sts.getCallerIdentity({})).Account
        }
        return this._account_id_cache
    }

    async _get_api_id():Promise<string|undefined>{
        // Get the id for API gateway (null if doesn't exist)
        if (!this._gateway_id_cache){
            // NOTE ResourceTypeFilters does not work (seems to be an AWS bug) so manually filtering
            const resp = await this.tagging.getResources({
                TagFilters: [{Key: 'stello', Values: [this.bucket]}]})
            const arn = resp.ResourceTagMappingList
                .map(i => i.ResourceARN.split(':'))  // Get ARN parts
                .filter(i => i[2] === 'apigateway')[0]  // Only match API gateway
                // Should only be one if any `[0]`
            this._gateway_id_cache = arn && arn[5].split('/')[2]  // Extract gateway id part
        }
        return this._gateway_id_cache
    }

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

    async _setup_bucket_create():Promise<void>{
        // Ensure bucket has been created
        try {
            await this.s3.headBucket({Bucket: this.bucket})
        } catch (error){
            if (error.name !== 'NotFound'){
                throw error
            }
            await this.s3.createBucket({Bucket: this.bucket})
        }
    }

    async _setup_displayer():Promise<void>{
        // Upload displayer, configured with deployment config

        // Define displayer's deployment config for later embedding in displayer code
        const api_id = await this._get_api_id()
        const deployment_config = JSON.stringify({
            url_msgs: `./`,  // Same URL as displayer for self-hosted AWS
            url_msgs_append_subdomain: false,
            url_responder: `https://${api_id}.execute-api.${this.region}.amazonaws.com/`,
        } as DeploymentConfig)

        // Get list of files in displayer tar
        // WARN js-untar is unmaintained and readAsString() is buggy so not using
        interface TarFile {name:string, type:string, buffer:ArrayBuffer}
        const files:TarFile[] = await untar(await self.app_native.read_file('displayer.tar'))

        // Add deployment config to files to be uploaded so user can access it
        // NOTE `type` is for TarFile and means "regular file"
        files.push({name: 'deployment.json', type: '', buffer: string_to_utf8(deployment_config)})

        // Start uploading displayer assets and collect promises that resolve with their path
        const uploads:Promise<string>[] = []
        let index_contents:string
        for (const file of files){

            // Actual files have type ''|'0' (others may be directory etc)
            if (file.type !== '' && file.type !== '0'){
                continue
            }

            // Process file contents
            // WARN Currently assume all assets are text (and suitable for gzip compressing)
            let contents = new TextDecoder().decode(file.buffer)
            const type = displayer_asset_type(file.name)
            if (type === 'text/javascript'){
                contents = contents.replace('DEPLOYMENT_CONFIG_DATA_UfWFTF5axRWX',
                    btoa(deployment_config))
            }

            // Index should be uploaded last so that assets are ready (important for updates)
            if (file.name === 'index.html'){
                index_contents = contents
                continue
            }

            // Upload
            uploads.push(this.s3.putObject({
                Bucket: this.bucket,
                Key: file.name,
                ContentType: type,
                ContentEncoding: 'gzip',
                Body: pako.gzip(contents),
            }).then(() => file.name))
        }

        // Once other files have been uploaded, can upload index and remove old assets
        await Promise.all(uploads).then(async upload_paths => {

            // Upload the index
            // TODO For org hosting, probably leave as index.html to serve from '/'
            await this.s3.putObject({
                Bucket: this.bucket,
                Key: '_',
                ContentType: 'text/html',
                ContentEncoding: 'gzip',
                Body: pako.gzip(index_contents),
            })

            // List all old assets
            // NOTE Pagination not used since limit is 1000
            const list_resp = await this.s3.listObjectsV2({
                Bucket: this.bucket,
                Prefix: 'displayer/',
            })
            const old_assets = list_resp.Contents?.filter(item => !upload_paths.includes(item.Key))
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
        await waitUntilBucketExists({client: this.s3, maxWaitTime: 30}, {Bucket: this.bucket})

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

        // Generate list of expiry rules for possible lifespan values (1-365)
        // NOTE Limit is 1,000 rules
        const rules = [...Array(365).keys()].map(n => n + 1).map(n => {
            return {
                Status: 'Enabled',
                Expiration: {Days: n},
                Filter: {Tag: {Key: 'stello-lifespan', Value: `${n}`}},
            }
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
            if (error.name !== 'NotFound'){
                throw error
            }
            await this.s3.createBucket({Bucket: this._bucket_resp_id})
        }
        await waitUntilBucketExists({client: this.s3, maxWaitTime: 30},
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

    async _setup_user_create():Promise<void>{
        // Ensure iam user exists
        try {
            await this.iam.createUser({
                UserName: this._user_id,
                Path: `/stello/${this.region}/`,
                Tags: [{Key: 'stello', Value: this.bucket}],
            })
        } catch (error){
            if (error.name !== 'EntityAlreadyExists'){
                throw error
            }
        }
    }

    async _setup_user_configure():Promise<void>{
        // Ensure iam user has correct permissions

        // May need to wait if still creating user
        await waitUntilUserExists({client: this.iam, maxWaitTime: 30}, {UserName: this._user_id})

        // Define permissions
        const statements = [

            // Main bucket
            // NOTE ListBucket applies to bucket, where as others apply to objects (/*)
            {Effect: 'Allow', Resource: this._bucket_arn,
                Action: ['s3:ListBucket']},
            // SECURITY tags could be used for other reasons in an AWS account
            //      So must ensure user can only set the stello-lifespan tag
            //      NOTE Tags can be set via PutObject (not just PutObjectTagging)
            {Effect: 'Allow', Resource: `${this._bucket_arn}/*`,
                Action: ['s3:GetObject', 's3:PutObject', 's3:PutObjectTagging', 's3:DeleteObject'],
                // Condition to ensure if any tag specified, can only be stello ones
                // ForAllValues:StringLike means for every value in s3:RequestObjectTagKeys
                //      ensure it is included in given array
                // See https://docs.aws.amazon.com/IAM/latest/UserGuide
                //          /reference_policies_multi-value-conditions.html
                Condition: {'ForAllValues:StringLike': {'s3:RequestObjectTagKeys':
                    ['stello-lifespan', 'stello-reads', 'stello-max-reads']}}},

            // Responses bucket
            {Effect: 'Allow', Resource: this._bucket_resp_arn,
                Action: ['s3:ListBucket']},
            {Effect: 'Allow', Resource: `${this._bucket_resp_arn}/*`,
                Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject']},

            // Manage SNS subscriptions
            // SECURITY Unlike s3, region is important here for not creating in multiple regions
            {Effect: 'Allow', Resource: await this._get_topic_arn(),
                Action: ['sns:ListSubscriptionsByTopic', 'sns:Subscribe', 'sns:Unsubscribe'],
                // SECURITY Only allow email subscriptions (others may cost or cause issues)
                Condition: {StringEqualsIfExists: {'sns:Protocol': 'email'}}},
        ]

        // Put the permissions policy
        await this.iam.putUserPolicy({
            UserName: this._user_id,
            PolicyName: 'stello',
            PolicyDocument: JSON.stringify({Version: '2012-10-17', Statement: statements}),
        })
    }

    async _setup_gateway():Promise<void>{
        // Create API Gateway and connect it to lambda
        if (! await this._get_api_id()){
            // Gateway doesn't exist yet, so create
            const resp = await this.gateway.createApi({
                Tags: {stello: this.bucket},
                Name: `stello ${this.bucket}`,  // Not used programatically, just for UI
                ProtocolType: 'HTTP',
                Target: await this._get_lambda_arn(),
            })
            this._gateway_id_cache = resp.ApiId
        }

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
                SourceArn: `arn:aws:execute-api:${this.region}:${account_id}:${api_id}/*`,
            })
        } catch (error){
            if (error.name !== 'ResourceConflictException'){  // Already exists
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
            if (error.name !== 'EntityAlreadyExists'){
                throw error
            }
        }

        // May need to wait if still creating role
        await waitUntilRoleExists({client: this.iam, maxWaitTime: 30},
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

    _setup_lambda_config_has_changed(fn_config:Record<string, any>,
            fn_config_env:UpdateFunctionConfigurationCommandInput['Environment'],
            resp:GetFunctionCommandOutput):boolean{
        // Return boolean for whether function config has changed since last updated

        // Compare simple config values
        for (const key in fn_config){
            if (resp.Configuration[key] !== fn_config[key]){
                return true
            }
        }

        // Compare env vars
        for (const key in fn_config_env.Variables){
            if (resp.Configuration.Environment.Variables[key] !== fn_config_env.Variables[key]){
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
            Variables: {
                stello_env: 'production',
                stello_version: app_config.version,
                stello_msgs_bucket: this.bucket,
                stello_resp_bucket: this._bucket_resp_id,
                stello_topic_arn: await this._get_topic_arn(),
                stello_region: this.region,
                stello_rollbar_responder: import.meta.env.VITE_ROLLBAR_RESPONDER,
            },
        }

        // Try get current function's config, else create function
        let resp:GetFunctionCommandOutput
        try {
            resp = await this.lambda.getFunction({FunctionName: this._lambda_id})
        } catch (error){
            if (error.name === 'ResourceNotFoundException'){
                // Function doesn't exist, so create and return when done
                await this.lambda.createFunction({
                    ...fn_config,
                    Environment: {...fn_config_env},
                    Code: {ZipFile: fn_code},
                    Tags: {stello: this.bucket},
                })
                await waitUntilFunctionExists(
                    {client: this.lambda, maxWaitTime: 30},
                    {FunctionName: this._lambda_id},
                )
                return
            }
            // An error actually occured
            throw error
        }

        // May need to wait for function still if recently created
        if (resp.Configuration.StateReasonCode === 'Creating'){
            await waitUntilFunctionExists(
                {client: this.lambda, maxWaitTime: 30},
                {FunctionName: this._lambda_id},
            )
        }

        // See if need to update the function's config
        if (this._setup_lambda_config_has_changed(fn_config, fn_config_env, resp)){
            await this.lambda.updateFunctionConfiguration({
                ...fn_config,
                Environment: {...fn_config_env},
            })
        }

        // See if need to update the function's code
        const code_digest = buffer_to_hex(await crypto.subtle.digest('SHA-256', fn_code))
        if (resp.Configuration.CodeSha256 !== code_digest){
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
            if (error.name !== 'EntityAlreadyExists'){
                throw error
            }
        }
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
        await Promise.all(existing.AccessKeyMetadata.map(key => {
            return this.iam.deleteAccessKey({
                UserName: user_id,
                AccessKeyId: key.AccessKeyId,
            })
        }))
    }
}


async function no404(request:Promise<any>):Promise<any>{
    // Helper for ignoring 404 errors (which usually signify already deleted)
    return request.catch(error => {
        if (error.$metadata.httpStatusCode !== 404){
            throw error
        }
    })
}
