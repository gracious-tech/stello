
import {Task} from '@/services/tasks/tasks'
import {CustomError} from '../utils/exceptions'


export const HostStorageVersion = 11  // Bump whenever an update to storage services needed


// SIMPLE TYPES


export type HostCloud = 'aws'  //|'google'|'azure'


export interface HostCredentials {
    key_id:string
    key_secret:string
    key_session?:string
}


export interface HostStorageCredentials {
    credentials:HostCredentials
    api:string  // Dynamically generated so convenient to pair with also-dynamic credentials
}


// CLASSES


export declare class HostManager {
    // Management access to host's API for creating and managing sets of storage services

    cloud:HostCloud
    credentials:HostCredentials

    constructor(credentials:HostCredentials)

    // Get list of instances of HostManagerStorage for all detected in host account
    // NOTE Will return instances detected in any relevant services (not just storage service)
    //      So that partially deleted services can be detected and fully deleted or fixed
    list_storages():Promise<HostManagerStorage[]>

    // List regions that are available
    list_regions():Promise<string[]>

    // Get name for given region (since expensive in AWS, only use when necessary and cache)
    get_region_name(region:string):Promise<string>

    // See if a storage id is available
    // NOTE Returns false if taken (whether by own account or third party)
    bucket_available(bucket:string):Promise<boolean>

    // Create an instance for a new storage set of services (without actually doing anything yet)
    new_storage(bucket:string, region:string):HostManagerStorage
}


export declare class HostManagerStorage {
    // Management access to a single set of storage services

    cloud:HostCloud
    credentials:HostCredentials
    bucket:string
    region:string
    version:number

    // NOTE version may not be provided if not known or needed (e.g. when deleting services)
    constructor(credentials:HostCredentials, bucket:string, region:string, version?:number)

    // Whether storage services are up to date
    get up_to_date():boolean

    // Generate new credentials for the storage (and remove existing)
    new_credentials():Promise<HostStorageCredentials>
}


export declare class HostUser {
    // User access to host's API for sending messages etc

    cloud:HostCloud
    credentials:HostCredentials
    bucket:string
    region:string
    user:string|null

    constructor(credentials:HostCredentials, bucket:string, region:string, user:string)

    // Upload a file into the storage
    upload_file(path:string, data:Blob|ArrayBuffer, lifespan?:number, max_reads?:number)
        :Promise<void>

    // Delete a file that was uploaded into storage
    delete_file(path:string):Promise<void>

    // List uploaded files (useful for deleting old messages if app lost state)
    list_files(prefix?:string):Promise<string[]>

    // Download a response file
    download_response(path:string):Promise<ArrayBuffer>

    // Delete a response file
    delete_response(path:string):Promise<void>

    // List all responses
    list_responses(type?:string):Promise<string[]>

    // Upload config for the displayer
    upload_displayer_config(config:ArrayBuffer):Promise<void>

    // Upload config for responder function
    upload_responder_config(config:ArrayBuffer):Promise<void>

    // Update email address
    update_email(address:string):Promise<void>

    // Ensure host services setup properly
    setup_services(task:Task):Promise<void>

    // Delete services
    delete_services(task:Task):Promise<void>
}


// ERRORS (real thing, not just types)


export class HostPermissionError extends CustomError {}
