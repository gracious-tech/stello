# Stello / στέλλω

This is the source code for [Stello](https://stello.news).

**While the source code is publicly viewable, it is not yet licensed and cannot be copied or distributed (it will likely be in the near future though).**


## How messages are sent

Stello stores messages in the cloud via services like AWS's S3. Each message for each recipient is publicly accessible, but has a long random id acting effectively as its access password. The actual contents of each messages' assets are encrypted and the key is never sent to the cloud service.

A HTML file which is also uploaded to the cloud service includes code for decrypting and displaying messages. Recipients are sent links which point to the HTML file and provide the message id and decryption key in the URL's fragment identifier. Browsers never transmit the fragment identifier via HTTP so the decryption key never leaves the user's device.

Public key encryption is used for any responses from recipients, with responses also stored in the cloud until Stello is next opened and downloads them.


## End-to-end encryption

Stello is end-to-end encrypted in the sense that the platform that stores and transfers the actual messages never has access to the decryption key. However, we avoid describing Stello as end-to-end encrypted because there are other aspects of Stello that make it less secure than well known end-to-end encryption apps.


## Components

 - **app:** App for authoring and sending messages
    - All of the UI and functionality for Stello (the program) is in here, and it interacts with cloud APIs for publishing messages
    - Written is JS for browser environment (for packaging with Electron or Cordova etc) using Vue 2 framework
 - **displayer:** Webpage that is deployed and served whenever a published message is viewed
    - The displayer is responsible for downloading, decrypting, and displaying messages
    - Written in Vue 3 and uses Vite for development and packaging
 - **responder:** Cloud function that handles responses from readers
    - The responder notifies the author of new responses, encrypts and stores them for downloading
    - Written in Python, so far for AWS only
 - **electron:** Packager for publishing `app` on desktop platforms
    - This is very barebones as only does things that are impossible in a browser environment (like sending emails)
    - An electron app that uses Electron Builder to package, sign, and publish binaries


## Credits

Reaction emoji: https://www.google.com/get/noto/help/emoji/

Illustrations: https://blush.design/

Third-party code: See dependency files
