
# Can't connect email account

Stello uses the same technology (SMTP) as regular email programs like Outlook and Apple Mail. If you can setup and send emails using a regular email program then you should be able to with Stello as well.


## Providers that don't support SMTP
There are some email providers that do not allow you to use an external program to send email. The only significant provider we know of so far is Tutanota. ProtonMail is another but they do allow connecting as long as you are a paid user and use their [bridge software](/guide/problem-protonmail/). Usually providers do this for security reasons, but when you are sending messages to a variety of contacts the security benefits of such systems are usually negated anyway and it is reasonable to just use a different email provider.


## Anti-virus issues
Stello can get mistakenly blocked by anti-virus which may prevent you from connecting an email account.

### Why does anti-virus block Stello?
Stello always sends emails over encrypted connections for security. Some anti-virus software provide email scanning features to detect threats embedded in emails. Because Stello uses encrypted connections these anti-virus products can't read the emails Stello sends and instead block them all together.

### How do I unblock Stello?
If your anti-virus software is stopping Stello sending emails you'll need to disable it. You likely won't need to completely disable your anti-virus, you just need to disable the email scanning feature for outgoing emails (SMTP) only.

### Instructions for AVG
By default AVG will block Stello from sending emails. You can unblock it by **disabling** the setting found at:

> AVG &rarr; Settings &rarr; Basic protection &rarr; Email Shield &rarr; Scan outbound emails (SMTP)

<img src='@/.assets/guide/disable_email_scanning_avg.jpg'>

### How do I know if my anti-virus is the reason I can't send emails?
You can temporarily disable your entire anti-virus software and **after restarting your computer** try to send an email with Stello. If you can confirm the issue is with your anti-virus software you can then turn it back on and try to disable only the specific feature of it that is causing the problem (likely email scanning).

### Is it safe to disable scanning of outbound emails?
While nothing is completely risk free, sending emails is a very basic and common behavior that shouldn't be blocked simply because the emails can't be scanned. If your computer were to be sending compromised emails then it would already be infected with malware anyway.
Your anti-virus may be able to be configured to only allow Stello to send emails and not other programs, but this may be very complicated.
