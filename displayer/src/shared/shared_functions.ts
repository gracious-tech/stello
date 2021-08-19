
// Types

interface SectionLike {
    id:string
    content:{
        type:string,
        standout?:string,
    }
}

interface RowDisplay {
    display:string
    sections:SectionLike[]
}


// Functions

export function floatify_rows(rows:([SectionLike]|[SectionLike, SectionLike])[]):RowDisplay[]{
    // Take sections/rows and return them with a display property provided for each row
    return rows.map(row => {

        // If only one section in the row, no special treatment needed
        const first = row[0]
        const second = row[1]
        if (!second){
            return {
                display: 'single',
                sections: [first],
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
            }
        }

        return {
            display: is_plain(second) ? 'wrap-left' : 'parallel',
            sections: [first, second],
        }
    })
}


export function section_classes(section:SectionLike):string[]{
    // Return classes for given section
    const classes = []
    classes.push(`type-${section.content.type}`)
    if (section.content.type === 'text' && section.content.standout){
        classes.push('standout')
        classes.push(`standout-${section.content.standout}`)
    }
    return classes
}
