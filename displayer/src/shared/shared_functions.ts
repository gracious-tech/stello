
// Types

export interface SectionLike {
    id:string
    content:{
        type:string,
        standout?:string|null,
        images?:unknown[]
        hero?:boolean
    }
}

export interface RowDisplay<T> {
    display:string
    sections:T[]
    hero:boolean
}


// Functions

export function floatify_rows<T extends SectionLike>(rows:([T]|[T, T])[]):RowDisplay<T>[]{
    // Take sections/rows and return them with a display property provided for each row
    return rows.map(row => {

        // If only one section in the row, no special treatment needed
        const first = row[0]
        const second = row[1]
        if (!second){
            return {
                display: 'single',
                sections: [first],
                hero: first.content.type === 'images' && first.content.images!.length === 1 &&
                    !!first.content.hero,
            }
        }

        // Helper for determining if a section is plain text (and .'. will wrap other content)
        const is_plain = (section:SectionLike) =>
            section.content.type === 'text' && !section.content.standout

        if (is_plain(first)){
            // If not floating first section it needs to come last so can wrap around "second" one
            // NOTE This forces the real second section to float right even if it too was plain text
            return {
                display: 'wrap-right',
                sections: [second, first],
                hero: false,
            }
        }

        return {
            display: is_plain(second) ? 'wrap-left' : 'parallel',
            sections: [first, second],
            hero: false,
        }
    })
}


export function section_classes<T extends SectionLike>(section:T):string[]{
    // Return classes for given section
    const classes = []
    classes.push(`type-${section.content.type}`)
    if (section.content.type === 'text' && section.content.standout){
        classes.push('standout')
        classes.push(`standout-${section.content.standout}`)
    }
    return classes
}


export function reaction_url(reaction:string, prefix=''):string{
    // Get URL for given reaction code
    const svg_reactions = ['pray']
    const ext = svg_reactions.includes(reaction) ? 'svg' : 'json'
    return `${prefix}reactions/${reaction}.${ext}`
}
