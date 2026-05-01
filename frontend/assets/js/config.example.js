// ==================== DataBot Configuration (TEMPLATE) ====================
// Salin file ini menjadi config.js dan isi dengan kredensial Anda.
// JANGAN commit config.js ke repositori publik.
const CONFIG = {
  // Supabase — https://supabase.com/dashboard → Project Settings → API
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

  // App defaults
  MAX_SQL_ROWS: 1000,
};

// Generate or retrieve session token
function getSessionToken() {
  let token = localStorage.getItem('databot_session');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('databot_session', token);
  }
  return token;
}

// Theme management
function getTheme() {
  return localStorage.getItem('databot_theme') || 'dark';
}

function setTheme(theme) {
  localStorage.setItem('databot_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

// Initialize theme
document.documentElement.setAttribute('data-theme', getTheme());
