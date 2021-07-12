// Config that is specific to the deployment env (not user) and hard-coded when deployed

import {DeploymentConfig} from '../shared/shared_types'


// PRIVATE

function _decode_config():DeploymentConfig{
    // Decode and return embedded config data (value to be replaced during deployment)
    // NOTE Random suffix is in case 'DEPLOYMENT_CONFIG_DATA' mentioned in comments (like now!)
    let b64_json_config = 'DEPLOYMENT_CONFIG_DATA_UfWFTF5axRWX'
    if (b64_json_config.startsWith('DEPLOYMENT_CONFIG_DATA')){  // No prefix so not replaced
        b64_json_config = btoa(JSON.stringify({
            url_msgs: '/dev/',  // Will point at public dev assets that are never deployed
            url_msgs_append_subdomain: false,
            url_responder: 'http://localhost:3050/',
        } as DeploymentConfig))
    }
    return JSON.parse(atob(b64_json_config))
}

function _parse_config(config:DeploymentConfig):Omit<DeploymentConfig, 'url_msgs_append_subdomain'>{
    // Return deployment urls, processed from config
    let {url_msgs, url_responder} = config
    // Optionally append subdomain to msgs url
    if (config.url_msgs_append_subdomain){
        url_msgs += self.location.hostname.split('.')[0] + '/'
    }
    return {url_msgs, url_responder}
}


// PUBLIC

export const deployment_config = _parse_config(_decode_config())
