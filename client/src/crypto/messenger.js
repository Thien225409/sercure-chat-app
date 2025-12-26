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
  govEncryptionDataStr
} from './lib.js';

/** ******* Implementation ********/

export class MessengerClient {
  constructor (certAuthorityPublicKey, govPublicKey) {
    this.caPublicKey = certAuthorityPublicKey
    this.govPublicKey = govPublicKey
    this.conns = {}
    this.certs = {}
    this.EGKeyPair = {}
  }

  async generateCertificate (username) {
    const keyPair = await generateEG()
    this.EGKeyPair = keyPair
    const certificate = {
      username: username,
      pk: keyPair.pub
    }
    return certificate
  }

  async receiveCertificate (certificate, signature) {
    const certString = JSON.stringify(certificate)
    const isValid = await verifyWithECDSA(this.caPublicKey, certString, signature)
    if (!isValid) throw new Error('Certificate Tampering Detected!')
    this.certs[certificate.username] = certificate
  }

  async sendMessage (name, plaintext) {
    if (!this.conns[name]) {
      const otherCert = this.certs[name]
      if (!otherCert) throw new Error('Unknown user certificate!')

      const myDH = await generateEG()
      const sk = await computeDH(this.EGKeyPair.sec, otherCert.pk)
      const [rk, cks] = await HKDF(sk, await computeDH(myDH.sec, otherCert.pk), 'ratchet-str')

      this.conns[name] = {
        DHs: myDH,
        DHr: otherCert.pk,
        RK: rk,
        CKs: cks,
        CKr: null,
        NS: 0,
        NR: 0,
        PN: 0,
        skippedKeys: {} // Kho chứa chìa khóa bị bỏ qua
      }
    }

    const state = this.conns[name]

    // Sending Ratchet
    if (!state.CKs) {
      const myDH = await generateEG()
      state.DHs = myDH
      const dhSecret = await computeDH(state.DHs.sec, state.DHr)
      const [newRK, newCKs] = await HKDF(state.RK, dhSecret, 'ratchet-str')
      
      state.RK = newRK
      state.CKs = newCKs
      
      // Cập nhật PN (Previous Number) = số tin nhắn đã gửi ở chuỗi trước
      state.PN = state.NS
      // Reset số thứ tự tin nhắn cho chuỗi mới
      state.NS = 0
    }

    // Symmetric Ratchet
    const mk = await HMACtoAESKey(state.CKs, govEncryptionDataStr)
    const mkRaw = await HMACtoAESKey(state.CKs, govEncryptionDataStr, true)
    const nextCKs = await HMACtoHMACKey(state.CKs, 'ratchet-str')
    state.CKs = nextCKs

    // Gov Encryption
    const govPair = await generateEG()
    const govSecret = await computeDH(govPair.sec, this.govPublicKey)
    const govKey = await HMACtoAESKey(govSecret, govEncryptionDataStr)
    const ivGov = genRandomSalt()
    const cGov = await encryptWithGCM(govKey, mkRaw, ivGov, '')

    const receiverIV = genRandomSalt()

    const header = {
      vGov: govPair.pub,
      cGov: cGov,
      ivGov: ivGov,
      receiverIV: receiverIV,
      dh: state.DHs.pub,
      N: state.NS,  // Gửi kèm số thứ tự tin
      PN: state.PN  // Gửi kèm số lượng tin chuỗi trước
    }

    // Tăng số thứ tự gửi
    state.NS++

    const ciphertext = await encryptWithGCM(mk, plaintext, receiverIV, JSON.stringify(header))
    return [header, ciphertext]
  }

  async receiveMessage (name, [header, ciphertext]) {
    if (!this.conns[name]) {
      const otherCert = this.certs[name]
      if (!otherCert) throw new Error('Unknown user certificate!')

      const sk = await computeDH(this.EGKeyPair.sec, otherCert.pk)
      const [rk, ckr] = await HKDF(sk, await computeDH(this.EGKeyPair.sec, header.dh), 'ratchet-str')
      
      this.conns[name] = {
        DHs: this.EGKeyPair,
        DHr: header.dh,
        RK: rk,
        CKs: null,
        CKr: ckr,
        NS: 0,
        NR: 0,
        PN: 0,
        skippedKeys: {}
      }
    }
    const state = this.conns[name]

    // --- BƯỚC 1: KIỂM TRA KHO SKIPPED KEYS (Dành cho tin đến muộn) ---
    // Tạo key định danh cho kho: "DH_PublicKey_String : Message_Number"
    const headerDHJson = JSON.stringify(await cryptoKeyToJSON(header.dh))
    const skipKeyIndex = headerDHJson + ':' + header.N

    if (state.skippedKeys[skipKeyIndex]) {
      // Tìm thấy chìa trong kho -> Lấy ra dùng luôn
      const mk = state.skippedKeys[skipKeyIndex]
      delete state.skippedKeys[skipKeyIndex] // Dùng xong xóa ngay
      
      try {
        const plaintext = await decryptWithGCM(mk, ciphertext, header.receiverIV, JSON.stringify(header))
        return bufferToString(plaintext)
      } catch (e) {
        throw new Error('Decryption failed! Message tampered or wrong key.')
      }
    }

    // --- BƯỚC 2: KIỂM TRA DH RATCHET (Có đổi lượt không?) ---
    const oldDHJson = JSON.stringify(await cryptoKeyToJSON(state.DHr))
    
    if (headerDHJson !== oldDHJson) {
      // 2.1. Trước khi đổi lượt, phải "vét" nốt các chìa khóa còn thiếu của lượt cũ
      // Chạy từ NR hiện tại đến PN (số tin tối đa của lượt cũ)
      for (let i = state.NR; i < header.PN; i++) {
        const mkSkipped = await HMACtoAESKey(state.CKr, govEncryptionDataStr)
        state.CKr = await HMACtoHMACKey(state.CKr, 'ratchet-str')
        // Lưu chìa khóa bị nhảy cóc vào kho
        state.skippedKeys[oldDHJson + ':' + i] = mkSkipped
      }

      // 2.2. Thực hiện DH Ratchet
      const dhSecret = await computeDH(state.DHs.sec, header.dh)
      const [newRK, newCKr] = await HKDF(state.RK, dhSecret, 'ratchet-str')
      
      state.RK = newRK
      state.CKr = newCKr
      state.DHr = header.dh
      state.CKs = null
      state.NR = 0 // Reset bộ đếm nhận về 0 cho chuỗi mới
    }

    // --- BƯỚC 3: SYMMETRIC RATCHET (Đuổi theo tin hiện tại) ---
    // Nếu N trong header lớn hơn NR hiện tại -> Có tin nhắn bị nhảy cóc ở giữa
    while (state.NR < header.N) {
      const mkSkipped = await HMACtoAESKey(state.CKr, govEncryptionDataStr)
      state.CKr = await HMACtoHMACKey(state.CKr, 'ratchet-str')
      // Lưu chìa khóa bị nhảy cóc vào kho (với DH mới)
      state.skippedKeys[headerDHJson + ':' + state.NR] = mkSkipped
      state.NR++
    }

    // --- BƯỚC 4: GIẢI MÃ TIN HIỆN TẠI ---
    const mk = await HMACtoAESKey(state.CKr, govEncryptionDataStr)
    const nextCKr = await HMACtoHMACKey(state.CKr, 'ratchet-str')
    state.CKr = nextCKr
    state.NR++ // Tăng bộ đếm

    try {
      const plaintext = await decryptWithGCM(mk, ciphertext, header.receiverIV, JSON.stringify(header))
      return bufferToString(plaintext)
    } catch (e) {
      throw new Error('Decryption failed! Message tampered or wrong key.')
    }
  }
};
