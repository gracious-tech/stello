
import {test, expect} from '@playwright/test'


test('Visiting displayer without a hash', async ({page}) => {
    await page.goto('')
    expect(await page.isVisible('text=Click original link to view message')).toBeTruthy()
})
