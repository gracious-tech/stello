
<template lang='pug'>

div

    bubble-menu.bubble(v-if='editor' :editor='editor' :tippy-options='bubble_tippy_options'
            class='app-bg-primary-relative')
        template(v-if='bubble_url === null')
            app-btn(icon='format_bold' :color='editor.isActive("bold") ? "accent" : ""'
                @click='focused_run("toggleBold")' data-tip="Bold")
            app-btn(icon='format_italic' :color='editor.isActive("italic") ? "accent" : ""'
                @click='focused_run("toggleItalic")' data-tip="Italic")
            app-btn(icon='highlight' :color='editor.isActive("highlight") ? "accent" : ""'
                @click='focused_run("toggleHighlight")' data-tip="Highlight")
            app-btn(icon='link' :color='editor.isActive("link") ? "accent" : ""'
                @click='on_url_toggle' data-tip="Link")
            app-menu-more
                v-subheader Change format
                app-list-item(@click='force_block("setParagraph")') Normal
                app-list-item(@click='force_heading') Heading
                app-list-item(@click='force_block("toggleBulletList")') Bullet points
                app-list-item(@click='force_block("toggleOrderedList")') Numbered list
                app-list-item(@click='force_block("setNote")') Note
                app-list-item(@click='force_block("setBlockquote")') Quotation
                v-divider
                app-list-item(@click='clear_formatting') Clear all formatting

        template(v-else)
            input.url(ref='url' v-model='bubble_url' @keydown.enter.prevent='on_url_confirmation'
                type='url' placeholder="Enter URL..." spellcheck='false')
            app-btn(:icon='bubble_url ? "done" : "close"' @click='on_url_confirmation')

    floating-menu.floating(v-if='editor' @click.native='focus' :editor='editor'
            :tippy-options='floating_tippy_options')
        template(v-if='block_prompt')
            span.block_prompt {{ block_prompt }}
        template(v-else)
            span.prompt Type or...
            app-btn(icon='heading' @click='focused_run("setHeading", {level:2})'
                data-tip="Heading")
            app-btn(icon='list_bulleted' @click='focused_run("toggleBulletList")'
                data-tip="Bullet points")
            app-btn(icon='list_numbered' @click='focused_run("toggleOrderedList")'
                data-tip="Numbered list")
            app-btn(icon='short_text' @click='focused_run("setNote")'
                data-tip="Note")
            app-btn(icon='format_quote' @click='focused_run("setBlockquote")'
                data-tip="Quotation")

    editor-content(:editor='editor')

</template>


<script lang='ts'>

import tippy from 'tippy.js'
import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import {Plugin, PluginKey} from 'prosemirror-state'
import {Node as ProseMirrorNode} from 'prosemirror-model'
import {Editor, EditorContent, BubbleMenu, FloatingMenu, VueRenderer, BubbleMenuInterface,
    mergeAttributes, Node, Extension, ChainedCommands} from '@tiptap/vue-2'
import {Mention} from '@tiptap/extension-mention'
import {SuggestionProps, SuggestionKeyDownProps} from '@tiptap/suggestion'
import {Document} from '@tiptap/extension-document'
import {Text} from '@tiptap/extension-text'
import {Link} from '@tiptap/extension-link'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Placeholder} from '@tiptap/extension-placeholder'
import {Blockquote} from '@tiptap/extension-blockquote'
import {HardBreak} from '@tiptap/extension-hard-break'
import {Bold} from '@tiptap/extension-bold'
import {Italic} from '@tiptap/extension-italic'
import {Heading} from '@tiptap/extension-heading'
import {ListItem} from '@tiptap/extension-list-item'
import {BulletList} from '@tiptap/extension-bullet-list'
import {OrderedList} from '@tiptap/extension-ordered-list'
import {Typography} from '@tiptap/extension-typography'
import {History} from '@tiptap/extension-history'
import {Dropcursor} from '@tiptap/extension-dropcursor'
import {HorizontalRule} from '@tiptap/extension-horizontal-rule'
import {Highlight} from '@tiptap/extension-highlight'

import AppHtmlVariables from './assets/AppHtmlVariables.vue'


declare module '@tiptap/core' {
    // Tell TS about custom commands
    interface Commands<ReturnType> {
        note: {
            setNote: () => ReturnType,
        }
    }
}


export const NormalizeHeadings = Extension.create({
    // A TipTap extension for converting all headings to H2 when pasted (else <h1> would become <p>)
    name: 'NormalizeHeadings',
    addProseMirrorPlugins(){
        return [new Plugin({
            key: new PluginKey('NormalizeHeadings'),
            props: {
                transformPastedHTML(html){
                    // WARN Pasted html may be <h1 style=...> rather than <h1>
                    return html.replaceAll(/<(\/?\s*)h[1-6]/ig, '<$1h2')
                },
            },
        })]
    },
})


export const Note = Node.create({
    // A custom node for notes that uses <p><small> so that will render correctly in emails too etc
    name: 'note',
    group: 'block',
    content: 'inline*',
    defining: true,  // Pasted text should go within (rather than replace) notes

    parseHTML(){
        return [{tag: 'p', context: 'paragraph/small'}]
    },

    renderHTML(){
        return ['p', ['small', 0]]
    },

    addCommands(){
        return {
            setNote: () => ({commands}) => {
                return commands.setNode(this.name)
            },
        }
    },

    addKeyboardShortcuts: () => {return {
        // Revert to a <p> when backspace on empty note (rather than rm line)
        // so that is similar to ul/ol/etc and shows inline menu options again
        Backspace: ({editor}) => {
            const {empty, $anchor} = editor.state.selection
            if (!empty || $anchor.parent.type.name !== 'note') {
                return false  // Something selected, or not dealing with a note
            }
            if ($anchor.pos === 1 || !$anchor.parent.textContent.length){
                // Cursor is at beginning of line, so remove the note node
                return editor.commands.clearNodes()
            }
            return false
        },
    }},
})


function mention_renderer(parent_component:AppHtml){
    // Render function for AppHtmlVariables list popup
    let component:VueRenderer
    let popup:ReturnType<typeof tippy>

    return {

        onStart: (props:SuggestionProps) => {
            // Render custom component with list of suggestions
            component = new VueRenderer(AppHtmlVariables, {
                parent: parent_component,
                propsData: props,
            })
            // Use tippy to position the list (could possibly use Vuetify but meh)
            popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
            })
        },

        onUpdate(props:SuggestionProps){
            // Update component when props change
            component.updateProps(props)
            popup[0]!.setProps({
                getReferenceClientRect: props.clientRect,
            })
        },

        onKeyDown(props:SuggestionKeyDownProps){
            // Pass on key down events to the custom list component to handle
            return (component.ref as AppHtmlVariables).on_keydown(props)
        },

        onExit(){
            // Destroy the popup and component when no longer needed
            popup[0]!.destroy()
            component.destroy()
        },
    }
}


function CustomMention(component:AppHtml){
    // Custom version of Mention extension that uses # and own variables system
    const trigger_char = '#'

    const options = {
        // Use variable's value as span's text, otherwise variable's label
        renderLabel: ({node}:{node:ProseMirrorNode}) => {
            return component.variables[node.attrs['id'] as string]!.value
                || component.variables[node.attrs['id'] as string]!.label.toLocaleUpperCase()
        },
        suggestion: {
            char: trigger_char,
            items: ({query}:{query:string}) => {
                // Match items by label and/or code when typing after trigger char
                query = query.toLowerCase()
                return Object.entries(component.variables)
                    .map(([code, {label, value}]) => ({code, label, value}))
                    .filter(i => i.label.toLowerCase().includes(query) || i.code.includes(query))
            },
            render: () => mention_renderer(component),
        },
    }

    return Mention.configure(options).extend({
        renderHTML:({node, HTMLAttributes}) => {
            // Override to add tip attributes
            return [
                'span',
                mergeAttributes(
                    {
                        'data-mention': '',
                        'data-tip': component.variables[node.attrs['id'] as string]!.label,
                        'data-tip-instant': '',
                    },
                    HTMLAttributes,
                ),
                options.renderLabel({node}),
            ]
        },
        renderText({node}){
            // Use code when copying/pasting as text, as easier to reapply as no spaces
            return `${trigger_char}${node.attrs['id'] as string}`
        },
    })
}


@Component({
    components: {EditorContent, BubbleMenu, FloatingMenu},
})
export default class AppHtml extends Vue {

    @Prop({type: String, default: ''}) declare readonly value:string
    @Prop({type: Object, default: () => ({})}) declare readonly variables
        :Record<string, {label:string, value:string}>

    editor:Editor|null = null
    bubble_url:string|null = null
    block_prompt:string|null = null

    get has_variables(){
        // Whether variables provided
        return !!Object.keys(this.variables).length
    }

    get bubble_tippy_options():BubbleMenuInterface['tippyOptions']{
        // Custom popup options for the bubble menu
        return {
            maxWidth: 500,  // Prevent wrapping by enlarging
            // Prevent menu from appearing under section move buttons (not body as then unstyled)
            appendTo: self.document.querySelector('.v-application--wrap')!,
            onHide: () => {
                // Clear any url input when bubble closed
                this.bubble_url = null
            },
        }
    }

    get floating_tippy_options():BubbleMenuInterface['tippyOptions']{
        // Custom popup options for the floating/inline menu
        return {
            maxWidth: 500,  // Prevent wrapping by enlarging
        }
    }

    focus(){
        // Focus the editor
        // NOTE Used by parent components
        if (!this.editor!.isFocused){
            this.editor!.commands.focus()
        }
    }

    focused_run<T extends keyof ChainedCommands>(
            command:T, ...config:Parameters<ChainedCommands[T]>):void{
        // Run an editor command after focusing the editor (e.g. after a button click)
        // @ts-ignore TS doesn't like ... as every command has different arg expectations
        ;(this.editor!.chain().focus()[command](...config) as ChainedCommands).run()
    }

    force_block(command:'setBlockquote'|'setNote'|'toggleBulletList'|'toggleOrderedList'
            |'setParagraph'){
        // Force selection to become block signified by given command
        // NOTE Some block types won't change unless existing nodes first cleared
        this.editor!.chain().focus().clearNodes()[command]().run()
    }

    force_heading(){
        // Force selection to become a heading
        this.editor!.chain().focus().clearNodes().setHeading({level: 2}).run()
    }

    clear_formatting(){
        // Clear all formatting for selected text
        this.editor!.chain().focus().clearNodes().unsetAllMarks().run()
    }

    reevaluate_block_prompt(){
        // Re-evaluate what prompt to show when block is empty
        if (this.editor!.isActive('heading')){
            this.block_prompt = "Heading..."
        } else if (this.editor!.isActive('note')){
            this.block_prompt = "Note..."
        } else {
            this.block_prompt = null
        }
    }

    on_url_toggle(){
        // When clicking the link format button, either clear an existing link or show input field
        if (this.editor!.isActive("link")){
            this.focused_run('unsetLink')
        } else {
            this.bubble_url = ''  // When not null, field appears
            this.$nextTick(() => {
                ;(this.$refs['url'] as HTMLInputElement).focus()
            })
        }
    }

    on_url_confirmation(){
        // When clicking the appended confirm button, create the link if there was any input
        let url = this.bubble_url?.trim()
        if (url){
            if (!url.includes(':')){  // Allows mailto, and other protocols
                url = 'https://' + url  // SECURITY default to https
            }
            this.focused_run('setLink', {href: url})
        }
        this.bubble_url = null
    }

    mounted(){
        // Init editor
        this.editor = new Editor({
            content: this.value,
            onUpdate: () => {
                // Emit html whenever content changes
                this.$emit('input', this.editor!.getHTML())
                // Whenever content changes, may be in a new block type
                this.reevaluate_block_prompt()
            },
            onSelectionUpdate: () => {
                // Whenever selection changes, may be in a new block type
                this.reevaluate_block_prompt()
            },
            extensions: [
                // Core
                Document,
                Text,
                // Elements without UI
                Paragraph,  // Default element
                HardBreak,  // Shift-enter
                HorizontalRule,  // ---
                Typography,  // Transforms common sequences into unicode, e.g. (c) to ©
                // Elements with UI
                Heading.configure({levels: [2]}).extend({
                    addInputRules: () => [],  // Disable creation via '# ' since use for variables
                    addKeyboardShortcuts: () => {return {
                        // Revert to a <p> when backspace on empty heading (rather than rm line)
                        // so that is similar to ul/ol/etc and shows inline menu options again
                        Backspace: ({editor}) => {
                            const {empty, $anchor} = editor.state.selection
                            if (!empty || $anchor.parent.type.name !== 'heading') {
                                return false  // Something selected, or not dealing with a heading
                            }
                            if ($anchor.pos === 1 || !$anchor.parent.textContent.length){
                                // Cursor is at beginning of line, so remove the heading node
                                return this.editor!.commands.clearNodes()
                            }
                            return false
                        },
                    }},
                }),
                ListItem,  // <li> required for lists
                BulletList,
                OrderedList,
                Blockquote.extend({
                    content: 'paragraph+',  // Don't allow headings/lists/etc in blockquotes
                }),
                Bold,
                Italic,
                Highlight,
                Link,
                // Utils
                Placeholder,
                History,  // Required for undo/redo
                Dropcursor,  // Required for showing drag position
                // Own extensions
                CustomMention(this),
                Note,
                NormalizeHeadings,
            ],
        })
    }

    beforeDestroy(){
        // Ensure editor instance destroyed to avoid memory leaks
        if (this.editor){
            this.editor.destroy()
        }
    }


    @Watch('value') watch_value(value:string):void{
        // If provided value changes, reflect change in editor
        // NOTE Don't touch editor if already same (e.g. due to own emit)
        if (this.editor && this.editor.getHTML() !== value){
            this.editor.commands.setContent(this.value, false)  // Doesn't emit change
        }
    }

    @Watch('variables') watch_variables(){
        // When variables change, update the text content of mention nodes
        // NOTE Prosemirror/Tiptap APIs didn't seem to have an easy way to do this
        // NOTE Changes don't need saving as the content of mention nodes is always dynamic
        for (const node of this.$el.querySelectorAll('[data-mention]')){
            const data_id = node.attributes.getNamedItem('data-id')!.value
            node.textContent = this.variables[data_id]!.value
                || this.variables[data_id]!.label.toLocaleUpperCase()
        }
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/utils.sass'


.v-btn
    // Make all buttons match text color (as editor theme may be different to app theme)
    color: currentColor !important


.bubble
    display: flex
    border-radius: 24px
    box-shadow: 0 1px 4px 0 rgba(black, 20%)

    .url
        margin-left: 12px
        font-size: 16px
        height: 48px
        width: 300px

        &:focus
            outline-style: none


// Create placeholder when editor is empty and not focused
::v-deep .ProseMirror:not(:focus-within) p.is-editor-empty:first-child::before
    content: attr(data-placeholder)
    float: left
    color: rgba(#888, 0.5)
    pointer-events: none
    height: 0


.floating
    user-select: none

    .prompt, .block_prompt
        opacity: 0.25

    .v-btn
        opacity: 0.25
        &:hover
            opacity: 1

    &:hover
        .v-btn
            opacity: 0.75


::v-deep [contenteditable='true']

    // Make dynamic content clearly visible
    [data-mention]
        outline: 2px solid rgba(var(--accent_darker_num), 50%)

    // Show href of links on hover (using existing tooltip styling)
    a::after
        @include tooltip
        content: attr(href)
    a:hover::after
        top: -$tooltip_height - 6
        opacity: 1 !important

    // Tooltip containers in editor need relative positioning for some reason
    [data-tip], a
        position: relative
        &::after
            left: 0


</style>


<style lang='sass'>

// Do not show prompt if sections adjacent as not enough room for that and buttons
.srow:not(.single)
    .type-text .floating
        .prompt
            display: none

</style>
