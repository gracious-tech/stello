test...

# Stello / στέλλω

This is the source code for [Stello](https://stello.news).


## How messages are sent

Stello stores messages in the cloud via services like AWS's S3. Each message for each recipient is publicly accessible, but has a long random id acting effectively as its access password. The actual contents of each messages' assets are encrypted and the key is never sent to the cloud service.

A HTML file which is also uploaded to the cloud service includes code for decrypting and displaying messages. Recipients are sent links which point to the HTML file and provide the message id and decryption key in the URL's fragment identifier. Browsers never transmit the fragment identifier via HTTP so the decryption key never leaves the user's device.

Public key encryption is used for any responses from recipients, with responses also stored in the cloud until Stello is next opened and downloads them.


## End-to-end encryption

Stello is end-to-end encrypted in the sense that the platform that stores and transfers the actual messages never has access to the decryption key. However, we avoid describing Stello as end-to-end encrypted because there are other aspects of Stello that make it less secure than well known end-to-end encryption apps. Namely, the fact that the decryption code is served by the server that also stores the encrypted files, such that a malicious server could modify the decryption code to transmit unencrypted data back to itself. This is a known risk, but still a better scenario than most apps that give the server full access to decrypted files.


## Components

 - **app:** App for authoring and sending messages
    - All of the UI and functionality for Stello (the program) is in here, and it interacts with cloud APIs for publishing messages
    - Written in JS for browser environment (for packaging with Electron or Cordova etc) using Vue 2 framework
 - **displayer:** Webpage that is deployed and served whenever a published message is viewed
    - The displayer is responsible for downloading, decrypting, and displaying messages
    - Written in Vue 3 and uses Vite for development and packaging
 - **responder:** Cloud function that handles responses from readers
    - The responder notifies the author of new responses, encrypts and stores them for downloading
    - Written in Python, so far for AWS only
 - **electron:** Packager for publishing `app` on desktop platforms
    - This is very barebones as only does things that are impossible in a browser environment (like using SMTP)
    - An electron app that uses Electron Builder to package, sign, and publish binaries


## Browser support

The displayer of messages currently supports all browsers that have implemented the Subtle Crypto API, as well as all ES2015 features and CSS grid (since most have when crypto supported).

 - Chrome 57+
 - Edge 79+
 - Samusung 6.2+
 - Safari 10.1+
 - iOS 10.3+
 - Firefox 54+

Notes:
* Supports around 95% of users (Apr 2021)
* [webkitSubtle is not compatible](https://webkit.org/blog/7790/update-on-web-cryptography/)


## Credits

Reactions: [JoyPixels](https://www.joypixels.com/emoji/animated) (proprietary license)

Illustrations: [Blush](https://blush.design/) (proprietary license)

Third-party code: See dependency files
