
<template lang='pug'>

div.step
    div.num Step 1 - You
    div.substep
        icon-alternate-email(class='icon')
        div Connect email account
    div.substep
        icon-sending(class='icon')
        div Write &amp; send
div.step
    div.num Step 2 - Stello
    div.substep
        icon-lock(class='icon')
        div Encrypts message
    div.substep
        icon-cloud(class='icon')
        div Uploads to cloud
    div.substep
        icon-key(class='icon')
        div Emails links with password
div.step
    div.num Step 3 - Recipient
    div.substep
        icon-launch(class='icon')
        div Clicks link in email
    div.substep
        icon-lock-open(class='icon')
        div Browser decrypts and displays


</template>


<script lang='ts'>

import IconArrowBack from 'md-icon-svgs/arrow_back.svg'
import IconCloud from 'md-icon-svgs/cloud_upload.svg'
import IconKey from 'md-icon-svgs/vpn_key.svg'
import IconLaunch from 'md-icon-svgs/launch.svg'
import IconSending from 'md-icon-svgs/send.svg'
import IconLock from 'md-icon-svgs/lock.svg'
import IconLockOpen from 'md-icon-svgs/lock_open.svg'
import IconAlternateEmail from 'md-icon-svgs/alternate_email.svg'


export default {
    components: {IconArrowBack, IconCloud, IconKey, IconLaunch, IconSending, IconLockOpen,
        IconLock, IconAlternateEmail},
}
</script>


<style lang='sass' scoped>


.step
    background-color: hsla(0, 0%, 100%, 0.1)
    display: flex
    flex-direction: column
    margin: 24px auto
    max-width: 400px
    padding: 24px
    border-radius: 24px

    .num
        align-self: center
        background-color: var(--secondary)
        color: #000
        font-weight: bold
        border-radius: 20px
        margin-bottom: 24px
        padding: 6px 12px

    .substep
        display: flex
        align-items: center
        flex-wrap: no-wrap
        margin-bottom: 24px

        .icon
            margin-right: 12px
            min-width: 24px
            min-height: 24px
            fill: currentColor

</style>
