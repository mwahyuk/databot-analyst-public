// ==================== DataBot Chat Controller ====================
const DataBot = {
  state: {
    botConfig: {},
    sources: [],
    schema: [],
    examples: [],
    glossary: [],
    sessions: [],
    currentSession: null,
    chatHistory: [],
    isProcessing: false,
    showSQL: false,
    chatLimit: 20,
    chatUsage: 0,
    userRole: 'user',
  },

  elements: {},

  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadUserProfile();
    await this.loadConfig();
    await this.loadSources();
    await this.loadSchemaAndMeta();
    await this.loadUserUsage();
    this.loadSessions();
    this.renderSuggestions();
    this.renderSources();
  },

  async loadUserProfile() {
    try {
      const sessionStr = localStorage.getItem('sb-pgyltungxodpdoacoizk-auth-token');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        const user = session.user;
        if (user && user.user_metadata && user.user_metadata.full_name) {
          this.elements.welcomeTitle.textContent = `Halo, ${user.user_metadata.full_name.split(' ')[0]}!`;
        }
      }
    } catch (e) {
      console.warn('Failed to load user profile for welcome message');
    }
  },

  cacheElements() {
    this.elements = {
      chatInput: document.getElementById('chatInput'),
      sendBtn: document.getElementById('sendBtn'),
      chatMessages: document.getElementById('chatMessages'),
      chatArea: document.getElementById('chatArea'),
      welcomeScreen: document.getElementById('welcomeScreen'),
      suggestionGrid: document.getElementById('suggestionGrid'),
      sourceList: document.getElementById('sourceList'),
      sessionList: document.getElementById('sessionList'),
      sidebar: document.getElementById('sidebar'),
      themeToggle: document.getElementById('themeToggle'),
      newChatBtn: document.getElementById('newChatBtn'),
      sidebarToggle: document.getElementById('sidebarToggle'),
      mobileMenuBtn: document.getElementById('mobileMenuBtn'),
      welcomeTitle: document.getElementById('welcomeTitle'),
      welcomeMessage: document.getElementById('welcomeMessage'),
      welcomeAvatar: document.getElementById('welcomeAvatar'),
      botAvatar: document.getElementById('botAvatar'),
      botNameSidebar: document.getElementById('botNameSidebar'),
      toastContainer: document.getElementById('toastContainer'),
      logoutBtn: document.getElementById('logoutBtn'),
      changePasswordBtn: document.getElementById('changePasswordBtn'),
      usageTextSidebar: document.getElementById('usageTextSidebar'),
      usageTextMain: document.getElementById('usageTextMain'),
      clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    };
  },

  bindEvents() {
    const { chatInput, sendBtn, themeToggle, newChatBtn, sidebarToggle, mobileMenuBtn } = this.elements;

    chatInput.addEventListener('input', () => {
      sendBtn.disabled = !chatInput.value.trim();
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendBtn.addEventListener('click', () => this.sendMessage());

    themeToggle.addEventListener('click', () => {
      const current = getTheme();
      setTheme(current === 'dark' ? 'light' : 'dark');
    });

    if (this.elements.changePasswordBtn) {
      this.elements.changePasswordBtn.addEventListener('click', () => this.openChangePasswordModal());
    }

    newChatBtn.addEventListener('click', () => this.startNewChat());

    sidebarToggle.addEventListener('click', () => {
      this.elements.sidebar.classList.toggle('collapsed');
    });

    mobileMenuBtn.addEventListener('click', () => {
      this.elements.sidebar.classList.toggle('open');
    });

    if (this.elements.clearHistoryBtn) {
      this.elements.clearHistoryBtn.addEventListener('click', () => this.clearAllHistory());
    }

    if (this.elements.logoutBtn) {
      this.elements.logoutBtn.addEventListener('click', () => SupabaseAPI.logout());
    }
  },

  // ==================== Data Loading ====================
  async loadConfig() {
    try {
      const configs = await SupabaseAPI.query('tb_bot_config', { filters: { is_active: 'eq.true' } });
      const map = {};
      configs.forEach(c => { map[c.config_key] = c.config_value; });
      this.state.botConfig = map;

      // Apply config to UI
      const { welcomeTitle, welcomeMessage, welcomeAvatar, botAvatar, botNameSidebar } = this.elements;
      welcomeTitle.textContent = map.bot_name || 'DataBot';
      welcomeMessage.textContent = map.welcome_message || 'Halo! Silakan ajukan pertanyaan.';
      welcomeAvatar.textContent = map.bot_avatar || '🤖';
      botAvatar.textContent = map.bot_avatar || '🤖';
      botNameSidebar.textContent = map.bot_name || 'DataBot';
      this.state.showSQL = map.enable_sql_display === 'true';

      // Apply theme from config if user hasn't set preference
      if (!localStorage.getItem('databot_theme') && map.chart_theme) {
        setTheme(map.chart_theme);
      }

      // Load Gemini settings from database config
      if (map.gemini_api_key) CONFIG.GEMINI_API_KEY = map.gemini_api_key;
      if (map.gemini_model) CONFIG.GEMINI_MODEL = map.gemini_model;
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  },

  async loadSources() {
    try {
      this.state.sources = await SupabaseAPI.query('tb_data_sources');
      this.state.sources.forEach(s => s._active = s.is_active !== false);
    } catch (err) {
      console.error('Failed to load sources:', err);
    }
  },

  async loadUserUsage() {
    try {
      const sessionStr = localStorage.getItem('sb-pgyltungxodpdoacoizk-auth-token');
      if (!sessionStr) return;
      const session = JSON.parse(sessionStr);
      const userId = session.user.id;

      // Get limit from profile
      const profiles = await SupabaseAPI.query('tb_profiles', { eq: { id: userId } });
      if (profiles && profiles.length > 0) {
        const limit = profiles[0].chat_limit;
        this.state.chatLimit = (limit !== undefined && limit !== null) ? limit : 20;
        this.state.userRole = profiles[0].role || 'user';
        this.state.isVerified = profiles[0].is_verified !== false;
      }

      // Hide clear history button if not admin
      if (this.state.userRole !== 'admin' && this.elements.clearHistoryBtn) {
        this.elements.clearHistoryBtn.style.display = 'none';
      }

      // Count usage from chat logs (tb_chat_messages) instead of a separate counter
      this.state.chatUsage = await SupabaseAPI.rpc('count_user_daily_chats', { p_user_id: userId }) || 0;
      
      this.updateUsageUI();
    } catch (e) {
      console.warn('Failed to load user usage:', e);
    }
  },

  updateUsageUI() {
    const isAdmin = this.state.userRole === 'admin';
    const isUnlimited = this.state.chatLimit === -1;
    const isOverLimit = !isAdmin && !isUnlimited && (this.state.chatUsage >= this.state.chatLimit);
    const displayLimit = isUnlimited ? '∞' : this.state.chatLimit;
    const usageStr = `Kuota: ${this.state.chatUsage} / ${displayLimit}`;

    const updateEl = (el) => {
      if (!el) return;
      el.textContent = usageStr;
      
      if (isOverLimit) {
        el.style.color = 'var(--danger)';
      } else if (isAdmin || isUnlimited) {
        el.style.color = 'var(--accent)';
        el.textContent += ' (Unlimited)';
      } else {
        el.style.color = 'var(--text-muted)';
      }
    };

    updateEl(this.elements.usageTextSidebar);
    updateEl(this.elements.usageTextMain);

    if (this.elements.chatInput) {
      if (isOverLimit) {
        this.elements.chatInput.placeholder = 'Kuota harian Anda sudah habis.';
        this.elements.chatInput.disabled = true;
        this.elements.sendBtn.disabled = true;
      } else {
        this.elements.chatInput.placeholder = 'Ketik pertanyaan tentang data Anda...';
        this.elements.chatInput.disabled = false;
      }
    }
  },

  async incrementUsage() {
    // Just update locally for live feedback
    // The persistent count is based on tb_chat_messages logs saved in saveToSupabase
    this.state.chatUsage++;
    this.updateUsageUI();
  },

  async loadSchemaAndMeta() {
    try {
      this.state.schema = await SupabaseAPI.query('tb_schema_registry');
      this.state.examples = await SupabaseAPI.query('tb_prompt_examples', { filters: { is_active: 'eq.true' } });
      this.state.glossary = await SupabaseAPI.query('tb_glossary');
    } catch (err) {
      console.error('Failed to load schema/meta:', err);
    }
  },

  loadSessions() {
    const saved = localStorage.getItem('databot_sessions');
    if (saved) {
      try { this.state.sessions = JSON.parse(saved); } catch { this.state.sessions = []; }
    }
    this.renderSessions();
  },

  saveSessions() {
    // Keep only last 20 sessions
    const sessions = this.state.sessions.slice(-20);
    localStorage.setItem('databot_sessions', JSON.stringify(sessions));
  },

  // ==================== Rendering ====================
  renderSuggestions() {
    const grid = this.elements.suggestionGrid;
    let prompts = [
      'Tampilkan analisis lengkap jumlah unjuk rasa per wilayah', 
      'Bagaimana tren unjuk rasa dari tahun ke tahun?', 
      'Bandingkan jumlah korban kekerasan antar provinsi', 
      'Tampilkan ringkasan data unjuk rasa dan korban'
    ];
    try {
      const cfg = this.state.botConfig.suggestion_prompts;
      if (cfg) prompts = JSON.parse(cfg);
    } catch {}

    grid.innerHTML = prompts.map(p => `
      <div class="suggestion-card" onclick="DataBot.handleSuggestion('${p.replace(/'/g, "\\'")}')">${p}</div>
    `).join('');
  },

  renderSources() {
    const isAdmin = this.state.userRole === 'admin';
    this.elements.sourceList.innerHTML = this.state.sources.map((s, i) => {
      const isActive = s._active !== false;
      const clickAttr = isAdmin ? `onclick="DataBot.toggleSource(${i})"` : '';
      const cursorStyle = isAdmin ? 'cursor:pointer' : 'cursor:default';
      
      return `
        <div class="source-item ${isActive ? 'active-source' : 'inactive-source'}" 
             ${clickAttr} 
             style="${cursorStyle}; display:flex; align-items:flex-start; opacity: ${isActive ? '1' : '0.6'}; transition: 0.2s;" 
             title="${isAdmin ? 'Klik untuk mengaktifkan/menonaktifkan' : 'Status sumber data'}">
          <span class="source-dot" style="background: ${isActive ? '#4ade80' : '#ef4444'}; box-shadow: 0 0 5px ${isActive ? '#4ade80' : '#ef4444'};"></span>
          <span class="source-label" style="text-decoration: ${isActive ? 'none' : 'line-through'};">${s.name}</span>
        </div>
      `;
    }).join('') || '<div style="color:var(--text-muted);font-size:0.8rem;padding:8px;">Belum ada sumber data</div>';
  },

  async toggleSource(index) {
    if (this.state.userRole !== 'admin') return;
    const src = this.state.sources[index];
    if (!src) return;

    const newStatus = !src._active;
    try {
      await SupabaseAPI.update('tb_data_sources', src.id, { is_active: newStatus });
      src._active = newStatus;
      src.is_active = newStatus;
      this.renderSources();
      this.showToast(`Sumber "${src.name}" ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`, newStatus ? 'success' : 'warning');
    } catch (err) {
      console.error('Toggle source failed:', err);
      this.showToast('Gagal mengubah status sumber data', 'error');
    }
  },

  renderSessions() {
    this.elements.sessionList.innerHTML = this.state.sessions.map((s, i) => `
      <div class="session-item ${s.id === this.state.currentSession?.id ? 'active' : ''}" onclick="DataBot.loadSession(${i})" title="${s.title || 'Chat ' + (i + 1)}">
        <span class="session-icon">💬</span>
        <span class="session-title">${s.title || 'Chat ' + (i + 1)}</span>
        <button class="session-delete-btn" onclick="event.stopPropagation(); DataBot.deleteSessionFromSidebar(${i})" title="Hapus sesi ini">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('') || '<div style="color:var(--text-muted);font-size:0.8rem;padding:8px;" class="session-empty">Belum ada riwayat</div>';
  },

  addMessageToUI(role, content, responseContent = null) {
    const msg = document.createElement('div');
    msg.className = `message ${role === 'user' ? 'user' : 'bot'}`;

    const avatar = role === 'user' ? '👤' : (this.state.botConfig.bot_avatar || '🤖');
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    msg.innerHTML = `<div class="message-avatar">${avatar}</div>`;
    const body = document.createElement('div');
    body.className = 'message-body';

    if (role === 'user') {
      contentDiv.textContent = content;
      body.appendChild(contentDiv);
    } else if (responseContent) {
      contentDiv.innerHTML = '';
      body.appendChild(contentDiv);
      Renderer.renderBotResponse(responseContent, contentDiv);
    } else {
      contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(content) : content.replace(/\n/g, '<br>');
      body.appendChild(contentDiv);
    }

    msg.appendChild(body);
    this.elements.chatMessages.appendChild(msg);
    this.scrollToBottom();
  },

  scrollToBottom() {
    setTimeout(() => {
      this.elements.chatArea.scrollTop = this.elements.chatArea.scrollHeight;
    }, 50);
  },

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  // ==================== Chat Logic ====================
  handleSuggestion(text) {
    this.elements.chatInput.value = text;
    this.elements.sendBtn.disabled = false;
    this.sendMessage();
  },

  startNewChat() {
    this.state.currentSession = null;
    this.state.chatHistory = [];
    this.elements.chatMessages.innerHTML = '';
    this.elements.welcomeScreen.style.display = 'flex';
    this.elements.chatArea.style.display = 'none';
    this.elements.chatInput.value = '';
    this.elements.sendBtn.disabled = true;
    this.renderSessions();
    // Close mobile sidebar
    this.elements.sidebar.classList.remove('open');
  },

  clearAllHistory() {
    if (confirm('Hapus semua riwayat dari tampilan?\n\nRiwayat percakapan Anda tetap tersimpan di server dan kuota chat tetap dihitung.')) {
      localStorage.removeItem('databot_sessions');
      this.state.sessions = [];
      this.state.currentSession = null;
      this.startNewChat();
      this.showToast('Riwayat berhasil dihapus dari tampilan', 'success');
    }
  },

  deleteSessionFromSidebar(index) {
    const deleted = this.state.sessions[index];
    this.state.sessions.splice(index, 1);
    // If the deleted session was active, go back to welcome screen
    if (deleted && this.state.currentSession && deleted.id === this.state.currentSession.id) {
      this.state.currentSession = null;
      this.state.chatHistory = [];
      this.elements.chatMessages.innerHTML = '';
      this.elements.welcomeScreen.style.display = 'flex';
      this.elements.chatArea.style.display = 'none';
    }
    this.saveSessions();
    this.renderSessions();
  },

  async retryLastMessage() {
    if (this.state.isProcessing) return;
    const lastUserMsg = this.state.chatHistory.slice().reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    
    // Remove the last bot error message from UI
    const messages = this.elements.chatMessages.querySelectorAll('.message.bot');
    if (messages.length > 0) {
      const lastBotBubble = messages[messages.length - 1];
      if (lastBotBubble.innerHTML.includes('Terjadi kesalahan')) {
         lastBotBubble.remove();
         // Remove error message from state history
         this.state.chatHistory.pop();
         if (this.state.currentSession && this.state.currentSession.messages.length > 0) {
           this.state.currentSession.messages.pop();
         }
      }
    }
    
    this.state.isProcessing = true;
    this.elements.welcomeScreen.style.display = 'none';
    this.elements.chatArea.style.display = 'block';
    
    await this.processMessage(lastUserMsg.content);
  },

  loadSession(index) {
    const session = this.state.sessions[index];
    if (!session) return;
    this.state.currentSession = session;
    this.state.chatHistory = session.messages || [];

    // Show chat area
    this.elements.welcomeScreen.style.display = 'none';
    this.elements.chatArea.style.display = 'block';
    this.elements.chatMessages.innerHTML = '';

    // Render all messages
    session.messages.forEach(m => {
      if (m.role === 'user') {
        this.addMessageToUI('user', m.content);
      } else {
        this.addMessageToUI('bot', m.content, m.responseData);
      }
    });

    this.renderSessions();
    this.elements.sidebar.classList.remove('open');
  },

  async sendMessage() {
    const input = this.elements.chatInput;
    const message = input.value.trim();
    if (!message || this.state.isProcessing) return;

    // Check Chat Limit (Admin & -1 bypasses)
    const isOverLimit = this.state.userRole !== 'admin' && 
                        this.state.chatLimit !== -1 && 
                        this.state.chatUsage >= this.state.chatLimit;

    if (isOverLimit) {
      this.showToast('Kuota chat harian Anda sudah habis. Silakan hubungi admin.', 'error');
      return;
    }

    if (message.length < 3) { this.showToast('Pertanyaan terlalu pendek.', 'error'); return; }

    // Check Gemini API Key (loaded from database via CMS Konfigurasi Bot)
    if (!CONFIG.GEMINI_API_KEY) {
      this.showToast('Gemini API Key belum dikonfigurasi. Admin silakan isi melalui CMS → Konfigurasi Bot.', 'error');
      return;
    }

    this.state.isProcessing = true;
    input.value = '';
    input.style.height = 'auto';
    this.elements.sendBtn.disabled = true;

    // Update usage immediately in UI and Database
    this.incrementUsage();

    // Show chat area, hide welcome
    this.elements.welcomeScreen.style.display = 'none';
    this.elements.chatArea.style.display = 'block';

    // Create session if needed
    if (!this.state.currentSession) {
      this.state.currentSession = {
        id: crypto.randomUUID(),
        title: message.substring(0, 40) + (message.length > 40 ? '...' : ''),
        messages: [],
        createdAt: new Date().toISOString()
      };
      this.state.sessions.unshift(this.state.currentSession);
    }

    // Add user message
    this.addMessageToUI('user', message);
    this.state.chatHistory.push({ role: 'user', content: message });
    this.state.currentSession.messages.push({ role: 'user', content: message });

    await this.processMessage(message);
  },

  async processMessage(message) {
    // Show typing indicator
    this.elements.chatMessages.appendChild(Renderer.renderTypingIndicator());
    this.scrollToBottom();

    try {
      // PASS 1: Intent + SQL generation
      const activeSources = this.state.sources.filter(s => s._active !== false);
      const systemPrompt = await ContextBuilder.buildSystemPrompt(
        this.state.botConfig, activeSources, this.state.schema,
        this.state.glossary, this.state.examples, this.state.chatHistory
      );

      const temperature = parseFloat(this.state.botConfig.gemini_temperature) || 0.2;
      const pass1 = await GeminiAPI.generate(systemPrompt, message, temperature);

      let parsed;
      try {
        parsed = JSON.parse(pass1.text);
      } catch {
        // If Gemini didn't return valid JSON, show as text
        Renderer.removeTypingIndicator();
        this.addMessageToUI('bot', pass1.text);
        this.state.chatHistory.push({ role: 'assistant', content: pass1.text });
        this.state.currentSession.messages.push({ role: 'assistant', content: pass1.text });
        this.saveSessions();
        this.renderSessions();
        this.state.isProcessing = false;
        return;
      }

      // Handle clarification
      if (parsed.needs_clarification) {
        Renderer.removeTypingIndicator();
        const clarText = parsed.clarification_question || 'Bisa jelaskan lebih detail pertanyaan Anda?';
        this.addMessageToUI('bot', clarText);
        this.state.chatHistory.push({ role: 'assistant', content: clarText });
        this.state.currentSession.messages.push({ role: 'assistant', content: clarText });
        this.saveSessions();
        this.renderSessions();
        this.state.isProcessing = false;
        return;
      }

      // Sanitize LLM string 'null'
      if (parsed.sql === 'null') parsed.sql = null;
      if (parsed.api_endpoint === 'null') parsed.api_endpoint = null;

      // Validate SQL or API
      if (!parsed.sql && !parsed.api_endpoint) {
        Renderer.removeTypingIndicator();
        this.addMessageToUI('bot', 'Maaf, saya tidak bisa memproses permintaan ini karena sumber data tidak relevan atau instruksi kurang jelas.');
        this.state.isProcessing = false;
        return;
      }

      if (parsed.sql && !validateSQL(parsed.sql)) {
        Renderer.removeTypingIndicator();
        this.addMessageToUI('bot', 'Maaf, saya tidak bisa memproses permintaan ini karena query SQL yang dihasilkan tidak valid atau berpotensi tidak aman.');
        this.state.isProcessing = false;
        return;
      }

      // Execute Data Fetching
      let queryResults;
      let rawApiData = null; 
      try {
        if (parsed.api_endpoint) {
          // 1. Find the source config for this endpoint to get Auth settings
          const sourceInfo = this.state.sources.find(s => 
            s.api_endpoint && (parsed.api_endpoint.includes(s.api_endpoint) || s.api_endpoint.includes(parsed.api_endpoint))
          );
          const authConfig = sourceInfo ? sourceInfo.auth_config : null;

          // 2. Fetch with Auto-Pagination & Auth
          let rawData = [];
          let currentSkip = 0;
          let limit = 1000;
          let hasMore = true;
          
          let baseUrl = parsed.api_endpoint;
          baseUrl = baseUrl.replace(/[\?&]skip=\d+/g, '').replace(/[\?&]limit=\d+/g, '');
          const separator = baseUrl.includes('?') ? '&' : '?';

          while (hasMore) {
            const fetchUrl = `${baseUrl}${separator}limit=${limit}&skip=${currentSkip}`;
            
            // Use RestAPIConnector to handle Auth
            const data = await RestAPIConnector.fetchData(fetchUrl, authConfig);
            
            let pageData = data;
            if (data.data && Array.isArray(data.data)) pageData = data.data;
            else if (Array.isArray(data)) pageData = data;
            
            if (Array.isArray(pageData) && pageData.length > 0) {
              rawData = rawData.concat(pageData);
              if (data.meta && data.meta.total_record) {
                if (rawData.length >= data.meta.total_record) hasMore = false;
                else currentSkip += limit;
              } else {
                hasMore = false;
              }
            } else {
              hasMore = false;
            }
          }
          
          // In-Memory SQL Processing (AlaSQL)
          if (typeof alasql !== 'undefined' && parsed.sql) {
            try {
              let sanitizedSql = parsed.sql.replace(/;+$/, '');
              if (!sanitizedSql.includes('?')) sanitizedSql = sanitizedSql.replace(/FROM\s+([a-zA-Z0-9_]+)/i, "FROM ?");
              queryResults = alasql(sanitizedSql, [rawData]);
              rawApiData = rawData;
            } catch (alasqlErr) {
               queryResults = Array.isArray(rawData) ? rawData : [];
               rawApiData = rawData;
            }
          } else {
            queryResults = Array.isArray(rawData) ? rawData : [];
            rawApiData = rawData;
          }
          
          if (Array.isArray(queryResults)) queryResults = queryResults.slice(0, 100);
        } else {
          // Execute SQL via Edge Function (for Supabase Tables)
          const maxRows = parseInt(this.state.botConfig.max_rows_returned) || 1000;
          let sql = parsed.sql.replace(/;+$/, '');
          if (!/LIMIT\s+\d+/i.test(sql)) sql += ` LIMIT ${maxRows}`;
          queryResults = await SupabaseAPI.executeSQL(sql);
        }
      } catch (err) {
        Renderer.removeTypingIndicator();
        this.addMessageToUI('bot', `Maaf, terjadi kesalahan saat mengambil data: ${err.message}`);
        this.state.isProcessing = false;
        return;
      }

      // PASS 2: Insight generation
      const insightPrompt = ContextBuilder.buildInsightPrompt(queryResults, message);
      const pass2 = await GeminiAPI.generate(
        'Kamu adalah analis data profesional. Berikan analisis dalam Bahasa Indonesia. Output JSON ketat.',
        insightPrompt, 0.3
      );

      let insightData;
      try { insightData = JSON.parse(pass2.text); } catch { insightData = { summary: pass2.text }; }

      Renderer.removeTypingIndicator();

      // Build multi-chart data
      const charts = await this.buildMultiChartData(queryResults, parsed, rawApiData);

      // Build response content
      const responseContent = {
        text: insightData.summary || insightData.recommendation || '',
        kpis: insightData.kpis || [],
        charts: charts,
        // Backward compat: single chart field
        chart: charts.length > 0 ? charts[0] : null,
        table: this.buildTableData(queryResults),
        insights: insightData.insights || [],
        sql_used: this.state.showSQL ? parsed.sql : null
      };

      this.addMessageToUI('bot', '', responseContent);

      const botMessage = {
        role: 'assistant',
        content: insightData.summary || 'Analisis selesai.',
        responseData: responseContent
      };
      this.state.chatHistory.push(botMessage);
      this.state.currentSession.messages.push(botMessage);

      // Save to Supabase (fire and forget)
      this.saveToSupabase(message, botMessage, parsed.sql, pass1.tokens + (pass2.tokens || 0));

    } catch (err) {
      Renderer.removeTypingIndicator();
      console.error('Chat error:', err);
      const errorHtml = `Terjadi kesalahan: ${err.message}<br><br><button class="btn btn-outline btn-sm" onclick="DataBot.retryLastMessage()" style="margin-top:10px; border-color:var(--danger); color:var(--danger); background:rgba(248,113,113,0.1);">🔄 Coba Lagi</button>`;
      this.addMessageToUI('bot', errorHtml);
      
      const botMessage = { role: 'assistant', content: `Terjadi kesalahan: ${err.message}` };
      this.state.chatHistory.push(botMessage);
      if (this.state.currentSession) {
        this.state.currentSession.messages.push(botMessage);
      }
    }

    this.saveSessions();
    this.renderSessions();
    this.state.isProcessing = false;
  },

  // ==================== Multi-Chart Builder ====================
  async buildMultiChartData(mainResults, parsed, rawApiData = null) {
    const chartDefs = parsed.charts || [];
    
    // Backward compatibility: if old single-chart format is used
    if (!chartDefs.length && parsed.chart_type && parsed.chart_type !== 'none') {
      return [this._buildSingleChart(mainResults, {
        chart_type: parsed.chart_type,
        chart_title: parsed.chart_title || null,
        chart_x_axis: parsed.chart_x_axis,
        chart_y_axis: parsed.chart_y_axis,
        chart_group_by: parsed.chart_group_by || null
      })].filter(Boolean);
    }

    const charts = [];
    for (const def of chartDefs) {
      if (!def.chart_type || def.chart_type === 'none') continue;
      
      let data = mainResults;

      // If this chart has its own SQL, execute it
      if (def.chart_sql && def.chart_sql !== parsed.sql) {
        try {
          if (!validateSQL(def.chart_sql)) { continue; }
          
          if (parsed.api_endpoint) {
            // In-memory SQL via AlaSQL on the RAW API data (not pre-processed)
            const sourceData = rawApiData || mainResults;
            if (typeof alasql !== 'undefined') {
              let sql = def.chart_sql.replace(/;+$/, '');
              if (!sql.includes('?')) {
                sql = sql.replace(/FROM\s+([a-zA-Z0-9_]+)/i, "FROM ?");
              }
              data = alasql(sql, [sourceData]);
            }
          } else {
            // Execute via Supabase Edge Function
            let sql = def.chart_sql.replace(/;+$/, '');
            const maxRows = parseInt(this.state.botConfig.max_rows_returned) || 1000;
            if (!/LIMIT\s+\d+/i.test(sql)) sql += ` LIMIT ${maxRows}`;
            data = await SupabaseAPI.executeSQL(sql);
          }
        } catch (err) {
          console.warn(`Chart SQL failed for "${def.chart_title}":`, err);
          data = mainResults; // Fallback to main results
        }
      }

      const chart = this._buildSingleChart(data, def);
      if (chart) charts.push(chart);
    }

    return charts;
  },

  _buildSingleChart(results, def) {
    if (!results?.length) return null;
    const chartType = def.chart_type || 'bar';
    const availableKeys = Object.keys(results[0]);

    // --- Smart column resolver: match AI column names to actual data keys ---
    const resolveCol = (col) => {
      if (!col) return null;
      // Exact match
      if (availableKeys.includes(col)) return col;
      // Case-insensitive match
      const lower = col.toLowerCase();
      const found = availableKeys.find(k => k.toLowerCase() === lower);
      if (found) return found;
      // Partial match (e.g. "total" matches "total_unjuk_rasa")
      const partial = availableKeys.find(k => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()));
      if (partial) return partial;
      return null;
    };

    let xAxis = resolveCol(def.chart_x_axis);
    let yAxis = resolveCol(def.chart_y_axis);

    // Auto-detect x/y if columns couldn't be resolved
    if (!xAxis || !yAxis) {
      const numericCols = availableKeys.filter(k => typeof results[0][k] === 'number' || !isNaN(parseFloat(results[0][k])));
      const textCols = availableKeys.filter(k => !numericCols.includes(k));
      if (!xAxis) xAxis = textCols[0] || availableKeys[0];
      if (!yAxis) yAxis = numericCols[0] || availableKeys[1] || availableKeys[0];
      if (xAxis === yAxis && availableKeys.length > 1) {
        yAxis = availableKeys.find(k => k !== xAxis) || yAxis;
      }
    }

    // AI often swaps X and Y for horizontal charts. Ensure Y is numeric and X is categorical (if possible).
    if (xAxis && yAxis && results.length > 0) {
      const xVal = results[0][xAxis];
      const yVal = results[0][yAxis];
      const xIsNumeric = typeof xVal === 'number' || (!isNaN(parseFloat(xVal)) && isFinite(xVal));
      const yIsNumeric = typeof yVal === 'number' || (!isNaN(parseFloat(yVal)) && isFinite(yVal));
      // If X is numeric and Y is NOT numeric, swap them (except for scatter/bubble)
      if (xIsNumeric && !yIsNumeric && chartType !== 'scatter' && chartType !== 'bubble') {
        const temp = xAxis;
        xAxis = yAxis;
        yAxis = temp;
      }
    }

    if (!xAxis || !yAxis) return null;

    // --- Scatter / Bubble ---
    if (chartType === 'scatter' || chartType === 'bubble') {
      const data = results.map(r => {
        const point = { x: parseFloat(r[xAxis]) || 0, y: parseFloat(r[yAxis]) || 0 };
        if (chartType === 'bubble') {
          const rKey = availableKeys.find(k => k !== xAxis && k !== yAxis && typeof r[k] === 'number');
          point.r = rKey ? Math.min(Math.max(parseFloat(r[rKey]) || 5, 3), 30) : 5;
        }
        return point;
      });
      return {
        type: chartType,
        title: def.chart_title || null,
        labels: [],
        datasets: [{ label: `${yAxis.replace(/_/g, ' ')} vs ${xAxis.replace(/_/g, ' ')}`, data }]
      };
    }

    // --- Resolve group column ---
    const groupCol = resolveCol(def.chart_group_by);

    // --- Multi-series via group_by ---
    if (groupCol) {
      const groups = {};
      const labelsSet = new Set();

      results.forEach(r => {
        const group = String(r[groupCol] ?? 'Lainnya');
        const label = String(r[xAxis] ?? '');
        labelsSet.add(label);
        if (!groups[group]) groups[group] = {};
        groups[group][label] = (groups[group][label] || 0) + (parseFloat(r[yAxis]) || 0);
      });

      const labels = [...labelsSet];
      const datasets = Object.entries(groups).map(([name, values]) => ({
        label: name.replace(/_/g, ' '),
        data: labels.map(l => values[l] || 0)
      }));

      return { type: chartType, title: def.chart_title || null, labels, datasets };
    }

    // --- Single-series with aggregation for duplicate labels ---
    const aggregated = {};
    results.forEach(r => {
      const label = String(r[xAxis] ?? '');
      const val = parseFloat(r[yAxis]) || 0;
      aggregated[label] = (aggregated[label] || 0) + val;
    });

    const labels = Object.keys(aggregated);
    const data = Object.values(aggregated);

    return {
      type: chartType,
      title: def.chart_title || null,
      labels,
      datasets: [{ label: yAxis.replace(/_/g, ' '), data }]
    };
  },

  buildTableData(results) {
    if (!results?.length) return null;
    const headers = Object.keys(results[0]);
    const rows = results.slice(0, 50).map(r => headers.map(h => r[h] ?? ''));
    return { headers, rows };
  },

  async saveToSupabase(userMsg, botMsg, sql, tokens) {
    try {
      const sessionToken = getSessionToken();
      // Ensure session exists
      let sessions = await SupabaseAPI.query('tb_chat_sessions', { eq: { session_token: sessionToken } });
      let sessionId;
      if (!sessions.length) {
        const sessionData = JSON.parse(localStorage.getItem('sb-pgyltungxodpdoacoizk-auth-token') || '{}');
        const userId = sessionData.user?.id || null;
        const created = await SupabaseAPI.insert('tb_chat_sessions', { 
          session_token: sessionToken,
          user_identifier: userId
        });
        sessionId = created[0]?.id;
      } else {
        sessionId = sessions[0].id;
        await SupabaseAPI.update('tb_chat_sessions', sessionId, { last_active: new Date().toISOString() });
      }
      if (!sessionId) return;

      // Save user message
      await SupabaseAPI.insert('tb_chat_messages', {
        session_id: sessionId, role: 'user', content: userMsg, response_type: 'text'
      });
      // Save bot message
      await SupabaseAPI.insert('tb_chat_messages', {
        session_id: sessionId, role: 'assistant', content: botMsg.content,
        response_type: 'report', response_data: botMsg.responseData,
        sql_generated: sql, gemini_tokens: tokens
      });
    } catch (err) {
      console.error('Failed to save to Supabase:', err);
    }
  },

  openChangePasswordModal() {
    const html = `
      <div class="modal-form">
        <div class="modal-form-group">
          <label class="modal-label">Password Baru</label>
          <input type="password" id="new_pwd" class="modal-input" placeholder="Minimal 6 karakter">
        </div>
        <div class="modal-form-group">
          <label class="modal-label">Konfirmasi Password</label>
          <input type="password" id="conf_pwd" class="modal-input" placeholder="Ulangi password">
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-outline" onclick="document.getElementById('modalOverlay').style.display='none'">Batal</button>
      <button class="btn btn-primary" id="savePwdBtn">Simpan Password</button>
    `;
    
    document.getElementById('modalTitle').textContent = 'Ubah Password';
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modalFooter').innerHTML = footer;
    document.getElementById('modalOverlay').style.display = 'flex';

    document.getElementById('savePwdBtn').onclick = async () => {
      const pwd = document.getElementById('new_pwd').value;
      const conf = document.getElementById('conf_pwd').value;
      if (pwd.length < 6) return this.showToast('Password minimal 6 karakter', 'error');
      if (pwd !== conf) return this.showToast('Konfirmasi password tidak cocok', 'error');

      try {
        const { error } = await supabaseClient.auth.updateUser({ password: pwd });
        if (error) throw error;
        this.showToast('Password berhasil diubah', 'success');
        document.getElementById('modalOverlay').style.display = 'none';
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  },

  showToast(message, type = 'info') {
    const container = this.elements.toastContainer;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
};

// ==================== Initialize ====================
document.addEventListener('DOMContentLoaded', () => DataBot.init());
