// Management of sets of storage services
// NOTE Must be reuseable outside of Stello app as well (e.g. automation of new users)

import AWS from 'aws-sdk'
import pako from 'pako'

import {buffer_to_hex} from '@/services/utils/coding'
import {sleep} from '@/services/utils/async'
import {Task} from '@/services/tasks/tasks'
import {StorageBaseAws} from './aws_common'
import {HostManager, HostManagerStorage, HostPermissionError} from './types'

// Raw strings for displayer assets
// @ts-ignore special webpack path
import displayer_html from '!!raw-loader!@/assets/displayer/index.html'
// @ts-ignore special webpack path
import displayer_js from '!!raw-loader!@/assets/displayer/index.js'
// @ts-ignore special webpack path
import displayer_css from '!!raw-loader!@/assets/displayer/index.css'


interface HostManagerAwsSettings {
    key_id:string
    key_secret:string
}


interface HostAwsCredentials {
    credentials:{
        key_id:string,
        key_secret:string,
    },
    credentials_responder:{
        key_id:string,
        key_secret:string,
    },
}


export class HostManagerAws implements HostManager {
    // Management access to host's API for setting up new users

    credentials:AWS.Credentials
    ssm:AWS.SSM
    s3:AWS.S3
    iam:AWS.IAM
    ec2:AWS.EC2  // Used only to get available regions
    s3_accessible = true

    constructor(settings:HostManagerAwsSettings){
        // Requires key with either root access or all necessary permissions for managing users
        this.credentials = new AWS.Credentials({
            accessKeyId: settings.key_id,
            secretAccessKey: settings.key_secret,
        })

        // Set a default region as some services require it (just to list resources, not create)
        const region = 'us-west-2'

        // Init services
        this.ssm = new AWS.SSM({apiVersion: '2014-11-06', credentials: this.credentials, region})
        this.s3 = new AWS.S3({apiVersion: '2006-03-01', credentials: this.credentials, region})
        this.iam = new AWS.IAM({apiVersion: '2010-05-08', credentials: this.credentials, region})
        this.ec2 = new AWS.EC2({apiVersion: '2016-11-15', credentials: this.credentials, region})

        // Give best guess as to whether have permission to head/create buckets or not
        // Used to determine if forbidden errors due to someone else owning bucket or not
        // NOTE Done early on to speed up `bucket_available` results
        this.s3.listBuckets().promise().catch(error => {
            // If forbidden then don't have s3:ListAllMyBuckets permission
            // Then assume also don't have permission to headBucket, so can't know if exists or not
            this.s3_accessible = error.code !== 'Forbidden'
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
            const resp = await this.iam.listUsers(params).promise()

            // Extract bucket/region from user's name/path and use to init HostManagerStorageAws
            storages.push(...resp.Users.map(async user => {
                const bucket = user.UserName.slice('stello-'.length)  // 'stello-{id}'
                const region = user.Path.split('/')[2]  // '/stello/{region}/'
                // Fetch completed setup version (else undefined)
                // NOTE Despite mentioning it, listUsers does NOT include tags in results itself
                const tags = await this.iam.listUserTags({UserName: user.UserName}).promise()
                const v = tags.Tags.filter(t => t.Key === 'stello-version').map(t => t.Value)[0]
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

    async list_regions(){
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
        }).promise()
        return regions_resp.Regions.map(region => region.RegionName)
    }

    async get_region_name(region){
        // Return human name for given region
        const path = `/aws/service/global-infrastructure/regions/${region}/longName`
        const resp = await this.ssm.getParameter({Name: path}).promise()
        return resp.Parameter.Value
    }

    async bucket_available(bucket){
        // See if a storage id is available
        // NOTE Returns false if taken (whether by own account or third party)
        try {
            await this.s3.headBucket({Bucket: bucket}).promise()
        } catch (error){
            if (error.code === 'NotFound'){
                // Bucket doesn't exist, so is available
                return true
            }
            if (error.code === 'Forbidden'){
                // Confirm if this is a permission issue or if someone else owns the bucket
                if (this.s3_accessible){
                    // Have s3 permissions, and not allowed to access bucket, so someone else owns
                    return false
                }
                throw new HostPermissionError(error)
            }
            // Error not a permissions issue, so reraise
            throw error
        }
        // headBucket succeded, so bucket exists and we own it, so not available
        return false
    }

    new_storage(bucket, region){
        // Create instance for a new storage set of services (without actually doing anything yet)
        return new HostManagerStorageAws(this.credentials, bucket, region)
    }
}


export class HostManagerStorageAws extends StorageBaseAws implements HostManagerStorage {

    cloud = 'aws'

    bucket:string
    region:string
    version

    iam:AWS.IAM
    s3:AWS.S3
    lambda:AWS.Lambda
    sns:AWS.SNS
    sts:AWS.STS

    _account_id_cache:string

    constructor(credentials, bucket, region, version?){
        super()
        this.bucket = bucket
        this.region = region
        this.version = version
        this.iam = new AWS.IAM({apiVersion: '2010-05-08', credentials, region})
        this.s3 = new AWS.S3({apiVersion: '2006-03-01', credentials, region})
        this.lambda = new AWS.Lambda({apiVersion: '2015-03-31', credentials, region})
        this.sns = new AWS.SNS({apiVersion: '2010-03-31', credentials, region})
        this.sts = new AWS.STS({apiVersion: '2011-06-15', credentials, region})
    }

    async setup_services(t:Task){
        // Ensure host services setup properly (sets up all services, not just storage)
        // NOTE Will create if storage doesn't exist, or fail if storage id taken by third party

        // Setup task
        t.label = `Setting up storage '${this.bucket}'`
        t.subtasks_total = 9
        t.show_count = false

        try {
            // Ensure bucket created, as everything else pointless if can't create
            // NOTE Don't need to wait for ready state though, can work on other tasks without that
            await t.t(this._setup_bucket_create())

            // Ensure user created first, as detecting storages depends on it
            // NOTE May need to manually resolve if bucket created but nothing else (can't detect)
            await t.t(this._setup_user_create())

            // Resolve when all tasks done
            await t.array([
                this._setup_bucket_configure(),
                this._setup_resp_bucket(),
                this._setup_user_configure(),
                this._setup_lambda_role().then(() => this._setup_lambda()),
                this._setup_lambda_invoke_user(),
                this._setup_sns(),
            ])

            // Update setup version tag on user to mark setup as completing successfully
            await t.t(this.iam.tagUser({
                UserName: this._user_id,
                Tags: [{Key: 'stello-version', Value: '0'}],
            }).promise())

        } catch (error){
            // Convert permission errors into a generic form so app can handle differently
            throw error?.code === 'Forbidden' ? new HostPermissionError(error) : error
        }
    }

    async new_credentials():Promise<HostAwsCredentials>{
        // Generate the credentials the user needs to have to access the storage (remove existing)
        // NOTE AWS only allows 2 keys to exist per user

        // Helper to create keys in parallel
        const new_key = async (user_id:string) => {
            await this._delete_user_keys(user_id)
            return this.iam.createAccessKey({UserName: user_id}).promise()
        }

        // Generate new key for both user and responder function
        const [user_key, responder_key] = await Promise.all([
            new_key(this._user_id),
            new_key(this._lambda_invoke_user_id),
        ])

        // Return credentials
        return {
            credentials: {
                key_id: user_key.AccessKey.AccessKeyId,
                key_secret: user_key.AccessKey.SecretAccessKey,
            },
            credentials_responder: {
                key_id: responder_key.AccessKey.AccessKeyId,
                key_secret: responder_key.AccessKey.SecretAccessKey,
            },
        }
    }

    async delete_services(t:Task){
        // Delete services for this storage set

        // Setup task
        t.label = `Deleting storage '${this.bucket}'`
        t.subtasks_total = 8
        t.show_count = false

        // Delete services
        await t.array([
            // Buckets
            this._delete_bucket(this.bucket),
            this._delete_bucket(this._bucket_resp_id),
            // Other
            this._delete_user(this._lambda_invoke_user_id),
            no404(this.lambda.deleteFunction({FunctionName: this._lambda_id})),
            no404(this.sns.deleteTopic({TopicArn: await this._get_topic_arn()})),
            no404(this.iam.deleteRolePolicy({RoleName: this._lambda_role_id, PolicyName: 'stello'}))
                .then(() => no404(this.iam.deleteRole({RoleName: this._lambda_role_id}))),
        ])

        // Delete user last, as a consistant way of knowing if all services deleted
        await t.t(this._delete_user(this._user_id))
    }

    // PRIVATE METHODS

    async _get_account_id(){
        // Some requests strictly require the account id to be specified
        if (!this._account_id_cache){
            this._account_id_cache = (await this.sts.getCallerIdentity().promise()).Account
        }
        return this._account_id_cache
    }

    async _get_topic_arn(){
        // SNS always requires the account id in topic arns
        const account_id = await this._get_account_id()
        return `arn:aws:sns:${this.region}:${account_id}:${this._topic_id}`
    }

    async _get_lambda_arn(){
        // Lambda arn must include account id (at least for permissions policies)
        const account_id = await this._get_account_id()
        return `arn:aws:lambda:${this.region}:${account_id}:function:${this._lambda_id}`
    }

    async _get_lambda_role_arn(){
        // Arn with account required when creating lambda
        const account_id = await this._get_account_id()
        return `arn:aws:iam::${account_id}:role/${this._lambda_role_id}`
    }

    async _setup_bucket_create(){
        // Ensure bucket has been created
        try {
            await this.s3.headBucket({Bucket: this.bucket}).promise()
        } catch (error){
            if (error.code !== 'NotFound'){
                throw error
            }
            await this.s3.createBucket({Bucket: this.bucket}).promise()
        }
    }

    async _setup_bucket_configure(){
        // Ensure bucket is correctly configured

        // Ensure creation has finished, as these tasks rely on it (not just securing id)
        await this.s3.waitFor('bucketExists', {Bucket: this.bucket}).promise()

        // Begin uploading displayer code
        const uploads = []
        const displayer_config = {
            url_msgs: `./`,  // Same URL as displayer for self-hosted AWS
            url_msgs_append_subdomain: false,
            url_responder: `https://lambda.${this.region}.amazonaws.com/2015-03-31/functions/${this._lambda_id}/invocations`,
        }
        uploads.push(this.s3.putObject({
            Bucket: this.bucket,
            Key: '_',  // TODO For org hosting, probably leave as index.html to serve from '/'
            ContentType: 'text/html',
            ContentEncoding: 'gzip',
            Body: pako.gzip(displayer_html),
        }).promise())
        uploads.push(this.s3.putObject({
            Bucket: this.bucket,
            Key: 'index.js',
            ContentType: 'text/javascript',
            ContentEncoding: 'gzip',
            Body: pako.gzip(displayer_js.replace('DEPLOYMENT_CONFIG_DATA_UfWFTF5axRWX',
                btoa(JSON.stringify(displayer_config)))),
        }).promise())
        uploads.push(this.s3.putObject({
            Bucket: this.bucket,
            Key: 'index.css',
            ContentType: 'text/css',
            ContentEncoding: 'gzip',
            Body: pako.gzip(displayer_css),
        }).promise())

        // While uploading, also configure bucket
        // NOTE The following tasks conflict (409 errors) and cannot be run in parallel

        // Set tag
        await this.s3.putBucketTagging({
            Bucket: this.bucket,
            Tagging: {TagSet: [{Key: 'stello', Value: this.bucket}]},
        }).promise()

        // Set encryption config
        // SECURITY Sensitive data already encrypted, but this may still help some assets
        await this.s3.putBucketEncryption({
            Bucket: this.bucket,
            ServerSideEncryptionConfiguration: {
                Rules: [{ApplyServerSideEncryptionByDefault: {SSEAlgorithm: 'AES256'}}],
            },
        }).promise()

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
        }).promise()

        // Set access policy
        await this.s3.putBucketPolicy({
            Bucket: this.bucket,
            Policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: {Effect: 'Allow', Principal: '*', Action: 's3:GetObject',
                    Resource: `${this._bucket_arn}/*`},
            }),
        }).promise()

        // Resolve when uploads also complete
        await Promise.all(uploads)
    }

    async _setup_resp_bucket(){
        // Create and configure responses bucket
        // NOTE Configure tasks can't be run in parallel

        // Ensure bucket has been created
        try {
            await this.s3.headBucket({Bucket: this._bucket_resp_id}).promise()
        } catch (error){
            if (error.code !== 'NotFound'){
                throw error
            }
            await this.s3.createBucket({Bucket: this._bucket_resp_id}).promise()
        }
        await this.s3.waitFor('bucketExists', {Bucket: this._bucket_resp_id}).promise()

        // Set tag
        await this.s3.putBucketTagging({
            Bucket: this._bucket_resp_id,
            Tagging: {TagSet: [{Key: 'stello', Value: this.bucket}]},
        }).promise()

        // Set encryption config
        // SECURITY Responses already encrypted, but can't do any harm!
        await this.s3.putBucketEncryption({
            Bucket: this._bucket_resp_id,
            ServerSideEncryptionConfiguration: {
                Rules: [{ApplyServerSideEncryptionByDefault: {SSEAlgorithm: 'AES256'}}],
            },
        }).promise()
    }

    async _setup_user_create(){
        // Ensure iam user exists
        try {
            await this.iam.createUser({
                UserName: this._user_id,
                Path: `/stello/${this.region}/`,
                Tags: [{Key: 'stello', Value: this.bucket}],
            }).promise()
        } catch (error){
            if (error.code !== 'EntityAlreadyExists'){
                throw error
            }
        }
    }

    async _setup_user_configure(){
        // Ensure iam user has correct permissions

        // May need to wait if still creating user
        await this.iam.waitFor('userExists', {UserName: this._user_id}).promise()

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
        }).promise()
    }

    async _setup_lambda_role(){
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
            }).promise()
        } catch (error){
            if (error.code !== 'EntityAlreadyExists'){
                throw error
            }
        }

        // May need to wait if still creating role
        await this.iam.waitFor('roleExists', {RoleName: this._lambda_role_id}).promise()

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
        }).promise()

        // Lambda requires a significant amount of time before it can discover this role
        await sleep(12000)
    }

    async _setup_lambda_invoke_user(){
        // Create a user (to be assumed by all recipients) that is allowed to invoke the lambda
        try {
            await this.iam.createUser({
                // NOTE Do NOT add Path param since will confuse storages listing and not needed
                UserName: this._lambda_invoke_user_id,
                Tags: [{Key: 'stello', Value: this.bucket}],
            }).promise()
        } catch (error){
            if (error.code !== 'EntityAlreadyExists'){
                throw error
            }
        }

        // May need to wait if still creating user
        await this.iam.waitFor('userExists', {UserName: this._lambda_invoke_user_id}).promise()

        // Put the permissions policy
        await this.iam.putUserPolicy({
            UserName: this._lambda_invoke_user_id,
            PolicyName: 'stello',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: {
                    Effect: 'Allow',
                    Resource: await this._get_lambda_arn(),
                    Action: 'lambda:InvokeFunction',
                },
            }),
        }).promise()
    }

    async _setup_lambda_config_has_changed(fn_config, fn_config_env, resp){
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

    async _setup_lambda(){
        // Setup lambda for handling recipient responses
        // SECURITY Lambda code managed by admin rather than user to prevent malicious code uploads

        // Load code so can deploy or compare
        const fn_code = await (await fetch('responder_aws.zip')).arrayBuffer()

        // Function config that can be used in a create or update request
        const fn_config = {
            FunctionName: this._lambda_id,
            Runtime: 'python3.8',
            Role: await this._get_lambda_role_arn(),
            Handler: 'responder.entry',
            Timeout: 5,
            MemorySize: 128,  // Smallest possible
        }
        const fn_config_env = {
            Variables: {
                stello_env: 'isolated',
                stello_msgs_bucket: this.bucket,
                stello_resp_bucket: this._bucket_resp_id,
                stello_topic_arn: await this._get_topic_arn(),
                stello_region: this.region,
            },
        }

        // Try get current function's config, else create function
        let resp:AWS.Lambda.GetFunctionResponse
        try {
            resp = await this.lambda.getFunction({FunctionName: this._lambda_id}).promise()
        } catch (error){
            if (error.code === 'ResourceNotFoundException'){
                // Function doesn't exist, so create and return when done
                await this.lambda.createFunction({
                    ...fn_config,
                    Environment: {...fn_config_env},
                    Code: {ZipFile: fn_code},
                    Tags: {stello: this.bucket},
                }).promise()
                return this.lambda.waitFor('functionExists',
                    {FunctionName: this._lambda_id}).promise()
            }
            // An error actually occured
            throw error
        }

        // May need to wait for function still if recently created
        if (resp.Configuration.StateReasonCode === 'Creating'){
            await this.lambda.waitFor('functionExists', {FunctionName: this._lambda_id}).promise()
        }

        // See if need to update the function's config
        if (this._setup_lambda_config_has_changed(fn_config, fn_config_env, resp)){
            await this.lambda.updateFunctionConfiguration({
                ...fn_config,
                Environment: {...fn_config_env},
            }).promise()
        }

        // See if need to update the function's code
        const code_digest = buffer_to_hex(await crypto.subtle.digest('SHA-256', fn_code))
        if (resp.Configuration.CodeSha256 !== code_digest){
            await this.lambda.updateFunctionCode({
                FunctionName: this._lambda_id,
                ZipFile: fn_code,
            }).promise()
        }
    }

    async _setup_sns(){
        // Setup SNS topic for notifying about responses
        try {
            await this.sns.createTopic({
                Name: this._topic_id,
                Tags: [{Key: 'stello', Value: this.bucket}],
            }).promise()
        } catch (error){
            if (error.code !== 'EntityAlreadyExists'){
                throw error
            }
        }
    }

    async _delete_bucket(bucket:string):Promise<void>{
        // Delete a bucket
        await this._empty_bucket(bucket)
        await no404(this.s3.deleteBucket({Bucket: bucket}))
    }

    async _empty_bucket(bucket){
        // Delete all the objects in a bucket

        // Keep listing objects until none remain (don't need true pagination in that sense)
        while (true){

            // List any/all objects
            const list_resp = await no404(this.s3.listObjectsV2({Bucket: bucket}))
            if (!list_resp || !list_resp.Contents.length){
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
            }).promise()

            // Delete request may still have errors, even if doesn't throw itself
            if (delete_resp.Errors.length){
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
            }).promise()
        }))
    }
}


function no404(request){
    // Helper for ignoring 404 errors (which usually signify already deleted)
    // NOTE Pass raw request and this will call `promise()` on it
    return request.promise().catch(error => {
        if (error.statusCode !== 404){
            throw error
        }
    })
}
