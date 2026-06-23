# INL Portal API

Backend REST API untuk INL Portal — dibangun dengan **Fastify v4 + TypeScript + Drizzle ORM + PostgreSQL**.

## Tech Stack

| | |
|---|---|
| Framework | Fastify v4 |
| Language | TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Validation | Zod |
| Auth | JWT (`@fastify/jwt`) |
| Password | bcryptjs |
| File Upload | `@fastify/multipart` + `@fastify/static` |

---

## Struktur Folder

```
src/
├── config/env.ts           # Env loader + validasi Zod
├── db/
│   ├── index.ts            # Drizzle client
│   ├── migrate.ts          # Migration runner
│   ├── seed.ts             # Seed data awal
│   └── schema/
│       ├── auth.ts         # user, aplikasi, app_user_access, sso_token
│       ├── employee.ts     # employee
│       ├── organisasi.ts   # bagian, sub_bagian
│       └── master.ts       # ref_status_karyawan, ref_pendidikan, ref_status_pernikahan
├── plugins/
│   ├── jwt.ts              # @fastify/jwt plugin
│   └── auth.ts             # authenticate + authorize decorators
├── routes/                 # Route handlers
├── services/               # Business logic
├── validators/             # Zod schemas
├── utils/                  # hash, response, pagination, file
└── server.ts               # Entry point
```

---

## Step-by-Step Setup

### 1. Clone / masuk folder project

```bash
cd "d:\Asisten IT\Project\INL PORTAL\inl-portal-api"
```

### 2. Install dependencies (sudah dilakukan)

```bash
npm install
```

### 3. Setup environment

```bash
copy .env.example .env
```

Edit `.env` dan isi dengan kredensial PostgreSQL kamu:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inl_portal
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_super_secret_key_min_32_chars_here!!

UPLOAD_DIR=uploads
UPLOAD_URL=http://localhost:3000/uploads

SEED_ADMIN_EMAIL=admin@inl.co.id
SEED_ADMIN_PASSWORD=Admin@123
```

### 4. Buat database PostgreSQL

```sql
CREATE DATABASE inl_portal;
```

### 5. Generate migrasi

```bash
npm run db:generate
```

### 6. Jalankan migrasi

```bash
npm run db:migrate
```

### 7. Seed data awal

Seed akan membuat:
- Ref data: status karyawan, pendidikan, status pernikahan
- User super_admin (email & password dari `.env`)

```bash
npm run db:seed
```

### 8. Jalankan dev server

```bash
npm run dev
```

Output:
```
🚀  INL Portal API running on http://0.0.0.0:3000
📁  Static files: http://localhost:3000/uploads
🔑  Health check: http://localhost:3000/health
```

### 9. Cek health

```bash
curl http://localhost:3000/health
```

---

## Roles

| Role | Akses |
|---|---|
| `user` | Lihat portal, akses aplikasi yang diberikan |
| `super_admin` | Full CRUD: employee, user, bagian, sub_bagian, aplikasi |

---

## API Endpoints

### Auth
| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Authenticated |
| POST | `/api/auth/logout` | Authenticated |

### Users (super_admin only)
| Method | Path |
|---|---|
| GET | `/api/users?page=1&limit=50&search=&role=` |
| POST | `/api/users` |
| GET | `/api/users/:id` |
| PUT | `/api/users/:id` |
| DELETE | `/api/users/:id` |
| GET | `/api/users/:id/apps` |
| POST | `/api/users/:id/grant-app` |
| DELETE | `/api/users/:id/revoke-app/:appId` |

### Employees
| Method | Path | Auth |
|---|---|---|
| GET | `/api/employees` | Authenticated |
| POST | `/api/employees` | super_admin |
| GET | `/api/employees/:id` | Authenticated |
| PUT | `/api/employees/:id` | super_admin |
| DELETE | `/api/employees/:id` | super_admin |
| POST | `/api/employees/:id/photo` | super_admin (multipart) |

### Organisasi
| Method | Path | Auth |
|---|---|---|
| GET | `/api/org/bagian` | Authenticated |
| POST | `/api/org/bagian` | super_admin |
| PUT | `/api/org/bagian/:id` | super_admin |
| DELETE | `/api/org/bagian/:id` | super_admin |
| GET | `/api/org/sub-bagian` | Authenticated |
| POST | `/api/org/sub-bagian` | super_admin |
| PUT | `/api/org/sub-bagian/:id` | super_admin |
| DELETE | `/api/org/sub-bagian/:id` | super_admin |

### Aplikasi
| Method | Path | Auth |
|---|---|---|
| GET | `/api/apps` | Authenticated |
| POST | `/api/apps` | super_admin |
| GET | `/api/apps/:id` | Authenticated |
| PUT | `/api/apps/:id` | super_admin |
| DELETE | `/api/apps/:id` | super_admin |

### SSO
| Method | Path | Auth |
|---|---|---|
| GET | `/api/sso/token?app_id=xxx` | Authenticated |
| POST | `/api/sso/verify` | Public (untuk app client) |

### Master Data
| Method | Path | Auth |
|---|---|---|
| GET | `/api/master/status-karyawan` | Authenticated |
| GET | `/api/master/pendidikan` | Authenticated |
| GET | `/api/master/status-pernikahan` | Authenticated |

---

## Auth Flow

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@inl.co.id","password":"Admin@123"}'
```

### Gunakan token
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Logout (token langsung invalid)
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

---

## File Upload (Foto Profil)

```bash
curl -X POST http://localhost:3000/api/employees/:id/photo \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/photo.jpg"
```

File disimpan di folder `uploads/` dengan nama: `{timestamp}_{random}.jpg`
URL akses: `http://localhost:3000/uploads/{filename}` (dari `UPLOAD_URL` di `.env`)

---

## SSO Flow

1. User klik aplikasi SSO di portal → Frontend call `GET /api/sso/token?app_id=xxx`
2. Backend return `{ token, expiresAt, redirectUrl }`
3. Frontend redirect ke `redirectUrl?sso_token=xxx`
4. Aplikasi target call `POST /api/sso/verify` dengan `{ token, app_id }`
5. Backend return data user → aplikasi generate session sendiri

---

## Response Format

```json
// Success
{ "success": true, "data": {...}, "meta": { "page": 1, "limit": 50, "total": 100, "totalPages": 2 } }

// Error
{ "success": false, "error": "Pesan error" }

// Validation Error (422)
{ "success": false, "error": "Validasi gagal", "details": [{ "field": "email", "message": "Email tidak valid" }] }
```
