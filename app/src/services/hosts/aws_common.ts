
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
}


// Standard wait time
// NOTE Occasionally hit timeout for bucket creation when set to 30 seconds, so doubled to 60
// NOTE casing matches property casing allowing easier insertion
export const maxWaitTime = 60
