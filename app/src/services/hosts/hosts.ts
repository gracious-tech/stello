// Generic factory functions for getting correct class for given cloud value

import {HostCloud} from './types'
import {HostManagerAws} from './aws_manager'
import {HostUserAws} from './aws_user'
import {HostUserGracious} from '@/services/hosts/gracious_user'


export function get_host_manager(cloud:HostCloud){
    if (cloud === 'aws'){
        return HostManagerAws
    }
    throw new Error('impossible')
}


export function get_host_user(cloud:HostCloud){
    if (cloud === 'aws'){
        return HostUserAws
    } else if (cloud === 'gracious'){
        return HostUserGracious
    }
    throw new Error('impossible')
}
