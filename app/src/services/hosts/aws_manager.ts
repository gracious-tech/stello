// Management of sets of storage services
// NOTE Must be reuseable outside of Stello app as well (e.g. automation of new users)

import {STS} from '@aws-sdk/client-sts'
import {SSM} from '@aws-sdk/client-ssm'
import {IAM, waitUntilUserExists, paginateListUsers} from '@aws-sdk/client-iam'
import {EC2} from '@aws-sdk/client-ec2'
import {S3} from '@aws-sdk/client-s3'
import {ApiGatewayV2} from '@aws-sdk/client-apigatewayv2'
import {ResourceGroupsTaggingAPI, paginateGetResources}
    from '@aws-sdk/client-resource-groups-tagging-api'

import {HostPermissionError} from '@/services/hosts/common'
import {maxWaitTime, StorageBaseAws, AwsError, HostCredentialsAws, HostStorageGeneratedAws, no404}
    from '@/services/hosts/aws_common'
import {HostCloud, HostManager, StorageProps} from '@/services/hosts/types'
import {HostUserAws} from '@/services/hosts/aws_user'
import {Task} from '@/services/tasks/tasks'


export class HostManagerAws implements HostManager {
    // Management access to host's API for setting up new users

    cloud:HostCloud = 'aws'
    credentials:HostCredentialsAws

    iam:IAM
    s3:S3
    sts:STS  // Used to get account id for use in ARNs
    ec2:EC2  // Used only to get available regions
    ssm:SSM  // Used to get human name for regions

    _account_id:string|undefined
    _s3_accessible = true

    constructor(credentials:HostCredentialsAws){
        // Requires key with either root access or all necessary permissions for managing users
        this.credentials = credentials

        // Set a default region as some services require it (just to list resources, not create)
        const region = 'us-west-2'

        // Init non-regional services
        this.iam = new IAM({apiVersion: '2010-05-08', credentials, region})
        this.s3 = new S3({apiVersion: '2006-03-01', credentials, region})
        this.sts = new STS({apiVersion: '2011-06-15', credentials, region})
        this.ec2 = new EC2({apiVersion: '2016-11-15', credentials, region})
        this.ssm = new SSM({apiVersion: '2014-11-06', credentials, region})

        // Give best guess as to whether have permission to head/create buckets or not
        // Used to determine if forbidden errors due to someone else owning bucket or not
        // NOTE Done early on to speed up `bucket_available` results
        this.s3.listBuckets({}).catch((error:AwsError) => {
            // If forbidden then don't have s3:ListAllMyBuckets permission
            // Then assume also don't have permission to headBucket, so can't know if exists or not
            // TODO `error.name` is buggy https://github.com/aws/aws-sdk-js-v3/issues/1596
            this._s3_accessible = error?.$metadata?.httpStatusCode !== 403
        })
    }

    async list_storages(){
        // Get list of storage ids for all detected in host account

        // Collect storages meta data
        const storages:Record<string, StorageProps> = {}
        const regions = new Set<string>()

        // Get only users under the /stello/ path
        const users_paginator = paginateListUsers({client: this.iam}, {PathPrefix: '/stello/'})
        for await (const resp of users_paginator){

            // Process each user async
            for (const user of resp.Users ?? []){

                // Extract bucket/region from user's name/path
                const bucket = user.UserName!.slice('stello-'.length)  // 'stello-{id}'
                const region = user.Path!.split('/')[2]!  // '/stello/{region}/'
                regions.add(region)

                storages[bucket] = {bucket, region, version: undefined}
            }
        }

        // Detect storage versions for users
        for (const region of regions){
            const tags_paginator = paginateGetResources({
                client: new ResourceGroupsTaggingAPI(
                    {apiVersion: '2017-01-26', credentials: this.credentials, region}),
            }, {
                TagFilters: [{Key: 'stello-version'}]})
            for await (const resp of tags_paginator){
                for (const bucket_tags of (resp.ResourceTagMappingList ?? [])){
                    const bucket = bucket_tags.Tags?.find(item => item.Key === 'stello')?.Value
                    if (bucket && bucket in storages){
                        const v = bucket_tags.Tags?.find(i => i.Key === 'stello-version')?.Value
                        storages[bucket]!.version = v ? parseInt(v, 10) : undefined
                    }
                }
            }
        }

        return Object.values(storages)
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
        return regions_resp.Regions!.map(region => region.RegionName!)
    }

    async get_region_name(region:string):Promise<string>{
        // Return human name for given region
        const path = `/aws/service/global-infrastructure/regions/${region}/longName`
        const resp = await this.ssm.getParameter({Name: path})
        return resp.Parameter!.Value!
    }

    async bucket_available(bucket:string):Promise<boolean>{
        // See if a storage id is available
        // NOTE Returns false if taken (whether by own account or third party)
        // TODO `error.name` is buggy https://github.com/aws/aws-sdk-js-v3/issues/1596
        try {
            await this.s3.headBucket({Bucket: bucket})
            return false  // Bucket exists and we own it, so not available
        } catch (error){
            const aws_error = error as AwsError
            if (aws_error?.name === 'NotFound'){
                return true  // Bucket doesn't exist, so is available
            } else if (aws_error?.$metadata?.httpStatusCode === 301){
                return false  // Bucket exists in a different region to the request
            } else if (aws_error?.$metadata?.httpStatusCode === 403){
                // Was not allowed to access the bucket
                if (this._s3_accessible){
                    return false  // Can access S3 so bucket must be owned by someone else
                }
                throw new HostPermissionError(aws_error?.message)  // Should have been allowed
            }
            // Error not a permissions issue, so reraise
            throw error
        }
    }

    async new_storage(bucket:string, region:string):Promise<HostStorageGeneratedAws>{
        // Create user with access to a set of storage resources and return credentials

        // Define arns needed for permissions and setup
        const ids = new StorageBaseAws(bucket, region)  // Base has access to ids/arns
        const account_id = await this._get_account_id()
        const lambda_arn = `arn:aws:lambda:${region}:${account_id}:function:${ids._lambda_id}`
        const lambda_role_arn = `arn:aws:iam::${account_id}:role/${ids._lambda_role_id}`
        const lambda_boundary_arn = `arn:aws:iam::${account_id}:policy/${ids._lambda_boundary_id}`
        const topic_arn = `arn:aws:sns:${region}:${account_id}:${ids._topic_id}`

        // Create the messages bucket to secure its id
        const regioned_s3 = new S3(
            {apiVersion: '2006-03-01', credentials: this.credentials, region})
        try {
            await regioned_s3.headBucket({Bucket: bucket})
        } catch (error){
            if (error instanceof Error && error.name === 'NotFound'){
                // Must recreate S3 client to change region
                await regioned_s3.createBucket({Bucket: bucket,
                        CreateBucketConfiguration: {LocationConstraint: region}})
            } else {
                throw error
            }
        }

        // Setup an API for the user (user can't self-setup since id is random & needed for IAM)
        let api_id = await this._get_api_id(bucket, region)
        if (!api_id){
            // Must recreate gateway client to change region
            const regioned_gateway = new ApiGatewayV2({apiVersion: '2018-11-29',
                credentials: this.credentials, region})
            api_id = (await regioned_gateway.createApi({
                Tags: {stello: bucket},
                Name: `stello ${bucket}`,  // Not used programatically, just for UI
                ProtocolType: 'HTTP',
                // Setting target auto-creates stage/integration/route
                // NOTE Should still use normal paths /responder/type as responder will check path
                // NOTE Since only one user, only one fn/policy for simplicity (unlike host setup)
                Target: lambda_arn,
            })).ApiId!
        }
        // NOTE For some reason adding account id invalidates the arn
        const gateway_arn = `arn:aws:apigateway:${region}::/apis/${api_id}`

        // Create user who will have permissions to setup rest of services
        try {
            await this.iam.createUser({
                UserName: ids._user_id,
                Path: `/stello/${region}/`,
                Tags: [{Key: 'stello', Value: bucket}],
            })
        } catch (error){
            if (!(error instanceof Error) || error.name !== 'EntityAlreadyExists'){
                throw error
            }
        }
        await waitUntilUserExists({client: this.iam, maxWaitTime}, {UserName: ids._user_id})

        // Define IAM statement that grants full access to all resources granted to the user
        // SECURITY Do NOT include any IAM resources in this to prevent circumventing restrictions
        const full_access_resources = {
            Effect: 'Allow',
            Action: '*',
            Resource: [
                ids._bucket_arn,
                ids._bucket_arn + '/*',
                ids._bucket_resp_arn,
                ids._bucket_resp_arn + '/*',
                lambda_arn,
                gateway_arn,
                gateway_arn + '/*',
                topic_arn,
            ],
        }

        // Create a policy for use as permissions boundary for lambda role
        // SECURITY This prevents circumventing restrictions via the lambda role
        try {
            await this.iam.createPolicy({
                PolicyName: ids._lambda_boundary_id,
                Tags: [{Key: 'stello', Value: bucket}],
                PolicyDocument: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [full_access_resources],
                }),
            })
        } catch (error){
            if ((error as AwsError)?.name !== 'EntityAlreadyExists'){
                throw error
            }
        }

        // Grant the user permissions for all resources and to create the role for the lambda
        // SECURITY Unlike other resources, self-management of lambda role requires extra care
        await this.iam.putUserPolicy({
            UserName: ids._user_id,
            PolicyName: 'stello',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [

                    // Non-IAM resources
                    full_access_resources,

                    // Can manage the lambda's role as long as permissions boundary attached
                    // SECURITY Otherwise could grant lambda more permissions than user has
                    {
                        Effect: 'Allow',
                        Resource: lambda_role_arn,
                        Action: ['iam:CreateRole', 'iam:UpdateRole'],
                        Condition: {
                            StringEquals: {
                                'iam:PermissionsBoundary': lambda_boundary_arn,
                            },
                        },
                    },

                    // Can allow the lambda to assume the role, and can also delete the role
                    // SECURITY Don't allow passing any other role, otherwise lambda could be admin
                    {
                        Effect: 'Allow',
                        Resource: lambda_role_arn,
                        Action: ['iam:GetRole', 'iam:PassRole', 'iam:TagRole', 'iam:DeleteRole',
                            'iam:PutRolePolicy', 'iam:DeleteRolePolicy'],
                    },

                    // Allow user to delete their own key
                    {
                        Effect: 'Allow',
                        Resource: `arn:aws:iam::${account_id}:user/stello/${region}/${ids._user_id}`,
                        Action: ['iam:DeleteAccessKey'],
                    },
                ],
            }),
        })

        // Revoke any existing keys
        await this._delete_user_keys(ids._user_id)

        // Create key for the user
        const user_key = await this.iam.createAccessKey({UserName: ids._user_id})

        // Return generated data
        return {
            credentials: {
                accessKeyId: user_key.AccessKey!.AccessKeyId!,
                secretAccessKey: user_key.AccessKey!.SecretAccessKey!,
            },
            api_id,
        }
    }

    async delete_storage(task:Task, bucket:string, region:string):Promise<void>{
        // Delete storage services and user

        // Delete services user has access to
        const host_user = new HostUserAws({credentials: this.credentials}, bucket, region, null)
        await host_user.delete_services(task)

        // Delete services user can't access

        // Delete permission boundary
        const account_id = await host_user._get_account_id()
        await no404(this.iam.deletePolicy({
            PolicyArn: `arn:aws:iam::${account_id}:policy/${host_user._lambda_boundary_id}`,
        }))

        // User's policy must be deleted before user can be
        await no404(this.iam.deleteUserPolicy({UserName: host_user._user_id, PolicyName: 'stello'}))

        // Must also first delete any keys
        await this._delete_user_keys(host_user._user_id)

        // Can now finally delete the user
        // NOTE Delete user last, as a consistant way of knowing if all services deleted
        await no404(this.iam.deleteUser({UserName: host_user._user_id}))
    }

    // PRIVATE

    async _get_account_id():Promise<string>{
        // Some requests strictly require the account id to be specified
        if (!this._account_id){
            this._account_id = (await this.sts.getCallerIdentity({})).Account!
        }
        return this._account_id
    }

    async _get_api_id(bucket:string, region:string):Promise<string|undefined>{
        // Get the id for API gateway (null if doesn't exist)
        // NOTE ResourceTypeFilters does not work (seems to be an AWS bug) so manually filtering
        const tagging = new ResourceGroupsTaggingAPI(
            {apiVersion: '2017-01-26', credentials: this.credentials, region})
        const resp = await tagging.getResources({
            TagFilters: [{Key: 'stello', Values: [bucket]}]})
        const arn = (resp.ResourceTagMappingList ?? [])
            .map(i => i.ResourceARN?.split(':') ?? [])  // Get ARN parts
            .filter(i => i[2] === 'apigateway')[0]  // Only match API gateway
            // Should only be one if any `[0]`
        return arn?.[5]?.split('/')[2]  // Extract gateway id part
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
}
