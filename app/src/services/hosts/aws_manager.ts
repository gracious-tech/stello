// Management of sets of storage services
// NOTE Must be reuseable outside of Stello app as well (e.g. automation of new users)

import {SSM} from '@aws-sdk/client-ssm'
import {IAM, waitUntilUserExists} from '@aws-sdk/client-iam'
import {EC2} from '@aws-sdk/client-ec2'
import {S3} from '@aws-sdk/client-s3'

import {maxWaitTime, StorageBaseAws} from '@/services/hosts/aws_common'
import {HostCloud, HostCredentials, HostManager, HostPermissionError, HostStorageCredentials}
    from './types'


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

    async list_storages(){
        // Get list of instances of HostManagerStorageAws for all detected in host account
        // NOTE Returns instances for any remaining Stello users, regardless if other services exist
        //      Should therefore remove user last, when deleting storage, to ensure full deletion

        // Get all Stello users
        const storages:{bucket:string, region:string, version:string}[] = []
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
                return {bucket, region, version: v}
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
                if (this.s3_accessible){
                    return false  // Can access S3 so bucket must be owned by someone else
                }
                throw new HostPermissionError(error)  // Should have been allowed but wasn't
            }
            // Error not a permissions issue, so reraise
            throw error
        }
    }
}
