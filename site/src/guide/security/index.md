
<script setup>

import IconEmail from 'md-icon-svgs/email.svg'

import IconPrivateConn from '@/.assets/icons/private_connectivity.svg'
import IconConnectUnknown from '@/.assets/icons/connect_unknown.svg'
import IconMailLock from '@/.assets/icons/mail_lock.svg'
import SecurityDiagram from '@/.assets/guide/security.svg'

</script>

<style lang='sass' scoped>

.diagram
    display: flex
    align-items: center

    svg
        fill: currentColor
        width: 48px
        height: 48px
        margin: 0 12px

        &.crypt
            fill: rgba(50%, 100%, 50%, 0.8)

        &.insecure
            fill: rgba(100%, 50%, 50%, 0.8)

    .node
        display: flex
        flex-direction: column
        align-items: center

        svg
            width: 24px

.security-diagram
    width: 100%
    height: auto

</style>


# Security
Stello was specifically created to provide a secure alternative to traditional newsletter platforms.

## Stello's security benefits
Because Stello messages are sent via links, you can do the following that you can't do with email:
 * Retract a sent message
 * Expire a message after a period of time
 * Expire a message after being opened a certain amount of times
 * Encrypt responses
 * Prevent recipients from keeping their own responses

## Existing messaging technologies
Stello enhances the existing security of whatever you use to send your messages, so in order to understand Stello's security model you must first understand how existing solutions work.

### How email works
When email was first created there was no encryption for it, so messages could be intercepted by all the services that are responsible for delivering them. Over the years encryption has been introduced and is almost always required when sending messages to your email provider (the first leg) and when downloading messages from your email provider (the last leg).

The journey between your email provider and another person's email provider has been the slowest to adopt encryption, and these days it is encrypted around [96% of the time](https://transparencyreport.google.com/safer-email/overview).

Emails are still viewable by both your email provider and the recipient's as they are only encrypted when in transit.


<div class='diagram'>
    <div class='node'>
        You
        <IconEmail/>
    </div>
    <IconPrivateConn class='crypt'/>
    <div class='node'>
        Your email provider
        <IconEmail class='insecure'/>
    </div>
    <IconConnectUnknown class='insecure'/>
    <div class='node'>
        Recipient's email provider
        <IconEmail class='insecure'/>
    </div>
    <IconPrivateConn class='crypt'/>
    <div class='node'>
        Recipient
        <IconEmail/>
    </div>
</div>

#### End-to-end encrypted email
There have been attempts to fully encrypt email but none of them have widespread use. Some email providers have made great efforts to further secure email and even provide end-to-end encryption when sending to another user using the same provider. None of these solutions however work when emailing a large list of contacts with varying addresses.

So the only real difference between mainstream providers like Gmail and "secure" email providers is how much you trust the company to not abuse your privacy. There isn't much difference on a technical level.


### How standard message apps work
Most messaging apps work as a central system, so there is only one "provider" rather than the two that is often the case with email. The messaging provider can read all the messages sent in their system. Such apps include Facebook Messenger, Instagram, etc. It is likely these companies restrict access to only senior staff, but there'll always be someone who can read your messages if they really want to.

<div class='diagram'>
    <div class='node'>
        You
        <IconEmail/>
    </div>
    <IconPrivateConn class='crypt'/>
    <div class='node'>
        Messaging app
        <IconEmail class='insecure'/>
    </div>
    <IconPrivateConn class='crypt'/>
    <div class='node'>
        Recipient
        <IconEmail/>
    </div>
</div>

### How end-to-end encrypted message apps work
End-to-end encryption is where the message is encrypted before being sent and only able to be decrypted by the recipient's device. These apps make it impossible for the service provider to be able to read the messages as they only ever possess the encrypted copy. Such apps include Signal, WhatsApp, etc.

<div class='diagram'>
    <div class='node'>
        You
        <IconEmail/>
    </div>
    <IconPrivateConn class='crypt'/>
    <div class='node'>
        Messaging app
        <IconMailLock class='crypt'/>
    </div>
    <IconPrivateConn class='crypt'/>
    <div class='node'>
        Recipient
        <IconEmail/>
    </div>
</div>


## How Stello works
Stello works on top of existing messaging technologies which it uses to send recipients the link that provides access to the message. You can use any messaging technology to send the link, though only email can be automated (others must be copy and pasted). Stello is as secure as whatever is used to send the link. You can replace the outlined box with any of the diagrams discussed already above.

<SecurityDiagram class='security-diagram'/>

The link that is sent combines the address for locating the message as well as the password for decrypting it. Only the encrypted message is uploaded to the Stello server such that the service provider cannot read the message, they can only know that it exists. Stello messages usually have an expiry as well, after which time the server will delete the message and the link will become redundant.

When the recipient clicks the link they are taken to a webpage that downloads the encrypted message. Significantly, the password in the link is never sent to the server (due to the nature of how that part of a URL works). So the server never has access to the password. After downloading the message the browser will decrypt it and display it to the recipient.

### Media is encrypted as well
Everything you put in a Stello message is fully encrypted, including images, files, and config. They are all decrypted in the reader's browser which has the decryption key, so cannot be accessed from the server they are stored on. The contents of a Stello server is in simplified form:

 * messages
    * config
    * media
        * random id
        * random id
        * ...
    * copies
        * random id
        * random id
        * ...
 * responses
    * config
    * replies
        * random id
        * random id
        * ...

So the quantity and creation time of messages can be observed (until they expire) but otherwise every single file in storage is encrypted by passwords that only you and your readers have (and are never sent to the server).

<small>* Obviously Youtube and Vimeo videos are not encrypted as they are externally hosted</small>

<small>* Due to technical limitations the passwords for the image headers in invitations are sent to the server but only momentarily to decrypt the image and display it, they are never stored on the server</small>

### Responses are encrypted too
Responses are encrypted in the reader's browser before being sent to the Stello server and only your device can decrypt them. So the Stello server can see how many responses you have waiting to be downloaded and that's about it.

<small>* You can optionally send unencrypted responses to the server so you can read them in email notifications without having to open Stello</small>

### Invites are not encrypted or retractable
The emails you send inviting people to read your message are regular emails and so are not encrypted (aside from regular email encryption) and cannot be retracted. The header image is the exception though as it is encrypted and retractable.

## Stello usage can be detected
Stello was created by a Christian organisation and it is possible for internet service providers and government to detect if you are using Stello (unless you use a VPN before opening Stello). Stello is also a desktop application and must be installed on your device. If this is an issue for you then it is recommended to appoint a trusted contact who can use Stello on your behalf and act as your intermediary.

You should txt or email them plain text and image attachments which they can then copy and paste fairly quickly into a Stello message for you. They can then screenshot and send you back any responses they receive from recipients. You obviously should use a secure channel for such communication.

## Stello data on your device is not encrypted
We work under the assumption that your computer will contain much more sensitive material than you'll be sending with Stello, amongst all your files and browsing history. In which case it is essential that you have proper encryption for your entire device and not just Stello. If your computer is not encrypted and is compromised then there's nothing Stello could do to protect you anyway. Your email password is encrypted when provided to Stello, but other than that you should have a proper encryption system for your entire computer instead.
