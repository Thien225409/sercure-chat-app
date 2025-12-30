/**
 * Biến Password thành AES Key dùng PBKDF2
 * @param {string} password - Mật khẩu người dùng nhập
 * @param {Uint8Array} salt - Muối ngẫu nhiên (Lấy từ DB lúc login hoặc tạo mới lúc register)
 * @returns {Promise<CryptoKey>} - Khóa AES-GCM
 */
// Hàm này dùng để tạo AES Key từ Password -> Dùng để mã hóa Keychain
export async function deriveKeyFromPassword(password, salt) {
  if (!salt || salt.byteLength < 16) {
      throw new Error("Salt is required and must be at least 16 bytes for security.");
  }

  const enc = new TextEncoder();

  // Import password dưới dạng key
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );

  // Dùng PBKDF2 để kéo giãn password thành key mạnh
  // Iterations: 210,000 (Theo khuyến nghị OWASP 2023+ cho SHA-256)
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 210000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}