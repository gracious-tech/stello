
import {S3, paginateListObjectsV2} from '@aws-sdk/client-s3'
import {SNS} from '@aws-sdk/client-sns'
import {IAM} from '@aws-sdk/client-iam'
import {STS} from '@aws-sdk/client-sts'
import {Lambda} from '@aws-sdk/client-lambda'
import {ApiGatewayV2} from '@aws-sdk/client-apigatewayv2'
import {ResourceGroupsTaggingAPI} from '@aws-sdk/client-resource-groups-tagging-api'

import {StorageBaseAws, no404, HostStorageGeneratedAws, RequestHandler}
    from '@/services/hosts/aws_common'
import {enforce_range} from '../utils/numbers'
import {stream_to_buffer} from '../utils/coding'
import {sort} from '../utils/arrays'


export class HostUserAwsBase extends StorageBaseAws {
    // User access to host's API for sending messages etc

    generated:HostStorageGeneratedAws
    user:string

    s3:S3
    sns:SNS
    iam:IAM
    sts:STS
    lambda:Lambda
    gateway:ApiGatewayV2
    tagging:ResourceGroupsTaggingAPI

    constructor(generated:HostStorageGeneratedAws, bucket:string, region:string, user:string|null){
        super(bucket, region)

        // Store args
        this.generated = generated
        this.bucket = bucket
        this.region = region
        this.user = user ?? '_user'

        // Init AWS clients
        const credentials = generated.credentials
        this.s3 = new S3({apiVersion: '2006-03-01', credentials, region,
            requestHandler: new RequestHandler()})
        this.sns = new SNS({apiVersion: '2010-03-31', credentials, region,
            requestHandler: new RequestHandler()})
        this.iam = new IAM({apiVersion: '2010-05-08', credentials, region,
            requestHandler: new RequestHandler()})
        this.sts = new STS({apiVersion: '2011-06-15', credentials, region,
            requestHandler: new RequestHandler()})
        this.lambda = new Lambda({apiVersion: '2015-03-31', credentials, region,
            requestHandler: new RequestHandler()})
        this.gateway = new ApiGatewayV2({apiVersion: '2018-11-29', credentials, region,
            requestHandler: new RequestHandler()})
        this.tagging = new ResourceGroupsTaggingAPI({apiVersion: '2017-01-26', credentials, region,
            requestHandler: new RequestHandler()})
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
        await this.s3.deleteObject({Bucket: this.bucket,
            Key: this.generated.old_beta ? path : `messages/${this.user}/${path}`,
        })
    }

    async list_files(prefix=''):Promise<string[]>{
        // List uploaded message files (useful for deleting old messages if app lost state)
        return this._list_objects(this.bucket,
            this.generated.old_beta ? '' : `messages/${this.user}/`, prefix)
    }

    async download_response(path:string):Promise<ArrayBuffer>{
        // Download a response file
        const resp = await this.s3.getObject({
            Bucket: this.generated.old_beta ? `${this.bucket}-stello-responses` : this._bucket_resp_id,
            Key: this.generated.old_beta ? `responses/${path}` : `responses/${this.user}/${path}`,
        })
        return stream_to_buffer(resp.Body as ReadableStream)  // ReadableStream when in browser
    }

    async delete_response(path:string):Promise<void>{
        // Delete a response file
        await this.s3.deleteObject({
            Bucket: this.generated.old_beta ? `${this.bucket}-stello-responses` : this._bucket_resp_id,
            Key: this.generated.old_beta ? `responses/${path}` : `responses/${this.user}/${path}`,
        })
    }

    async list_responses(type=''):Promise<string[]>{
        // List responses
        return this._list_objects(
            this.generated.old_beta ? `${this.bucket}-stello-responses` : this._bucket_resp_id,
            this.generated.old_beta ? `responses/` : `responses/${this.user}/`,
            type,
        )
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

    async _delete_objects(bucket:string, prefix=''):Promise<void>{
        // Delete all the objects in a bucket

        // Keep listing objects until none remain (don't need true pagination in that sense)
        while (true){

            // List any/all objects
            const list_resp = await no404(this.s3.listObjectsV2({Bucket: bucket, Prefix: prefix}))
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
}
