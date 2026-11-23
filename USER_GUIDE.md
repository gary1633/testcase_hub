# Hướng dẫn sử dụng FinX TestCase Hub (User Guide)

Tài liệu hướng dẫn chi tiết từng màn hình và quy trình thao tác chuẩn dành cho toàn bộ người dùng của **FinX TestCase Hub** (Admin, QA Manager, QA Lead, QA Engineer, PM và PO).

---

## Mục lục
1. [Phân quyền theo Vai trò (RBAC)](#1-phân-quyền-theo-vai-trò-rbac)
2. [Màn hình Đăng nhập (`/login`)](#2-màn-hình-đăng-nhập-login)
3. [Thanh điều hướng chung, Tìm kiếm nhanh (`Ctrl + K`) & Cá nhân hóa](#3-thanh-điều-hướng-chung--cá-nhân-hóa)
4. [Màn hình Không gian Dự án (`/projects`) & Việc của tôi (`/my-work`)](#4-màn-hình-không-gian-dự-án-projects)
5. [Màn hình Kho Test Case (`/projects/:id/repository`)](#5-màn-hình-kho-test-case-repository)
6. [Màn hình Test Plans (`/projects/:id/plans`)](#6-màn-hình-test-plans-plans)
7. [Màn hình Test Runs & Thực thi kiểm thử (`/runs` & `/runs/:runId`)](#7-màn-hình-test-runs--thực-thi-kiểm-thử)
8. [Màn hình Defects — Quản lý lỗi (`/projects/:id/defects`)](#8-màn-hình-defects--quản-lý-lỗi-defects)
9. [Màn hình Tổng quan & Báo cáo (`/projects/:id/overview`)](#9-màn-hình-tổng-quan--báo-cáo-overview)
10. [Màn hình Lịch sử thay đổi (`/projects/:id/history`)](#10-màn-hình-lịch-sử-thay-đổi-history)
11. [Màn hình Cài đặt Dự án (`/projects/:id/settings`)](#11-màn-hình-cài-đặt-dự-án-settings)
12. [Màn hình Quản lý Thành viên & Workstreams (`/users`)](#12-màn-hình-quản-lý-thành-viên--workstreams-users)
13. [Quy trình làm việc chuẩn & Phím tắt](#13-quy-trình-làm-việc-chuẩn--phím-tắt)

---

## 1. Phân quyền theo Vai trò (RBAC)

Hệ thống chia làm **6 vai trò** rõ ràng để đảm bảo an toàn dữ liệu và đúng trách nhiệm công việc:

| Tính năng / Màn hình | Admin | QA Manager | QA Lead | QA Engineer | PM (View Only) | PO (View Only) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Xem tất cả dự án trong công ty | ✅ | ✅ | Dự án tham gia | Dự án tham gia | Dự án tham gia | Dự án tham gia |
| Tạo / Lưu trữ / Xóa dự án | ✅ | ✅ | ✅ *(dự án quản lý)* | ❌ | ❌ | ❌ |
| Truy cập **Cài đặt Dự án** | ✅ | ✅ | ✅ | Xem thông tin | ❌ *(Ẩn)* | ❌ *(Ẩn)* |
| Thêm / Sửa / Xóa Suite, Test Case, Shared Steps | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Xem **Thùng rác** & Khôi phục | ✅ | ✅ | ✅ | ✅ *(Khôi phục)* | ❌ *(Ẩn)* | ❌ *(Ẩn)* |
| Xóa vĩnh viễn trong Thùng rác | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Duyệt Test Case (`In Review → Active`) | ✅ | ✅ | ✅ | ❌ *(Gửi duyệt)* | ❌ | ❌ |
| Nhân bản Case / Suite sang dự án khác | ✅ | ✅ | ✅ | ✅ *(Dự án có quyền sửa)* | ❌ | ❌ |
| Tạo & Thực thi Test Plan / Test Run / Defect | ✅ | ✅ | ✅ | ✅ | Chỉ xem | Chỉ xem |
| Xem & Xuất Báo cáo (Excel / PDF / HTML / PNG) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Truy cập **Thành viên & Workstreams** (`/users`) | ✅ | ✅ | ✅ *(Tạo user, Team)* | ❌ | ❌ | ❌ |
| Cấp lại mật khẩu (Reset Password) | Mọi user | Trừ Admin | Chỉ QA Engineer | ❌ | ❌ | ❌ |

---

## 2. Màn hình Đăng nhập (`/login`)

### Các thành phần chính
- **Góc trên bên phải:**
  - Nút chuyển ngôn ngữ **`VI | EN`** (chuyển ngay toàn bộ trang giữa Tiếng Việt và Tiếng Anh).
  - Nút **Tùy chỉnh giao diện** (Chế độ Sáng / Tối & 10 bảng màu).
- **Biểu mẫu đăng nhập:**
  - Nhập **Email công ty** và **Mật khẩu** (có nút mắt để hiện/ẩn mật khẩu).
  - Tùy chọn **Ghi nhớ đăng nhập trên thiết bị này**.
  - Bấm **Đăng nhập** để vào Không gian Dự án.
- **Đăng nhập bằng Google (nếu công ty bật Google Workspace SSO):** Bấm nút **Continue with Google** phía dưới biểu mẫu.
- **Quên mật khẩu:**
  1. Bấm **Quên mật khẩu?** ngay góc phải ô mật khẩu.
  2. Nhập Email công ty và ghi chú ngắn (nếu cần), rồi bấm **Gửi yêu cầu**.
  3. Yêu cầu sẽ xuất hiện trên màn hình Quản lý Thành viên của Admin / QA Manager / QA Lead để cấp mật khẩu tạm thời cho bạn.
  4. Khi đăng nhập bằng mật khẩu tạm lần đầu, hệ thống sẽ tự mở hộp thoại bắt buộc bạn **Đổi mật khẩu mới**.

---

## 3. Thanh điều hướng chung & Cá nhân hóa

Thanh Header luôn hiển thị ở trên cùng sau khi đăng nhập:
- **Menu trái:**
  - **Dự án (`Projects`)**: Quay về danh sách tất cả dự án bạn tham gia.
  - **Việc của tôi (`My Work`)**: Mở trung tâm tổng hợp công việc cá nhân trên toàn bộ dự án (`/my-work`).
  - **Thành viên (`Members`)**: Chỉ hiện với `Admin`, `QA Manager`, `QA Lead`. Nếu có yêu cầu Quên mật khẩu đang chờ xử lý, badge số màu cam sẽ hiện ngay bên cạnh.
  - **Thanh Tìm kiếm nhanh (`Ctrl + K` / nút `Tìm nhanh...`)**: Bấm `Ctrl + K` tại bất kỳ màn hình nào để gõ tên dự án, mã Test Case (VD: `WEB-1`), Test Run hoặc Defect, dùng `↑` `↓` và `Enter` để nhảy thẳng tới đích.
- **Tiện ích phải:**
  - **Badge vai trò & Thông tin tài khoản** của bạn.
  - **Nút chuyển ngôn ngữ `VI | EN`**: Chuyển đổi tức thì toàn bộ giao diện giữa Tiếng Việt và Tiếng Anh, tự động ghi nhớ cho các lần truy cập sau.
  - **Nút Bảng màu & Sáng/Tối (`ThemePicker`)**:
    - Chuyển giữa **Sáng (Light)** và **Tối (Dark)**.
    - Chọn **6 bảng màu đơn (Solid)** hoặc **4 bảng màu chuyển sắc (Gradient)** theo sở thích.
  - **Biểu tượng Chìa khóa**: Đổi mật khẩu cá nhân bất cứ lúc nào.
  - **Biểu tượng Đăng xuất**: Thoát phiên làm việc an toàn.

---

## 4. Màn hình Không gian Dự án (`/projects`)

Đây là trang chủ hiển thị toàn bộ dự án bạn có quyền truy cập.

### Các thao tác chính
- **Thẻ thống kê nhanh:** Hiển thị tổng số dự án đang hoạt động, tổng số Test Case và tỷ lệ phủ Automation trung bình.
- **Ghim Dự án Yêu thích (Favorite / Pin):**
  - Bấm biểu tượng **Ngôi sao (`★`)** ở góc phải mỗi thẻ dự án (hoặc ngay trên thanh điều hướng trong dự án) để ghim dự án đó lên đầu danh sách.
  - Bấm nút **Yêu thích** trên thanh công cụ để lọc nhanh chỉ xem các dự án đã ghim.
  - Danh sách ghim là **riêng tư theo từng tài khoản**.
- **Tìm kiếm & Lưu trữ:**
  - Gõ tên hoặc mã dự án (VD: `WEB`, `MOB`) vào ô tìm kiếm.
  - `Admin` / `QA Manager` / `QA Lead` có thêm nút **Hiện dự án đã lưu trữ** để xem các dự án đã Archive.
- **Tạo dự án mới (`Admin`, `QA Manager`, `QA Lead`):**
  1. Bấm **+ Tạo dự án**.
  2. Nhập **Mã dự án** (2–10 ký tự in hoa, VD: `PAY`, `CORE` — dùng làm tiền tố mã Test Case như `PAY-1`, `PAY-2`), **Tên dự án** và **Mô tả**.
  3. Bấm **Tạo dự án**.

### Trung tâm "Việc của tôi" (`/my-work`)
Màn hình tổng hợp xuyên suốt tất cả dự án bạn đang tham gia:
- **Test Case được gán chạy (Đang mở):** Liệt kê các case được gán cho bạn trong các Test Run đang chạy (ưu tiên `Failed`, `Blocked`, `Retest`, `Not Executed` lên đầu), click vào dòng để nhảy thẳng tới màn hình thực thi.
- **Test Case chờ duyệt (`In Review`):** Hiển thị cho `Admin`, `QA Manager`, `QA Lead` để duyệt nhanh Test Case do team gửi lên.
- **Bản nháp (`Draft`) của tôi & Defects đang mở gần đây:** Theo dõi tiến độ soạn thảo và các lỗi còn mở trên toàn hệ thống.

---

## 5. Màn hình Kho Test Case (`/projects/:id/repository`)

Màn hình trung tâm để thiết kế, tổ chức và quản lý toàn bộ Test Suite & Test Case của dự án.

### 5.1. Cây Test Suite (Cột trái)
- **Tất cả Test Cases** / **Chưa phân loại**: Xem toàn bộ case trong dự án hoặc các case chưa gán vào Suite nào.
- **Tạo Suite / Sub-suite:** Bấm **+ Suite mới** ở đỉnh cây để tạo Suite gốc, hoặc di chuột vào 1 Suite bất kỳ rồi bấm biểu tượng **Thêm sub-suite** (`FolderPlus`).
- **Kéo-thả sắp xếp & phân cấp đa cấp (Drag & Drop):**
  - Kéo 1 Suite vào **giữa** Suite khác → lồng vào làm Sub-suite.
  - Kéo lên **mép trên / mép dưới** Suite khác → đổi thứ tự hiển thị.
  - Kéo Sub-suite lên vùng **Tất cả Test Cases** hoặc bấm biểu tượng **Tách ra Suite gốc** (`CornerLeftUp`) khi di chuột → đưa Sub-suite ra cấp gốc (Root).
- **Chỉnh sửa / Đổi Suite cha:** Di chuột vào Suite → bấm biểu tượng **Bút chì**.
- **Nhân bản Suite sang dự án khác:** Di chuột vào Suite → bấm biểu tượng **Copy** (`Nhân bản Suite sang dự án khác`). Xem chi tiết ở mục **5.4**.
- **Xóa Suite:** Di chuột vào Suite → bấm biểu tượng **Thùng rác** (Suite sẽ được chuyển vào Thùng rác, các Test Case bên trong được giữ an toàn).

### 5.2. Thanh công cụ & Bộ lọc (Phía trên bảng)
- **Bộ lọc nhanh:** Tìm kiếm theo mã/tiêu đề/tag, lọc theo **Priority**, **Automation**, **Type**, **Trạng thái (`Active` / `In Review` / `Draft` / `Deprecated`)**, và **Jira Key**. Bấm **Xóa lọc** để đặt lại.
- **Các nút thao tác trên thanh công cụ:**
  - **Shared Steps** *(QA trở lên)*: Mở thư viện các bộ bước dùng chung (`SS-1`, `SS-2`, …) để tạo/sửa và tái sử dụng vào nhiều Test Case.
  - **Thùng rác** *(QA trở lên — ẩn với `PM`/`PO`)*: Xem và khôi phục Test Case / Suite đã xóa mềm, hoặc xóa vĩnh viễn (`Admin`/`QA Manager`/`QA Lead`).
  - **Import Excel** *(QA trở lên)*: Tải file mẫu chuẩn Vikki (`.xlsx`) và nhập hàng loạt Test Case từ `.xlsx` hoặc `.csv` (tự động tạo Suite cha/con từ cấu trúc file).
  - **Export Excel (.xlsx)** *(Tất cả vai trò)*: Xuất danh sách Test Case theo bộ lọc hiện tại ra file Excel chuẩn biểu mẫu Vikki.
  - **+ Tạo Test Case** *(QA trở lên)*: Mở ngăn trượt bên phải để tạo Test Case mới.

### 5.3. Thanh Thao tác hàng loạt (Bulk Actions Bar)
Khi tick chọn 1 hoặc nhiều Test Case trong bảng, thanh màu đậm sẽ xuất hiện phía trên bảng với các lệnh nhanh:
- **Chuyển Suite:** Di chuyển toàn bộ case đang chọn sang Suite khác.
- **Đổi Priority / Đổi Automation:** Cập nhật hàng loạt thuộc tính.
- **Nhân bản:** Nhân bản các case đang chọn trong cùng dự án hiện tại.
- **Copy sang dự án khác:** Nhân bản toàn bộ case đang chọn sang dự án khác mà bạn có quyền chỉnh sửa.
- **Tạo Test Plan / Chạy Test Run:** Đưa trực tiếp các case đang chọn vào một Test Plan mới hoặc khởi tạo Test Run ngay lập tức.
- **Xóa:** Chuyển các case đang chọn vào Thùng rác.

### 5.4. Nhân bản Test Case / Test Suite sang dự án khác (Cross-Project Duplicate)
Bạn có thể kích hoạt từ **3 vị trí**:
1. Di chuột vào Suite bất kỳ trên cây Suite → bấm nút **Copy**.
2. Tick chọn 1 hoặc nhiều Test Case → bấm **Copy sang dự án khác** trên thanh Bulk Actions.
3. Mở chi tiết 1 Test Case → bấm nút **Copy sang dự án** trên thanh tiêu đề Drawer.

Trong hộp thoại hiện ra:
- **Dự án đích:** Chỉ hiển thị các dự án đang hoạt động (chưa lưu trữ) mà bạn là thành viên và có quyền thêm/sửa Test Case.
- **Suite đích:** Tự động tải danh sách Suite của dự án đích để bạn chọn vị trí lưu.
- *(Khi nhân bản Test Suite)* Có thêm 2 tùy chọn:
  - **Bao gồm tất cả Sub-suite con:** Giữ nguyên cấu trúc cây thư mục.
  - **Bao gồm toàn bộ Test Case & Steps bên trong:** Tự động cấp mã mới theo dự án đích (VD: `WEB-1` → `MOB-25`). Nếu Test Case có dùng `Shared Steps`, hệ thống sẽ tự bung thành các bước độc lập để tránh lỗi liên kết chéo dự án.

### 5.5. Ngăn Chi tiết Test Case (TestCase Drawer)
Click vào bất kỳ dòng Test Case nào để mở ngăn trượt bên phải gồm **3 tab**:
1. **Nội dung & Steps:**
   - Sửa Tiêu đề, Suite, Priority, Severity, Type, Automation, Trạng thái, Tags, Jira Issue Keys, Điều kiện tiên quyết (Preconditions), Mô tả.
   - **Các bước thực hiện (Test Steps):** Kéo-thả đổi thứ tự bước, thêm bước mới, hoặc bấm **Chèn Shared Step** để gắn bộ bước dùng chung.
   - **Tệp đính kèm (Attachments):** Tải lên hình ảnh/tài liệu minh họa.
   - **Luồng Review (Review Workflow):**
     - Case ở trạng thái `Draft` → QA bấm **Gửi duyệt (In Review)**.
     - Case ở trạng thái `In Review` → `Admin` / `QA Manager` / `QA Lead` bấm **Duyệt → Active** hoặc **Trả về Draft**.
2. **Thảo luận & Review:** Trao đổi góp ý, đặt câu hỏi trực tiếp trên từng Test Case.
3. **Lịch sử & Phiên bản:** Xem toàn bộ phiên bản (`v1`, `v2`, …), bấm **So sánh (Diff)** để đối chiếu thay đổi giữa 2 phiên bản, hoặc bấm **Khôi phục** để quay lại phiên bản trước đó.

> **Lưu ý cho vai trò `PM` và `PO`:** Ở màn hình Kho Test Case, `PM` và `PO` chỉ xem được cây Suite, bộ lọc, danh sách/chi tiết Test Case và xuất Excel; các nút **Thùng rác**, **Shared Steps**, **Import**, **Tạo/Sửa/Xóa** đều được ẩn để tránh thao tác nhầm.

---

## 6. Màn hình Test Plans (`/projects/:id/plans`)

Dùng để gom nhóm các bộ Test Case tái sử dụng theo từng đợt kiểm thử (VD: *Smoke Test Release 2.4*, *Regression Thanh toán*).

### Các thao tác chính
- **Tạo Test Plan mới:** Bấm **+ Tạo Test Plan**, đặt tên, mô tả và chọn các Test Case (có thể lọc theo Suite hoặc tìm kiếm).
- **Chỉnh sửa / Xóa Plan:** Cập nhật lại danh sách Test Case trong Plan bất cứ lúc nào.
- **Khởi chạy Test Run từ Plan:** Bấm nút **Chạy Test Run** trên thẻ Plan → điền Môi trường (`Staging`, `UAT`, `Production`), phiên bản ứng dụng (`App Version`), Jira Key (nếu có) → tạo ngay một đợt thực thi mới từ toàn bộ Test Case trong Plan.

---

## 7. Màn hình Test Runs & Thực thi kiểm thử (`/runs` & `/runs/:runId`)

### 7.1. Danh sách Test Runs (`/projects/:id/runs`)
- Theo dõi tất cả các đợt chạy kiểm thử kèm thanh tiến độ màu (Passed / Failed / Blocked / Skipped / Retest / Untested), số lượng Bug phát sinh và trạng thái (`Đang chạy` / `Hoàn tất` / `Đã hủy`).
- **Tạo Test Run mới:** Bấm **+ Tạo Test Run**, chọn từ **Test Plan** có sẵn hoặc tự chọn thủ công các Test Case.
- **Thao tác nhanh trên mỗi Run:** Vào **Thực thi**, **Chạy lại Lỗi/Blocked (Re-run)**, xuất **Excel Vikki**, hoặc **Xóa**.

### 7.2. Màn hình Thực thi 2 cột (`/projects/:id/runs/:runId`)
- **Thanh điều khiển trên cùng:**
  - Hiển thị tiến độ tổng thể, trạng thái Run và nút **Hoàn tất Run / Mở lại Run**.
  - **Lịch sử Run:** Xem toàn bộ nhật ký thực thi của đợt chạy.
  - **Xuất Báo cáo:** Xuất nhanh định dạng **PDF**, **HTML**, **PNG** hoặc **Excel chuẩn Vikki**.
  - **Chạy lại Lỗi/Blocked (Re-run):** Tạo nhanh một Test Run mới chỉ gồm các Test Case đang `Failed`, `Blocked` hoặc `Retest` để retest sau khi Dev fix.
  - **Đẩy lên Jira:** Gửi bảng tổng kết tiến độ Test Run vào bình luận của Jira Issue đã liên kết.
- **Cột trái (Danh sách Test Case cần chạy):**
  - Lọc nhanh theo trạng thái, bấm **Của tôi** để chỉ xem các case được gán cho bạn.
  - **Gán việc hàng loạt (Bulk Assign):** Tick nhiều case → chọn người thực hiện và ngày dự kiến hoàn thành.
- **Cột phải (Chi tiết thực thi):**
  - Xem Preconditions và từng bước thực hiện (Shared Steps tự động bung đầy đủ).
  - Chọn kết quả: **Passed**, **Failed**, **Blocked**, **Skipped**, **Retest** (hỗ trợ phím tắt nhanh `P`, `F`, `B`, `S` và `J`/`K` chuyển case).
  - Ghi **Kết quả thực tế (Actual Result)**, **Ghi chú**, và **dán trực tiếp ảnh chụp màn hình bằng `Ctrl + V`** (hoặc bấm tải ảnh lên) vào mục Bằng chứng (Evidence).
  - Nếu Test Case bị **Failed**: Bấm **+ Tạo Bug (Defect)** ngay tại dòng kết quả để tạo lỗi kèm sẵn bước tái hiện, kết quả thực tế, bằng chứng và tùy chọn **đẩy thẳng sang Jira**.

---

## 8. Màn hình Defects — Quản lý lỗi (`/projects/:id/defects`)

Tập trung theo dõi mọi lỗi phát sinh trong quá trình kiểm thử của dự án.

### Các thao tác chính
- **Lọc & Tìm kiếm:** Lọc theo Trạng thái (`Open`, `In Progress`, `Resolved`, `Closed`, `Won't Fix`), Mức độ nghiêm trọng (`Severity`), Độ ưu tiên (`Priority`), hoặc từ khóa.
- **Tạo Bug mới:** Bấm **+ Tạo Bug**, nhập Tiêu đề, Mô tả, Bước tái hiện, Kết quả thực tế/mong đợi, dán ảnh chụp bằng `Ctrl + V` và bật tùy chọn **Đồng bộ sang Jira** (nếu dự án đã cấu hình Jira).
- **Cập nhật trạng thái & Chi tiết:** Click vào 1 dòng Bug để mở ngăn trượt chỉnh sửa trạng thái, xem link nhảy trực tiếp về Test Run gốc hoặc mở ticket trên Jira.

---

## 9. Màn hình Tổng quan & Báo cáo (`/projects/:id/overview`)

Bảng điều khiển trực quan giúp QA Lead, QA Manager, PM và PO nắm bắt nhanh chất lượng dự án:
- **4 thẻ KPI chính:** Tổng số Test Case, Tỷ lệ phủ Automation, Tổng số Test Run & Pass Rate trung bình, Số Defect đang mở.
- **Biểu đồ phân bổ:** Theo Priority, Automation Status, Test Case Type, Top Suites có nhiều case nhất, và bảng các Test Run gần đây.
- **Ma trận Truy vết Yêu cầu (RTM — Jira ↔ Test Cases ↔ Kết quả):**
  - Tự động gom nhóm theo từng **Jira Issue Key** đã gắn trên Test Case.
  - Hiển thị trạng thái sẵn sàng Go-Live (`Sẵn sàng`, `Có rủi ro`, `Đang kiểm thử`, `Chưa chạy`), số lượng Test Case, **Pass Rate**, số Defect đang mở và cho phép bấm mở rộng để xem từng Test Case + lần chạy gần nhất.
  - Bấm **Xuất RTM (.csv)** để tải bảng truy vết phục vụ nghiệm thu UAT.
- **Xuất Báo cáo Tổng quan:** Bấm nút **Xuất Báo cáo** ở góc trên bên phải để tải về dạng **PDF**, **HTML** hoặc **PNG** gửi cho các bên liên quan.

---

## 10. Màn hình Lịch sử thay đổi (`/projects/:id/history`)

Ghi nhận đầy đủ mọi thay đổi trên Test Case của toàn dự án (Audit Trail):
- Tìm kiếm theo mã Test Case / tiêu đề / người sửa, lọc theo trạng thái phiên bản (`Active`, `Outdated`, `Deleted`) và loại hành động (`Tạo mới`, `Cập nhật`, `Nhân bản`, `Khôi phục`, `Import`, `Đã xóa`).
- Bấm **So sánh Diff** để xem chi tiết từng trường và từng bước đã thay đổi, hoặc **Xem Snapshot** để đọc lại toàn bộ nội dung tại thời điểm đó.

---

## 11. Màn hình Cài đặt Dự án (`/projects/:id/settings`)

> **Lưu ý phân quyền:** Tab **Cài đặt Dự án** bị **ẩn hoàn toàn** và chặn truy cập đối với vai trò `PM` và `PO`. Chỉ `Admin`, `QA Manager`, `QA Lead` có quyền chỉnh sửa cài đặt.

Gồm **6 khu vực**:
1. **Thông tin Dự án:** Đổi tên và mô tả dự án.
2. **Thành viên Dự án:**
   - Bấm **+ Thêm theo Team** để thêm nhanh toàn bộ thành viên của một Workstream/Team vào dự án chỉ trong 1 click.
   - Bấm **+ Thêm thành viên** để chọn nhiều thành viên lẻ cùng lúc.
   - Vai trò trong dự án được đồng bộ tự động theo vai trò tài khoản tại `/users`.
3. **Tích hợp Jira (Cloud / Server):** Nhập Base URL, Email, API Token, Project Key, Default Issue Type và bấm **Kiểm tra kết nối** để xác nhận.
4. **Webhook thông báo (Slack / MS Teams / Google Chat):** Dán Webhook URL, chọn sự kiện nhận thông báo (Hoàn tất Test Run / Phát sinh Defect mức Highest) và bấm **Gửi tin nhắn thử**.
5. **CI/CD Automation Ingestion Tokens:** Tạo API Token (`tcms_...`) và copy đoạn lệnh `cURL` mẫu để tích hợp vào GitHub Actions / GitLab CI đẩy kết quả Playwright JSON hoặc JUnit XML về tự động.
6. **Vùng nguy hiểm (Danger Zone):** Lưu trữ dự án (`Archive`), Khôi phục dự án (`Restore`), hoặc Xóa vĩnh viễn dự án.

---

## 12. Màn hình Quản lý Thành viên & Workstreams (`/users`)

Dành cho `Admin`, `QA Manager`, và `QA Lead` quản lý nhân sự toàn hệ thống với bố cục **2 cột**:
- **Cảnh báo Yêu cầu Quên mật khẩu (nếu có):** Hiển thị ngay phía trên khi có nhân viên gửi yêu cầu quên mật khẩu; bấm **Cấp mật khẩu mới** hoặc **Bỏ qua**.
- **Cột trái — Nhóm / Workstreams (Teams):**
  - Lọc danh sách theo **Tất cả thành viên**, **Chưa gán Team**, hoặc từng **Workstream** cụ thể.
  - Bấm **+ Mới** để tạo Workstream (chọn tên, mô tả, màu đại diện và tick chọn thành viên).
  - Di chuột vào từng Workstream để sửa thành viên hoặc xóa nhóm.
- **Cột phải — Danh sách Thành viên:**
  - Tìm kiếm theo tên, email, tên team và lọc theo **Vai trò** (`Admin`, `QA Manager`, `QA Lead`, `QA Engineer`, `PM`, `PO`).
  - **Thêm thành viên mới:** Bấm **+ Thêm thành viên**, nhập Họ tên, Email, chọn Vai trò, gán Workstream, tạo mật khẩu tạm (có nút sinh mật khẩu ngẫu nhiên) và bật tùy chọn *Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên*.
  - **Thao tác từng dòng:** Đổi vai trò trực tiếp (Admin / QA Manager), bấm **Đặt lại MK** (cấp mật khẩu tạm & copy nhanh thông tin đăng nhập gửi nhân viên), hoặc **Khóa / Mở khóa** tài khoản.

---

## 13. Quy trình làm việc chuẩn & Phím tắt

### Quy trình QA chuẩn đề xuất
1. **Thiết kế:** QA tạo Suite & Test Case (dùng Shared Steps cho các bước lặp lại như Đăng nhập) ở trạng thái `Draft`.
2. **Review:** QA gửi duyệt (`In Review`) → QA Lead / QA Manager kiểm tra, góp ý trong tab *Thảo luận* rồi bấm **Duyệt → Active**.
3. **Lập kế hoạch:** Gom các Test Case `Active` vào **Test Plan** theo từng tính năng / đợt phát hành.
4. **Thực thi:** Khởi chạy **Test Run** từ Plan, gán việc cho từng QA, thực thi kèm ảnh bằng chứng (`Ctrl + V`) và tạo **Defect** (đẩy Jira) cho các case `Failed`.
5. **Retest & Báo cáo:** Sau khi Dev sửa lỗi, dùng **Chạy lại Lỗi/Blocked (Re-run)** để kiểm tra lại → Hoàn tất Run → Xuất báo cáo **PDF / HTML / Excel** từ màn hình Run hoặc **Tổng quan & Báo cáo**.

### Bảng Phím tắt trong màn hình Thực thi Test Run
| Phím tắt | Tác dụng |
|---|---|
| `P` | Đánh dấu **Passed** |
| `F` | Đánh dấu **Failed** |
| `B` | Đánh dấu **Blocked** |
| `S` | Đánh dấu **Skipped** |
| `J` hoặc `↓` | Chuyển sang Test Case tiếp theo |
| `K` hoặc `↑` | Quay lại Test Case trước đó |
| `Ctrl + V` | Dán trực tiếp ảnh chụp màn hình vào Bằng chứng (Evidence) / Mô tả Bug |
