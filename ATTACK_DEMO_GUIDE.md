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

### D. Tấn công Quay lui (Rollback / Forward Secrecy Attack) - *Nâng cao*
**Mục tiêu**: Kẻ tấn công ăn cắp được chìa khóa *hiện tại*, và dùng nó để giải mã các tin nhắn *trong quá khứ*.

*   **Thao tác**:
    1.  Khi nhận tin nhắn từ Bob, đừng Inject ngay. Hãy bấm nút xanh **💾 Snapshot for Rollback**.
    2.  Chat tiếp với Bob 2-3 câu qua lại. (Hành động này kích hoạt **Ratchet Step**, xoay vòng tạo chìa khóa mới và xóa chìa khóa cũ).
    3.  Nhìn xuống dưới cùng Hacker Lab, nút **LOAD OLD SNAPSHOT (ROLLBACK)** sẽ hiện ra. Bấm vào đó.
    4.  Bấm **INJECT PACKET**.
*   **Kết quả an toàn**: Hệ thống báo lỗi (Decrypt Failed / Integrity Check Failed).
*   **Cơ chế bảo vệ**: **Double Ratchet Algorithm**. Mỗi tin nhắn có một chìa khóa riêng biệt (Message Key). Sau khi tin nhắn được giải mã, chìa khóa đó bị xóa vĩnh viễn khỏi bộ nhớ (RAM). Chìa khóa hiện tại không thể suy ngược ra chìa khóa quá khứ.

---

## ⚠️ 3. LỖ HỔNG TỒN TẠI (Vulnerability Demo)

### E. Tấn công Từ chối Dịch vụ (DoS - Key Exhaustion)
**Mục tiêu**: Làm treo máy nạn nhân bằng cách gửi một gói tin yêu cầu tính toán quá lớn.

*   **Bối cảnh**: Giao thức cho phép nhận tin nhắn không tuần tự (Out-of-order) bằng cách "tua nhanh" (Skip) các chìa khóa trung gian. Ví dụ: Đang ở tin 1, nhận tin 5 -> Máy tính toán Key 2,3,4,5.
*   **Lỗ hổng**: Hệ thống hiện tại **không giới hạn số lượng tin nhảy cóc (MAX_SKIP)**.

*   **Thao tác**:
    1.  Chọn một gói tin ĐẾN. Bấm **Load into Editor**.
    2.  Bấm nút màu vàng **💥 DoS ATTACK**.
        *   (Hệ thống sẽ tự động sửa số thứ tự `N` tăng lên **+50,000** để tối đa hóa hiệu ứng).
    3.  Bấm **INJECT PACKET**.
*   **Kết quả (LỖ HỔNG)**:
    *   Trình duyệt của bạn sẽ bị **đơ (freeze)** trong khoảng 5-15 giây (tùy cấu hình máy).
    *   Sau khi chạy xong, thông báo sẽ hiện ra kèm thời gian xử lý: **"💥 CPU Time: ... ms"**.
    *   Mở **Task Manager (Shift+Esc)** sẽ thấy CPU tab này vọt lên 100%.
*   **Giải thích**: Để giải mã tin số 50,000, máy tính phải chạy vòng lặp 50,000 lần thuật toán KDF (HMAC/SHA-256). Kẻ tấn công có thể lợi dụng điều này làm kiệt quệ tài nguyên máy nạn nhân.

---
*Tài liệu này dùng cho mục đích Demo môn học An toàn Bảo mật Thông tin.*
