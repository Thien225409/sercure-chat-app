# 🛡️ Hướng dẫn Demo Tấn công Bảo mật (Attack Simulation Guide)

Tài liệu này hướng dẫn chi tiết cách sử dụng **Hacker Lab Console** để thực hiện các kịch bản tấn công vào giao thức mã hóa của ứng dụng Secure Chat.

## 🛠️ 1. Chuẩn bị Môi trường

Để demo hiệu quả nhất, bạn nên thiết lập như sau:
1.  Mở trình duyệt (Tab A) và đăng nhập User 1 (ví dụ: `Alice`).
2.  Mở trình duyệt Ẩn danh (Tab B) và đăng nhập User 2 (ví dụ: `Bob`).
3.  Đặt 2 cửa sổ song song để quan sát cả người gửi và người nhận.
4.  Trên máy người nhận (ví dụ `Alice`), bật **Hacker Lab** (Nút con bọ 🐞 góc phải dưới).

---

## ⚔️ 2. Các Kịch bản Tấn công (Attack Vectors)

### A. Tấn công Phát lại (Replay Attack)
**Mục tiêu**: Kẻ tấn công bắt gói tin đã gửi và gửi lại y hệt để lừa hệ thống xử lý 2 lần (ví dụ: lặp lại lệnh chuyển tiền).

*   **Thao tác**:
    1.  Bob gửi tin "Hello".
    2.  Trên máy Alice, tại Hacker Lab: Chọn gói tin vừa nhận ("Bob").
    3.  Bấm **INJECT PACKET**.
    4.  *(Lần 1 có thể thành công nếu là lần đầu tiên gói tin đi vào bộ xử lý của Hacker Lab)*.
    5.  Bấm **INJECT PACKET** một lần nữa.
*   **Kết quả an toàn**: Hệ thống báo lỗi xanh lá:
    > `🛡️ ĐÃ CHẶN ĐỨNG. Lỗi: "Phát hiện tin nhắn cũ (Replay/Old)"`
*   **Cơ chế bảo vệ**: Hệ thống kiểm tra số thứ tự `N` trong Header. Nếu `N` nhỏ hơn hoặc bằng số đã nhận từ phiên `DH` đó, nó từ chối ngay lập tức.

---

### B. Tấn công Sửa đổi (Tamper / Integrity Attack)
**Mục tiêu**: Kẻ giữa đường (MITM) thay đổi nội dung tin nhắn hoặc metadata.

*   **Thao tác**:
    1.  Chọn một gói tin ĐẾN. Bấm **Load into Editor**.
    2.  Tại ô **Ciphertext** (màu xanh): Sửa đổi 1 ký tự bất kỳ.
    3.  Bấm **INJECT PACKET**.
*   **Kết quả an toàn**: Hệ thống báo lỗi:
    > `🛡️ ĐÃ CHẶN ĐỨNG. Lỗi: "Integrity Check Failed (HMAC/Tag mismatch)"`
*   **Cơ chế bảo vệ**: Mã hóa **AES-GCM (Galois/Counter Mode)** là loại mã hóa xác thực (Authenticated Encryption). Bất kỳ thay đổi nào dù chỉ 1 bit đều làm sai lệch thẻ xác thực (Auth Tag) đi kèm gói tin.

*   **Biến thể (Header Manipulation)**: Thử sửa trường `"N"` hoặc `"ivGov"` trong ô **Header**. Kết quả vẫn bị chặn vì Header được đưa vào tham số `Authenticated Data` (AAD) của AES-GCM.

---

### C. Tấn công Giả mạo Danh tính (Spoofing Attack)
**Mục tiêu**: Gửi tin nhắn nhưng mạo danh là người khác.

*   **Thao tác**:
    1.  Chọn một gói tin ĐẾN (từ `Bob`). Bấm **Load into Editor**.
    2.  Tại ô **Target Identity (Sender ID)**: Đổi tên thành người khác (ví dụ: `Eve` hoặc tên một user lạ).
    3.  Bấm **INJECT PACKET**.
*   **Kết quả an toàn**:
    *   Nếu user lạ không tồn tại/không có Cert: `🛡️ ĐÃ CHẶN ĐỨNG. Lỗi: "Không tìm thấy User/Cert"`.
    *   Nếu user tồn tại (`Eve`): `🛡️ ĐÃ CHẶN ĐỨNG. Lỗi: "Integrity Check Failed"`.
*   **Cơ chế bảo vệ**:
    *   **Identity Check**: Hệ thống verify chữ ký số (ECDSA) trên Certificate của sender.
    *   **Key Mismatch**: Kể cả khi Certificate hợp lệ, Shared Secret được tính toán dựa trên `Private Key(Me) + Public Key(Eve)` sẽ khác hoàn toàn với `Private Key(Me) + Public Key(Bob)`. Do đó key giải mã sai -> GCM Tag sai.

---

### D. Kiểm chứng Forward Secrecy (Perfect Forward Secrecy - PFS) 🔐
**Mục tiêu**: Chứng minh rằng ngay cả khi hacker chiếm được quyền kiểm soát máy và đọc được RAM (lấy được Key hiện tại), họ vẫn **KHÔNG THỂ** giải mã được các tin nhắn trong quá khứ.

*   **Chuẩn bị**:
    1.  User A chat với User B một tin nhắn: "Bí mật quốc gia". (Đây là tin nhắn mục tiêu cần giải mã).
    2.  User A và B tiếp tục chat thêm 2-3 tin nhắn nữa (Ví dụ: "Tin 2", "Tin 3").
        > *Bước này cực kỳ quan trọng: Nó kích hoạt **Ratchet**, khiến hệ thống xoay vòng khóa và xóa bỏ khóa cũ.*

*   **Thao tác trên Hacker Lab**:
    1.  Tìm đến gói tin đầu tiên ("Bí mật quốc gia") trong danh sách Sniffer.
    2.  Bấm nút tím **🔐 Target F.Secrecy**. (Panel **Raw Decryptor Workbench** sẽ hiện ra, tự động điền Ciphertext/IV/Header của tin cũ).
    3.  Bấm nút lửa **🔥 DUMP RAM KEYS**. (Mô phỏng hacker quét bộ nhớ RAM để trộm khóa).

*   **Thực hiện Tấn công & Kết quả**:

    **Kịch bản 1: Giả sử hacker đã chiếm máy TỪ TRƯỚC (Dùng Key Xanh)**
    *   Tìm trong danh sách key vừa leak, chọn key màu xanh lá: `🔑 OLD MESSAGE KEY`.
    *   Bấm **🔓 DECRYPT WITH RAW PARAMS**.
    *   🔴 **Kết quả:** `🔓 MỞ KHÓA THÀNH CÔNG`.
    *   👉 **Giải thích:** Đây là trường hợp hacker cài backdoor, lưu lại chìa khóa *ngay lúc tin nhắn vừa đến*. Điều này chứng minh công cụ giải mã hoạt động tốt (nếu có đúng chìa).

    **Kịch bản 2: Hacker chiếm máy HIỆN TẠI (Dùng Key Đỏ) - ĐÂY LÀ CHỐT CHẶN BẢO MẬT**
    *   Tìm key màu đỏ/cam: `⛓️ CURRENT CHAIN KEY (Future Msgs)`. (Đây là chìa khóa đang nằm trong RAM lúc này).
    *   Bấm **🔓 DECRYPT WITH RAW PARAMS**.
    *   🟢 **Kết quả:** `❌ CRITICAL ERROR: [OperationError]`.
    *   👉 **Giải thích (Killer Point):**
        > *"Mọi người thấy lỗi **OperationError** chứ? Đây là lỗi từ tầng thấp nhất của trình duyệt (Web Crypto API).*
        > *Nó chứng minh toán học rằng: Chìa khóa hiện tại trong RAM **không khớp** với ổ khóa của tin nhắn quá khứ.*
        > *Hệ thống đã **xóa vĩnh viễn** chìa khóa cũ. Hacker dù có kiểm soát toàn bộ RAM hiện tại cũng **bất lực** với lịch sử chat."*

*   **Cơ chế bảo vệ**: **Double Ratchet & Immediate Key Erasure**. Mỗi tin nhắn dùng một Message Key riêng biệt. Message Key được xóa ngay lập tức sau khi giải mã. Chain Key (dùng để tạo Message Key) có tính chất One-Way (một chiều): chỉ tạo được key tương lai, không thể quay ngược về quá khứ.
