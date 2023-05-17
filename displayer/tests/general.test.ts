
import {test} from '@playwright/test'


test('Visiting displayer without a hash', async ({page}) => {
    await page.goto('')
    await page.waitForSelector('text=Click original link to view message')
})
