
<script setup>
import IconInvalid from '@/.assets/icons/cancel_schedule_send.svg'
import IconPendingSend from '@/.assets/icons/schedule_send.svg'
</script>

<style lang='sass' scoped>
.neutral
    fill: hsla(0, 0%, 100%, 0.8)
.error
    fill: rgba(100%, 20%, 20%, 0.8)

</style>

# Trouble sending messages

Worked hard on your message and now it's not sending? That's annoying! Believe us... we know.

Don't try send a new message or create a new Stello account as that is more likely to make the problem worse than better. Instead, let's identify what the problem is and see what options are available...

#### Please first read our [page on sending](/guide/sending/) as this page expands on that

## Some of my messages don't send
Each of your contacts is sent a separate message and each will have a status icon next to them to indicate what the problem is:

### There is <IconInvalid class='error'/> next to some of my contacts
Your email account refused to send to them because it detected the addresses are invalid. You should ask those contacts for their email address again as it is probably misspelled or they have changed address. After updating their address you can finish sending and Stello will retry with the new address.

### There is <IconPendingSend class='neutral'/> next to some of my contacts
Then sending has not finished and Stello was interrupted by an error or reached the sending limit of your email account. If you have reached your account's sending limit it is best to just resume sending the next day as limits usually reset every 24 hours.

### No messages are going through
If no messages are getting sent at all and you haven't sent many messages that day (using your regular email program) then something may be wrong and you should [let us know](https://gracious.tech/contact).


## I get bounce/rejection emails
When your message is successfully sent but then your email provider (or the recipient's) later decides it doesn't want to send the message you'll receive an email from them telling you your message wasn't sent. Common reasons include:
 * The recipient's address was incorrect
 * The recipient's account has been deleted or is full
 * You triggered an email provider's limit by sending many messages

It's important to read the emails to see what it identifies the problem as. You may just need to correct the address (or remove) some of your stale contacts. If you receive lots of rejection emails then you may have triggered some kind of sending limit or be suspected of sending spam.

### When rejection emails suggest you've hit a limit...

<!--
1. Calculate how many messages went through by comparing how many you sent to how many rejection emails you received (this is roughly your sending limit)
2. Go into your Stello sending profile and enter in that limit for your email account (or slightly less than it)

That will hopefully solve things for future. Stello will only send that amount of emails per day and will automatically send the rest the next day if you leave it open. But now let's deal with the message you were trying to send.
-->

Unfortunately Stello can't exactly identify which emails were rejected since your email provider told Stello it was fine and then changed its mind. But Stello will make it easier by ruling out contacts that already opened the message.

1. Open the sent message in Stello
2. In top-right menu click "Resend some emails"
3. Select the contacts you received rejection messages for

When Stello is next able to send it will retry sending to those contacts.


## How to avoid sending limits
If you are having problems with the limits of your email account you can try the following:

### 1. Clean up your contacts list
An easy way to stay under account limits is to simply remove some contacts. This is good practice because:

1. It helps to stay within account limits
2. You're less likely to have contacts mark you as spam
    * Some contacts may do this as a lazy way of unsubscribing
3. Your open rate will be higher
    * Disengaged contacts just serve to depress it (and you!)

You can do this by:
* Checking your previous mailing platform if it allows you to see who hasn't read your messages
* Checking Stello's "Disengaged" list in the contacts page if you've already sent several messages
* Ask all your contacts to resubscribe and remove those who don't
    * You could do this manually or could create a Google Form with name and email address fields, export it to CSV, then import that into Stello


### 2. Spread sending over several days
Most users will not _need_ to send to every contact immediately, and sending over just two days will effectively double your sending limit. Stello will usually be able to just pick up where it left off, so it requires little effort to just resume sending the next day or two.

#### Only send in batches if getting rejection emails
It is common with regular email programs to divide your subscribers list into smaller groups so you can send in batches and avoid limits around how many addresses can be put in a single email. There isn't much benefit in doing that with Stello though. Stello sends a separate email to each of your contacts and will automatically pick up where it left off as soon as your email account restriction eases.

Sending in batches may be helpful if you are getting lots of rejection emails, since Stello can't detect those and won't know to stop sending when they occur.


### 3. Try a different email account
You should avoid using free email accounts that are recently created or rarely used. So it's often the case that your main personal email account will be the best to use because it will have built up trust with your email provider already, where as a brand new account or an account devoted just to newsletters are the worst options.

::: danger
Be careful when using your personal account to send lots of messages as if it gets suspended you'll lose access to all your personal emails. Hitting a sending limit occasionally shouldn't be a problem but frequent spam-like behaviour may get you banned.
:::

If you have email addresses with multiple providers then you could try them to see if they are more generous with their limits.

Paid accounts will usually allow much higher limits than free ones, so you could try creating a reasonably cheap address with a privacy-friendly provider like [Fastmail](https://fastmail.com/pricing/). [ProtonMail](https://protonmail.com/support/knowledge-base/sending-limit/) isn't recommended because their limits are quite low, they are more complicated to setup, and their security features aren't as relevant when sending to non-ProtonMail addresses.

::: tip
You can change the email account used for your sending account at any time and even resume sending a message with a different account
:::

::: tip
**_Professionals only_** -- Stello uses SMTP so you can set it up with any service you like that can connect via SMTP, such as [SendGrid](https://sendgrid.com/). You could then potentially send to thousands of contacts using Stello, though you'll have to deal with SPF/etc and may have an increased likelihood of getting marked as spam if not using a dedicated IP.
:::

### 4. Contact us
Feel free to [contact us](https://gracious.tech/contact) if you are still having trouble sending. At the very least you'll help us identify what email providers are most reliable so we can direct users to those that work the best.

## Sending with Stello is too painful
We understand it can be frustrating when you've spent a long time writing your message and then there's a problem sending it. That's the reality of email unfortunately, and if you go with other solutions you'll face different problems instead, like messages going to spam and not being as interactive and secure.

If you can't (or don't want to) find an email provider that allows you to send the amount of messages you want, you could try a hybrid solution instead where you use Stello to create your message but use something else to send it.

### Procedure:

1. Write your message in Stello
2. Send it to a single contact (with mailing list option enabled)
3. Copy the invitation into Mailchimp/WhatsApp group/etc
4. Send

### Disadvantages:

Since there's only one contact in Stello, unsubscribes, inserting contacts' names in text, seeing who opened the message, etc. will all have to be handled by the platform you are using to send the message.

But the main disadvantage will be having to manually write to the correct contact when replying to responses, or alternatively you could disable comments/replies and have recipients reply via email or txt instead. If you are happy with that compromise then you'll get to enjoy most of Stello's features and not have to worry about email account limits any more.
