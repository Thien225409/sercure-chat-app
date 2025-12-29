import { webcrypto } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// --- 1. TẠO __dirname TRONG ES MODULE ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PV_KEY_PATH = join(__dirname, '../certs/ca_private.json');

let CA_PRIVATE_KEY = null;

// Load Private Key từ file khi Server khởi động
export async function loadCaKey() {
    if (!existsSync(PV_KEY_PATH)) {
        throw new Error("Không tìm thấy CA Private Key! Hãy chạy script generateCA.js.");
    }
    const jwk = JSON.parse(readFileSync(PV_KEY_PATH, 'utf8'));
    
    CA_PRIVATE_KEY = await webcrypto.subtle.importKey(
        "jwk", jwk,
        { name: "ECDSA", namedCurve: "P-384" },
        true,
        ["sign"]
    );
    console.log("Đã load CA Private Key thành công.");
}

// Hàm ký Certificate
export async function signCertificate(certificateObj) {
    if (!CA_PRIVATE_KEY) await loadCaKey();

    // CHUẨN HÓA DỮ LIỆU KÝ:
    // Client và Server phải stringify giống hệt nhau.
    // { username: "...", pk: {...} }
    const payload = JSON.stringify({
        username: certificateObj.username,
        pk: certificateObj.pk
    });

    const encoder = new TextEncoder();
    const signatureBuffer = await webcrypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-384" } },
        CA_PRIVATE_KEY,
        encoder.encode(payload)
    );

    // Trả về Base64 để lưu DB
    return Buffer.from(signatureBuffer).toString('base64');
}