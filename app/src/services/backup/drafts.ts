
import {download_file} from '@/services/utils/misc'
import {blob_to_bitcanvas, buffer_to_base64, canvas_to_blob} from '@/services/utils/coding'
import {escape_for_html, sanitize_filename} from '@/services/utils/strings'
import {section_classes, floatify_rows} from '@/shared/shared_functions'
import {gen_theme_style_props} from '@/shared/shared_theme'

import type {Section} from '@/services/database/sections'
import type {ThemeStyle} from '@/shared/shared_types'
import type {ContentPage, RecordDraft, SectionIds} from '@/services/database/types'

import displayer_styles from '@/shared/styles/displayer.sass?inline'


// HTML template for draft export
function fill_template(title:string, content:string, theme_style:string, theme_style_css:string){
    return  `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="user-scalable=no, width=device-width, initial-scale=1">
            <title>${escape_for_html(title)}</title>
            <style>
                :root {
                    ${theme_style_css}
                }
                @media screen {
                    html {
                        background-color: var(--stello-bg);
                    }
                }
                body {
                    margin: 0;
                }
                section.type-images img {
                    width: 100%;
                    border-radius: var(--stello-radius);
                    margin-bottom: 24px;
                }
                section.type-video img {
                    width: 100%;
                    border-radius: var(--stello-radius);
                    aspect-ratio: 16 / 9;
                    object-fit: cover;
                }
                h1 {
                    text-align: center;
                }
                ${displayer_styles as string}
            </style>
        </head>
        <body>
            <div class='stello-displayer style-${theme_style}'>
                <div class='content'>
                    ${content}
                </div>
            </div>
        </body>
        </html>
    `
}


// Render list of sections to HTML
async function sections_to_html(section_ids:SectionIds):Promise<string>{

    // Collect page sections as will add to end
    // NOTE Users usually use pages to not interrupt the flow of the parent page so end is best
    const pages:Section<ContentPage>[] = []
    const take_if_page = (section:Section|undefined) => {
        if (section?.content.type === 'page'){
            pages.push(section as Section<ContentPage>)
            return undefined
        }
        return section
    }

    // Convert the section ids to actual sections
    // NOTE Filter out sections that can't be fetched for some reason
    const sections:([Section]|[Section, Section])[] = []
    for (const [sid1, sid2] of section_ids){
        const row = [
            take_if_page(await self.app_db.sections.get(sid1)),
            sid2 ? take_if_page(await self.app_db.sections.get(sid2)) : undefined,
        ].filter(s => s) as [Section]|[Section, Section]
        if (row.length){
            sections.push(row)
        }
    }

    // Work out the display of rows
    const floatified_rows = floatify_rows(sections)

    // Render each row to html
    let html = ''
    for (const row of floatified_rows){
        html += `<div class='srow ${row.display} ${row.hero ? "hero" : ""}'>
            <div class='sections'>`
        html += await section_to_html(row.sections[0]!)
        if (row.sections[1]){
            html += await section_to_html(row.sections[1])
        }
        html += '</div></div>'
    }

    // Add pages that were taken out of sections array
    for (const page of pages){
        html += '<hr>' + await sections_to_html(page.content.sections)
    }

    return html
}


// Convert a single section to HTML
async function section_to_html(section:Section):Promise<string>{
    const classes = section_classes(section)
    const section_html = await inner_section_to_html(section)
    return `
        <section class='${classes.join(" ")}'>
            <div class='inner'>${section_html}</div>
        </section>
    `
}


// Get HTML based on section type
async function inner_section_to_html(section:Section):Promise<string>{
    if (section.content.type === 'text'){
        return section.content.html
    } else if (section.content.type === 'video'){
        const video_id = section.content.id
        if (video_id && section.content.format === 'iframe_youtube'){
            const img = `https://img.youtube.com/vi/${video_id}/hqdefault.jpg`
            return `<a href='https://www.youtube.com/watch?v=${video_id}'><img src="${img}"></a>`
        }
    } else if (section.content.type === 'chart'){
        return ''  // TODO Could use OffscreenCanvas to render Chart.js using Chart.toBase64Image()
    } else if (section.content.type === 'images'){
        // TODO captions
        let html = ''
        for (const image of section.content.images){
            // Ensure images are webp as file will be large if not
            let webp:Blob
            if (image.data.type === 'image/webp'){
                webp = image.data
            } else {
                webp = await canvas_to_blob(await blob_to_bitcanvas(image.data), 'webp')
            }
            const base64 = buffer_to_base64(await webp.arrayBuffer())
            html += `<img src="data:image/webp;base64,${base64}">`
        }
        return html
    } else if (section.content.type === 'files'){
        return '' // TODO Test if large files will still work to embed
    }
    return ''
}


// Convert a draft to exportable HTML
export async function draft_to_html(draft:RecordDraft):Promise<string>{

    // Get theme_style
    let theme_style:ThemeStyle = 'modern'
    let theme_color = self.app_db.profiles.get_default_theme_color()
    if (draft.profile){
        const profile = await self.app_db.profiles.get(draft.profile)
        if (profile){
            theme_style = profile.options.theme_style
            theme_color = profile.options.theme_color
        }
    }
    const theme_style_props = gen_theme_style_props(false, theme_style, theme_color)
    const theme_style_css =
        Object.entries(theme_style_props).map(([key, val]) => `${key}:${val};`).join('\n')

    const content = await sections_to_html(draft.sections)
    return fill_template(draft.title, content, theme_style, theme_style_css)
}


// Prompt the user to save a draft as HTML
export async function save_draft_html(draft:RecordDraft){
    const html = await draft_to_html(draft)
    const filename = sanitize_filename(draft.title) + '.html'
    download_file(new File([html], filename, {type: 'text/html'}))
}


// Prompt the user to save a draft as PDF
export async function save_draft_pdf(draft:RecordDraft){
    const html = await draft_to_html(draft)
    const filename = sanitize_filename(draft.title)
    void self.app_native.html_to_pdf(html, filename)
}
