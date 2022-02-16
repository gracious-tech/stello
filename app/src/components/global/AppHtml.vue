
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
        template(v-else)
            input.url(ref='url' v-model='bubble_url' @keydown.enter.prevent='on_url_confirmation'
                type='url' placeholder="Enter URL..." spellcheck='false')
            app-btn(:icon='bubble_url ? "done" : "close"' @click='on_url_confirmation')

    floating-menu.floating(v-if='editor' @click.native='focus' :editor='editor'
            :tippy-options='floating_tippy_options')
        template(v-if='heading_prompt')
            span.heading_prompt {{ heading_prompt }}
        template(v-else)
            span.prompt Type or...
            app-btn(icon='heading' @click='focused_run("toggleHeading", {level:1})'
                data-tip="Heading")
            app-btn(icon='subheading' @click='focused_run("toggleHeading", {level:2})'
                data-tip="Subheading")
            app-btn(icon='list_bulleted' @click='focused_run("toggleBulletList")'
                data-tip="Bullet points")
            app-btn(icon='list_numbered' @click='focused_run("toggleOrderedList")'
                data-tip="Numbered list")
            app-btn(icon='format_quote' @click='focused_run("toggleBlockquote")'
                data-tip="Multi-line quote")
            app-btn(icon='tag' @click='focused_run("insertContent", "#")'
                data-tip="Dynamic content (merge fields)")

    editor-content(:editor='editor')

</template>


<script lang='ts'>

import tippy from 'tippy.js'
import {Component, Vue, Prop, Watch} from 'vue-property-decorator'

import {Editor, EditorContent, BubbleMenu, FloatingMenu, VueRenderer, BubbleMenuInterface,
    mergeAttributes} from '@tiptap/vue-2'
import {Mention} from '@tiptap/extension-mention'
import {SuggestionOptions} from '@tiptap/suggestion'
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


function mention_renderer():ReturnType<SuggestionOptions['render']>{
    // Render function for mention extension
    let component:VueRenderer
    let popup:ReturnType<typeof tippy>

    return {

        onStart: props => {
            // Render custom component with list of suggestions
            component = new VueRenderer(AppHtmlVariables, {
                parent: this,
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

        onUpdate(props){
            // Update component when props change
            component.updateProps(props)
            popup[0].setProps({
                getReferenceClientRect: props.clientRect,
            })
        },

        onKeyDown(props){
            // Pass on key down events to the custom list component to handle
            return (component.ref as any).on_keydown(props)
        },

        onExit(){
            // Destroy the popup and component when no longer needed
            popup[0].destroy()
            component.destroy()
        },
    }
}


@Component({
    components: {EditorContent, BubbleMenu, FloatingMenu},
})
export default class extends Vue {

    @Prop({type: String, default: ''}) declare readonly value:string
    @Prop({type: Object, default: () => {}}) declare readonly variables:Record<string, {label:string, value:string}>

    editor:Editor|null = null
    bubble_url:string|null = null
    heading_prompt = null

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

    focused_run(command:string, config?:any):void{
        // Run an editor command after focusing the editor (e.g. after a button click)
        this.editor.chain().focus()[command](config).run()
    }

    reevaluate_heading_prompt(){
        // Re-evaluate whether inside a heading or subheading
        if (this.editor!.isActive('heading', {level: 1})){
            this.heading_prompt = "Heading..."
        } else if (this.editor!.isActive('heading', {level: 2})){
            this.heading_prompt = "Subheading..."
        } else {
            this.heading_prompt = null
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
        let url = this.bubble_url.trim()
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
                // Whenever content changes, may/may not be inside a heading any more
                this.reevaluate_heading_prompt()
            },
            onSelectionUpdate: () => {
                // Whenever selection changes, may/may not be inside a heading any more
                this.reevaluate_heading_prompt()
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
                Heading.configure({levels: [1, 2]}).extend({
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
                Mention.configure({
                    // @ts-ignore custom fn added so can use it within `renderHTML()`
                    tip: (id:string):string => this.variables[id].label,
                    // Use variable's value as span's text, otherwise variable's label
                    renderLabel: ({node}) => this.variables[node.attrs['id']].value
                        || this.variables[node.attrs['id']].label.toLocaleUpperCase(),
                    suggestion: {
                        char: '#',
                        items: ({query}) => {
                            // Match items by label and/or code
                            query = query.toLowerCase()
                            return Object.entries(this.variables)
                                .map(([code, {label, value}]) => ({code, label, value}))
                                .filter(i =>
                                    i.label.toLowerCase().includes(query) || i.code.includes(query))
                        },
                        render: mention_renderer,
                    },
                }).extend({
                    renderHTML({node, HTMLAttributes}){
                        // Override to add tip attributes
                        return [
                            'span',
                            mergeAttributes(
                                {
                                    'data-mention': '',
                                    'data-tip': this.options.tip(node.attrs['id']),
                                    'data-tip-instant': '',
                                },
                                this.options.HTMLAttributes,
                                HTMLAttributes,
                            ),
                            this.options.renderLabel({node, options: this.options}),
                        ]
                    },
                    renderText({node}){
                        // Use code when copying/pasting as text, as easier to reapply as no spaces
                        return `${this.options.suggestion.char}${node.attrs['id']}`
                    },
                }),
                History,  // Required for undo/redo
                Dropcursor,  // Required for showing drag position
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
            const data_id = node.attributes.getNamedItem('data-id').value
            node.textContent = this.variables[data_id].value
                || this.variables[data_id].label.toLocaleUpperCase()
        }
    }
}

</script>


<style lang='sass' scoped>

@import 'src/styles/globals.sass'


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

    .prompt, .heading_prompt
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
