// Generic factory functions for getting correct class for given cloud value

import {HostCloud} from './types'
import {HostManagerAws, HostManagerStorageAws} from './aws_manager'
import {HostUserAws} from './aws_user'


export function get_host_manager(cloud:HostCloud):typeof HostManagerAws{
    if (cloud === 'aws'){
        return HostManagerAws
    }
    throw new Error('impossible')
}


export function get_host_manager_storage(cloud:HostCloud):typeof HostManagerStorageAws{
    if (cloud === 'aws'){
        return HostManagerStorageAws
    }
    throw new Error('impossible')
}


export function get_host_user(cloud:HostCloud):typeof HostUserAws{
    if (cloud === 'aws'){
        return HostUserAws
    }
    throw new Error('impossible')
}
