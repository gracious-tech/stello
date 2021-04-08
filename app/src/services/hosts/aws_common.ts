
export class StorageBaseAws {

    bucket:string
    region:string

    get _bucket_id():string{
        return this.bucket
    }

    get _bucket_arn():string{
        return `arn:aws:s3:::${this.bucket}`
    }

    get _bucket_resp_id():string{
        return `${this.bucket}-stello-responses`
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

    get _lambda_invoke_user_id():string{
        return `stello-${this.bucket}-lambda-invoke`
    }

    get _lambda_invoke_user_arn():string{
        return `arn:aws:iam:::user/stello-${this.bucket}-lambda-invoke`
    }

}
