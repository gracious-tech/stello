
import {test, expect} from '@playwright/test'

import {mimic_formatting} from './numbers'


test.describe('mimic_formatting', () => {

    const input:[string, number, string][] = [
        ['', 2, '2'],
        ['1', 2, '2'],
        ['1%', 2, '2%'],
        ['$1', 2, '$2'],
        ['-$1', 2, '$2'],
        ['$1', -2, '-$2'],
        ['-1%', 2, '2%'],
        ['1%', -2, '-2%'],
        ['-$.1', 2.2, '$2.2'],
        ['$1,000k', 2000, '$2,000k'],
    ]

    for (const item of input){
        test(item.join('  '), () => {
            expect(mimic_formatting(item[0], item[1])).toEqual(item[2])
        })
    }
})
