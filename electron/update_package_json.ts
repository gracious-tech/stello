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
    main: 'dist/main.js',
    dependencies: package_json.dependencies,
    devDependencies: package_json.devDependencies,
    build: {
        files: [
            // Stop electron-builder from including src files (defaults to '**/*')
            // NOTE electron-builder still includes standard ignores in addition to these
            // NOTE test by packaging and `npx asar extract resources/app.asar app_asar`
            'dist',
            // Rollbar includes lots of unnecessary stuff that is quite large
            '!node_modules/rollbar/dist',  // Just for browser, main is 'src/server/rollbar.js'
            '!node_modules/rollbar/src/browser',
            '!node_modules/rollbar/docs',
        ],
        appId: `tech.gracious.${app_config.codename}`,
        productName: app_config.name,
        // NOTE Version not included so will overwrite each time (rely on S3 versioning instead)
        // eslint-disable-next-line no-template-curly-in-string -- electron-builder syntax
        artifactName: app_config.codename + '.${ext}',
        directories: {
            output: 'packaged',  // dist used for electron JS code (built from TS)
        },
        linux: {
            category: 'Office',
        },
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
