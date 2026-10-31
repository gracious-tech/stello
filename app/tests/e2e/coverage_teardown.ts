
// Generate coverage report from the data cached by every test

import MCR from 'monocart-coverage-reports'

import {coverage_options} from './coverage'


export default async function():Promise<void>{
    await MCR(coverage_options).generate()
}
