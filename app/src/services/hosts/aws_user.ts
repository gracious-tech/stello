
import {S3, paginateListObjectsV2} from '@aws-sdk/client-s3'
import {SNS} from '@aws-sdk/client-sns'
import {IAM} from '@aws-sdk/client-iam'
import {STS} from '@aws-sdk/client-sts'

import {DeploymentConfig} from '@/shared/shared_types'
import {HostCloud, HostCredentials, HostUser} from './types'
import {StorageBaseAws} from './aws_common'
import {enforce_range} from '../utils/numbers'
import {stream_to_buffer} from '../utils/coding'


export class HostUserAws extends StorageBaseAws implements HostUser {
    // User access to host's API for sending messages etc

    cloud:HostCloud = 'aws'
    credentials:HostCredentials
    user:string

    _prefix:string

    s3:S3
    sns:SNS
    iam:IAM
    sts:STS

    constructor(credentials:HostCredentials, bucket:string, region:string, user:string){
        super()

        // Store args
        this.credentials = credentials
        this.bucket = bucket
        this.region = region
        this.user = user

        // Determine prefix for user
        this._prefix = user ? `${user}/` : ''

        // Init AWS clients
        const aws_creds = {accessKeyId: credentials.key_id, secretAccessKey: credentials.key_secret}
        this.s3 = new S3({apiVersion: '2006-03-01', credentials: aws_creds, region})
        this.sns = new SNS({apiVersion: '2010-03-31', credentials: aws_creds, region})
        this.iam = new IAM({apiVersion: '2010-05-08', credentials: aws_creds, region})
        this.sts = new STS({apiVersion: '2011-06-15', credentials: aws_creds, region})
    }

    async upload_file(path:string, data:Blob|ArrayBuffer, lifespan:number=Infinity,
            max_reads:number=Infinity):Promise<void>{
        // Upload a file into the storage

        // Determine tags
        let tagging:string
        if (lifespan !== Infinity){
            lifespan = enforce_range(lifespan, 1, 365)  // Should have checked already, but do again
            tagging = `stello-lifespan=${lifespan}`
        }
        if (max_reads !== Infinity){
            tagging = tagging ? `${tagging}&` : ''
            tagging += `stello-reads=0&stello-max-reads=${max_reads}`
        }

        await this.s3.putObject({
            Bucket: this.bucket,
            Key: this._prefix + path,
            Body: data instanceof Blob ? data : new Uint8Array(data),
            ContentType: (data instanceof Blob ? data.type : null) || 'application/octet-stream',
            CacheControl: 'no-store',
            Tagging: tagging,
        })
    }

    async delete_file(path:string):Promise<void>{
        // Delete a file that was uploaded into storage
        await this.s3.deleteObject({Bucket: this.bucket, Key: this._prefix + path})
    }

    async list_files(prefix:string=''):Promise<string[]>{
        // List uploaded files (useful for deleting old messages if app lost state)
        // NOTE `_prefix` is the user name if any, while `prefix` is limiting results to a subdir
        return this._list_objects(this.bucket, prefix)
    }

    async download_response(path:string):Promise<ArrayBuffer>{
        // Download a response file
        const resp = await this.s3.getObject({
            Bucket: this._bucket_resp_id,
            Key: this._prefix + path,
        })
        return stream_to_buffer(resp.Body as ReadableStream)  // ReadableStream when in browser
    }

    async delete_response(path:string):Promise<void>{
        // Delete a response file
        await this.s3.deleteObject({
            Bucket: this._bucket_resp_id,
            Key: this._prefix + path,
        })
    }

    async list_responses(type:string=''):Promise<string[]>{
        // List responses
        // NOTE `_prefix` is the user name if any, while `prefix` is limiting results to a subdir
        return this._list_objects(this._bucket_resp_id, `responses/${type}`)
    }

    async upload_responder_config(config:Record<string, any>):Promise<void>{
        // Upload config for the responder function
        await this.s3.putObject({
            Bucket: this._bucket_resp_id,
            Key: `${this._prefix}config`,
            ContentType: 'application/json',
            Body: JSON.stringify(config),
        })

        // If no user then relying on SNS for notifications and need to ensure subscribed to it
        // NOTE Skip subscribing if not production as would send real emails to do so
        if (this.user || process.env.NODE_ENV !== 'production'){
            return
        }

        // Remove existing subscription if any
        const account_id = await this._get_account_id()
        const topic_arn = `arn:aws:sns:${this.region}:${account_id}:${this._topic_id}`
        const list_resp = await this.sns.listSubscriptionsByTopic({
            TopicArn: topic_arn,
        })
        for (const sub of list_resp.Subscriptions){
            // NOTE Expecting only one subscription in this loop at most
            if (sub.Endpoint === config.email){
                // Already subscribed so just finish
                return
            }
            if (!sub.SubscriptionArn.startsWith('arn:')){
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
            Endpoint: config.email,
        })
    }

    async download_deployment_config():Promise<DeploymentConfig>{
        // Download deployment config from msgs bucket
        const resp = await this.s3.getObject({
            Bucket: this.bucket,
            Key: 'deployment.json',
        })
        return new Response(resp.Body as ReadableStream).json()
    }

    // PRIVATE

    async _get_account_id():Promise<string>{
        // Some requests strictly require the account id to be specified
        return (await this.sts.getCallerIdentity({})).Account
    }

    async _list_objects(bucket:string, prefix:string=''):Promise<string[]>{
        // List objects in a bucket
        const objects:string[] = []
        const paginator = paginateListObjectsV2({client: this.s3}, {
            Bucket: bucket,
            Prefix: this._prefix + prefix,
        })
        for await (const resp of paginator){
            // NOTE Keys returned have any user-prefix already removed (but not prefix arg)
            objects.push(...(resp.Contents ?? []).map(obj => obj.Key.slice(this._prefix.length)))
        }
        return objects
    }
}
