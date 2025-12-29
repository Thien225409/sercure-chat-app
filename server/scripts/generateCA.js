import { webcrypto } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const CERT_DIR = join(__dirname, '../certs');

if (!existsSync(CERT_DIR)) {
    mkdirSync(CERT_DIR);
}

async function generateCA() {
    console.log("⏳ Đang tạo cặp khóa CA (ECDSA P-384)...");
    
    // Tạo cặp key
    const keyPair = await webcrypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-384" },
        true,
        ["sign", "verify"]
    );

    // Xuất Private Key (để Server ký)
    const privateKeyJwk = await webcrypto.subtle.exportKey("jwk", keyPair.privateKey);
    writeFileSync(
        join(CERT_DIR, 'ca_private.json'), 
        JSON.stringify(privateKeyJwk, null, 2)
    );

    // Xuất Public Key (để Client xác thực)
    const publicKeyJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
    writeFileSync(
        join(CERT_DIR, 'ca_public.json'), 
        JSON.stringify(publicKeyJwk, null, 2)
    );

    console.log("✅ Đã tạo xong!");
    console.log("👉 Private Key: server/certs/ca_private.json (GIỮ BÍ MẬT)");
    console.log("👉 Public Key:  server/certs/ca_public.json (COPY CÁI NÀY CHO CLIENT)");
}

generateCA();