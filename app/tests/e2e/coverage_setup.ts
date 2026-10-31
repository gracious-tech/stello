
// Clear any coverage cache from a previous run before tests start

import MCR from 'monocart-coverage-reports'

import {coverage_options} from './coverage'


export default function():void{
    MCR(coverage_options).cleanCache()
}
