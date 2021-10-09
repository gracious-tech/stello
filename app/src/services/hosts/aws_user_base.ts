
import {S3, paginateListObjectsV2} from '@aws-sdk/client-s3'
import {SNS} from '@aws-sdk/client-sns'
import {IAM} from '@aws-sdk/client-iam'
import {STS} from '@aws-sdk/client-sts'
import {Lambda} from '@aws-sdk/client-lambda'
import {ApiGatewayV2} from '@aws-sdk/client-apigatewayv2'
import {ResourceGroupsTaggingAPI} from '@aws-sdk/client-resource-groups-tagging-api'

import {HostCloud, HostCredentials} from './types'
import {StorageBaseAws} from './aws_common'
import {enforce_range} from '../utils/numbers'
import {stream_to_buffer} from '../utils/coding'
import {sort} from '../utils/arrays'


export class HostUserAwsBase extends StorageBaseAws {
    // User access to host's API for sending messages etc

    cloud:HostCloud = 'aws'
    credentials:HostCredentials
    user:string

    s3:S3
    sns:SNS
    iam:IAM
    sts:STS
    lambda:Lambda
    gateway:ApiGatewayV2
    tagging:ResourceGroupsTaggingAPI

    constructor(credentials:HostCredentials, bucket:string, region:string, user:string|null){
        super()

        // Store args
        this.credentials = credentials
        this.bucket = bucket
        this.region = region
        this.user = user ?? '_user'

        // Init AWS clients
        const aws_creds = {
            accessKeyId: credentials.key_id,
            secretAccessKey: credentials.key_secret,
            sessionToken: credentials.key_session!,
        }
        this.s3 = new S3({apiVersion: '2006-03-01', credentials: aws_creds, region})
        this.sns = new SNS({apiVersion: '2010-03-31', credentials: aws_creds, region})
        this.iam = new IAM({apiVersion: '2010-05-08', credentials: aws_creds, region})
        this.sts = new STS({apiVersion: '2011-06-15', credentials: aws_creds, region})
        this.lambda = new Lambda({apiVersion: '2015-03-31', credentials: aws_creds, region})
        this.gateway = new ApiGatewayV2({apiVersion: '2018-11-29', credentials: aws_creds, region})
        this.tagging = new ResourceGroupsTaggingAPI({apiVersion: '2017-01-26',
            credentials: aws_creds, region})
    }

    async upload_file(path:string, data:Blob|ArrayBuffer, lifespan=Infinity,
            max_reads=Infinity):Promise<void>{
        // Upload a message file into the storage

        // Determine tags
        const tagging:string[] = []
        if (lifespan !== Infinity){
            lifespan = enforce_range(lifespan, 1, 365)  // Should have checked already, but do again
            tagging.push(`stello-lifespan=${lifespan}`)
        }
        if (max_reads !== Infinity){
            tagging.push(`stello-reads=0`, `stello-max-reads=${max_reads}`)
        }

        await this.s3.putObject({
            Bucket: this.bucket,
            Key: `messages/${this.user}/${path}`,
            Body: data instanceof Blob ? data : new Uint8Array(data),
            ContentType: (data instanceof Blob ? data.type : null) || 'application/octet-stream',
            CacheControl: 'no-store',
            Tagging: tagging.join('&'),
        })
    }

    async delete_file(path:string):Promise<void>{
        // Delete a message file that was uploaded into storage
        await this.s3.deleteObject({Bucket: this.bucket, Key: `messages/${this.user}/${path}`})
    }

    async list_files(prefix=''):Promise<string[]>{
        // List uploaded message files (useful for deleting old messages if app lost state)
        return this._list_objects(this.bucket, `messages/${this.user}/`, prefix)
    }

    async download_response(path:string):Promise<ArrayBuffer>{
        // Download a response file
        const resp = await this.s3.getObject({
            Bucket: this._bucket_resp_id,
            Key: `responses/${this.user}/${path}`,
        })
        return stream_to_buffer(resp.Body as ReadableStream)  // ReadableStream when in browser
    }

    async delete_response(path:string):Promise<void>{
        // Delete a response file
        await this.s3.deleteObject({
            Bucket: this._bucket_resp_id,
            Key: `responses/${this.user}/${path}`,
        })
    }

    async list_responses(type=''):Promise<string[]>{
        // List responses
        return this._list_objects(this._bucket_resp_id, `responses/${this.user}/`, type)
    }

    async upload_displayer_config(config:ArrayBuffer):Promise<void>{
        // Upload config for the displayer
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: `config/${this.user}/config`,
            ContentType: 'application/octet-stream',
            Body: new Uint8Array(config),
        })
    }

    async upload_responder_config(config:ArrayBuffer):Promise<void>{
        // Upload config for the responder function
        await this.s3.putObject({
            Bucket: this._bucket_resp_id,
            Key: `config/${this.user}/config`,
            ContentType: 'application/octet-stream',
            Body: new Uint8Array(config),
        })
    }

    // PRIVATE

    async _get_account_id():Promise<string>{
        // Some requests strictly require the account id to be specified
        return (await this.sts.getCallerIdentity({})).Account!
    }

    async _list_objects(bucket:string, auth_prefix:string, prefix:string):Promise<string[]>{
        // List objects in a bucket
        // NOTE auth_prefix is the prefix authorized to list objects at and is stripped in resp
        // WARN Application logic (such as response processing) expects in ascending order by date
        const paginator = paginateListObjectsV2({client: this.s3}, {
            Bucket: bucket,
            Prefix: auth_prefix + prefix,
        })
        const objects:{key:string, date:Date}[] = []
        for await (const resp of paginator){
            // NOTE Keys returned have any user-prefix already removed (but not prefix arg)
            objects.push(...(resp.Contents ?? []).map(obj => {
                return {
                    key: obj.Key!.slice(auth_prefix.length),
                    date: obj.LastModified!,
                }
            }))
        }
        sort(objects, 'date')
        return objects.map(obj => obj.key)
    }
}
