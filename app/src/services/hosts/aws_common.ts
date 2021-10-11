
export class StorageBaseAws {

    constructor(public bucket:string, public region:string){}

    get _bucket_id():string{
        return this.bucket
    }

    get _bucket_arn():string{
        return `arn:aws:s3:::${this.bucket}`
    }

    get _bucket_domain():string{
        return `${this.bucket}.s3-${this.region}.amazonaws.com`
    }

    get _bucket_resp_id():string{
        return `${this.bucket}-stello-resp`
    }

    get _bucket_resp_arn():string{
        return `arn:aws:s3:::${this._bucket_resp_id}`
    }

    get _user_id():string{
        return `stello-${this.bucket}`
    }

    get _topic_id():string{
        return `stello-${this.bucket}`
    }

    get _lambda_id():string{
        return `stello-${this.bucket}`
    }

    get _lambda_role_id():string{
        return `stello-${this.bucket}-lambda`
    }

    get _lambda_boundary_id():string{
        return `stello-${this.bucket}-lambda-boundary`
    }
}


// Standard wait time
// NOTE Occasionally hit timeout for bucket creation when set to 30 seconds, so doubled to 60
// NOTE casing matches property casing allowing easier insertion
export const maxWaitTime = 60


interface _AwsError extends Error {
    // The error object usually thrown by AWS SDK
    // NOTE All props optional in case not actually an AWS error
    $metadata?:{
        httpStatusCode?:number
    }
}

export type AwsError = _AwsError|null  // Null in case not actually an AWS error
