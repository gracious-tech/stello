
# MacOS

## Getting a code signing certificate

 1. Generate (or use existing) private key

    `openssl genrsa -out private.key 2048`

 2. Generate a new certificate signing request (no subject data needed)

    `openssl req -new -key private.key -out cert_request.certSigningRequest -subj "/"`

 3. Create a new certificate using [Apple's developer admin](https://developer.apple.com/account/resources/certificates/add), selecting `Developer ID Application`, providing the request file generated earlier, and downloading the `.cer` file which is in DER format

 4. Convert the DER formatted file to PEM formatting

    `openssl x509 -inform der -in developerID_application.cer -out developerID_application.pem`

 5. Combine the private key and cert into a single p12 file, with password "abc123", since mac seems to require one

    `openssl pkcs12 -export -inkey private.key -in developerID_application.pem -out signing_cert.p12 -passout pass:abc123`


## Using a code signing certificate

Store the certificate as a base64 encoded (`base64 --wrap 0 cert.p12`) CI secret and expose as the `CSC_LINK` environment variable when building using Electron Builder (which accepts a base64 string).
