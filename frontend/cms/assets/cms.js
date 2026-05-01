// ==================== Supabase API Wrapper ====================
const Supabase = {
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
      'Authorization': authHeader,
      'Prefer': 'return=representation'
    };
  },
  async get(table, query = '') {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: this.headers() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Failed to fetch ${table}: ${err.message || res.statusText}`);
    }
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to insert into ${table}`);
    return res.json();
  },
  async update(table, id, data) {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH', headers: this.headers(), body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to update ${table}`);
    return res.json();
  },
  async delete(table, id) {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE', headers: this.headers()
    });
    if (!res.ok) throw new Error(`Failed to delete from ${table}`);
    return true;
  }
};

// ==================== CMS State & Core ====================
const CMS = {
  state: {
    page: 'dashboard',
    data: {}
  },
  
  init() {
    this.navigate('dashboard');
    document.documentElement.setAttribute('data-theme', localStorage.getItem('databot_theme') || 'dark');
    this.checkUnverifiedUsers();
  },

  async checkUnverifiedUsers() {
    try {
      const unverified = await Supabase.get('tb_profiles', 'is_verified=eq.false&select=id');
      const badge = document.getElementById('userBadge');
      if (badge) {
        badge.textContent = unverified.length;
        badge.style.display = unverified.length > 0 ? 'inline-block' : 'none';
      }
    } catch (e) { console.warn('Failed to fetch unverified users'); }
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('databot_theme', next);
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalFooter').innerHTML = footerHtml;
    document.getElementById('modalOverlay').style.display = 'flex';
  },

  closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
  },

  async confirm(message, onConfirm) {
    this.openModal('Konfirmasi', `<p>${message}</p>`, `
      <button class="btn btn-outline" onclick="CMS.closeModal()">Batal</button>
      <button class="btn btn-danger" id="confirmBtn">Ya, Lanjutkan</button>
    `);
    document.getElementById('confirmBtn').onclick = async () => {
      await onConfirm();
      this.closeModal();
    };
  },

  async navigate(page) {
    this.state.page = page;
    document.querySelectorAll('.cms-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
    
    // Close sidebar on mobile
    document.getElementById('cmsSidebar').classList.remove('open');
    
    const content = document.getElementById('cmsContent');
    content.innerHTML = '<div class="empty-state"><div class="skeleton" style="height: 200px"></div></div>';
    
    const titles = {
      dashboard: 'Dashboard', config: 'Konfigurasi Bot', sources: 'Sumber Data',
      schema: 'Schema & Kolom', examples: 'Prompt Examples', glossary: 'Glossary',
      history: 'Riwayat Chat', users: 'Manajemen User'
    };
    document.getElementById('cmsPageTitle').textContent = titles[page];

    try {
      if (page === 'dashboard') await this.renderDashboard();
      else if (page === 'config') await this.renderConfig();
      else if (page === 'sources') await this.renderSources();
      else if (page === 'schema') await this.renderSchema();
      else if (page === 'examples') await this.renderExamples();
      else if (page === 'glossary') await this.renderGlossary();
      else if (page === 'history') await this.renderHistory();
      else if (page === 'users') await this.renderUsers();
    } catch (err) {
      console.error(err);
      this.showToast('Gagal memuat halaman: ' + err.message, 'error');
      content.innerHTML = `<div class="error-message">Gagal memuat: ${err.message}</div>`;
    }
  },

  // ==================== Renderers ====================
  async renderDashboard() {
    const sources = await Supabase.get('tb_data_sources', 'select=id');
    const schemas = await Supabase.get('tb_schema_registry', 'select=id');
    const examples = await Supabase.get('tb_prompt_examples', 'select=id');
    const sessions = await Supabase.get('tb_chat_sessions', 'select=id');

    document.getElementById('cmsContent').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-value">${sources.length}</div>
          <div class="stat-label">Sumber Data</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-value">${schemas.length}</div>
          <div class="stat-label">Kolom Schema</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💡</div>
          <div class="stat-value">${examples.length}</div>
          <div class="stat-label">Prompt Examples</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💬</div>
          <div class="stat-value">${sessions.length}</div>
          <div class="stat-label">Sesi Chat</div>
        </div>
      </div>
      <div class="cms-chart-container" style="display:none">
        <canvas id="usageChart"></canvas>
      </div>
    `;
  },

  async renderConfig() {
    const configs = await Supabase.get('tb_bot_config', 'order=config_key.asc');
    this.state.data.configs = configs;

    // Wide fields (textarea/json) span full width; regular fields go into 2-column grid
    const wideFields = configs.filter(c => c.config_key === 'system_prompt' || c.config_type === 'json');
    const gridFields = configs.filter(c => c.config_key !== 'system_prompt' && c.config_type !== 'json');

    let html = '<div class="cms-form">';

    if (gridFields.length > 0) {
      html += '<div class="config-grid">';
      gridFields.forEach(c => {
        html += `
          <div class="form-group">
            <label class="form-label">${c.config_key}</label>
            ${this.renderInput(c)}
            <div class="form-hint">${c.description || ''}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    wideFields.forEach(c => {
      html += `
        <div class="form-group">
          <label class="form-label">${c.config_key}</label>
          ${this.renderInput(c)}
          <div class="form-hint">${c.description || ''}</div>
        </div>
      `;
    });

    html += `<button class="btn btn-primary" onclick="CMS.saveConfig()">Simpan Perubahan</button></div>`;
    document.getElementById('cmsContent').innerHTML = html;
  },

  renderInput(config) {
    const val = (config.config_value || '').replace(/"/g, '&quot;');
    if (config.config_type === 'boolean') {
      return `<select id="cfg_${config.id}" class="form-select">
        <option value="true" ${val === 'true' ? 'selected' : ''}>True</option>
        <option value="false" ${val === 'false' ? 'selected' : ''}>False</option>
      </select>`;
    } else if (config.config_type === 'number') {
      return `<input type="number" id="cfg_${config.id}" class="form-input" value="${val}">`;
    } else if (config.config_key === 'system_prompt' || config.config_type === 'json') {
      return `<textarea id="cfg_${config.id}" class="form-textarea code">${val}</textarea>`;
    } else if (config.config_key.includes('api_key') || config.config_key.includes('secret')) {
      return `<input type="password" id="cfg_${config.id}" class="form-input" value="${val}" placeholder="Masukkan API Key..." autocomplete="off">`;
    }
    return `<input type="text" id="cfg_${config.id}" class="form-input" value="${val}">`;
  },

  async saveConfig() {
    try {
      for (const c of this.state.data.configs) {
        const el = document.getElementById(`cfg_${c.id}`);
        if (el && el.value !== c.config_value) {
          await Supabase.update('tb_bot_config', c.id, { config_value: el.value });
        }
      }
      this.showToast('Konfigurasi berhasil disimpan', 'success');
      this.renderConfig();
    } catch (err) {
      this.showToast('Gagal menyimpan: ' + err.message, 'error');
    }
  },

  // === Sources ===
  async renderSources() {
    const sources = await Supabase.get('tb_data_sources', 'order=created_at.desc');
    this.state.data.sources = sources; // Store for lookup
    let html = `
      <div class="cms-table-toolbar">
        <input type="text" class="cms-search" placeholder="Cari sumber data...">
        <button class="btn btn-primary" onclick="CMS.editSource()">+ Tambah Source</button>
      </div>
      <div class="cms-table-wrapper"><table class="cms-table">
      <thead><tr><th>Nama</th><th>Tipe</th><th>Target</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
    `;
    sources.forEach(s => {
      html += `<tr>
        <td><strong>${s.name}</strong></td>
        <td><span class="tag">${s.source_type}</span></td>
        <td>${s.table_name || s.api_endpoint || '-'}</td>
        <td><span class="status-${s.is_active ? 'active' : 'inactive'}">${s.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="CMS.editSourceById('${s.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="CMS.deleteSource('${s.id}')">Hapus</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('cmsContent').innerHTML = html;
  },

  editSourceById(id) {
    const source = this.state.data.sources.find(s => s.id === id);
    this.editSource(source);
  },

  editSource(source = null) {
    const isNew = !source;
    source = source || { name: '', source_type: 'supabase_table', table_name: '', description: '', is_active: true };
    const isApi = source.source_type === 'rest_api';
    const auth = source.auth_config || { auth_type: 'none', data_path: '', login_url: '', login_payload: '', token_path: '', credentials: { username: '', password: '' } };
    
    const html = `
      <div class="cms-tabs">
        <button class="tab-btn active" onclick="CMS.switchSourceTab('basic')">Info Dasar</button>
        <button class="tab-btn" id="tab_auth_btn" style="display:${isApi?'block':'none'}" onclick="CMS.switchSourceTab('auth')">Autentikasi</button>
      </div>

      <div id="tab_basic" class="tab-content">
        <div class="form-group">
          <label class="form-label">Nama Sumber Data</label>
          <input type="text" id="src_name" class="form-input" value="${source.name}">
        </div>
        <div class="form-group">
          <label class="form-label">Tipe</label>
          <select id="src_type" class="form-select" onchange="CMS.handleSourceTypeChange(this.value)">
            <option value="supabase_table" ${!isApi?'selected':''}>Supabase Table</option>
            <option value="rest_api" ${isApi?'selected':''}>REST API</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Nama Tabel / Endpoint</label>
          <div style="display:flex; gap:10px;">
            <input type="text" id="src_target" class="form-input" value="${source.table_name || source.api_endpoint || ''}">
            <button id="api_test_btn" class="btn btn-outline" style="white-space:nowrap; display:${isApi?'block':'none'}" onclick="CMS.testAPI()">Cek API</button>
          </div>
          <div id="api_test_result" style="margin-top:10px; font-size:0.8rem;"></div>
        </div>
        <div class="form-group" id="group_data_path" style="display:${isApi?'block':'none'}">
          <label class="form-label">Path Data Array (Opsional)</label>
          <input type="text" id="src_data_path" class="form-input" value="${auth.data_path || ''}" placeholder="Contoh: products (kosongkan jika langsung array)">
          <div class="form-hint">Gunakan jika API membungkus data dalam objek (misal DummyJSON pakai 'products')</div>
        </div>
        <div class="form-group">
          <label class="form-label">Deskripsi untuk LLM</label>
          <textarea id="src_desc" class="form-textarea">${source.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="src_active" ${source.is_active !== false ? 'checked' : ''} style="width:16px; height:16px;">
            Aktifkan Sumber Data Ini
          </label>
        </div>
      </div>

      <div id="tab_auth" class="tab-content" style="display:none">
        <div class="form-group">
          <label class="form-label">Tipe Autentikasi</label>
          <select id="auth_type" class="form-select" onchange="CMS.handleAuthTypeChange(this.value)">
            <option value="none" ${auth.auth_type==='none'?'selected':''}>None (Public)</option>
            <option value="bearer" ${auth.auth_type==='bearer'?'selected':''}>Bearer Token</option>
            <option value="basic" ${auth.auth_type==='basic'?'selected':''}>Basic Auth</option>
            <option value="custom_login" ${auth.auth_type==='custom_login'?'selected':''}>Custom Login (POST)</option>
          </select>
        </div>

        <div id="auth_sec_login" style="display:${auth.auth_type==='custom_login'?'block':'none'}">
          <div class="form-group">
            <label class="form-label">Login URL</label>
            <input type="text" id="auth_login_url" class="form-input" value="${auth.login_url || ''}" placeholder="https://api.example.com/login">
          </div>
          <div class="form-group">
            <label class="form-label">Login Payload (JSON)</label>
            <textarea id="auth_login_payload" class="form-textarea code" placeholder='{"email": "{{username}}", "password": "{{password}}"}'>${auth.login_payload || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Token Path (Response JSON)</label>
            <input type="text" id="auth_token_path" class="form-input" value="${auth.token_path || ''}" placeholder="data.access_token">
          </div>
        </div>

        <div id="auth_sec_creds" style="display:${auth.auth_type!=='none'?'block':'none'}">
          <div class="form-group">
            <label class="form-label" id="label_user">Username / API Key</label>
            <input type="text" id="auth_user" class="form-input" value="${auth.credentials?.username || ''}">
          </div>
          <div class="form-group" id="group_pass" style="display:${auth.auth_type==='bearer'?'none':'block'}">
            <label class="form-label">Password / Secret</label>
            <input type="password" id="auth_pass" class="form-input" value="${auth.credentials?.password || ''}">
          </div>
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-outline" onclick="CMS.closeModal()">Batal</button>
      <button class="btn btn-primary" onclick="CMS.saveSource('${source.id || ''}')">Simpan</button>
    `;
    this.openModal(isNew ? 'Tambah Source' : 'Edit Source', html, footer);
  },
  switchSourceTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(tab === 'basic' ? 'info' : 'autentikasi')));
    document.getElementById('tab_basic').style.display = tab === 'basic' ? 'block' : 'none';
    document.getElementById('tab_auth').style.display = tab === 'auth' ? 'block' : 'none';
  },

  handleSourceTypeChange(type) {
    const isApi = type === 'rest_api';
    document.getElementById('api_test_btn').style.display = isApi ? 'block' : 'none';
    document.getElementById('tab_auth_btn').style.display = isApi ? 'block' : 'none';
    document.getElementById('group_data_path').style.display = isApi ? 'block' : 'none';
    if (!isApi) this.switchSourceTab('basic');
  },

  handleAuthTypeChange(type) {
    document.getElementById('auth_sec_login').style.display = type === 'custom_login' ? 'block' : 'none';
    document.getElementById('auth_sec_creds').style.display = type === 'none' ? 'none' : 'block';
    document.getElementById('group_pass').style.display = type === 'bearer' ? 'none' : 'block';
    document.getElementById('label_user').textContent = type === 'bearer' ? 'API Token / Key' : 'Username / API Key';
  },

  async testAPI() {
    const endpoint = document.getElementById('src_target').value;
    const resultDiv = document.getElementById('api_test_result');
    if (!endpoint) return resultDiv.innerHTML = '<span style="color:var(--color-danger)">Endpoint kosong!</span>';
    
    // Construct temporary config from form
    const authConfig = {
      auth_type: document.getElementById('auth_type').value,
      data_path: document.getElementById('src_data_path')?.value || '',
      login_url: document.getElementById('auth_login_url')?.value || '',
      login_payload: document.getElementById('auth_login_payload')?.value || '',
      token_path: document.getElementById('auth_token_path')?.value || '',
      credentials: {
        username: document.getElementById('auth_user')?.value || '',
        password: document.getElementById('auth_pass')?.value || ''
      }
    };

    resultDiv.innerHTML = '<span style="color:var(--text-muted)">Mencoba menghubungkan dengan autentikasi... ⏳</span>';
    
    try {
      // Use the RestAPIConnector we already built for the chat
      const rawData = await RestAPIConnector.fetchData(endpoint, authConfig);
      
      if (!Array.isArray(rawData) || rawData.length === 0) {
        resultDiv.innerHTML = `<span style="color:orange">API berhasil diakses, tapi data tidak dikenali sebagai array atau kosong.</span>`;
        return;
      }
      
      const sample = JSON.stringify(rawData[0], null, 2);
      resultDiv.innerHTML = `
        <div style="color:var(--color-success); margin-bottom:5px;">✅ Sukses Terhubung! Ditemukan ${rawData.length} data.</div>
        <div style="color:var(--text-muted); margin-bottom:5px;">Contoh baris pertama:</div>
        <pre style="background:var(--bg-primary); padding:8px; border-radius:4px; max-height:150px; overflow-y:auto; color:var(--color-primary);">${sample}</pre>
      `;
    } catch (e) {
      resultDiv.innerHTML = `<span style="color:var(--color-danger)">❌ Gagal: ${e.message}</span>`;
      console.error('Test API Error:', e);
    }
  },

  async saveSource(id) {
    const data = {
      name: document.getElementById('src_name').value,
      source_type: document.getElementById('src_type').value,
      description: document.getElementById('src_desc').value,
      is_active: document.getElementById('src_active').checked
    };
    
    if (data.source_type === 'supabase_table') {
      data.table_name = document.getElementById('src_target').value;
      data.auth_config = null;
    } else {
      data.api_endpoint = document.getElementById('src_target').value;
      data.auth_config = {
        auth_type: document.getElementById('auth_type').value,
        data_path: document.getElementById('src_data_path').value,
        login_url: document.getElementById('auth_login_url')?.value || '',
        login_payload: document.getElementById('auth_login_payload')?.value || '',
        token_path: document.getElementById('auth_token_path')?.value || '',
        credentials: {
          username: document.getElementById('auth_user')?.value || '',
          password: document.getElementById('auth_pass')?.value || ''
        }
      };
    }

    try {
      if (id) await Supabase.update('tb_data_sources', id, data);
      else await Supabase.insert('tb_data_sources', data);
      this.closeModal();
      this.showToast('Tersimpan', 'success');
      this.renderSources();
    } catch (e) { this.showToast(e.message, 'error'); }
  },

  async deleteSource(id) {
    this.confirm('Yakin ingin menghapus sumber data ini?', async () => {
      try {
        await Supabase.delete('tb_data_sources', id);
        this.showToast('Terhapus', 'success');
        this.renderSources();
      } catch (e) { this.showToast(e.message, 'error'); }
    });
  },

  // === Schema ===
  async renderSchema() {
    const schemas = await Supabase.get('tb_schema_registry', 'select=*,tb_data_sources(name)&order=source_id.asc,column_name.asc');
    const sources = await Supabase.get('tb_data_sources', 'select=id,name');
    this.state.data.sources = sources;
    this.state.data.schemas = schemas;
    
    let html = `
      <div class="cms-table-toolbar">
        <input type="text" class="cms-search" placeholder="Cari kolom...">
        <button class="btn btn-primary" onclick="CMS.editSchema()">+ Tambah Kolom</button>
      </div>
      <div class="cms-table-wrapper"><table class="cms-table">
      <thead><tr><th>Source</th><th>Kolom</th><th>Tipe</th><th>Deskripsi</th><th>Aksi</th></tr></thead><tbody>
    `;
    schemas.forEach(s => {
      html += `<tr>
        <td>${s.tb_data_sources?.name || '-'}</td>
        <td><strong>${s.column_name}</strong></td>
        <td><span class="tag">${s.column_type}</span></td>
        <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${s.description}">${s.description}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="CMS.editSchemaById('${s.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="CMS.deleteSchema('${s.id}')">Hapus</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('cmsContent').innerHTML = html;
  },

  editSchemaById(id) {
    const schema = this.state.data.schemas.find(s => s.id === id);
    this.editSchema(schema);
  },

  editSchema(s = null) {
    const isNew = !s;
    s = s || { source_id: '', column_name: '', column_type: 'TEXT', description: '', sample_values: [] };
    const srcOptions = this.state.data.sources.map(src => `<option value="${src.id}" ${src.id===s.source_id?'selected':''}>${src.name}</option>`).join('');
    
    const html = `
      <div class="form-group"><label class="form-label">Source</label><select id="sch_src" class="form-select">${srcOptions}</select></div>
      <div class="form-group"><label class="form-label">Nama Kolom</label><input type="text" id="sch_name" class="form-input" value="${s.column_name}"></div>
      <div class="form-group"><label class="form-label">Tipe Data</label>
        <select id="sch_type" class="form-select">
          <option value="TEXT" ${s.column_type==='TEXT'?'selected':''}>TEXT</option>
          <option value="INTEGER" ${s.column_type==='INTEGER'?'selected':''}>INTEGER</option>
          <option value="DECIMAL" ${s.column_type==='DECIMAL'?'selected':''}>DECIMAL</option>
          <option value="DATE" ${s.column_type==='DATE'?'selected':''}>DATE</option>
          <option value="BOOLEAN" ${s.column_type==='BOOLEAN'?'selected':''}>BOOLEAN</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Deskripsi</label><textarea id="sch_desc" class="form-textarea">${s.description}</textarea></div>
      <div class="form-group"><label class="form-label">Sample Values (pisahkan dengan koma)</label><input type="text" id="sch_samples" class="form-input" value="${(s.sample_values||[]).join(', ')}"></div>
    `;
    const footer = `<button class="btn btn-outline" onclick="CMS.closeModal()">Batal</button><button class="btn btn-primary" onclick="CMS.saveSchema('${s.id || ''}')">Simpan</button>`;
    this.openModal(isNew ? 'Tambah Kolom Schema' : 'Edit Schema', html, footer);
  },

  async saveSchema(id) {
    const data = {
      source_id: document.getElementById('sch_src').value,
      column_name: document.getElementById('sch_name').value,
      column_type: document.getElementById('sch_type').value,
      description: document.getElementById('sch_desc').value,
      sample_values: document.getElementById('sch_samples').value.split(',').map(x=>x.trim()).filter(Boolean)
    };
    try {
      if (id) await Supabase.update('tb_schema_registry', id, data);
      else await Supabase.insert('tb_schema_registry', data);
      this.closeModal(); this.showToast('Tersimpan', 'success'); this.renderSchema();
    } catch (e) { this.showToast(e.message, 'error'); }
  },

  async deleteSchema(id) {
    this.confirm('Hapus kolom schema ini?', async () => {
      await Supabase.delete('tb_schema_registry', id);
      this.renderSchema();
    });
  },

  // === Prompt Examples ===
  async renderExamples() {
    const examples = await Supabase.get('tb_prompt_examples', 'select=*,tb_data_sources(name)&order=created_at.desc');
    const sources = await Supabase.get('tb_data_sources', 'select=id,name');
    this.state.data.sources = sources;
    this.state.data.examples = examples;
    
    let html = `
      <div class="cms-table-toolbar">
        <button class="btn btn-primary" onclick="CMS.editExample()">+ Tambah Example</button>
      </div>
      <div class="cms-table-wrapper"><table class="cms-table">
      <thead><tr><th>Source</th><th>Pertanyaan</th><th>SQL</th><th>Aksi</th></tr></thead><tbody>
    `;
    examples.forEach(e => {
      html += `<tr>
        <td>${e.tb_data_sources?.name || '-'}</td>
        <td style="max-width:200px"><strong>${e.question}</strong></td>
        <td style="max-width:300px;font-family:var(--font-mono);font-size:0.75rem" title="${e.sql_answer}">${e.sql_answer}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="CMS.editExampleById('${e.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="CMS.deleteExample('${e.id}')">Hapus</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('cmsContent').innerHTML = html;
  },

  editExampleById(id) {
    const example = this.state.data.examples.find(e => e.id === id);
    this.editExample(example);
  },

  editExample(e = null) {
    const isNew = !e;
    e = e || { source_id: '', question: '', sql_answer: '', description: '' };
    const srcOptions = this.state.data.sources.map(src => `<option value="${src.id}" ${src.id===e.source_id?'selected':''}>${src.name}</option>`).join('');
    
    const html = `
      <div class="form-group"><label class="form-label">Source</label><select id="ex_src" class="form-select">${srcOptions}</select></div>
      <div class="form-group"><label class="form-label">Pertanyaan Natural</label><input type="text" id="ex_q" class="form-input" value="${e.question}"></div>
      <div class="form-group"><label class="form-label">SQL Answer</label><textarea id="ex_sql" class="form-textarea code">${e.sql_answer}</textarea></div>
      <div class="form-group"><label class="form-label">Keterangan</label><input type="text" id="ex_desc" class="form-input" value="${e.description || ''}"></div>
    `;
    const footer = `<button class="btn btn-outline" onclick="CMS.closeModal()">Batal</button><button class="btn btn-primary" onclick="CMS.saveExample('${e.id || ''}')">Simpan</button>`;
    this.openModal(isNew ? 'Tambah Example' : 'Edit Example', html, footer);
  },

  async saveExample(id) {
    const data = {
      source_id: document.getElementById('ex_src').value,
      question: document.getElementById('ex_q').value,
      sql_answer: document.getElementById('ex_sql').value,
      description: document.getElementById('ex_desc').value
    };
    try {
      if (id) await Supabase.update('tb_prompt_examples', id, data);
      else await Supabase.insert('tb_prompt_examples', data);
      this.closeModal(); this.showToast('Tersimpan', 'success'); this.renderExamples();
    } catch (e) { this.showToast(e.message, 'error'); }
  },

  async deleteExample(id) {
    this.confirm('Hapus example ini?', async () => {
      await Supabase.delete('tb_prompt_examples', id);
      this.renderExamples();
    });
  },

  // === Glossary ===
  async renderGlossary() {
    const glossary = await Supabase.get('tb_glossary', 'select=*,tb_data_sources(name)&order=term.asc');
    const sources = await Supabase.get('tb_data_sources', 'select=id,name');
    this.state.data.sources = sources;
    this.state.data.glossary = glossary;

    let html = `
      <div class="cms-table-toolbar">
        <button class="btn btn-primary" onclick="CMS.editGlossary()">+ Tambah Istilah</button>
      </div>
      <div class="cms-table-wrapper"><table class="cms-table">
      <thead><tr><th>Istilah</th><th>Definisi</th><th>Source Terkait</th><th>Aksi</th></tr></thead><tbody>
    `;
    glossary.forEach(g => {
      html += `<tr>
        <td><strong>${g.term}</strong></td>
        <td>${g.definition}</td>
        <td><span class="tag">${g.tb_data_sources?.name || 'Umum'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="CMS.editGlossaryById('${g.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="CMS.deleteGlossary('${g.id}')">Hapus</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('cmsContent').innerHTML = html;
  },

  editGlossaryById(id) {
    const item = this.state.data.glossary.find(g => g.id === id);
    this.editGlossary(item);
  },

  editGlossary(g = null) {
    const isNew = !g;
    g = g || { term: '', definition: '', source_id: '' };
    const srcOptions = `<option value="">-- Semua / Umum --</option>` + this.state.data.sources.map(src => `<option value="${src.id}" ${src.id===g.source_id?'selected':''}>${src.name}</option>`).join('');
    
    const html = `
      <div class="form-group"><label class="form-label">Istilah / Term</label><input type="text" id="gl_term" class="form-input" value="${g.term}"></div>
      <div class="form-group"><label class="form-label">Definisi</label><textarea id="gl_def" class="form-textarea">${g.definition}</textarea></div>
      <div class="form-group"><label class="form-label">Source Terkait (Opsional)</label><select id="gl_src" class="form-select">${srcOptions}</select></div>
    `;
    const footer = `<button class="btn btn-outline" onclick="CMS.closeModal()">Batal</button><button class="btn btn-primary" onclick="CMS.saveGlossary('${g.id || ''}')">Simpan</button>`;
    this.openModal(isNew ? 'Tambah Istilah' : 'Edit Istilah', html, footer);
  },

  async saveGlossary(id) {
    const data = {
      term: document.getElementById('gl_term').value,
      definition: document.getElementById('gl_def').value,
      source_id: document.getElementById('gl_src').value || null
    };
    try {
      if (id) await Supabase.update('tb_glossary', id, data);
      else await Supabase.insert('tb_glossary', data);
      this.closeModal(); this.showToast('Tersimpan', 'success'); this.renderGlossary();
    } catch (e) { this.showToast(e.message, 'error'); }
  },

  async deleteGlossary(id) {
    this.confirm('Hapus istilah ini?', async () => {
      await Supabase.delete('tb_glossary', id);
      this.renderGlossary();
    });
  },

  // === History ===
  async renderHistory() {
    try {
      // Get hidden session IDs from localStorage (UI-only, data stays in DB)
      const hiddenSessions = JSON.parse(localStorage.getItem('cms_hidden_sessions') || '[]');

      // 1. Get sessions
      const allSessions = await Supabase.get('tb_chat_sessions', 'select=*&order=last_active.desc&limit=100');
      const sessions = allSessions.filter(s => !hiddenSessions.includes(s.id));

      // 2. Get unique user IDs to fetch profiles
      const userIds = [...new Set(sessions.map(s => s.user_identifier).filter(Boolean))];
      let profileMap = {};

      if (userIds.length > 0) {
        const profiles = await Supabase.get('tb_profiles', `id=in.(${userIds.join(',')})&select=id,full_name,email`);
        profiles.forEach(p => { profileMap[p.id] = p; });
      }

      // 3. Get message counts
      let countMap = {};
      try {
        const msgCounts = await SupabaseAPI.executeSQL(`
          SELECT session_id, count(*) as count
          FROM tb_chat_messages
          WHERE session_id IN (${sessions.map(s => `'${s.id}'`).join(',')})
          GROUP BY session_id
        `);
        (msgCounts || []).forEach(row => { countMap[row.session_id] = row.count; });
      } catch (e) {
        console.warn('Failed to fetch message counts:', e);
      }

      const hiddenCount = hiddenSessions.length;
      let html = `
        <div class="cms-table-toolbar">
          <div class="form-hint">
            Menampilkan ${sessions.length} dari ${allSessions.length} riwayat chat.
            ${hiddenCount > 0 ? `<span style="color:var(--text-muted)"> (${hiddenCount} disembunyikan)</span>` : ''}
          </div>
          ${hiddenCount > 0 ? `<button class="btn btn-sm btn-outline" onclick="CMS.resetHiddenSessions()">Tampilkan Semua</button>` : ''}
        </div>
        <div class="cms-table-wrapper">
          <table class="cms-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Pesan</th>
                <th>Last Active</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>`;

      sessions.forEach(s => {
        const p = profileMap[s.user_identifier] || {};
        const userName = p.full_name || 'Anonymous';
        const userEmail = p.email || '-';
        const count = countMap[s.id] || 0;

        html += `<tr>
          <td>
            <div style="font-weight:600">${userName}</div>
            <div style="font-size:0.75rem; color:var(--text-muted)">${userEmail}</div>
          </td>
          <td><span class="tag">${count} pesan</span></td>
          <td style="font-size:0.85rem">${new Date(s.last_active).toLocaleString('id-ID')}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="CMS.viewSession('${s.id}')">Buka</button>
            <button class="btn btn-sm btn-outline" onclick="CMS.hideSession('${s.id}')" style="color:var(--text-muted)">Sembunyikan</button>
          </td>
        </tr>`;
      });
      html += '</tbody></table></div>';
      document.getElementById('cmsContent').innerHTML = html;
    } catch (err) {
      this.showToast('Gagal memuat riwayat: ' + err.message, 'error');
    }
  },

  async viewSession(id) {
    try {
      const messages = await Supabase.get('tb_chat_messages', `session_id=eq.${id}&order=created_at.asc`);
      let html = `<div class="chat-detail-container" style="display:flex;flex-direction:column;gap:12px;max-height:60vh;overflow-y:auto;padding-right:10px;">`;
      
      messages.forEach(m => {
        const isUser = m.role === 'user';
        const align = isUser ? 'flex-end' : 'flex-start';
        const bg = isUser ? 'rgba(59,130,246,0.1)' : 'var(--bg-tertiary)';
        const border = isUser ? 'rgba(59,130,246,0.2)' : 'var(--border-color)';
        const color = isUser ? 'var(--accent)' : 'var(--text-muted)';

        html += `
          <div style="align-self:${align}; max-width:85%; background:${bg}; padding:12px 16px; border-radius:12px; border:1px solid ${border}; box-shadow:var(--shadow-sm);">
            <div style="font-weight:bold; font-size:0.7rem; color:${color}; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">
              ${m.role === 'user' ? '👤 Anda' : '🤖 DataBot'}
            </div>
            <div style="font-size:0.9rem; line-height:1.5; color:var(--text-primary);">
              ${m.content || '<span style="font-style:italic;color:var(--text-muted)">[Visualisasi Data]</span>'}
            </div>
            ${m.sql_generated ? `
              <div style="margin-top:10px; padding:10px; background:#0f172a; border-radius:8px; border:1px solid #1e293b;">
                <div style="font-size:0.65rem; color:#94a3b8; margin-bottom:5px; font-family:var(--font-main);">SQL QUERY:</div>
                <pre style="margin:0; font-family:var(--font-mono); font-size:0.75rem; color:#38bdf8; white-space:pre-wrap;">${m.sql_generated}</pre>
              </div>
            ` : ''}
            <div style="font-size:0.65rem; color:var(--text-muted); margin-top:6px; text-align:right;">
              ${new Date(m.created_at).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })}
            </div>
          </div>
        `;
      });
      html += `</div>`;
      this.openModal('Transkrip Percakapan', html, `<button class="btn btn-primary" onclick="CMS.closeModal()">Tutup</button>`);
    } catch (err) {
      this.showToast('Gagal memuat detail: ' + err.message, 'error');
    }
  },

  async hideSession(id) {
    this.confirm('Sembunyikan sesi ini dari tampilan?\n\nData tetap tersimpan di database dan kuota user tetap dihitung.', () => {
      const hidden = JSON.parse(localStorage.getItem('cms_hidden_sessions') || '[]');
      if (!hidden.includes(id)) {
        hidden.push(id);
        localStorage.setItem('cms_hidden_sessions', JSON.stringify(hidden));
      }
      this.renderHistory();
      this.showToast('Sesi berhasil disembunyikan dari tampilan', 'success');
    });
  },

  resetHiddenSessions() {
    localStorage.removeItem('cms_hidden_sessions');
    this.renderHistory();
    this.showToast('Semua sesi kini ditampilkan kembali', 'info');
  },

  // ==================== User Management ====================
  async renderUsers() {
    const users = await Supabase.get('tb_profiles', 'order=created_at.desc');
    this.state.data.users = users;

    let html = `
      <div class="cms-table-container">
        <table class="cms-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Role</th>
              <th>Limit Chat</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
    `;

    users.forEach(u => {
      const isPending = !u.is_verified;
      const statusClass = u.is_verified ? 'badge-success' : 'badge-warning';
      const statusText = u.is_verified ? 'Terverifikasi' : 'Pending';
      
      html += `
        <tr>
          <td><strong>${u.full_name || 'Anonymous'}</strong></td>
          <td>${u.email || '-'}</td>
          <td><span class="cms-badge" style="background:var(--bg-tertiary); color:var(--text-secondary)">${u.role}</span></td>
          <td><span class="tag">${u.chat_limit === -1 ? 'Unlimited' : (u.chat_limit || 20) + ' / hari'}</span></td>
          <td><span class="cms-badge ${statusClass}">${statusText}</span></td>
          <td style="white-space:nowrap;">
            <button class="btn btn-outline btn-sm" onclick="CMS.manageUser('${u.id}')">Edit</button>
            <button class="btn btn-outline btn-sm" onclick="CMS.resetUserPassword('${u.id}', '${(u.email || '').replace(/'/g, "\\'")}')" title="Reset Password">🔑</button>
            ${isPending ? `<button class="btn btn-primary btn-sm" onclick="CMS.verifyUser('${u.id}', true)">Verifikasi</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="CMS.deleteUser('${u.id}', '${(u.email || '').replace(/'/g, "\\'")}')" title="Hapus User">✕</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    document.getElementById('cmsContent').innerHTML = html;
  },

  async verifyUser(userId, status) {
    try {
      await Supabase.update('tb_profiles', userId, { is_verified: status });
      this.showToast(status ? 'User berhasil diverifikasi' : 'Verifikasi dibatalkan', 'success');
      this.renderUsers();
      this.checkUnverifiedUsers();
    } catch (err) {
      this.showToast('Gagal mengubah status: ' + err.message, 'error');
    }
  },

  async resetUserPassword(userId, email) {
    const html = `
      <p style="margin-bottom:var(--space-md); color:var(--text-secondary);">Reset password untuk: <strong>${email}</strong></p>
      <div class="form-group">
        <label class="form-label">Password Baru</label>
        <input type="password" id="reset_new_pwd" class="form-input" placeholder="Minimal 6 karakter">
      </div>
      <div class="form-group">
        <label class="form-label">Konfirmasi Password</label>
        <input type="password" id="reset_conf_pwd" class="form-input" placeholder="Ulangi password">
      </div>
    `;
    const footer = `
      <button class="btn btn-outline" onclick="CMS.closeModal()">Batal</button>
      <button class="btn btn-primary" onclick="CMS.executeResetPassword('${userId}')">Reset Password</button>
    `;
    this.openModal('Reset Password User', html, footer);
  },

  async executeResetPassword(userId) {
    const pwd = document.getElementById('reset_new_pwd').value;
    const conf = document.getElementById('reset_conf_pwd').value;
    if (pwd.length < 6) return this.showToast('Password minimal 6 karakter', 'error');
    if (pwd !== conf) return this.showToast('Konfirmasi password tidak cocok', 'error');

    try {
      // Call Supabase Admin API via Edge Function
      const sessionStr = localStorage.getItem('sb-pgyltungxodpdoacoizk-auth-token');
      const session = JSON.parse(sessionStr);
      const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/admin-reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId, newPassword: pwd })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Gagal reset password');
      }
      
      this.showToast('Password berhasil direset', 'success');
      this.closeModal();
    } catch (err) {
      this.showToast('Gagal reset password: ' + err.message, 'error');
    }
  },

  async deleteUser(userId, email) {
    this.confirm(`Hapus user "${email}"? Data profil akan dihapus permanen.`, async () => {
      try {
        await Supabase.delete('tb_profiles', userId);
        this.showToast('User berhasil dihapus', 'success');
        this.renderUsers();
        this.checkUnverifiedUsers();
      } catch (err) {
        this.showToast('Gagal menghapus user: ' + err.message, 'error');
      }
    });
  },

  async manageUser(userId) {
    const user = this.state.data.users.find(u => u.id === userId);
    if (!user) return;

    const html = `
      <div class="form-group">
        <label class="form-label">Nama Lengkap</label>
        <input type="text" id="edit_user_name" class="form-input" value="${user.full_name || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select id="edit_user_role" class="form-select">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Limit Chat Harian</label>
        <input type="number" id="edit_user_limit" class="form-input" value="${user.chat_limit || 20}">
        <div class="form-hint">Jumlah maksimum pertanyaan per hari. Gunakan <strong>-1</strong> untuk akses Tanpa Batas (Unlimited).</div>
      </div>
    `;

    const footer = `
      <button class="btn btn-outline" onclick="CMS.closeModal()">Batal</button>
      <button class="btn btn-primary" onclick="CMS.saveUserProfile('${userId}')">Simpan Perubahan</button>
    `;

    this.openModal('Kelola User: ' + (user.email), html, footer);
  },

  async saveUserProfile(userId) {
    const data = {
      full_name: document.getElementById('edit_user_name').value,
      role: document.getElementById('edit_user_role').value,
      chat_limit: parseInt(document.getElementById('edit_user_limit').value) || 20
    };

    try {
      await Supabase.update('tb_profiles', userId, data);
      this.showToast('Profil user berhasil diperbarui', 'success');
      this.closeModal();
      this.renderUsers();
    } catch (err) {
      this.showToast('Gagal menyimpan: ' + err.message, 'error');
    }
  },

  openChangePasswordModal() {
    const html = `
      <div class="form-group">
        <label class="form-label">Password Baru</label>
        <input type="password" id="new_password" class="form-input" placeholder="Minimal 6 karakter">
      </div>
      <div class="form-group">
        <label class="form-label">Konfirmasi Password</label>
        <input type="password" id="confirm_password" class="form-input">
      </div>
    `;

    const footer = `
      <button class="btn btn-outline" onclick="CMS.closeModal()">Batal</button>
      <button class="btn btn-primary" onclick="CMS.changePassword()">Update Password</button>
    `;

    this.openModal('Ubah Password Saya', html, footer);
  },

  async changePassword() {
    const pass = document.getElementById('new_password').value;
    const confirm = document.getElementById('confirm_password').value;

    if (pass.length < 6) return this.showToast('Password minimal 6 karakter', 'error');
    if (pass !== confirm) return this.showToast('Konfirmasi password tidak cocok', 'error');

    try {
      // Create local client to access auth
      const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      const { error } = await supabaseClient.auth.updateUser({ password: pass });
      
      if (error) throw error;
      
      this.showToast('Password berhasil diperbarui', 'success');
      this.closeModal();
    } catch (err) {
      this.showToast('Gagal update password: ' + err.message, 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => CMS.init());
