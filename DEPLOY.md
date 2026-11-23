# Hướng dẫn Deploy Production (Dành cho DevOps) — FinX TestCase Hub

Hệ thống đã được đóng gói sẵn theo kiến trúc **3 container Docker**:
1. `postgres` (**PostgreSQL 16 Alpine**): Lưu trữ dữ liệu bền vững qua volume `tcms_pg_data`.
2. `api` (**NestJS + Node 22 Alpine**): Backend API port nội bộ `3001`, lưu file đính kèm/bằng chứng tại volume `tcms_uploads`.
3. `web` (**Nginx 1.27 + React 19 Vite SPA**): Serve frontend tĩnh và reverse proxy `/api/*` sang container `api`, hỗ trợ upload tối đa `20MB`.

---

## 1. Khởi tạo Production sạch (Chỉ 1 Super Admin, không dự án/dữ liệu mẫu)

Mặc định file `docker/docker-compose.prod.yml` đặt `SEED_MODE=superadmin`:
- Khi database khởi tạo lần đầu (`users` trống), hệ thống **chỉ tạo duy nhất 1 tài khoản Super Admin** (`ADMIN`).
- **Không** tạo tài khoản demo (`lead`, `qa`, `pm`) và **không** tạo bất kỳ dự án, suite, test case, test plan hay test run mẫu nào.
- Trang `/login` tự động **ẩn** khu vực chọn nhanh tài khoản mẫu và không điền sẵn email/mật khẩu demo.

### Các bước deploy:

```bash
# 1. Tạo file biến môi trường production từ template
cp docker/.env.prod.example docker/.env.prod

# 2. Chỉnh sửa docker/.env.prod: điền mật khẩu Postgres mạnh, JWT_SECRET ngẫu nhiên,
#    CORS_ORIGIN (domain thật), và thông tin Super Admin ban đầu
#    (Ví dụ tạo JWT_SECRET: openssl rand -hex 32)

# 3. Build và khởi chạy toàn bộ stack
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d --build

# 4. Kiểm tra trạng thái & logs
docker compose -f docker/docker-compose.prod.yml ps
docker logs -f tcms-api-prod
```

Sau khi lên service, truy cập `http://<server-ip>:8080` (hoặc domain đã trỏ reverse proxy HTTPS phía trước) và đăng nhập bằng `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`. Từ tài khoản Super Admin:
1. Vào **Quản lý Thành viên** (`/users`) để tạo các tài khoản QA Lead, QA Engineer, PM.
2. Vào **Không gian Dự án** (`/projects`) bấm **Tạo dự án** để bắt đầu từ đầu.

---

## 2. Backup & Restore dữ liệu (PostgreSQL + Uploads)

Chạy script định kỳ (có thể gắn vào `crontab` hàng đêm lúc 02:00):

```bash
chmod +x scripts/backup-postgres.sh scripts/restore-postgres.sh

# Backup database + thư mục uploads vào ./backups (tự giữ 14 bản gần nhất)
./scripts/backup-postgres.sh ./backups

# Khôi phục khi cần
./scripts/restore-postgres.sh ./backups/tcms_db_YYYYMMDD_HHMMSS.sql.gz ./backups/tcms_uploads_YYYYMMDD_HHMMSS.tar.gz
```

---

## 3. Tích hợp Webhook & CI/CD cho Team QA

Trong **Cài đặt Dự án** (vai trò `Admin` / `QA Lead`):
- **Webhook (Slack / MS Teams / Google Chat)**: Dán Incoming Webhook URL -> tự động gửi thông báo khi **Hoàn tất Test Run** hoặc phát sinh **Defect mức Highest**.
- **CI/CD Automation**: Tạo `Project API Token` (`tcms_...`) và cấu hình GitHub Actions / GitLab CI `POST /api/ci/ingest` kèm báo cáo **Playwright JSON** hoặc **JUnit XML** để tự sinh Test Run sau mỗi lần deploy.

---

## 7. Tùy chọn: Google Workspace SSO & Gửi Email tự động (Gmail SMTP)

Cả hai tính năng đều **tắt mặc định** khi bỏ trống biến môi trường (không phát sinh kết nối ra ngoài hay ảnh hưởng luồng đăng nhập mật khẩu thông thường).

### 7.1. Bật Gửi Email tự động qua Gmail / Google Workspace (SMTP)
1. Bật **Xác minh 2 bước (2-Step Verification)** cho tài khoản Gmail công ty dùng làm bot (VD: `qa-bot@finx.vn`).
2. Vào **Google Account → Security → App passwords** tạo mật khẩu ứng dụng 16 ký tự.
3. Mở `docker/.env.prod`, bỏ comment và điền:
   ```env
   APP_PUBLIC_URL=https://tcms.finx.vn
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=qa-bot@finx.vn
   SMTP_PASS=xxxx_xxxx_xxxx_xxxx
   SMTP_FROM="FinX TestCase Hub <qa-bot@finx.vn>"
   ```
4. Tải lại container API:
   ```bash
   docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d api
   ```
   Khi bật, hệ thống sẽ tự gửi email (không chặn API) khi: có yêu cầu Quên mật khẩu (gửi tới Admin), Admin tạo tài khoản mới, hoặc Admin cấp mật khẩu tạm thời.

### 7.2. Bật "Đăng nhập bằng Google" (Google Workspace SSO)
> **Lưu ý:** Google OAuth yêu cầu domain HTTPS (VD: `https://tcms.finx.vn` qua Nginx/Cloudflare Tunnel) hoặc `http://localhost` — không hỗ trợ IP LAN thuần (`http://192.168.x.x`).

1. Vào **Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application)**.
2. Thêm domain truy cập vào **Authorized JavaScript origins** (VD: `https://tcms.finx.vn`).
3. Mở `docker/.env.prod`, bỏ comment và điền:
   ```env
   GOOGLE_CLIENT_ID=1234567890-xxxxx.apps.googleusercontent.com
   GOOGLE_ALLOWED_DOMAINS=finx.vn
   GOOGLE_AUTO_PROVISION=false
   GOOGLE_DEFAULT_ROLE=QA
   ```
   - `GOOGLE_AUTO_PROVISION=false` *(khuyến nghị)*: Chỉ nhân sự đã được Admin tạo sẵn tài khoản trong hệ thống mới đăng nhập được bằng Google.
   - `GOOGLE_AUTO_PROVISION=true`: Tự động tạo tài khoản mới lần đầu đăng nhập với vai trò `QA` hoặc `PM` (không bao giờ tự cấp quyền `ADMIN`).
4. Tải lại container API:
   ```bash
   docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d api
   ```
   Nút **Đăng nhập bằng Google** sẽ tự động xuất hiện trên trang `/login`.
