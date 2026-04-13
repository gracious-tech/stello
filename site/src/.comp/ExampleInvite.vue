
<template lang='pug'>

div(v-html='invite')

</template>


<script lang='ts'>

import {EXAMPLE_URL} from '@/globals'


export default {

    setup(){
        const invite = (() => {

            // Customised
            const image = '/invite_image.jpg'
            const contents = `
                <p>Hi friend,</p>
                <p>Please see below for latest news.</p>
                <p>Regards,<br>Gracious Tech</p>
            `

            // Copied straight from app
            const INVITE_HTML_MAX_WIDTH = 600
            const INVITE_HTML_CONTAINER_STYLES =
                `border-radius: 12px; max-width: ${INVITE_HTML_MAX_WIDTH}px; margin: 0 auto;`
                + 'background-color: #eeeeee; color: #000000;'
            const INVITE_HTML_IMAGE_STYLES =
                `border-radius: 12px 12px 0 0; width: 100%; height: auto; border-bottom: 1px solid #cccccc;`
                + `max-height: ${INVITE_HTML_MAX_WIDTH / 3}px; background-color: #ddeeff`
            return `<div style='${INVITE_HTML_CONTAINER_STYLES}'>
                <a href='${EXAMPLE_URL}' target='_blank'>
                    <img src='${image}' height='1' width='3' style='${INVITE_HTML_IMAGE_STYLES}'>
                </a>
                <div style='padding: 24px;'>
                    ${contents}
                </div>
                <hr style='margin: 0; border-style: solid; border-color: #cccccc; border-width: 1px 0 0 0;'>

                <div style='padding: 12px; border-radius: 0 0 12px 12px; text-align: center;
                        background-color: #ddeeff; color: #000000; font-family: Roboto, sans-serif;'>

                    <p style='margin: 36px 0;'>
                        <a href='${EXAMPLE_URL}' target='_blank' style='background-color: #224477; color: #ffffff;
                                padding: 12px 18px; border-radius: 12px; text-decoration: none;'>
                            <strong>Open Message</strong>
                        </a>
                    </p>

                </div>
            </div>`
        })()

        return {invite}
    }

}
</script>


<style lang='sass' scoped>


</style>
