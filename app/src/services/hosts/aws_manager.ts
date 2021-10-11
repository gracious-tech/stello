// Management of sets of storage services
// NOTE Must be reuseable outside of Stello app as well (e.g. automation of new users)

import {STS} from '@aws-sdk/client-sts'
import {SSM} from '@aws-sdk/client-ssm'
import {IAM, waitUntilUserExists, paginateListUsers} from '@aws-sdk/client-iam'
import {EC2} from '@aws-sdk/client-ec2'
import {S3} from '@aws-sdk/client-s3'
import {ApiGatewayV2} from '@aws-sdk/client-apigatewayv2'
import {ResourceGroupsTaggingAPI} from '@aws-sdk/client-resource-groups-tagging-api'

import {HostPermissionError} from '@/services/hosts/common'
import {maxWaitTime, StorageBaseAws, AwsError} from '@/services/hosts/aws_common'
import {HostCloud, HostCredentials, HostManager, HostStorageCredentials}
    from './types'


export class HostManagerAws implements HostManager {
    // Management access to host's API for setting up new users

    cloud:HostCloud = 'aws'
    credentials:HostCredentials

    sts:STS
    ssm:SSM
    s3:S3
    iam:IAM
    ec2:EC2  // Used only to get available regions
    gateway:ApiGatewayV2
    tagging:ResourceGroupsTaggingAPI

    _account_id:string|undefined
    _s3_accessible = true

    constructor(credentials:HostCredentials){
        // Requires key with either root access or all necessary permissions for managing users
        this.credentials = credentials

        // Set a default region as some services require it (just to list resources, not create)
        const region = 'us-west-2'

        // Init services
        const aws_creds = {accessKeyId: credentials.key_id, secretAccessKey: credentials.key_secret}
        this.sts = new STS({apiVersion: '2011-06-15', credentials: aws_creds, region})
        this.ssm = new SSM({apiVersion: '2014-11-06', credentials: aws_creds, region})
        this.s3 = new S3({apiVersion: '2006-03-01', credentials: aws_creds, region})
        this.iam = new IAM({apiVersion: '2010-05-08', credentials: aws_creds, region})
        this.ec2 = new EC2({apiVersion: '2016-11-15', credentials: aws_creds, region})
        this.gateway = new ApiGatewayV2({apiVersion: '2018-11-29', credentials: aws_creds, region})
        this.tagging = new ResourceGroupsTaggingAPI({apiVersion: '2017-01-26',
            credentials: aws_creds, region})

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

        // Collect list of promises
        const storages:Promise<{bucket:string, region:string, version:number|undefined}>[] = []

        // Get only users under the /stello/ path
        const paginator = paginateListUsers({client: this.iam}, {PathPrefix: '/stello/'})
        for await (const resp of paginator){

            // Process each user async
            storages.push(...(resp.Users ?? []).map(async user => {

                // Extract bucket/region from user's name/path
                const bucket = user.UserName!.slice('stello-'.length)  // 'stello-{id}'
                const region = user.Path!.split('/')[2]!  // '/stello/{region}/'

                // Fetch completed setup version (else undefined)
                // NOTE Despite mentioning it, listUsers does NOT include tags in results itself
                const tags = await this.iam.listUserTags({UserName: user.UserName})
                const v = tags.Tags?.find(t => t.Key === 'stello-version')?.Value

                return {bucket, region, version: v ? parseInt(v, 10) : undefined}
            }))
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
            if (error.name === 'NotFound'){
                return true  // Bucket doesn't exist, so is available
            } else if (error.$metadata.httpStatusCode === 301){
                return false  // Bucket exists in a different region to the request
            } else if (error.$metadata.httpStatusCode === 403){
                // Was not allowed to access the bucket
                if (this._s3_accessible){
                    return false  // Can access S3 so bucket must be owned by someone else
                }
                throw new HostPermissionError(error)  // Should have been allowed but wasn't
            }
            // Error not a permissions issue, so reraise
            throw error
        }
    }

    async new_storage(bucket:string, region:string):Promise<HostStorageCredentials>{
        // Create user with access to a set of storage resources and return credentials

        // Define arns needed for permissions and setup
        const ids = new StorageBaseAws(bucket, region)  // Base has access to ids/arns
        const account_id = await this._get_account_id()
        const lambda_arn = `arn:aws:lambda:${region}:${account_id}:function:${ids._lambda_id}`
        const lambda_role_arn = `arn:aws:iam::${account_id}:role/${ids._lambda_role_id}`
        const lambda_boundary_arn = `arn:aws:iam::${account_id}:policy/${ids._lambda_boundary_id}`

        // Create the messages bucket to secure its id
        try {
            await this.s3.headBucket({Bucket: bucket})
        } catch (error){
            if (error instanceof Error && error.name === 'NotFound'){
                await this.s3.createBucket({
                    Bucket: bucket,
                    CreateBucketConfiguration: {LocationConstraint: region},
                })
            } else {
                throw error
            }
        }

        // Setup an API for the user (user can't self-setup since id is random & needed for IAM)
        let api_id = await this._get_api_id(bucket)
        if (!api_id){
            api_id = (await this.gateway.createApi({
                Tags: {stello: bucket},
                Name: `stello ${bucket}`,  // Not used programatically, just for UI
                ProtocolType: 'HTTP',
                // Setting target auto-creates stage/integration/route
                // NOTE Should still use normal paths /responder/type as responder will check path
                // NOTE Since only one user, only one fn/policy for simplicity (unlike host setup)
                Target: lambda_arn,
            })).ApiId!
        }

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
                `arn:aws:apigateway:${region}:${account_id}:/apis/${api_id}`,
                `arn:aws:sns:${region}:${account_id}:${ids._topic_id}`,
            ],
        }

        // Create a policy for use as permissions boundary for lambda role
        // SECURITY This prevents circumventing restrictions via the lambda role
        await this.iam.createPolicy({
            PolicyName: ids._lambda_boundary_id,
            Tags: [{Key: 'stello', Value: bucket}],
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [full_access_resources],
            }),
        })

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
                        Action: ['iam:PassRole', 'iam:DeleteRole'],
                    },

                    // Allow user to delete themself
                    {
                        Effect: 'Allow',
                        Resource: `arn:aws:iam::${account_id}:user/${ids._user_id}`,
                        Action: ['iam:DeleteUser'],
                    },

                    // Allow user to delete permissions boundary (to clean up entire services set)
                    // SECURITY Not a security issue as lambda role can't exist/create without it
                    {
                        Effect: 'Allow',
                        Resource: lambda_boundary_arn,
                        Action: ['iam:DeletePolicy'],
                    },
                ],
            }),
        })

        // Create key for the user
        const user_key = await this.iam.createAccessKey({UserName: ids._user_id})

        // Return credentials
        return {
            credentials: {
                key_id: user_key.AccessKey!.AccessKeyId!,
                key_secret: user_key.AccessKey!.SecretAccessKey!,
            },
            api: `https://${api_id}.execute-api.${region}.amazonaws.com/`,
        }
    }

    // PRIVATE

    async _get_account_id():Promise<string>{
        // Some requests strictly require the account id to be specified
        if (!this._account_id){
            this._account_id = (await this.sts.getCallerIdentity({})).Account!
        }
        return this._account_id
    }

    async _get_api_id(bucket:string):Promise<string|undefined>{
        // Get the id for API gateway (null if doesn't exist)
        // NOTE ResourceTypeFilters does not work (seems to be an AWS bug) so manually filtering
        const resp = await this.tagging.getResources({
            TagFilters: [{Key: 'stello', Values: [bucket]}]})
        const arn = (resp.ResourceTagMappingList ?? [])
            .map(i => i.ResourceARN?.split(':') ?? [])  // Get ARN parts
            .filter(i => i[2] === 'apigateway')[0]  // Only match API gateway
            // Should only be one if any `[0]`
        return arn?.[5]?.split('/')[2]  // Extract gateway id part
    }
}
