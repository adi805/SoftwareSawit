# MCP (Model Context Protocol) - SoftwareSawit Integration

## Gambaran Umum

Dokumentasi ini menjelaskan bagaimana MCP diintegrasikan dengan aplikasi **SoftwareSawit** untuk keperluan automasi testing dan akses database.

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                        Droid (AI Agent)                     │
│                    Claude Code / CLI Tools                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ MCP Protocol (JSON-RPC over stdio/http)
                      │
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Context7   │ │ Software   │ │ Playwright  │
│    MCP      │ │  Sawit MCP  │ │  Electron   │
│  (Docs)     │ │  (DB/API)   │ │    MCP      │
└─────────────┘ └─────────────┘ └─────────────┘
                          │                  │
                          ▼                  ▼
              ┌───────────────────┐  ┌───────────────────┐
              │  MCP Server      │  │  CDP Protocol     │
              │  (port 3456)     │  │  (port 9222)      │
              └───────────────────┘  └───────────────────┘
                          │                  │
                          ▼                  ▼
              ┌─────────────────────────────────────────┐
              │           SoftwareSawit Electron App    │
              │  ┌─────────────┐    ┌──────────────┐   │
              │  │ Main Process│◄──►│ Renderer     │   │
              │  │ (Node.js)   │    │ (React)      │   │
              │  └─────────────┘    └──────────────┘   │
              │         │                               │
              │         ▼                               │
              │  ┌─────────────────────────────────┐   │
              │  │ SQLite Database (sql.js)        │   │
              │  │ - user.db                       │   │
              │  │ - coa.db                        │   │
              │  │ - kas.db                        │   │
              │  │ - bank.db                       │   │
              │  │ - gudang.db                     │   │
              │  │ - sync.db                       │   │
              │  └─────────────────────────────────┘   │
              └─────────────────────────────────────────┘
```

---

## MCP Servers yang Digunakan

### 1. Context7 MCP

**Purpose:** Akses dokumentasi library/framework modern

**Config:**
```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

**Usage:**
- Query dokumentasi React, Vite, TailwindCSS, dll
- Tidak terhubung ke aplikasi SoftwareSawit

---

### 2. SoftwareSawit MCP (Custom)

**Purpose:** Akses langsung ke database SQLite aplikasi

**Config:**
```json
{
  "mcpServers": {
    "software-sawit": {
      "type": "http",
      "url": "http://localhost:3456"
    }
  }
}
```

**Endpoint:** `mcp-server.js` di root project

**Fitur:**
- Baca/tulis database COA
- Baca/tulis database transaksi (Kas, Bank, Gudang)
- Manajemen user
- Query custom SQL

**Contoh Penggunaan:**
```
# Melalui Droid MCP client
MCP: software-sawit - Query COA data
MCP: software-sawit - Get all transactions
```

---

### 3. Playwright Electron MCP

**Purpose:** Automasi UI testing melalui Chrome DevTools Protocol (CDP)

**Config:**
```json
{
  "mcpServers": {
    "playwright-electron": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@iflow-mcp/robertn702-playwright-mcp-electron", "--cdp-endpoint", "http://127.0.0.1:9222"]
    }
  }
}
```

**Catatan:** MCP ini memerlukan Electron app berjalan dengan remote debugging enabled.

---

## Cara Kerja CDP (Chrome DevTools Protocol)

### Prerequisites

Electron app harus dijalankan dengan flag `--remote-debugging-port`:

```bash
cd D:\Estate\Droid\SoftwareSawit
npx electron . --remote-debugging-port=9222
```

### Koneksi WebSocket

```
URL: ws://127.0.0.1:9222/devtools/page/<PAGE_ID>
```

Untuk mendapatkan PAGE_ID:
```bash
curl http://127.0.0.1:9222/json
```

Response:
```json
[{
  "id": "C5FDE5C07DB33E400C75A459A057AC0A",
  "title": "SoftwareSawit",
  "url": "file:///D:/Estate/Droid/SoftwareSawit/dist/renderer/index.html",
  "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/C5FDE5C07DB33E400C75A459A057AC0A"
}]
```

### CDP Commands yang Tersedia

| Domain | Method | Deskripsi |
|--------|--------|-----------|
| Page | captureScreenshot | Ambil screenshot halaman |
| Page | reload | Reload halaman |
| Runtime | evaluate | Eksekusi JavaScript |
| DOM | getDocument | Ambil DOM tree |
| Accessibility | getFullAXTree | Accessibility tree |
| Input | dispatchEvent | Dispatch mouse/keyboard events |

---

## Script Automasi Testing

### File Script

| File | Purpose |
|------|---------|
| `full-test.js` | Test suite lengkap semua modul |
| `cdp-test.js` | Testing individual features |
| `debug-buttons.js` | Debug button states |
| `test-batal.js` | Debug Batal button click |

### Jalankan Script

```bash
cd D:\Estate\Droid\SoftwareSawit

# 1. Start Electron dengan debugging
powershell -Command "Start-Process -FilePath 'npx.cmd' -ArgumentList 'electron . --remote-debugging-port=9222' -WorkingDirectory 'D:\Estate\Droid\SoftwareSawit' -NoNewWindow"

# 2. Tunggu sampai ready
sleep 8

# 3. Jalankan test
node full-test.js
```

---

## Struktur Aplikasi SoftwareSawit

### Tech Stack
- **Electron** 34.x - Desktop framework
- **React** 19.x - UI library
- **Vite** 8.x - Build tool
- **TailwindCSS** 3.x - CSS framework
- **SQLite** (sql.js) - Local database
- **Socket.io** - Real-time sync

### Database Files (di %APPDATA%/software-sawit/data/)

| Database | Path | Contents |
|----------|------|----------|
| User | user.db | User accounts, roles, login history |
| COA | coa.db | Chart of Accounts |
| Blok | blok.db | Plantation blocks |
| Kas | kas/YYYY/MM.db | Cash transactions |
| Bank | bank/YYYY/MM.db | Bank transactions |
| Gudang | gudang/YYYY/MM.db | Inventory transactions |
| Sync | sync.db | Sync queue & configurations |

### Modul Aplikasi

1. **Dashboard** - Landing page dengan quick actions
2. **Master Data**
   - COA (Chart of Accounts)
   - Aspek Kerja (Work Aspects)
   - Blok (Plantation Blocks)
3. **Kas Module** - Cash transactions dengan dual approval
4. **Bank Module** - Bank transactions dengan dual approval
5. **Gudang Module** - Inventory dengan dual approval
6. **User Management** - Multi-user dengan roles
7. **Sync Settings** - Multi-location sync configuration

---

## Troubleshooting

### CDP Connection Refused

```bash
# Pastikan Electron running dengan debugging
netstat -an | findstr 9222

# Jika tidak ada, start ulang
npx electron . --remote-debugging-port=9222
```

### Page ID Changed

Setiap kali app direstart, Page ID berubah. Update script:

```bash
# Get current page ID
curl http://127.0.0.1:9222/json
```

### Click Events Not Working

CDP `element.click()` tidak memicu React synthetic events. Solusi:

1. **Reload method** - Reload halaman untuk reset state
2. **Mouse dispatch** - Gunakan MouseEvent dengan coordinate
3. **Expose test API** - Tambangkan test hook di app

---

## Catatan Penting

1. **React Events:** CDP click tidak otomatis trigger React onClick handler karena perbedaan synthetic event system
2. **Page ID Dynamic:** Page ID berubah setiap restart app
3. **Database Path:** Database tersimpan di AppData, bukan di project folder
4. **Socket Port 9222:** Port ini adalah debugging port, bukan aplikasi socket sync

---

## Referensi

- [Electron CDP Documentation](https://www.electronjs.org/docs/api/debugger)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Playwright MCP](https://github.com/iflow/robertn702-playwright-mcp-electron)
