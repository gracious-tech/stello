
export interface StorageCredentialsAws {
    key_id:string
    key_secret:string
}


export class StorageBaseAws {

    bucket:string
    region:string

    get _bucket_id(){
        return this.bucket
    }

    get _bucket_arn(){
        return `arn:aws:s3:::${this.bucket}`
    }

    get _bucket_resp_id(){
        return `${this.bucket}-stello-responses`
    }

    get _bucket_resp_arn(){
        return `arn:aws:s3:::${this._bucket_resp_id}`
    }

    get _user_id(){
        return `stello-${this.bucket}`
    }

    get _topic_id(){
        return `stello-${this.bucket}`
    }

    get _lambda_id(){
        return `stello-${this.bucket}`
    }

    get _lambda_role_id(){
        return `stello-${this.bucket}-lambda`
    }

    get _lambda_invoke_user_id(){
        return `stello-${this.bucket}-lambda-invoke`
    }

    get _lambda_invoke_user_arn(){
        return `arn:aws:iam:::user/stello-${this.bucket}-lambda-invoke`
    }

}
