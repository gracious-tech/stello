
import {Task} from '@/services/tasks/tasks'


export const HostStorageVersion = 1  // Bump whenever an update to storage services needed


// SIMPLE TYPES


export type HostCloud = 'aws'|'google'


export interface HostCredentials {
    key_id:string
    key_secret:string
}


export interface HostStorageCredentials {
    credentials:HostCredentials
    credentials_responder:HostCredentials
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

    constructor(credentials:HostCredentials, bucket:string, region:string, version:number)

    // Ensure host services setup properly (sets up all services, not just storage)
    // NOTE Will create if storage doesn't exist, or fail if storage id taken by third party
    setup_services(task:Task, force:boolean):Promise<void>

    // Generate new credentials for the storage (and remove existing)
    new_credentials():Promise<HostStorageCredentials>

    // Delete services for this storage set
    delete_services(task:Task):Promise<void>
}


export declare class HostUser {
    // User access to host's API for sending messages etc

    cloud:HostCloud
    credentials:HostCredentials
    bucket:string
    region:string
    user:string

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
    list_responses(prefix?:string):Promise<string[]>

    // Upload config for responder function
    upload_responder_config(config:Record<string, any>):Promise<void>
}


// ERRORS (real thing, not just types)


export class HostPermissionError extends Error {}
