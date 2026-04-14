
# MacOS

## Getting a code signing certificate

 1. Generate (or use existing) private key

    `openssl genrsa -out private.key 2048`

 2. Generate a new certificate signing request (no subject data needed)

    `openssl req -new -key private.key -out cert_request.certSigningRequest -subj "/"`

 3. Create a new certificate using [Apple's developer admin](https://developer.apple.com/account/resources/certificates/add), selecting `Developer ID Application`, then `G2 Sub-CA`, providing the request file generated earlier, and downloading the `.cer` file which is in DER format

 4. Download the Apple Developer ID intermediate certificate

    `curl -o DeveloperIDG2CA.cer https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer`

 5. Convert both DER formatted files to PEM formatting

    `openssl x509 -inform der -in DeveloperIDG2CA.cer -out DeveloperIDG2CA.pem`
    `openssl x509 -inform der -in developerID_application.cer -out developerID_application.pem`

 6. Combine the private key, cert, and intermediate into a single p12 file, with password "abc123", since mac seems to require one

    `openssl pkcs12 -export -legacy -inkey private.key -in developerID_application.pem -certfile DeveloperIDG2CA.pem -out signing_cert.p12 -passout pass:abc123`


## Using a code signing certificate

Store the certificate as a base64 encoded (`base64 --wrap 0 signing_cert.p12`) CI secret and expose as the `CSC_LINK` environment variable when building using Electron Builder (which accepts a base64 string).
