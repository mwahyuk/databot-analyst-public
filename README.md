# DataBot Analyst

Chatbot analisis data berbasis **Gemini API + Supabase**. Pengguna mengajukan pertanyaan dalam Bahasa Indonesia, dijawab secara otomatis dengan insight teks, chart interaktif, KPI card, dan tabel data.

## Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | Vanilla JS, HTML, CSS (no framework) |
| Database & Auth | [Supabase](https://supabase.com) (PostgreSQL + Auth + RLS) |
| AI | Google Gemini API (multi-key & multi-model rotation) |
| SQL Executor | Supabase Edge Function (Deno) |
| Deploy | Vercel / static hosting |

## Fitur

- Chat natural language → SQL → visualisasi otomatis
- Multi-sesi dengan riwayat per user
- Kuota chat harian per user, dapat dikonfigurasi admin
- CMS admin: manajemen user, konfigurasi bot, sumber data, schema, riwayat chat
- Dukungan multiple Gemini API key (load balancing) dan multiple model (fallback otomatis)
- Dukungan sumber data Supabase Table dan REST API eksternal
- Dark / light mode

---

## Setup

### Prasyarat

- Akun [Supabase](https://supabase.com) — free tier cukup
- Akun [Google AI Studio](https://aistudio.google.com) untuk Gemini API key
- [Supabase CLI](https://supabase.com/docs/guides/cli) untuk deploy edge function

---

### Langkah 1 — Buat Project Supabase

1. Buat project baru di [supabase.com/dashboard](https://supabase.com/dashboard)
2. Catat **Project URL** dan **anon public key** dari:
   `Dashboard → Project Settings → API`

---

### Langkah 2 — Jalankan Schema Database

Buka **SQL Editor** di Supabase Dashboard, paste seluruh isi `supabase/schema.sql`, lalu klik **Run**.

File ini membuat:
- 8 tabel (`tb_profiles`, `tb_bot_config`, `tb_data_sources`, `tb_schema_registry`, `tb_prompt_examples`, `tb_glossary`, `tb_chat_sessions`, `tb_chat_messages`)
- Row Level Security (RLS) pada semua tabel
- RPC function `count_user_daily_chats`
- Trigger otomatis buat profil saat user baru registrasi
- Seed data konfigurasi bot default

> RLS sudah aktif setelah menjalankan schema — tidak perlu konfigurasi tambahan.

---

### Langkah 3 — Deploy Edge Function

Edge function `execute-sql` digunakan untuk menjalankan query SQL hasil AI ke database secara aman.

```bash
# Login ke Supabase CLI
supabase login

# Link ke project Anda
supabase link --project-ref YOUR_PROJECT_REF

# Deploy
supabase functions deploy execute-sql
```

> Fungsi ini hanya mengizinkan query `SELECT` — semua perintah mutasi data diblokir.

---

### Langkah 4 — Konfigurasi Frontend

```bash
# Salin template config
cp frontend/assets/js/config.example.js frontend/assets/js/config.js
```

Edit `frontend/assets/js/config.js` dan isi dengan kredensial Supabase Anda:

```js
const CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
  MAX_SQL_ROWS: 1000,
};
```

Nilai `SUPABASE_URL` dan `SUPABASE_ANON_KEY` tersedia di:
**Supabase Dashboard → Project Settings → API**

> `config.js` ada di `.gitignore` dan tidak akan ter-commit.

---

### Langkah 5 — Buat Admin Pertama

1. Buka aplikasi dan daftar akun via `/login.html`
2. Jalankan query berikut di **Supabase SQL Editor**:

```sql
UPDATE public.tb_profiles
SET role = 'admin', is_verified = true
WHERE email = 'email-anda@domain.com';
```

---

### Langkah 6 — Konfigurasi Gemini API Key

Gemini API key tidak disimpan di file statis — dikelola via CMS setelah login admin:

1. Buka **CMS → Konfigurasi Bot**
2. Isi field `gemini_api_key` dengan key dari [Google AI Studio](https://aistudio.google.com)
3. Klik **Simpan Perubahan**

> Mendukung multiple API key (pisahkan koma) untuk load balancing, dan multiple model (pisahkan koma) untuk fallback otomatis saat rate limit.

---

### Langkah 7 — Jalankan / Deploy

Karena full static (HTML + JS + CSS), cukup serve folder `frontend/`:

```bash
# Lokal
npx serve frontend

# Deploy ke Vercel
vercel --cwd frontend
```

---

## Struktur Folder

```
├── frontend/
│   ├── index.html                        # Halaman chat utama
│   ├── login.html                        # Halaman login & registrasi
│   ├── assets/
│   │   ├── js/
│   │   │   ├── config.example.js         # Template konfigurasi
│   │   │   ├── config.js                 # ← buat sendiri, tidak di-commit
│   │   │   ├── api.js                    # Supabase & Gemini API client
│   │   │   ├── auth.js                   # Supabase Auth helper
│   │   │   ├── chat.js                   # Controller utama chat
│   │   │   └── renderer.js               # Render chart, tabel, KPI card
│   │   └── css/
│   │       └── style.css
│   └── cms/
│       ├── index.html                    # Panel admin CMS
│       └── assets/
│           ├── cms.js                    # Controller CMS
│           ├── cms.css
│           └── config.example.js         # Catatan kredensial CMS
└── supabase/
    ├── schema.sql                        # Schema lengkap — jalankan di SQL Editor
    └── functions/
        └── execute-sql/
            └── index.ts                  # Edge function SQL executor (Deno)
```

---

## Arsitektur

```
Browser (Vanilla JS)
  │
  ├── Supabase Auth        ← login, registrasi, session
  ├── Supabase REST API    ← konfigurasi, sumber data, riwayat chat
  ├── Gemini API           ← generate SQL + insight dari pertanyaan user
  └── Edge Function        ← eksekusi SELECT ke database
        execute-sql
```

---

## Keamanan

| Aspek | Penanganan |
|-------|------------|
| Supabase credentials | Disimpan di `config.js` (di-gitignore, tidak di-commit) |
| Gemini API key | Disimpan di database `tb_bot_config`, dikelola via CMS |
| Akses data | Row Level Security (RLS) aktif di semua tabel |
| Eksekusi SQL | Hanya `SELECT` — mutasi data diblokir di edge function |
| Akses CMS | Hanya user dengan `role = 'admin'` |
| Registrasi user | Memerlukan verifikasi admin (`is_verified = true`) |

---

## Lisensi

MIT
