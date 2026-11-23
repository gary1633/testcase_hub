# Hướng dẫn Tự Host FinX TestCase Hub trên Máy Local bằng Docker (Windows & macOS)

Tài liệu hướng dẫn từng bước để bạn tự host **FinX TestCase Hub** ngay trên máy tính **Windows** hoặc **macOS (Apple Silicon M1/M2/M3/M4 & Intel)** bằng Docker cho cả team (~40 thành viên) truy cập chung trong mạng nội bộ công ty, và sau này dễ dàng chuyển toàn bộ dữ liệu sang server của DevOps.

---

## 1. Yêu cầu cấu hình máy host

Bộ 3 container (`web` Nginx + `api` NestJS + `postgres` 16) đều dùng base **Alpine multi-arch** (chạy native trên cả Intel/AMD64 lẫn Apple Silicon ARM64) nên rất nhẹ:

| Thành phần | RAM thực tế | Ổ đĩa |
| :--- | :--- | :--- |
| `tcms-web-prod` (Nginx + React build) | ~15 – 30 MB | ~50 MB |
| `tcms-api-prod` (NestJS Node 22) | ~150 – 300 MB | ~300 MB |
| `tcms-postgres-prod` (PostgreSQL 16) | ~100 – 250 MB | ~250 MB |
| **Tổng 3 container** | **~300 – 600 MB** | **~700 MB – 1 GB** |

- **Khuyến nghị phần cứng**: RAM tối thiểu **8 GB** (lý tưởng **16 GB** nếu vừa host vừa làm việc), SSD trống ít nhất **10–20 GB** (lưu ảnh bằng chứng kiểm thử và bản backup).
- **Khuyến nghị vận hành**: Nên dùng máy bàn/Mac Mini bật liên tục trong giờ làm việc (tắt chế độ tự Sleep khi cắm nguồn).

---

## 2. Bước 1 — Cài đặt Docker

### Trên Windows
1. Tải và cài **Docker Desktop for Windows**: https://www.docker.com/products/docker-desktop/
2. Giữ tùy chọn **Use WSL 2 instead of Hyper-V**, khởi động lại máy nếu được hỏi và mở Docker Desktop cho tới khi hiện **Running**.

### Trên macOS (Apple Silicon & Intel)
Chọn **1 trong 2** cách:
- **Cách 1 — OrbStack (Khuyên dùng cho Mac, cực nhẹ RAM & khởi động nhanh):**
  ```bash
  brew install --cask orbstack
  ```
  Mở ứng dụng **OrbStack** một lần để kích hoạt Docker engine.
- **Cách 2 — Docker Desktop for Mac:**
  Tải đúng bản **Apple Silicon** hoặc **Intel** tại https://www.docker.com/products/docker-desktop/ (hoặc `brew install --cask docker`), sau đó mở Docker Desktop.

### Kiểm tra chung (PowerShell / Terminal)
```bash
docker --version
docker compose version
```

---

## 3. Bước 2 — Lấy IP mạng LAN của máy host

### Trên Windows (PowerShell)
```powershell
ipconfig
```
Tìm mục **IPv4 Address** của card Wi-Fi / Ethernet đang dùng (ví dụ: `192.168.1.50`).

### Trên macOS (Terminal)
```bash
# Nếu dùng Wi-Fi:
ipconfig getifaddr en0

# Nếu dùng cáp mạng LAN (Ethernet) và en0 trống:
ipconfig getifaddr en1
```
*(Hoặc xem trong **System Settings → Network → Wi-Fi / Ethernet → Details → IP address**).*

> **Mẹo quan trọng:** Nên nhờ IT gán **IP tĩnh (DHCP Reservation)** cho máy host để mỗi ngày bật máy địa chỉ IP không bị đổi.

---

## 4. Bước 3 — Cấu hình file biến môi trường `docker/.env.prod`

Tại thư mục gốc dự án:

- **Windows (PowerShell):**
  ```powershell
  Copy-Item docker\.env.prod.example docker\.env.prod
  ```
- **macOS (Terminal):**
  ```bash
  cp docker/.env.prod.example docker/.env.prod
  ```

Mở `docker/.env.prod` và điền thông tin thật:

```env
# Cổng Web UI (có thể đổi nếu 8080 đang bận)
WEB_PORT=8080

# Điền đúng địa chỉ truy cập của team (nhiều origin cách nhau bằng dấu phẩy)
CORS_ORIGIN=http://localhost:8080,http://192.168.1.50:8080

# Mật khẩu PostgreSQL (đổi thành chuỗi mạnh)
POSTGRES_USER=tcms
POSTGRES_PASSWORD=DatMatKhauPostgresManh@2026
POSTGRES_DB=tcms_db

# Chuỗi bí mật ký JWT (dài 64 ký tự ngẫu nhiên)
JWT_SECRET=thay-bang-chuoi-hex-ngau-nhien-64-ky-tu-rat-manh
JWT_EXPIRES_IN=7d

# KHỞI TẠO SẠCH: chỉ tạo duy nhất 1 tài khoản Super Admin, 0 dự án/dữ liệu mẫu
SEED_MODE=superadmin
SUPERADMIN_EMAIL=admin@finx.vn
SUPERADMIN_PASSWORD=MatKhauSuperAdminBanDau@2026
SUPERADMIN_NAME=FinX Super Admin
SUPERADMIN_MUST_CHANGE_PASSWORD=true

ENABLE_SWAGGER=false
```

**Tạo nhanh `JWT_SECRET` ngẫu nhiên:**
- **macOS:** `openssl rand -hex 32`
- **Windows (PowerShell):** `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })`

---

## 5. Bước 4 — Build và Khởi chạy Docker Compose

Chạy giống nhau trên cả **Windows** và **macOS** tại thư mục gốc dự án:

```bash
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d --build
```

- Lần đầu build mất khoảng **2 – 4 phút**.
- Kiểm tra 3 container đã ở trạng thái **Healthy / Up**:
  ```bash
  docker compose -f docker/docker-compose.prod.yml ps
  ```
- Kiểm tra log API (sẽ thấy dòng `Clean bootstrap: seeded initial Super Admin account only`):
  ```bash
  docker logs tcms-api-prod --tail 50
  ```
- Mở trình duyệt trên chính máy host vào `http://localhost:8080` để kiểm tra.

---

## 6. Bước 5 — Mở Firewall & Tắt Sleep để team truy cập trong LAN

### Trên Windows
1. Mở **PowerShell (Run as Administrator)** để cho phép port `8080`:
   ```powershell
   New-NetFirewallRule -DisplayName "FinX TestCase Hub (Port 8080)" `
     -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Domain,Private
   ```
2. Tắt Sleep: *Settings → System → Power & battery → Screen and sleep* → đặt **Put my device to sleep** = **Never** khi cắm sạc.

### Trên macOS
1. **Firewall**: Mặc định macOS Firewall tắt (team vào được ngay). Nếu bạn có bật (*System Settings → Network → Firewall → Options*), hãy chọn **Allow incoming connections** cho **Docker** / **OrbStack**.
2. **Tắt Sleep khi cắm sạc**:
   - Giao diện: *System Settings → Battery → Options* → bật **Prevent automatic sleeping on power adapter when the display is off**.
   - Hoặc chạy bằng lệnh Terminal (chỉ áp dụng khi cắm sạc):
     ```bash
     sudo pmset -c sleep 0
     ```

Sau đó gửi đường dẫn cho team truy cập: **`http://192.168.1.50:8080`** *(thay bằng IP thật của máy bạn)*.

---

## 7. Khởi tạo dữ liệu thật ngày đầu (Super Admin)

1. Đăng nhập bằng `SUPERADMIN_EMAIL` và `SUPERADMIN_PASSWORD` trong `docker/.env.prod`.
2. Đổi mật khẩu mới nếu hệ thống yêu cầu (`SUPERADMIN_MUST_CHANGE_PASSWORD=true`).
3. Vào mục **Thành viên** (`/users`) → tạo tài khoản cho QA Lead, QA Engineer, PM.
4. Vào **Không gian Dự án** (`/projects`) → bấm **Tạo dự án** để bắt đầu từ đầu.

---

## 8. (Tùy chọn) Truy cập từ xa (WFH) & bật HTTPS bằng Cloudflare Tunnel

Giúp team truy cập từ ngoài công ty và có sẵn **HTTPS** (nút Copy Clipboard hoạt động chuẩn trên mọi trình duyệt) mà không cần mở port modem:

- **Cài `cloudflared`:**
  - Windows: `winget install Cloudflare.cloudflared`
  - macOS: `brew install cloudflared`
- **Chạy thử nhanh (link HTTPS tạm miễn phí):**
  ```bash
  cloudflared tunnel --url http://localhost:8080
  ```
  *(Nếu muốn link cố định như `tcms.finx.vn`, tạo Named Tunnel miễn phí trên Cloudflare Zero Trust).*
- Thêm domain HTTPS vừa tạo vào `CORS_ORIGIN` trong `docker/.env.prod`, rồi tải lại container API:
  ```bash
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d api
  ```

---

## 9. Backup định kỳ & Chuyển sang Server DevOps sau này

### Backup trên Windows (PowerShell)
```powershell
.\scripts\backup-postgres.ps1
```
*(Có thể hẹn giờ chạy tự động mỗi ngày lúc 18:30 bằng **Windows Task Scheduler**).*

### Backup trên macOS (Terminal)
```bash
chmod +x scripts/backup-postgres.sh scripts/restore-postgres.sh
./scripts/backup-postgres.sh ./backups
```
Để tự động backup mỗi ngày lúc **18:30** trên macOS, chạy `crontab -e` và thêm dòng:
```cron
30 18 * * * cd /duong/dan/toi/testcase_manage && /usr/local/bin/bash ./scripts/backup-postgres.sh ./backups >> ./backups/cron.log 2>&1
```
*(Trên Apple Silicon Mac nếu `docker` nằm ở `/opt/homebrew/bin` hoặc `/usr/local/bin`, hãy thêm `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` ở đầu crontab).*

- Cả 2 script đều xuất 2 file `tcms_db_YYYYMMDD_HHMMSS.sql.gz` + `tcms_uploads_YYYYMMDD_HHMMSS.tar.gz` vào `backups/` và tự giữ 14 bản gần nhất.
- **Khuyến nghị:** Đồng bộ thư mục `backups/` lên Google Drive / OneDrive / iCloud / NAS nội bộ.

### Khi bàn giao chuyển lên Server DevOps (giữ nguyên 100% dữ liệu)
1. Chạy script backup lấy bản mới nhất (`.sql.gz` + `.tar.gz`).
2. DevOps dựng 3 container trên server theo [DEPLOY.md](./DEPLOY.md).
3. Copy 2 file backup lên server và khôi phục bằng `./scripts/restore-postgres.sh` — toàn bộ tài khoản, dự án, test case, lịch sử, test run và ảnh bằng chứng được chuyển sang nguyên vẹn.

---

## 10. Các lệnh quản trị thường dùng hàng ngày

```bash
# Dừng tạm (KHÔNG mất dữ liệu vì dữ liệu nằm trong Docker volume)
docker compose -f docker/docker-compose.prod.yml stop

# Khởi động lại sau khi bật máy
docker compose -f docker/docker-compose.prod.yml start

# Cập nhật code mới và build lại (GIỮ NGUYÊN dữ liệu DB & uploads)
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d --build

# Xem log khi cần kiểm tra lỗi
docker logs -f tcms-api-prod
```

> **CẢNH BÁO:** Tuyệt đối **KHÔNG** chạy `docker compose ... down -v` vì cờ `-v` sẽ xóa sạch toàn bộ volume dữ liệu PostgreSQL và ảnh uploads!

---

## 11. Tùy chọn: Bật Gmail SMTP & Google Workspace SSO sau này

Mặc định cả hai tính năng đều **tắt hoàn toàn** (không gọi ra Google/SMTP khi chưa cấu hình). Khi nào cần dùng:

- **Gmail công ty tự gửi email** (Quên mật khẩu, tạo tài khoản, cấp mật khẩu tạm): chạy được ngay cả khi host local/LAN — chỉ cần tạo Gmail **App Password** rồi điền `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` trong `docker/.env.prod` và chạy `docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d api`.
- **Đăng nhập bằng Google Workspace (SSO)**: cần có domain HTTPS (như Cloudflare Tunnel ở Mục 8), sau đó điền `GOOGLE_CLIENT_ID` và `GOOGLE_ALLOWED_DOMAINS` trong `docker/.env.prod` rồi khởi động lại container `api`. Xem chi tiết tại Mục 7 của [DEPLOY.md](./DEPLOY.md).
