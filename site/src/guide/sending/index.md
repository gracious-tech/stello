
<script setup>
import IconPendingUpload from '@/.assets/icons/pending.svg'
import IconPendingSend from '@/.assets/icons/schedule_send.svg'
import IconInvalid from '@/.assets/icons/cancel_schedule_send.svg'
import IconManual from 'md-icon-svgs/chat.svg'
import IconSuccess from 'md-icon-svgs/check_circle.svg'
import IconExpired from 'md-icon-svgs/delete.svg'
</script>

<style lang='sass' scoped>
svg
    fill: currentColor
.success
    fill: rgba(20%, 100%, 20%, 0.8)
.error
    fill: rgba(100%, 20%, 20%, 0.8)
.disabled
    opacity: 0.5

</style>

# Sending
When Stello sends a message it will first upload encrypted copies into your sending account and will then email links to the copies to all your email recipients. For more information on how all this works, see the [in depth](/guide/system/) sections of this guide.

Sending happens from your own computer so you'll need to leave Stello open until it completes. Unlike when bcc'ing people in a regular email, Stello sends a different email to every recipient so it will take longer in that sense. It also might get interrupted half-way in which case you'll need to resume sending.

## Stello uses your email account
Most newsletter platforms will send emails on your behalf and stick your address on, even though it is not actually coming from your account. This will often cause them to get flagged as being deceptive, unless you have your own domain name and have set things up properly with the newsletter platform (not simple).

Stello on the other hand uses your own email account to send, which means email services know the message is genuinely from you. And services like Gmail won't consider your messages to be "promotional" as it does for emails from newsletter platforms.

<img src='@/.assets/guide/promotional_inbox.jpg'>

## Sending limits
Because Stello uses your own email account to send, the limits to your email account apply to Stello too.

Message sending limits for popular services are:

| Service       | Free plan                                                 | Paid plan
| -             | -                                                         | -
| **Gmail**     | [500/day](https://support.google.com/mail/answer/22839)   | [2000/day](https://support.google.com/a/answer/166852)
| **Outlook**   | ~300/day                                                  | [5000/day](https://support.microsoft.com/en-us/office/sending-limits-in-outlook-com-279ee200-594c-40f0-9ec8-bb6af7735c2e)
| **iCloud**    | [1000/day](https://support.apple.com/en-au/HT202305)      | [1000/day](https://support.apple.com/en-au/HT202305)
| **ProtonMail**| [50/hour, 150/day](https://protonmail.com/support/knowledge-base/sending-limit/) | [300/hour, 1000/day](https://protonmail.com/support/knowledge-base/sending-limit/)
| **Fastmail**  | N/A    | [2000/hour, 4000/day](https://www.fastmail.help/hc/en-us/articles/1500000277382-Account-limits)

::: warning
Most services will further reduce limits for new accounts, accounts with suspicious activity, and will consider other factors too (so don't be surprised if your real limit is less than stated).
:::

There are lots of email providers with higher limits and affordable plans, so you may want to shop around if you need to send to more than a few hundred contacts in one go. Or you can also simply resume sending the next day, and Stello will pick up where it left off.


## Your responsibility
Stello will send messages you tell it to and is just a tool. It's your responsibility to ensure you are not sending messages that recipients do not want to receive, you are complying with anti-spam legislation, and you don't exceed the limits of your account.

::: danger
If you exceed the limits of your account you will not be able to send any emails (not just Stello ones) until the limit resets. Limits usually reset every 24 hours at the latest.

Be sure to only send messages to people that know you. Repeated spamming behaviour could get your own personal email account banned by your email provider and you could lose access to all your personal emails.
:::

## Sending statuses
Each recipient will have a sending status next to them when viewing the sent message. They mean the following:

| Icon                              | Status            | Explanation
| -                                 | -                 | -
| <IconPendingUpload/>              | Not ready         | Message hasn't been uploaded to the Stello server yet
| <IconPendingSend/>                | Waiting to send   | Message ready but invitation to open hasn't been emailed yet
| <IconInvalid class='error'/>      | Invalid address   | Contact's email address is invalid and needs correcting
| <IconManual/>                     | Send manually     | Contact has no email address so link must be sent manually
| <IconSuccess class='success'/>    | Sent              | Have successfully sent to this contact
| <IconExpired class='disabled'/>   | Expired           | Message has expired or been retracted for this contact

## Resuming sending
If sending gets interrupted Stello will prompt you to "Retry" or "Finish sending". Have no fear, Stello will never send duplicate messages to your contacts unless you created a duplicate message. You can retry sending as much as you like until it completes or the problem is resolved and each recipient will only ever get one copy.

&nbsp;<hr>&nbsp;

<a href='/guide/problem-sending/' class='btn'>Troubleshoot sending</a>
