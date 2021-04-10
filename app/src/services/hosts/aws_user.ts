
import AWS from 'aws-sdk'

import {HostCloud, HostCredentials, HostUser} from './types'
import {StorageBaseAws} from './aws_common'
import { enforce_range } from '../utils/numbers'


export class HostUserAws extends StorageBaseAws implements HostUser {
    // User access to host's API for sending messages etc

    cloud:HostCloud = 'aws'
    credentials:HostCredentials
    bucket:string
    region:string
    user:string

    _prefix:string

    s3:AWS.S3
    sns:AWS.SNS
    iam:AWS.IAM
    sts:AWS.STS

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
        this.s3 = new AWS.S3({apiVersion: '2006-03-01', credentials: aws_creds, region})
        this.sns = new AWS.SNS({apiVersion: '2010-03-31', credentials: aws_creds, region})
        this.iam = new AWS.IAM({apiVersion: '2010-05-08', credentials: aws_creds, region})
        this.sts = new AWS.STS({apiVersion: '2011-06-15', credentials: aws_creds, region})
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
            Body: data,
            ContentType: (data as Blob).type || 'application/octet-stream',
            CacheControl: 'no-store',
            Tagging: tagging,
        }).promise()
    }

    async delete_file(path:string):Promise<void>{
        // Delete a file that was uploaded into storage
        await this.s3.deleteObject({Bucket: this.bucket, Key: this._prefix + path}).promise()
    }

    async list_files(prefix:string=''):Promise<string[]>{
        // List uploaded files (useful for deleting old messages if app lost state)
        // NOTE `_prefix` is the user name if any, while `prefix` is limiting results to a subdir
        return this._list_objects(this.bucket, this._prefix + prefix)
    }

    async download_response(path:string):Promise<ArrayBuffer>{
        // Download a response file
        const resp = await this.s3.getObject({
            Bucket: this._bucket_resp_id,
            Key: this._prefix + path,
        }).promise()
        return (resp.Body as Uint8Array).buffer  // AWS SDK returns Uint8Array when in browser
    }

    async delete_response(path:string):Promise<void>{
        // Delete a response file
        await this.s3.deleteObject({
            Bucket: this._bucket_resp_id,
            Key: this._prefix + path,
        }).promise()
    }

    async list_responses(prefix:string=''):Promise<string[]>{
        // List responses
        // NOTE `_prefix` is the user name if any, while `prefix` is limiting results to a subdir
        return this._list_objects(this._bucket_resp_id, `${this._prefix}responses/${prefix}`)
    }

    async upload_responder_config(config:Record<string, any>):Promise<void>{
        // Upload config for the responder function
        await this.s3.putObject({
            Bucket: this._bucket_resp_id,
            Key: `${this._prefix}config`,
            ContentType: 'application/json',
            Body: JSON.stringify(config),
        }).promise()

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
        }).promise()
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
            await this.sns.unsubscribe({SubscriptionArn: sub.SubscriptionArn}).promise()
        }

        // Create subscription
        // NOTE Still create even if mode 'none' so don't have to confirm email later if change
        await this.sns.subscribe({
            TopicArn: topic_arn,
            Protocol: 'email',
            Endpoint: config.email,
        }).promise()
    }


    // PRIVATE

    async _get_account_id():Promise<string>{
        // Some requests strictly require the account id to be specified
        return (await this.sts.getCallerIdentity().promise()).Account
    }

    async _list_objects(bucket:string, prefix?:string):Promise<string[]>{
        // List objects in a bucket
        const objects = []
        let continuation_token
        while (true){
            const resp = await this.s3.listObjectsV2({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken: continuation_token,
            }).promise()
            objects.push(...resp.Contents.map(object => object.Key))
            continuation_token = resp.NextContinuationToken
            if (!continuation_token){
                break
            }
        }
        return objects
    }
}
