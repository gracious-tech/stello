// Generic factory functions for getting correct class for given cloud value

import {HostCloud} from './types'
import {HostManagerAws, HostManagerStorageAws} from './aws_manager'
import {HostUserAws} from './aws_user'


export function get_host_manager(cloud:HostCloud){
    switch (cloud){
        case 'aws':
            return HostManagerAws
    }
    throw new Error('impossible')
}


export function get_host_manager_storage(cloud:HostCloud){
    switch (cloud){
        case 'aws':
            return HostManagerStorageAws
    }
    throw new Error('impossible')
}


export function get_host_user(cloud:HostCloud){
    switch (cloud){
        case 'aws':
            return HostUserAws
    }
    throw new Error('impossible')
}
