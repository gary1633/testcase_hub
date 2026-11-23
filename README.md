# FinX TestCase Hub — Internal Test Case Management System

Hệ thống quản lý Test Case, Test Plan, Test Run, Defect và tích hợp Jira / Webhook / CI-CD nội bộ, xây dựng bằng **TypeScript / Node.js (React 19 + NestJS + Drizzle ORM + PostgreSQL)**, tối ưu cho đội ngũ QA, PM & PO.

> **Tài liệu hướng dẫn sử dụng cho người dùng cuối (đầy đủ từng màn hình):**
> - Bản Word có ảnh chụp màn hình minh họa: **[FinX_TestCase_Hub_User_Guide.docx](./FinX_TestCase_Hub_User_Guide.docx)**
> - Bản Markdown đọc nhanh trên Git: **[USER_GUIDE.md](./USER_GUIDE.md)**

---

## Tính năng nổi bật

- **Kho Test Case (Repository):**
  - Cây Suite đa cấp (kéo-thả sắp xếp, lồng sub-suite, 1-click tách ra Suite gốc).
  - Tìm kiếm & lọc theo Priority, Automation, Type, Trạng thái (`Active`, `In Review`, `Draft`, `Deprecated`), Jira Key.
  - Thao tác hàng loạt (**Bulk Actions**): Chuyển Suite, Đổi Priority/Automation, Nhân bản, **Nhân bản sang dự án khác (Cross-Project Duplicate)** cho cả Test Case lẫn Test Suite (bao gồm Sub-suite & Cases), Tạo Test Plan nhanh, Chạy Test Run nhanh, Xóa mềm.
- **Shared Steps (`SS-1`, `SS-2`, …):** Bộ bước dùng chung tái sử dụng trên nhiều Test Case; tự động bung chi tiết khi tạo Test Run, Export Excel/CSV hoặc khi nhân bản Test Case sang dự án khác.
- **Review Workflow & Thảo luận:** Luồng duyệt `Draft → In Review → Active` cùng mục bình luận góp ý trên từng Test Case.
- **Thùng rác (Soft Delete & Restore):** Khôi phục nguyên trạng Suite / Test Case đã xóa kèm bước & tệp đính kèm, hoặc xóa vĩnh viễn (ẩn và chặn ở API đối với vai trò chỉ xem `PM` / `PO`).
- **Lịch sử Phiên bản & So sánh Diff:** Tự động lưu snapshot mỗi thay đổi, đối chiếu diff trực quan và khôi phục phiên bản cũ.
- **Import / Export Excel chuẩn biểu mẫu Vikki & CSV:** Nhập/xuất file `.xlsx` (giữ logo, định dạng, công thức, sheet `DRAW_BUG`) và `.csv` (bảo vệ chống CSV Formula Injection).
- **Test Plans, Test Runs & Defects:** Thực thi kiểm thử 2 cột với phím tắt (`P`/`F`/`B`/`S`), dán ảnh bằng chứng `Ctrl+V`, lịch sử thay đổi từng kết quả, lọc **Của tôi**, **Gán việc hàng loạt (Bulk Assign)**, **Chạy lại Lỗi/Blocked (Re-run)**, xuất **Báo cáo Test Run (PDF / HTML / PNG)** và xuất **Báo cáo Tổng quan Dự án**.
- **Ma trận Truy vết Yêu cầu (RTM — Requirement Traceability Matrix):** Tự động gom theo **Jira Issue Key** ngay trên trang Tổng quan Dự án để đối chiếu số lượng Test Case phủ, kết quả chạy gần nhất, Pass Rate, số Defect đang mở và trạng thái sẵn sàng Go-Live (`Ready` / `At Risk` / `In Progress` / `Not Run`), hỗ trợ xuất `.csv`.
- **Trung tâm "Việc của tôi" (`/my-work`) & Tìm kiếm nhanh (`Ctrl + K`):**
  - Màn hình `/my-work` tổng hợp xuyên suốt mọi dự án: Test Case được gán chạy trong các Run đang mở, hàng đợi Test Case chờ duyệt (`In Review`), bản nháp (`Draft`) và Defect đang mở.
  - Phím tắt `Ctrl + K` (Global Command Palette) ở mọi màn hình để nhảy nhanh tới Dự án, mã Test Case (`WEB-1`), Test Run hoặc Defect.
- **Quản lý Thành viên & Workstreams (Teams):** Nhóm nhân sự theo Team/Workstream để thêm nhanh cả nhóm vào dự án chỉ bằng 1 thao tác.
- **Tiện ích giao diện & Cá nhân hóa:**
  - **Song ngữ Tiếng Việt (`VI`) / Tiếng Anh (`EN`)** chuyển đổi tức thì trên toàn hệ thống.
  - **Chế độ Sáng / Tối (Light / Dark Mode)** kết hợp **10 bảng màu** (6 màu Solid + 4 màu Gradient).
  - **Ghim Dự án yêu thích** lên đầu danh sách theo từng người dùng.
- **Tích hợp & Tự động hóa:**
  - **Jira Cloud / Server:** Liên kết Story/Task, tạo Bug trực tiếp, đẩy tổng kết tiến độ Run lên Jira.
  - **Webhook (Slack / MS Teams / Google Chat):** Tự động thông báo khi hoàn tất Test Run hoặc phát sinh Defect mức `Highest`.
  - **CI/CD Automation Ingestion (`POST /api/ci/ingest`):** Tạo Project API Token (`tcms_...`) để GitHub Actions / GitLab CI đẩy kết quả **Playwright JSON** hoặc **JUnit XML** vào tạo Test Run tự động.
- **Xác thực & Phân quyền RBAC (6 vai trò):** `ADMIN`, `QA_MANAGER`, `QA_LEAD`, `QA`, `PM` (View Only), `PO` (View Only); luồng Quên mật khẩu → Cấp mật khẩu tạm → Bắt đổi mật khẩu lần đầu; hỗ trợ tùy chọn **Google Workspace SSO** và **Gmail/SMTP**.

---

## Kiến trúc Monorepo & Tech Stack

```text
testcase_manage/
├── packages/
│   └── shared/        # Kiểu dữ liệu DTO, enum, hàm phân quyền RBAC dùng chung FE & BE
├── apps/
│   ├── api/           # Backend: NestJS + Drizzle ORM + PostgreSQL / PGlite + Swagger
│   └── web/           # Frontend: React 19 + Vite + Tailwind CSS v4 + TanStack Query
├── docker/            # Cấu hình Docker Production (postgres + api + web Nginx)
├── scripts/           # Script backup/restore PostgreSQL
├── .env.example       # File mẫu biến môi trường cho Backend & Database
├── USER_GUIDE.md      # Tài liệu hướng dẫn sử dụng chi tiết từng màn hình
├── DEPLOY.md          # Hướng dẫn deploy lên server Linux / Production
└── LOCAL_DOCKER_HOSTING.md # Hướng dẫn tự host qua Docker trên máy local / mạng LAN
```

---

## Hướng dẫn chạy Local (Database + Backend + Frontend)

### 1. Yêu cầu môi trường
- **Node.js** `>= 20.x` (khuyến nghị `20 LTS` hoặc `22 LTS`) và **npm** `>= 10.x`.
- *(Tùy chọn)* **PostgreSQL 16** (cài trực tiếp hoặc chạy qua Docker) nếu bạn muốn dùng PostgreSQL thật thay vì Embedded PostgreSQL (`PGlite`).

### 2. Cài đặt dependencies & cấu hình `.env`

```bash
# 1. Cài toàn bộ dependencies cho cả monorepo (shared, api, web)
npm install

# 2. Tạo file biến môi trường .env từ file mẫu
# macOS / Linux:
cp .env.example .env
# Windows (PowerShell):
Copy-Item .env.example .env
```

### 3. Thiết lập Database (Chọn 1 trong 2 cách)

#### Cách A — Không cần cài PostgreSQL (Zero-Config bằng PGlite, khuyến nghị cho dev nhanh)
Mặc định trong `.env.example` đã cấu hình sẵn:
```env
DATABASE_URL=pglite://./data/pgdata
SEED_MODE=demo
```
Khi Backend khởi động, hệ thống tự tạo database Embedded PostgreSQL tại `apps/api/data/pgdata`, tự chạy migration tạo toàn bộ bảng và khởi tạo dữ liệu mẫu.

#### Cách B — Dùng PostgreSQL 16 thật (Local hoặc Docker)
1. Khởi chạy PostgreSQL bằng Docker (hoặc dùng PostgreSQL đã cài sẵn trên máy):
   ```bash
   docker run -d --name tcms-postgres \
     -e POSTGRES_USER=tcms \
     -e POSTGRES_PASSWORD=tcms_password \
     -e POSTGRES_DB=tcms_db \
     -p 5432:5432 \
     postgres:16-alpine
   ```
2. Cập nhật `DATABASE_URL` trong file `.env`:
   ```env
   DATABASE_URL=postgresql://tcms:tcms_password@localhost:5432/tcms_db
   SEED_MODE=demo
   ```
3. *(Tùy chọn)* Chạy seed thủ công nếu muốn nạp lại dữ liệu mẫu:
   ```bash
   npm run db:seed
   ```

> **Lưu ý về `SEED_MODE`:**
> - `SEED_MODE=demo`: Tự tạo 5 tài khoản mẫu + 2 dự án mẫu (`WEB`, `MOB`) và bật thanh chọn nhanh tài khoản demo ở `/login`.
> - `SEED_MODE=superadmin`: Chỉ tạo duy nhất 1 tài khoản Super Admin (dùng cho staging/production sạch).
> - `SEED_MODE=none`: Không tự động seed.

### 4. Khởi chạy Backend (BE) và Frontend (FE)

#### Cách 1 — Chạy đồng thời cả BE & FE bằng 1 lệnh (Khuyến nghị)
```bash
npm run dev
```

#### Cách 2 — Chạy tách riêng 2 cửa sổ Terminal (dễ theo dõi log riêng)
- **Terminal 1 — Backend API (NestJS, port `3001`):**
  ```bash
  npm run dev:api
  ```
- **Terminal 2 — Frontend Web (Vite React, port `5173`):**
  ```bash
  npm run dev:web
  ```
  > Vite tự động proxy mọi request `/api/*` sang `http://localhost:3001`.

### 5. Truy cập ứng dụng
- **Frontend (Web App):** `http://localhost:5173`
- **Backend API Base URL:** `http://localhost:3001/api`
- **API Swagger Docs:** `http://localhost:3001/api/docs`

### 6. Tài khoản mẫu khi chạy Local (`SEED_MODE=demo`)

| Vai trò | Email | Mật khẩu | Quyền hạn chính |
|---|---|---|---|
| **Admin** | `admin@company.local` | `Admin123!` | Toàn quyền quản trị hệ thống, người dùng & mọi dự án |
| **QA Manager** | `manager@company.local` | `Manager123!` | Xem/quản lý mọi dự án & quản lý nhân sự (trừ Admin) |
| **QA Lead** | `lead@company.local` | `Lead123!` | Quản lý dự án được gán, tạo user, reset mật khẩu QA |
| **QA Engineer** | `qa@company.local` | `Qa123!` | Tạo/sửa Test Case, Suite, Plan, Run, Defect trong dự án tham gia |
| **PM (View Only)** | `pm@company.local` | `Pm123!` | Chỉ xem & lọc Test Case, Run, Báo cáo; không thấy Cài đặt Dự án & Thùng rác |
| **PO (View Only)** | *(Tạo trong `/users`)* | *(Tự đặt)* | Tương đương quyền `PM` (Product Owner — Chỉ xem) |

---

## Các lệnh hữu ích (Scripts)

| Lệnh | Mô tả |
|---|---|
| `npm run dev` | Chạy đồng thời Backend (`3001`) và Frontend (`5173`) với hot-reload |
| `npm run dev:api` | Chỉ chạy Backend API (`apps/api`) |
| `npm run dev:web` | Chỉ chạy Frontend Web (`apps/web`) |
| `npm run build` | Build production toàn bộ monorepo (`@tcms/shared` → `@tcms/api` → `@tcms/web`) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript trên toàn monorepo |
| `npm test` | Chạy bộ unit tests cho Backend (`apps/api/test/*.test.mjs`) |
| `npm run db:seed` | Nạp dữ liệu mẫu vào Database |

---

## Xử lý sự cố thường gặp khi chạy Local

- **Cổng `3001` hoặc `5173` đang bị chiếm:** Kiểm tra và tắt tiến trình cũ, hoặc đổi `PORT` trong `.env`.
- **Lỗi kết nối PostgreSQL (`ECONNREFUSED 127.0.0.1:5432`):** Đảm bảo service PostgreSQL hoặc container `tcms-postgres` đang chạy, hoặc chuyển về `DATABASE_URL=pglite://./data/pgdata` để chạy không cần Postgres.
- **Muốn reset trắng Database local (PGlite):** Dừng server, xóa thư mục `apps/api/data/pgdata`, sau đó chạy lại `npm run dev`.
- **Thay đổi trong `packages/shared` chưa cập nhật ở BE/FE:** Chạy `npm run build -w @tcms/shared` rồi khởi động lại `npm run dev`.

---

## Deploy Production & Tự Host bằng Docker

- **Dành cho DevOps (Server Linux / Production):** Xem **[DEPLOY.md](./DEPLOY.md)**.
- **Tự host ngay trên máy local (Windows & macOS Docker / Mạng LAN):** Xem **[LOCAL_DOCKER_HOSTING.md](./LOCAL_DOCKER_HOSTING.md)**.

Tóm tắt nhanh:
- Cấu hình sẵn trong `docker/docker-compose.prod.yml` và `docker/.env.prod.example` với **3 container** (`postgres:16-alpine`, `api`, `web` Nginx).
- Mặc định chạy `SEED_MODE=superadmin`: chỉ khởi tạo 1 tài khoản Super Admin duy nhất, không tạo dữ liệu mẫu.
- Kèm sẵn script backup/restore định kỳ: `scripts/backup-postgres.sh`, `scripts/backup-postgres.ps1` và `scripts/restore-postgres.sh`.

---

## Tùy chọn: Bật Google Workspace SSO & Gửi Email tự động (Gmail SMTP)

Cả 2 tính năng đều **tắt mặc định** khi chưa khai báo biến môi trường — nút **Đăng nhập bằng Google** sẽ tự động ẩn trên `/login` và không phát sinh kết nối ra ngoài cho tới khi bạn bật.

### 1. Bật "Đăng nhập bằng Google" (Google Workspace SSO)
> **Lưu ý:** Google OAuth chỉ chấp nhận domain **HTTPS** (VD: `https://tcms.finx.vn` qua Nginx/Cloudflare Tunnel) hoặc `http://localhost` khi dev — không hỗ trợ truy cập bằng IP LAN (`http://192.168.x.x`).

1. Mở **Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID** (chọn **Web application**).
2. Tại mục **Authorized JavaScript origins**, thêm địa chỉ truy cập web của bạn (VD: `http://localhost:5173` khi dev local, hoặc `https://tcms.finx.vn` khi chạy thật).
3. Copy **Client ID** và điền vào file `.env` (hoặc `docker/.env.prod` nếu chạy Docker):
   ```env
   GOOGLE_CLIENT_ID=1234567890-xxxxx.apps.googleusercontent.com
   GOOGLE_ALLOWED_DOMAINS=finx.vn
   GOOGLE_AUTO_PROVISION=false
   GOOGLE_DEFAULT_ROLE=QA
   ```
   - `GOOGLE_ALLOWED_DOMAINS`: Giới hạn tên miền email công ty được phép đăng nhập (nhiều domain cách nhau dấu phẩy, bỏ trống để cho phép mọi email Google).
   - `GOOGLE_AUTO_PROVISION=false` *(khuyến nghị)*: Chỉ nhân sự đã được tạo sẵn tài khoản trong hệ thống mới đăng nhập được bằng Google. Đặt `true` nếu muốn tự tạo tài khoản lần đầu với vai trò `GOOGLE_DEFAULT_ROLE` (`QA`, `PM`, hoặc `PO` — không bao giờ tự cấp `ADMIN`).
4. Khởi động lại API. Nút **Đăng nhập bằng Google** sẽ tự động xuất hiện trên trang `/login`.

### 2. Bật Gửi Email tự động qua Gmail / Google Workspace (SMTP)
*(Hoạt động được cả trên máy host local/LAN miễn có internet ra ngoài cổng 587/465).*

1. Dùng 1 tài khoản Gmail công ty làm hộp thư gửi thông báo (VD: `qa-bot@finx.vn`), bật **Xác minh 2 bước (2-Step Verification)**.
2. Vào **Google Account → Security → App passwords** tạo 1 mật khẩu ứng dụng 16 ký tự.
3. Điền vào `.env` (hoặc `docker/.env.prod`):
   ```env
   APP_PUBLIC_URL=https://tcms.finx.vn
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=qa-bot@finx.vn
   SMTP_PASS=xxxx_xxxx_xxxx_xxxx
   SMTP_FROM="FinX TestCase Hub <qa-bot@finx.vn>"
   ```
4. Khởi động lại API. Hệ thống sẽ tự gửi email ngầm khi:
   - Nhân viên gửi yêu cầu **Quên mật khẩu** → gửi email báo các tài khoản `ADMIN`.
   - Quản trị viên **tạo tài khoản mới** → gửi email chào mừng kèm thông tin đăng nhập ban đầu.
   - Quản trị viên **cấp mật khẩu tạm thời** → tự động gửi mật khẩu tạm tới email người dùng.
