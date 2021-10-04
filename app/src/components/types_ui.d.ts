
interface Credentials {
    key_id:string
    key_secret:string
}

export interface HostCredentialsPackage {
    cloud:string
    bucket:string
    region:string
    credentials:Credentials
    max_lifespan?:number|null  // Added after 0.8.3; Infinity is converted to null in JSON
}
