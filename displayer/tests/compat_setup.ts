// Vitest global setup that reads compatibility fixtures and provides them to displayer tests
// NOTE Read at runtime (in node) rather than via import.meta.glob, whose results Vitest caches
//      across runs so newly added fixtures could be missed

import {existsSync, readdirSync, readFileSync} from 'fs'
import path from 'path'

import type {TestProject} from 'vitest/node'


export default function setup(project:TestProject):void{
    // Provide all fixture files keyed by version then file name
    const compat_dir = path.resolve(__dirname, '../../fixtures/compat')
    const fixtures:Record<string, Record<string, unknown>> = {}
    for (const version of existsSync(compat_dir) ? readdirSync(compat_dir) : []){
        const version_dir = path.join(compat_dir, version)
        if (!version.startsWith('v')){
            continue  // E.g. README
        }
        fixtures[version] = {}
        for (const file of readdirSync(version_dir).filter(f => f.endsWith('.json'))){
            fixtures[version][file] =
                JSON.parse(readFileSync(path.join(version_dir, file), 'utf8')) as unknown
        }
    }
    project.provide('compat_fixtures', fixtures)
}


declare module 'vitest' {
    export interface ProvidedContext {
        compat_fixtures:Record<string, Record<string, unknown>>
    }
}
