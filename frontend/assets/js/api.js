// Initialize global Supabase client instance (named supabaseClient to avoid shadowing CDN's window.supabase)
const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const SupabaseAPI = {
  // Get dynamic headers with Auth Token if available
  headers() {
    const sessionStr = localStorage.getItem('sb-pgyltungxodpdoacoizk-auth-token');
    let authHeader = `Bearer ${CONFIG.SUPABASE_ANON_KEY}`;
    
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session && session.access_token) {
          authHeader = `Bearer ${session.access_token}`;
        }
      } catch (e) {}
    }

    return {
      'Content-Type': 'application/json',
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': authHeader
    };
  },

  async logout() {
    await supabaseClient.auth.signOut();
    localStorage.removeItem('databot_session'); // Clear old session too
    window.location.href = 'login.html';
  },

  async query(table, { select = '*', filters = {}, order, limit, eq, gte, lte } = {}) {
    let url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    for (const [k, v] of Object.entries(filters)) url += `&${k}=${encodeURIComponent(v)}`;
    if (eq) for (const [k, v] of Object.entries(eq)) url += `&${k}=eq.${encodeURIComponent(v)}`;
    if (gte) for (const [k, v] of Object.entries(gte)) url += `&${k}=gte.${encodeURIComponent(v)}`;
    if (lte) for (const [k, v] of Object.entries(lte)) url += `&${k}=lte.${encodeURIComponent(v)}`;
    if (order) url += `&order=${order}`;
    if (limit) url += `&limit=${limit}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
    return res.json();
  },

  async insert(table, data) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}`;
    const res = await fetch(url, {
      method: 'POST', headers: { ...this.headers(), 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Insert failed: ${res.status}`);
    return res.json();
  },

  async update(table, id, data) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
    const res = await fetch(url, {
      method: 'PATCH', headers: { ...this.headers(), 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Update failed: ${res.status}`);
    return res.json();
  },

  async delete(table, id) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.headers() });
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    return true;
  },

  async rpc(functionName, params = {}) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/rpc/${functionName}`;
    const res = await fetch(url, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(`RPC failed: ${res.status}`);
    return res.json();
  },

  // Execute raw SQL via Edge Function
  async executeSQL(sql) {
    const url = `${CONFIG.SUPABASE_URL}/functions/v1/execute-sql`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ sql })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`SQL execution failed: ${err}`);
    }
    return res.json();
  }
};

// ==================== REST API Connector (Auth Support) ====================
const RestAPIConnector = {
  // Simple in-memory cache for session tokens
  sessionCache: {},

  async fetchData(endpoint, authConfig = null, options = {}) {
    if (!authConfig || authConfig.auth_type === 'none') {
      return this._performFetch(endpoint, {}, options);
    }

    let headers = { ...options.headers };
    
    // Handle persistent auth (Basic/Bearer)
    if (authConfig.auth_type === 'basic') {
      const creds = btoa(`${authConfig.credentials.username}:${authConfig.credentials.password}`);
      headers['Authorization'] = `Basic ${creds}`;
    } else if (authConfig.auth_type === 'bearer') {
      headers['Authorization'] = `Bearer ${authConfig.credentials.username}`;
    } else if (authConfig.auth_type === 'custom_login') {
      // Handle session-based auth
      const token = await this._getCustomToken(authConfig);
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const responseData = await this._performFetch(endpoint, headers, options);
    
    // Support custom data path (e.g. "products" or "data.items")
    if (authConfig && authConfig.data_path) {
      const nested = this._getValueByPath(responseData, authConfig.data_path);
      if (nested) return nested;
    }

    return responseData;
  },

  async _getCustomToken(config) {
    const cacheKey = config.login_url;
    const cached = this.sessionCache[cacheKey];
    
    // Check if token exists and not expired (simple 1 hour TTL for now)
    if (cached && (Date.now() - cached.timestamp < 3600000)) {
      return cached.token;
    }

    console.log(`Authenticating with ${config.login_url}...`);
    try {
      // Build payload by replacing placeholders
      let payloadStr = config.login_payload || '{}';
      payloadStr = payloadStr.replace(/\{\{username\}\}/g, config.credentials.username)
                             .replace(/\{\{password\}\}/g, config.credentials.password);
      
      const res = await fetch(config.login_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr
      });

      if (!res.ok) throw new Error(`Login failed with status ${res.status}`);
      const data = await res.json();
      
      // Extract token using path (e.g. "data.access_token")
      const token = this._getValueByPath(data, config.token_path);
      if (!token) throw new Error(`Token not found at path: ${config.token_path}`);

      this.sessionCache[cacheKey] = { token, timestamp: Date.now() };
      return token;
    } catch (err) {
      console.error('REST API Auth Error:', err);
      return null;
    }
  },

  async _performFetch(endpoint, headers = {}, options = {}) {
    const res = await fetch(endpoint, {
      ...options,
      headers: { ...headers, ...options.headers }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API Error ${res.status}: ${errText.substring(0, 100)}`);
    }

    return res.json();
  },

  _getValueByPath(obj, path) {
    if (!path) return null;
    return path.split('.').reduce((o, i) => (o ? o[i] : null), obj);
  }
};

// ==================== Gemini API Client ====================
const GeminiAPI = {
  currentKeyIndex: 0,
  currentModelIndex: 0,

  async generate(systemPrompt, userMessage, temperature = 0.2, retries = 0) {
    const rawKeys = CONFIG.GEMINI_API_KEY;
    if (!rawKeys) throw new Error('GEMINI_API_KEY belum dikonfigurasi. Admin silakan isi di CMS → Konfigurasi Bot.');

    const rawModels = CONFIG.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

    // Dukungan multiple API Key yang dipisah koma untuk rotasi (Load Balancing)
    const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
    if (this.currentKeyIndex >= apiKeys.length) this.currentKeyIndex = 0;
    
    // Dukungan multiple Model yang dipisah koma untuk Fallback
    const models = rawModels.split(',').map(m => m.trim()).filter(Boolean);
    if (this.currentModelIndex >= models.length) this.currentModelIndex = 0;

    const apiKey = apiKeys[this.currentKeyIndex];
    const model = models[this.currentModelIndex];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      // Fitur Auto-Retry & Rotation jika terkena Rate Limit (429)
      const maxRetries = Math.max(apiKeys.length, models.length) * 2;
      if (res.status === 429 && (apiKeys.length > 1 || models.length > 1) && retries < maxRetries) {
        
        // Pindah model terlebih dahulu. Jika model habis, baru pindah API Key.
        this.currentModelIndex++;
        if (this.currentModelIndex >= models.length) {
          this.currentModelIndex = 0;
          this.currentKeyIndex = (this.currentKeyIndex + 1) % apiKeys.length;
        }

        console.warn(`Limit API tercapai. Mencoba ulang dengan model '${models[this.currentModelIndex]}' dan key #${this.currentKeyIndex}...`);
        return this.generate(systemPrompt, userMessage, temperature, retries + 1);
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${err.error?.message || res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const tokens = data.usageMetadata?.totalTokenCount || 0;
    return { text, tokens };
  }
};

// ==================== Context Builder ====================
const ContextBuilder = {
  async buildSystemPrompt(botConfig, sources, schemaRegistry, glossary, examples, chatHistory) {
    const botName = botConfig.bot_name || 'DataBot';
    const basePrompt = botConfig.system_prompt || 'Kamu adalah analis data profesional.';

    // Build data sources context
    const sourcesCtx = sources.filter(s => s.is_active).map(s =>
      `- ${s.name} (tipe: ${s.source_type}${s.table_name ? ', tabel: ' + s.table_name : ''}${s.api_endpoint ? ', endpoint: ' + s.api_endpoint : ''}): ${s.description || ''}`
    ).join('\n');

    // Build schema context
    const schemaCtx = schemaRegistry.map(col =>
      `  - ${col.column_name} (${col.column_type}): ${col.description}${col.sample_values?.length ? ' | Contoh: ' + col.sample_values.join(', ') : ''}`
    ).join('\n');

    // Build glossary context
    const glossaryCtx = glossary.map(g => `- "${g.term}": ${g.definition}`).join('\n');

    // Build few-shot examples
    const examplesCtx = examples.filter(e => e.is_active).slice(0, 5).map(e =>
      `Pertanyaan: "${e.question}"\nSQL: ${e.sql_answer}`
    ).join('\n\n');

    // Build conversation history
    const historyCtx = chatHistory.slice(-5).map(m =>
      `${m.role === 'user' ? 'Pengguna' : 'Asisten'}: ${m.content.substring(0, 300)}`
    ).join('\n');

    return `Kamu adalah analis data profesional bernama ${botName}.
${basePrompt}

## Sumber Data yang Tersedia:
${sourcesCtx || 'Belum ada sumber data yang dikonfigurasi.'}

## Schema Tabel:
${schemaCtx || 'Belum ada schema yang didaftarkan.'}

## Kamus Istilah Domain:
${glossaryCtx || 'Belum ada istilah domain.'}

## Contoh Query yang Benar:
${examplesCtx || 'Belum ada contoh.'}

## Riwayat Percakapan Terakhir:
${historyCtx || 'Tidak ada riwayat.'}

## Instruksi Wajib (BACA DENGAN TELITI):
1. Analisis pertanyaan pengguna dan identifikasi sumber data yang relevan.
2. Baik sumber tipe 'supabase_table' maupun 'rest_api', Anda WAJIB menghasilkan kueri SQL (hanya SELECT) di field 'sql'.
3. Khusus untuk tipe 'rest_api': Anda HARUS mengembalikan URL endpoint di field 'api_endpoint'. Dan di dalam string 'sql' Anda, gunakan karakter tanda tanya (?) sebagai nama tabel (contoh: "SELECT nama_kabupaten_kota, sum(jumlah_korban) AS total FROM ? GROUP BY nama_kabupaten_kota ORDER BY total DESC LIMIT 5").
4. Anda HARUS mengembalikan ARRAY "charts" berisi 2 sampai 5 objek chart yang menggambarkan data dari berbagai sudut pandang. Setiap chart memiliki SQL-nya masing-masing (bisa sama atau berbeda). Contoh sudut pandang:
   - Tren waktu (line/area) — jika ada kolom waktu/tanggal/tahun/bulan
   - Distribusi/proporsi (pie/doughnut/donut) — komposisi per kategori
   - Ranking/perbandingan (bar/bar_horizontal) — item teratas/terbawah
   - Perbandingan kelompok (stacked_bar) — multi-kategori
   - Korelasi (scatter) — hubungan antar 2 variabel numerik (jika relevan)
5. Panduan pemilihan chart_type per objek:
   - "line"            → Tren data sepanjang waktu (time series)
   - "area"            → Tren dengan area terisi, volume kumulatif
   - "bar"             → Perbandingan antar kategori
   - "bar_horizontal"  → Perbandingan dengan label panjang / banyak item
   - "stacked_bar"     → Komposisi per kategori bertumpuk
   - "doughnut" / "donut" → Distribusi proporsional (≤ 8 kategori)
   - "pie"             → Distribusi proporsional (≤ 6 kategori)
   - "radar"           → Perbandingan multi-dimensi / profil
   - "polar_area"      → Magnitude radial per kategori
   - "scatter"         → Korelasi 2 variabel numerik
6. Setiap objek chart memiliki field "sql" sendiri — boleh sama dengan SQL utama atau query berbeda yang lebih spesifik. Pastikan setiap SQL hanya SELECT dan aman.
7. Anda WAJIB merespon HANYA menggunakan format JSON ketat di bawah ini.

## Format Output (JSON ketat):
{
  "intent": "string — topik analisis",
  "sql": "SELECT utama untuk tabel data dan insight (ambil data seluas mungkin)",
  "api_endpoint": "URL rest API ATAU null",
  "charts": [
    {
      "chart_type": "bar",
      "chart_title": "Judul deskriptif chart",
      "chart_sql": "SELECT ... (query spesifik untuk chart ini, atau null untuk pakai sql utama)",
      "chart_x_axis": "nama_kolom_x",
      "chart_y_axis": "nama_kolom_y",
      "chart_group_by": "nama_kolom_group ATAU null"
    },
    {
      "chart_type": "pie",
      "chart_title": "Judul chart ke-2",
      "chart_sql": null,
      "chart_x_axis": "nama_kolom_x",
      "chart_y_axis": "nama_kolom_y",
      "chart_group_by": null
    }
  ],
  "needs_clarification": false,
  "clarification_question": null
}`;
  },

  buildInsightPrompt(queryResults, userQuestion) {
    return `Data hasil query (JSON):
${JSON.stringify(queryResults).substring(0, 4000)}

Pertanyaan pengguna: "${userQuestion}"

Berikan analisis dalam format JSON ketat:
{
  "summary": "Ringkasan insight utama (2-4 kalimat dalam Bahasa Indonesia, menjelaskan temuan penting)",
  "insights": [{"type": "positive|warning|info", "text": "..."}],
  "kpis": [{"label": "...", "value": "...", "delta": "...", "direction": "up|down|neutral"}],
  "recommendation": "Satu kalimat rekomendasi actionable"
}`;
  }
};

// ==================== SQL Validator ====================
function validateSQL(sql) {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith('SELECT')) return false;
  const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE'];
  for (const kw of forbidden) {
    // Match as whole word
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(upper)) return false;
  }
  return true;
}
