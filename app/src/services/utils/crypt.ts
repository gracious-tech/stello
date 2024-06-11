
import {join_buffers, buffers_equal} from './buffers'
import {buffer_to_url64, url64_to_buffer} from './coding'


// NIST recommends 96 bits (12 bytes) IV, and 128 bits (16 bytes) tag
// See https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf
const SYM_IV_BYTES = 12
const SYM_TAG_BITS = 128
const SYM_KEY_BITS = 256  // The max for AES
const SYM_KEY_BITS_SHORT = 128  // Still offers strong protection, but only use when necessary


// See https://developer.mozilla.org/en-US/docs/Web/API/RsaHashedKeyGenParams
const ASYM_MODULUS_BITS = 4096  // 2048 is considered minimum
const ASYM_PUBLIC_EXPONENT = new Uint8Array([0x01, 0x00, 0x01])  // 65537 (commonly recommended)


// KEYS


export function generate_key_sym(extractable=false, modes:KeyUsage[]=['encrypt'], short=false)
        :Promise<CryptoKey>{
    // Return a new key for encrypting data (optionally extractable)
    const algorithm:AesKeyGenParams = {name: 'AES-GCM',
        length: short ? SYM_KEY_BITS_SHORT : SYM_KEY_BITS}
    return crypto.subtle.generateKey(algorithm, extractable, modes)
}


export function generate_key_asym(extractable=false, modes:KeyUsage[]=['decrypt'])
        :Promise<CryptoKeyPair>{
    // Return a new key pair for public-key encryption (optionally extractable)
    // NOTE The public key part is always extractable, while secret key part is configurable
    const algorithm:RsaHashedKeyGenParams = {
        name: 'RSA-OAEP',
        modulusLength: ASYM_MODULUS_BITS,
        publicExponent: ASYM_PUBLIC_EXPONENT,
        hash: 'SHA-256',  // 512 can in some cases actually be more vulnerable
    }
    return crypto.subtle.generateKey(algorithm, extractable, modes)
}


export function import_key_sym(secret:ArrayBuffer, extractable=false, modes:KeyUsage[]=['decrypt'])
        :Promise<CryptoKey>{
    // Return a new sym key object from given binary data
    return crypto.subtle.importKey('raw', secret, 'AES-GCM', extractable, modes)
}


export function import_key_asym(secret:ArrayBuffer, extractable=false, modes:KeyUsage[]=['encrypt'])
        :Promise<CryptoKey>{
    // Return a new asym key object from given binary data
    // NOTE The public key part is always extractable, while secret key part is configurable
    const algorithm:RsaHashedImportParams = {name: 'RSA-OAEP', hash: 'SHA-256'}
    return crypto.subtle.importKey('spki', secret, algorithm, extractable, modes)
}


export function export_key(key:CryptoKey):Promise<ArrayBuffer>{
    // Return the raw binary secret of a CryptoKey
    return crypto.subtle.exportKey(key.algorithm.name === 'RSA-OAEP' ? 'spki' : 'raw', key)
}


// ENCRYPTION


export async function encrypt_sym(data:ArrayBuffer, key:CryptoKey):Promise<ArrayBuffer>{
    // Encrypt the given data with the given key
    // NOTE IV and tag are both included in the result (iv manually, tag always by SubtleCrypto)
    //      i.e. iv|ciphertext|tag

    // Generate a new random IV
    const iv = crypto.getRandomValues(new Uint8Array(SYM_IV_BYTES))

    // Encrypt the provided data
    const algorithm = {name: 'AES-GCM', tagLength: SYM_TAG_BITS, iv}
    const encrypted = await crypto.subtle.encrypt(algorithm, key, data) as ArrayBuffer

    // Return encrypted buffer with iv prepended
    return join_buffers([iv, encrypted])
}


export async function encrypt_asym_primitive(data:ArrayBuffer, key:CryptoKey):Promise<ArrayBuffer>{
    // Do primitive asymmetric encryption of given data (must be shorter than key size)
    return await crypto.subtle.encrypt({name: 'RSA-OAEP'}, key, data) as ArrayBuffer
}


export async function encrypt_asym(data:ArrayBuffer, asym_key:CryptoKey):Promise<string>{
    // Do asymmetric encryption of data with internal symmetric encryption so data can be limitless

    // Generate a new symmetric key
    const sym_key = await generate_key_sym(true)

    // Encrypt the data with the symmetric key (rather than the asymmetric key)
    const encrypted_data = await encrypt_sym(data, sym_key)

    // Encrypt the symmetric key with the assymetric key
    // Since the symmetric key is always a fixed length it never causes issues with RSA's limitation
    const encrypted_sym_key = await encrypt_asym_primitive(await export_key(sym_key), asym_key)

    // Return a JSON string with the encrypted data and encrypted decryption key
    return JSON.stringify({
        encrypted_data: buffer_to_url64(encrypted_data),
        encrypted_key: buffer_to_url64(encrypted_sym_key),
    })
}


export async function decrypt_sym(buffer:ArrayBuffer, key:CryptoKey):Promise<ArrayBuffer>{
    // Decrypt the given data with the given key

    // Extract IV that was prepended to ciphertext
    const iv = buffer.slice(0, SYM_IV_BYTES)
    const encrypted = buffer.slice(SYM_IV_BYTES)

    // Decrypt
    const algorithm = {name: 'AES-GCM', tagLength: SYM_TAG_BITS, iv}
    try {
        return await crypto.subtle.decrypt(algorithm, key, encrypted) as ArrayBuffer
    } catch (error){
        throw error instanceof DOMException ? new Error(`${error.name}: Failed to decrypt`) : error
    }
}


export async function decrypt_asym_primitive(buffer:ArrayBuffer, key:CryptoKey)
        :Promise<ArrayBuffer>{
    // Do primitive asymmetric decryption of given buffer
    try {
        return await crypto.subtle.decrypt({name: 'RSA-OAEP'}, key, buffer) as ArrayBuffer
    } catch (error){
        throw error instanceof DOMException ? new Error(`${error.name}: Failed to decrypt`) : error
    }
}


export async function decrypt_asym(json:string, asym_key:CryptoKey):Promise<ArrayBuffer>{
    // Do asymmetric decryption with internal symmetric decryption

    // Parse json input
    const {encrypted_data, encrypted_key} =
        JSON.parse(json) as {encrypted_data:string, encrypted_key:string}

    // Decode and decrypt symmetric key
    const sym_key = await import_key_sym(
        await decrypt_asym_primitive(url64_to_buffer(encrypted_key), asym_key))

    // Decode and decrypt data
    return decrypt_sym(url64_to_buffer(encrypted_data), sym_key)
}


// OTHER


export function random_buffer(bytes:number):ArrayBuffer{
    // Generate a buffer filled with random bits
    return crypto.getRandomValues(new Uint8Array(bytes)).buffer
}


export function generate_token(bytes=15):string{
    // Return a random string that is url safe (can be used for authentication or uuid etc)
    // NOTE Standard UUIDs are 15.25 bytes random + 0.75 version info (16 in total)
    // NOTE Returned string will be bytes/3*4 in length (multiples of 3 best for base64)
    return buffer_to_url64(random_buffer(bytes))
}


export async function generate_hash(buffer:ArrayBuffer, salt_bytes=16):Promise<ArrayBuffer>{
    // Generate a hash of provided data (salt is prepended to hash input & to the result)
    const salt = random_buffer(salt_bytes)
    const digest = await crypto.subtle.digest('SHA-256', join_buffers([salt, buffer]))
    return join_buffers([salt, digest])
}


export async function confirm_hash(hash:ArrayBuffer, input:ArrayBuffer, salt_bytes=16)
        :Promise<boolean>{
    // Confirm a hash was generated with the provided input and prepended with x bytes of salt
    const salt = hash.slice(0, salt_bytes)
    const original_digest = hash.slice(salt_bytes)
    const digest = await crypto.subtle.digest('SHA-256', join_buffers([salt, input]))
    return buffers_equal(digest, original_digest)
}
