'use strict'

/** ******* Imports ********/

import {
  bufferToString,
  genRandomSalt,
  generateEG, // async
  computeDH, // async
  verifyWithECDSA, // async
  HMACtoAESKey, // async
  HMACtoHMACKey, // async
  HKDF, // async
  encryptWithGCM, // async
  decryptWithGCM,
  cryptoKeyToJSON, // async
  govEncryptionDataStr,
  toBase64,
  fromBase64
} from './lib.js';

/** ******* Implementation ********/

export class MessengerClient {
  constructor(certAuthorityPublicKey, govPublicKey) {
    this.caPublicKey = certAuthorityPublicKey
    this.govPublicKey = govPublicKey
    this.conns = {}
    this.certs = {}
    this.EGKeyPair = {}
  }

  /* Utility to serialize generic object with CryptoKeys */
  async serializeState() {
    const serializeKey = async (key) => await cryptoKeyToJSON(key);

    const serializedState = {
      conns: {},
      certs: {},
      EGKeyPair: {}
    };

    // Serialize Identity Key Pair
    if (this.EGKeyPair.pub) {
      serializedState.EGKeyPair = {
        pub: await serializeKey(this.EGKeyPair.pub),
        sec: await serializeKey(this.EGKeyPair.sec)
      }
    }

    // Serialize Certificates
    for (const [username, cert] of Object.entries(this.certs)) {
      serializedState.certs[username] = {
        username: cert.username,
        pk: await serializeKey(cert.pk)
      }
    }

    // Serialize Connections
    // conns[name] = { DHs, DHr, RK, CKs, CKr, NS, NR, PN, skippedKeys }
    for (const [name, conn] of Object.entries(this.conns)) {
      serializedState.conns[name] = {
        DHs: {
          pub: await serializeKey(conn.DHs.pub),
          sec: await serializeKey(conn.DHs.sec)
        },
        DHr: await serializeKey(conn.DHr),
        RK: await serializeKey(conn.RK),
        CKs: conn.CKs ? await serializeKey(conn.CKs) : null,
        CKr: conn.CKr ? await serializeKey(conn.CKr) : null,
        NS: conn.NS,
        NR: conn.NR,
        PN: conn.PN,
        skippedKeys: {} // Serialize skipped keys (map of strings to keys)
      }
      for (const [k, v] of Object.entries(conn.skippedKeys)) {
        serializedState.conns[name].skippedKeys[k] = await serializeKey(v);
      }
    }

    return JSON.stringify(serializedState);
  }

  /* Utility to deserialize state */
  async deserializeState(jsonState) {
    const state = JSON.parse(jsonState);
    const { subtle } = window.crypto;

    const importKey = async (jwk, alg, usage) => {
      if (!jwk) return null;
      return await subtle.importKey('jwk', jwk, alg, true, usage);
    }

    // Import Identity
    if (state.EGKeyPair && state.EGKeyPair.pub) {
      this.EGKeyPair = {
        pub: await importKey(state.EGKeyPair.pub, { name: 'ECDH', namedCurve: 'P-384' }, []),
        sec: await importKey(state.EGKeyPair.sec, { name: 'ECDH', namedCurve: 'P-384' }, ['deriveKey'])
      }
    }

    // Import Certs
    for (const [username, cert] of Object.entries(state.certs)) {
      this.certs[username] = {
        username: cert.username,
        pk: await importKey(cert.pk, { name: 'ECDH', namedCurve: 'P-384' }, [])
      }
    }

    // Import Connections
    // Need to know algorithms for each key type:
    // DH keys: ECDH P-384
    // RK, CKs, CKr: HMAC (SHA-256) (based on lib.js computeDH result used in HKDF -> HMAC)
    // Actually RK, CKs, CKr are HMAC keys.
    const hmacAlg = { name: 'HMAC', hash: 'SHA-256', length: 256 };

    for (const [name, conn] of Object.entries(state.conns)) {
      this.conns[name] = {
        DHs: {
          pub: await importKey(conn.DHs.pub, { name: 'ECDH', namedCurve: 'P-384' }, []),
          sec: await importKey(conn.DHs.sec, { name: 'ECDH', namedCurve: 'P-384' }, ['deriveKey'])
        },
        DHr: await importKey(conn.DHr, { name: 'ECDH', namedCurve: 'P-384' }, []),
        RK: await importKey(conn.RK, hmacAlg, ['sign']), // HKDF uses 'sign' (HMAC)
        CKs: await importKey(conn.CKs, hmacAlg, ['sign']),
        CKr: await importKey(conn.CKr, hmacAlg, ['sign']),
        NS: conn.NS,
        NR: conn.NR,
        PN: conn.PN,
        skippedKeys: {}
      }

      // Skipped Keys are AES-GCM keys (derived from HMACtoAESKey)
      const aesAlg = 'AES-GCM';
      for (const [k, v] of Object.entries(conn.skippedKeys)) {
        // lib.js HMACtoAESKey returns key with usages ['encrypt', 'decrypt']
        this.conns[name].skippedKeys[k] = await importKey(v, aesAlg, ['encrypt', 'decrypt']);
      }
    }
  }

  async generateCertificate(username) {
    const keyPair = await generateEG()
    this.EGKeyPair = keyPair
    const certificate = {
      username: username,
      pk: keyPair.pub
    }
    return certificate
  }

  async receiveCertificate(certificate, signature) {
    const certString = JSON.stringify(certificate)
    const isValid = await verifyWithECDSA(this.caPublicKey, certString, signature)
    if (!isValid) throw new Error('Certificate Tampering Detected!')
    this.certs[certificate.username] = certificate
  }

  async sendMessage(name, plaintext) {
    if (!this.conns[name]) {
      const otherCert = this.certs[name]
      if (!otherCert) throw new Error('Unknown user certificate!')
      const myDH = await generateEG()
      const sk = await computeDH(this.EGKeyPair.sec, otherCert.pk)
      const [rk, cks] = await HKDF(sk, await computeDH(myDH.sec, otherCert.pk), 'ratchet-str')
      this.conns[name] = { DHs: myDH, DHr: otherCert.pk, RK: rk, CKs: cks, CKr: null, NS: 0, NR: 0, PN: 0, skippedKeys: {} }
    }

    const state = this.conns[name]

    // Sending Ratchet
    if (!state.CKs) {
      const myDH = await generateEG()
      state.DHs = myDH
      const dhSecret = await computeDH(state.DHs.sec, state.DHr)
      const [newRK, newCKs] = await HKDF(state.RK, dhSecret, 'ratchet-str')
      state.RK = newRK; state.CKs = newCKs; state.PN = state.NS; state.NS = 0
    }

    // Symmetric Ratchet & Gov Encryption
    const mk = await HMACtoAESKey(state.CKs, govEncryptionDataStr)
    const mkRaw = await HMACtoAESKey(state.CKs, govEncryptionDataStr, true)
    const nextCKs = await HMACtoHMACKey(state.CKs, 'ratchet-str')
    state.CKs = nextCKs

    const govPair = await generateEG()
    const govSecret = await computeDH(govPair.sec, this.govPublicKey)
    const govKey = await HMACtoAESKey(govSecret, govEncryptionDataStr)
    const ivGov = genRandomSalt()
    const cGov = await encryptWithGCM(govKey, mkRaw, ivGov, '')
    const receiverIV = genRandomSalt()
    const dhPublicKeyJWK = await cryptoKeyToJSON(state.DHs.pub);

    const header = {
      vGov: await cryptoKeyToJSON(govPair.pub),
      cGov: toBase64(cGov),
      ivGov: toBase64(ivGov),
      receiverIV: toBase64(receiverIV),
      dh: dhPublicKeyJWK,
      N: state.NS,
      PN: state.PN
    }

    state.NS++

    const headerStr = JSON.stringify(header);
    const ciphertext = await encryptWithGCM(mk, plaintext, receiverIV, headerStr)
    return [headerStr, ciphertext]
  }

  async receiveMessage(name, [headerStr, ciphertext]) {
    // 1. Kiểm tra input chặt chẽ
    if (typeof headerStr !== 'string') {
      throw new Error("Critical Error: Protocol violation. Header must be a raw JSON string.");
    }

    const header = JSON.parse(headerStr);
    const { subtle } = window.crypto;
    const receiverIVBinary = fromBase64(header.receiverIV);

    // 2. Import Key từ Header
    const dhRemoteKey = await subtle.importKey(
      'jwk', header.dh, { name: 'ECDH', namedCurve: 'P-384' }, true, []
    );

    // 3. Khởi tạo kết nối nếu chưa có
    if (!this.conns[name]) {
      const otherCert = this.certs[name]
      if (!otherCert) throw new Error(`Unknown user certificate for ${name}!`)

      // Initial Handshake: Compute DH with Identity Keys
      const sk = await computeDH(this.EGKeyPair.sec, otherCert.pk)
      const [rk, ckr] = await HKDF(sk, await computeDH(this.EGKeyPair.sec, dhRemoteKey), 'ratchet-str')
      this.conns[name] = {
        DHs: this.EGKeyPair, DHr: dhRemoteKey, RK: rk, CKs: null, CKr: ckr, NS: 0, NR: 0, PN: 0, skippedKeys: {}
      }
    }

    const originalState = this.conns[name];
    // Clone state object
    const state = {
      ...originalState,
      skippedKeys: { ...originalState.skippedKeys }
    };

    // Lấy key hiện tại trong máy ra
    const oldDHKey = await cryptoKeyToJSON(state.DHr);

    // Kiểm tra xem Sender có đổi Key không
    const isSameKey = (header.dh.x === oldDHKey.x) && (header.dh.y === oldDHKey.y);

    const headerDHJson = isSameKey ? JSON.stringify(oldDHKey) : JSON.stringify(header.dh);

    // 4. Kiểm tra xem tin nhắn này có nằm trong skippedKeys không
    const skipKeyIndex = headerDHJson + ':' + header.N

    if (state.skippedKeys[skipKeyIndex]) {
      const mk = state.skippedKeys[skipKeyIndex]
      delete state.skippedKeys[skipKeyIndex]

      try {
        const plaintext = await decryptWithGCM(mk, ciphertext, receiverIVBinary, headerStr)
        // **COMMIT STATE**
        this.conns[name].skippedKeys = state.skippedKeys;
        return bufferToString(plaintext)
      } catch (e) {
        throw new Error('Decryption failed! Message tampered or wrong key.')
      }
    }
    if (isSameKey && header.N < state.NR) {
      throw new Error("Message already processed");
    }

    // 5. Xử lý DH Ratchet 
    if (!isSameKey) {
      const oldDHJsonForSkip = JSON.stringify(oldDHKey);

      for (let i = state.NR; i < header.PN; i++) {
        const mkSkipped = await HMACtoAESKey(state.CKr, govEncryptionDataStr)
        state.CKr = await HMACtoHMACKey(state.CKr, 'ratchet-str')
        state.skippedKeys[oldDHJsonForSkip + ':' + i] = mkSkipped
      }

      const dhSecret = await computeDH(state.DHs.sec, dhRemoteKey)
      const [newRK, newCKr] = await HKDF(state.RK, dhSecret, 'ratchet-str')

      state.RK = newRK;
      state.CKr = newCKr;
      state.DHr = dhRemoteKey;
      state.CKs = null;
      state.NR = 0;
    }

    // 6. Symmetric Ratchet
    while (state.NR < header.N) {
      const mkSkipped = await HMACtoAESKey(state.CKr, govEncryptionDataStr)
      state.CKr = await HMACtoHMACKey(state.CKr, 'ratchet-str')
      state.skippedKeys[headerDHJson + ':' + state.NR] = mkSkipped
      state.NR++
    }

    // 7. Giải mã tin nhắn hiện tại
    const mk = await HMACtoAESKey(state.CKr, govEncryptionDataStr)
    const nextCKr = await HMACtoHMACKey(state.CKr, 'ratchet-str')
    state.CKr = nextCKr
    state.NR++

    try {
      const plaintext = await decryptWithGCM(mk, ciphertext, receiverIVBinary, headerStr)

      // **COMMIT STATE**: Chỉ khi giải mã thành công mới lưu ngược lại vào this.conns
      this.conns[name] = state;

      return bufferToString(plaintext)
    } catch (e) {
      console.error(e);
      // Không commit state -> Lần sau nhận lại sẽ thử lại từ đầu
      throw new Error('Decryption failed! Message tampered or wrong key.')
    }
  }
};