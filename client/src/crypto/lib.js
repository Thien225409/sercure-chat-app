'use strict'

const { subtle } = window.crypto;
const crypto = window.crypto;

/// ////////////////////////////////////////////////////////////////////////////////
// Cryptographic Primitives
//
// All of the cryptographic functions you need for this assignment
// are contained within this library.
//
// The parameter and return types are designed to be as convenient as possible.
// The only conversion you will need in messenger.js will be when converting
// the result of decryptWithGCM (an ArrayBuffer) to a string.
//
// Any argument to a lib.js function should either be a string or a value
// returned by a lib.js function.
/// ////////////////////////////////////////////////////////////////////////////////

export const govEncryptionDataStr = 'AES-GENERATION'

export function stringToBuffer(str) {
  return new TextEncoder().encode(str);
}

export function bufferToString (arr) {
  // Converts from ArrayBuffer to string
  // Used to go from output of decryptWithGCM to string
  return new TextDecoder().decode(arr);
}


export function toUint8Array(data) {
  if (typeof data === 'string') {
    return stringToBuffer(data);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return data;
}

export function toBase64(arr) {
    let binary = '';
    const bytes = new Uint8Array(arr);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export const fromBase64 = (base64) => {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
};

export function genRandomSalt (len = 16) {
  // Used to generate IVs for AES encryption
  // Used in combination with encryptWithGCM and decryptWithGCM
  return crypto.getRandomValues(new Uint8Array(len))
}

export async function cryptoKeyToJSON (cryptoKey) {
  // Used to and return CryptoKey in JSON format
  // Can console.log() the returned variable to see printed key in a readable format
  // This function can be helpfl for debugging since console.log() on cryptoKey
  // directly will not show the key data
  const key = await subtle.exportKey('jwk', cryptoKey)
  return key
}

export async function generateEG () {
  // returns a pair of ElGamal keys as an object
  // private key is keypairObject.sec
  // public key is keypairObject.pub
  const keypair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-384' }, true, ['deriveKey'])
  const keypairObject = { pub: keypair.publicKey, sec: keypair.privateKey }
  return keypairObject
}

export async function computeDH (myPrivateKey, theirPublicKey) {
  // computes Diffie-Hellman key exchange for an EG private key and EG public key
  // myPrivateKey should be pair.sec from generateEG output
  // theirPublicKey should be pair.pub from generateEG output
  // myPrivateKey and theirPublicKey should be from different calls to generateEG
  // outputs shared secret result of DH exchange
  // return type is CryptoKey with derivedKeyAlgorithm of HMAC
  return await subtle.deriveKey({ name: 'ECDH', public: theirPublicKey }, myPrivateKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign', 'verify'])
}

export async function verifyWithECDSA (publicKey, message, signature) {
  // returns true if signature is correct for message and publicKey
  // publicKey should be pair.pub from generateECDSA
  // message must be a string
  // signature must be exact output of signWithECDSA
  // returns true if verification is successful and false is fails
  return await subtle.verify({ 
    name: 'ECDSA', 
    hash: { name: 'SHA-384' } }, 
    publicKey, 
    signature, 
    toUint8Array(message)
  )
}

export async function HMACtoAESKey (key, data, exportToArrayBuffer = false) {
  // Performs HMAC to derive a new key with derivedKeyAlgorithm AES
  // if exportToArrayBuffer is true, return key as ArrayBuffer. Otherwise, output CryptoKey
  // key is a CryptoKey
  // data is a string

  // first compute HMAC output
  const hmacBuf = await subtle.sign(
    { name: 'HMAC' }, 
    key, 
    toUint8Array(data)
  )

  // Then, re-import with derivedKeyAlgorithm AES-GCM
  const out = await subtle.importKey('raw', hmacBuf, 'AES-GCM', true, ['encrypt', 'decrypt'])

  // If exportToArrayBuffer is true, exportKey as ArrayBuffer
  // (Think: what part of the assignment can this help with?)
  if (exportToArrayBuffer) {
    return await subtle.exportKey('raw', out)
  }

  // otherwise, export as cryptoKey
  return out
}

export async function HMACtoHMACKey (key, data) {
  // Performs HMAC to derive a new key with derivedKeyAlgorithm HMAC
  // key is a CryptoKey
  // data is a string

  // first compute HMAC output
  const hmacBuf = await subtle.sign({ name: 'HMAC' }, key, toUint8Array(data))
  // Then, re-import with derivedKeyAlgorithm HMAC
  return await subtle.importKey('raw', hmacBuf, { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign'])
}

export async function HKDF (inputKey, salt, infoStr) {
  // Calculates HKDF outputs
  // inputKey is a cryptoKey with derivedKeyAlgorithm HMAC
  // salt is a second cryptoKey with derivedKeyAlgorithm HMAC
  // infoStr is a string (can be an arbitrary constant e.g. "ratchet-str")
  // returns an array of two HKDF outputs [hkdfOut1, hkdfOut2]

  // since inputKey's derivedKeyAlgorithm is HMAC, we need to sign an arbitrary constant and
  // then re-import as a a CryptoKey with derivedKeyAlgorithm HKDF
  const inputKeyBuf = await subtle.sign({ name: 'HMAC' }, inputKey, stringToBuffer('0'))
  const inputKeyHKDF = await subtle.importKey('raw', inputKeyBuf, 'HKDF', false, ['deriveKey'])

  // Generate salts that will be needed for deriveKey calls later on
  const salt1 = await subtle.sign({ name: 'HMAC' }, salt, stringToBuffer('salt1'))
  const salt2 = await subtle.sign({ name: 'HMAC' }, salt, stringToBuffer('salt2'))

  const infoBuffer = stringToBuffer(infoStr);

  // calculate first HKDF output (with salt1)
  const hkdfOut1 = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt1, info: infoBuffer },
    inputKeyHKDF, { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign'])

  // calculate second HKDF output (with salt2)
  const hkdfOut2 = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt2, info: infoBuffer },
    inputKeyHKDF, { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign'])

  return [hkdfOut1, hkdfOut2]
}

export async function encryptWithGCM (key, plaintext, iv, authenticatedData = '') {
  // Encrypts using the GCM mode.
  // key is a cryptoKey with derivedKeyAlgorithm AES-GCM
  // plaintext is a string or ArrayBuffer of the data you want to encrypt.
  // iv is used for encryption and must be unique for every use of the same key
  // use the genRandomSalt() function to generate iv and store it in the header for decryption
  // authenticatedData is an optional argument string
  // returns ciphertext as ArrayBuffer
  // The authenticatedData is not encrypted into the ciphertext, but it will
  // not be possible to decrypt the ciphertext unless it is passed.
  // (If there is no authenticatedData passed when encrypting, then it is not
  // necessary while decrypting.)
  return await subtle.encrypt(
    { 
      name: 'AES-GCM', 
      iv, 
      additionalData: toUint8Array(authenticatedData) 
    }, 
    key, 
    toUint8Array(plaintext)
  )
}

export async function decryptWithGCM (key, ciphertext, iv, authenticatedData = '') {
  // Decrypts using the GCM mode.
  // key is a cryptoKey with derivedKeyAlgorithm AES-GCM
  // ciphertext is an ArrayBuffer
  // iv used during encryption is necessary to decrypt
  // iv should have been passed through the message header
  // authenticatedData is optional, but if it was passed when
  // encrypting, it has to be passed now, otherwise the decrypt will fail.
  // returns plaintext as ArrayBuffer if successful
  // throws exception if decryption fails (key incorrect, tampering detected, etc)
  return await subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: toUint8Array(authenticatedData) },
    key,
    ciphertext
  )
}

/// /////////////////////////////////////////////////////////////////////////////
// Addtional ECDSA functions for test-messenger.js
//
// YOU DO NOT NEED THESE FUNCTIONS FOR MESSENGER.JS,
// but they may be helpful if you want to write additional
// tests for certificate signatures in test-messenger.js.
/// /////////////////////////////////////////////////////////////////////////////

export async function generateECDSA () {
  // returns a pair of Digital Signature Algorithm keys as an object
  // private key is keypairObject.sec
  // public key is keypairObject.pub
  const keypair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, true, ['sign', 'verify'])
  const keypairObject = { pub: keypair.publicKey, sec: keypair.privateKey }
  return keypairObject
}

export async function signWithECDSA (privateKey, message) {
  // returns signature of message with privateKey
  // privateKey should be pair.sec from generateECDSA
  // message is a string
  // signature returned as an ArrayBuffer
  return await subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-384' } }, 
    privateKey, 
    toUint8Array(message)
  )
}

export async function encryptFile(file) {
  const fileBuffer = await file.arrayBuffer();

  const fileKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = genRandomSalt(12);

  // Mã hóa nội dung file
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    fileKey,
    fileBuffer
  );

  // Xuất key ra dạng raw để gửi qua tin nhắn chat
  const exportedKey = await window.crypto.subtle.exportKey('raw', fileKey);

  return {
    encryptedBlob: new Blob([encryptedContent]), // Blob để upload lên server
    key: exportedKey,   // Gửi cái này qua kênh chat E2E
    iv: iv,             // Gửi cái này qua kênh chat E2E
    type: file.type,    // MIME type
    name: file.name
  }
}

export async function decryptFile(encryptedBuffer, rawKey, iv, type) {
  const fileKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    'AES-GCM',
    true,
    ['decrypt']
  );

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    fileKey,
    encryptedBuffer
  );

  return new Blob([decryptedBuffer], { type: type });
}