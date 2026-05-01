// ==================== DataBot CMS Configuration (TEMPLATE) ====================
// Kredensial ini digunakan oleh halaman CMS admin (cms/index.html).
// Nilai aktual tertanam langsung di dalam <script> di cms/index.html.
//
// Catatan Gemini API Key:
//   - Gemini API Key TIDAK disimpan di file ini.
//   - Kunci Gemini dikelola via CMS → Konfigurasi Bot → gemini_api_key
//     dan disimpan terenkripsi di tabel tb_bot_config di Supabase.
//
// Kredensial Supabase yang digunakan di CMS:
const CONFIG_CMS = {
  // Supabase — https://supabase.com/dashboard → Project Settings → API
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
};
