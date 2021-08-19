// Update package.json based on app_config.json and build config

import path from 'path'
import {writeFileSync} from 'fs'

import type {Metadata} from 'electron-builder'

import app_config from './app_config.json'
import package_json from './package.json'


interface PackageJsonMissing {
    private:boolean
    devDependencies:Record<string, string>
}


const new_contents:Metadata|PackageJsonMissing = {

    // Used by electron
    name: app_config.codename,
    version: app_config.version,
    description: app_config.description,
    homepage: `https://${app_config.domain}/`,
    author: {
        name: app_config.author.name,
        email: app_config.author.email,
    },

    // Code related
    private: true,
    main: 'src/main.js',
    dependencies: package_json.dependencies,
    devDependencies: package_json.devDependencies,
    build: {
        appId: `tech.gracious.${app_config.codename}`,
        productName: app_config.name,
        // NOTE Version not included so will overwrite each time (rely on S3 versioning instead)
        artifactName: app_config.codename + '.${ext}',
        appx: {
            backgroundColor: app_config.theme.primary,
            // These properties must match exactly what Microsoft expects in its store
            displayName: "Stello by Gracious Tech",
            publisherDisplayName: "Gracious Tech Pty Ltd",
            identityName: "GraciousTechPtyLtd.StellobyGraciousTech",
            publisher: "CN=108FB3BA-A617-4D61-B151-371B31EF4350",
        },
        mac: {
            darkModeSupport: true,
            category: 'public.app-category.productivity',
        },
        dmg: {
            // NOTE Don't set `backgroundColor` as it's bg of dmg container rather than app
            // NOTE internetEnabled option is no longer valid (bad docs)
            icon: null,  // Avoid using same icon as actual app so doesn't confuse users
            title: "Install Stello (drag into Applications)",
        },
        afterSign: "./macos_notarize.js",
        publish: {
            // NOTE Different settings used in Electron script to access via CloudFront instead
            provider: 's3',
            bucket: 'releases-stello-news',
            region: 'us-west-2',
            path: 'electron_proposed/',
            acl: null,  // So don't have to grant CI ACL permissions
        },
    },
}


// Write to package.json using same style that npm uses
const package_json_path = path.join(__dirname, 'package.json')
writeFileSync(package_json_path, JSON.stringify(new_contents, null, 4) + '\n')
