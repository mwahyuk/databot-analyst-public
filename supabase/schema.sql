-- ============================================================
-- DataBot Analyst — Supabase Schema
-- Jalankan file ini di Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → paste & Run
-- ============================================================

-- ============================================================
-- 1. TABEL PROFIL USER
--    Extends auth.users Supabase (auto-created saat user daftar)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tb_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  role        TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  chat_limit  INTEGER NOT NULL DEFAULT 20,     -- -1 = unlimited
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: otomatis buat tb_profiles saat user baru mendaftar via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.tb_profiles (id, full_name, email, role, is_verified)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    'user',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 2. KONFIGURASI BOT
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tb_bot_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   TEXT NOT NULL UNIQUE,
  config_value TEXT,
  config_type  TEXT NOT NULL DEFAULT 'text',  -- 'text' | 'boolean' | 'number' | 'json'
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: nilai default konfigurasi bot
INSERT INTO public.tb_bot_config (config_key, config_value, config_type, description) VALUES
  ('bot_name',           'DataBot',                         'text',    'Nama bot yang ditampilkan di UI'),
  ('bot_avatar',         '🤖',                              'text',    'Emoji avatar bot'),
  ('welcome_message',    'Halo! Silakan ajukan pertanyaan tentang data Anda.', 'text', 'Pesan sambutan di halaman chat'),
  ('system_prompt',      'Kamu adalah analis data profesional. Jawab pertanyaan pengguna berdasarkan data yang tersedia.', 'text', 'System prompt dasar untuk Gemini AI'),
  ('gemini_api_key',     '',                                'text',    'API key Google Gemini (bisa multiple, pisahkan koma)'),
  ('gemini_model',       'gemini-2.5-flash-preview-05-20',  'text',    'Model Gemini (bisa multiple fallback, pisahkan koma)'),
  ('enable_sql_display', 'false',                           'boolean', 'Tampilkan SQL yang dihasilkan AI kepada user'),
  ('chart_theme',        'dark',                            'text',    'Tema default chart: dark | light'),
  ('max_sql_rows',       '1000',                            'number',  'Batas maksimum baris hasil query SQL')
ON CONFLICT (config_key) DO NOTHING;


-- ============================================================
-- 3. SUMBER DATA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tb_data_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  source_type  TEXT NOT NULL DEFAULT 'supabase_table',  -- 'supabase_table' | 'rest_api'
  table_name   TEXT,          -- diisi jika source_type = 'supabase_table'
  api_endpoint TEXT,          -- diisi jika source_type = 'rest_api'
  description  TEXT,          -- deskripsi untuk konteks LLM
  is_active    BOOLEAN NOT NULL DEFAULT true,
  auth_config  JSONB,         -- konfigurasi autentikasi REST API (opsional)
  --   Struktur auth_config:
  --   {
  --     "auth_type": "none" | "bearer" | "basic" | "custom_login",
  --     "data_path": "products",              -- path ke array data dalam response
  --     "login_url": "https://...",           -- untuk custom_login
  --     "login_payload": "{\"email\":\"{{username}}\"}",
  --     "token_path": "data.access_token",
  --     "credentials": { "username": "", "password": "" }
  --   }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 4. SCHEMA REGISTRY (metadata kolom sumber data untuk LLM)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tb_schema_registry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    UUID NOT NULL REFERENCES public.tb_data_sources(id) ON DELETE CASCADE,
  column_name  TEXT NOT NULL,
  column_type  TEXT NOT NULL DEFAULT 'TEXT',  -- 'TEXT' | 'INTEGER' | 'DECIMAL' | 'DATE' | 'BOOLEAN'
  description  TEXT,
  sample_values TEXT[],       -- contoh nilai untuk membantu LLM memahami data
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 5. CONTOH PROMPT (few-shot examples untuk LLM)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tb_prompt_examples (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID REFERENCES public.tb_data_sources(id) ON DELETE SET NULL,
  question    TEXT NOT NULL,   -- contoh pertanyaan user
  sql_answer  TEXT NOT NULL,   -- SQL yang benar untuk pertanyaan tersebut
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 6. GLOSSARY (kamus istilah domain untuk LLM)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tb_glossary (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term        TEXT NOT NULL,
  definition  TEXT NOT NULL,
  source_id   UUID REFERENCES public.tb_data_sources(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 7. SESI CHAT
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tb_chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token   TEXT NOT NULL,
  user_identifier UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_active     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_token
  ON public.tb_chat_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
  ON public.tb_chat_sessions(user_identifier);


-- ============================================================
-- 8. PESAN CHAT
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tb_chat_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES public.tb_chat_sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,             -- 'user' | 'assistant'
  content        TEXT NOT NULL,
  response_type  TEXT DEFAULT 'text',       -- 'text' | 'report'
  response_data  JSONB,                     -- structured bot response (charts, kpis, insight, dll)
  sql_generated  TEXT,                      -- SQL yang dihasilkan AI
  gemini_tokens  INTEGER,                   -- jumlah token yang dipakai
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON public.tb_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created
  ON public.tb_chat_messages(created_at);


-- ============================================================
-- 9. FUNGSI RPC: Hitung chat harian user
--    Dipanggil dari frontend: SupabaseAPI.rpc('count_user_daily_chats', { p_user_id })
-- ============================================================
CREATE OR REPLACE FUNCTION public.count_user_daily_chats(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.tb_chat_messages m
  JOIN public.tb_chat_sessions s ON s.id = m.session_id
  WHERE s.user_identifier = p_user_id
    AND m.role = 'user'
    AND m.created_at >= CURRENT_DATE
    AND m.created_at < CURRENT_DATE + INTERVAL '1 day';
$$;


-- ============================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Aktifkan RLS pada semua tabel
ALTER TABLE public.tb_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_bot_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_data_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_schema_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_prompt_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_glossary        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_chat_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_chat_messages   ENABLE ROW LEVEL SECURITY;

-- Helper: cek apakah user saat ini adalah admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---- tb_profiles ----
CREATE POLICY "User bisa baca profil sendiri"
  ON public.tb_profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "User bisa update profil sendiri"
  ON public.tb_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admin bisa update semua profil"
  ON public.tb_profiles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admin bisa hapus profil"
  ON public.tb_profiles FOR DELETE
  USING (public.is_admin());

CREATE POLICY "Trigger bisa insert profil baru"
  ON public.tb_profiles FOR INSERT
  WITH CHECK (true);

-- ---- tb_bot_config ----
CREATE POLICY "Semua user terautentikasi bisa baca config aktif"
  ON public.tb_bot_config FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin bisa kelola config"
  ON public.tb_bot_config FOR ALL
  USING (public.is_admin());

-- ---- tb_data_sources ----
CREATE POLICY "Semua user terautentikasi bisa baca sumber data"
  ON public.tb_data_sources FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin bisa kelola sumber data"
  ON public.tb_data_sources FOR ALL
  USING (public.is_admin());

-- ---- tb_schema_registry ----
CREATE POLICY "Semua user terautentikasi bisa baca schema"
  ON public.tb_schema_registry FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin bisa kelola schema"
  ON public.tb_schema_registry FOR ALL
  USING (public.is_admin());

-- ---- tb_prompt_examples ----
CREATE POLICY "Semua user terautentikasi bisa baca examples aktif"
  ON public.tb_prompt_examples FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin bisa kelola examples"
  ON public.tb_prompt_examples FOR ALL
  USING (public.is_admin());

-- ---- tb_glossary ----
CREATE POLICY "Semua user terautentikasi bisa baca glossary"
  ON public.tb_glossary FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin bisa kelola glossary"
  ON public.tb_glossary FOR ALL
  USING (public.is_admin());

-- ---- tb_chat_sessions ----
CREATE POLICY "User bisa baca sesi milik sendiri"
  ON public.tb_chat_sessions FOR SELECT
  USING (user_identifier = auth.uid() OR public.is_admin());

CREATE POLICY "User bisa buat sesi baru"
  ON public.tb_chat_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "User bisa update sesi milik sendiri"
  ON public.tb_chat_sessions FOR UPDATE
  USING (user_identifier = auth.uid() OR public.is_admin());

CREATE POLICY "Admin bisa hapus sesi"
  ON public.tb_chat_sessions FOR DELETE
  USING (public.is_admin());

-- ---- tb_chat_messages ----
CREATE POLICY "User bisa baca pesan dari sesi milik sendiri"
  ON public.tb_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tb_chat_sessions s
      WHERE s.id = session_id
        AND (s.user_identifier = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "User bisa kirim pesan"
  ON public.tb_chat_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admin bisa hapus pesan"
  ON public.tb_chat_messages FOR DELETE
  USING (public.is_admin());


-- ============================================================
-- 11. EDGE FUNCTION: execute-sql
--    Buat via Supabase Dashboard → Edge Functions → New Function
--    Nama fungsi: execute-sql
--    Kode fungsi tersedia di: supabase/functions/execute-sql/index.ts
-- ============================================================


-- ============================================================
-- 12. USER ADMIN PERTAMA
--    Setelah menjalankan schema ini:
--    1. Daftar akun via halaman /login.html
--    2. Jalankan query berikut di SQL Editor untuk jadikan admin:
--
--    UPDATE public.tb_profiles
--    SET role = 'admin', is_verified = true
--    WHERE email = 'email-anda@domain.com';
-- ============================================================
