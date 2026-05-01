// ==================== Response Renderer ====================
const Renderer = {
  chartInstances: new Map(),

  // Extended color palette for multi-dataset and segmented charts
  COLORS: [
    'rgba(124,92,252,0.8)',  // Purple
    'rgba(52,211,153,0.8)',  // Emerald
    'rgba(251,191,36,0.8)',  // Amber
    'rgba(96,165,250,0.8)',  // Blue
    'rgba(248,113,113,0.8)', // Red
    'rgba(167,139,250,0.8)', // Violet
    'rgba(244,114,182,0.8)', // Pink
    'rgba(45,212,191,0.8)',  // Teal
    'rgba(251,146,60,0.8)',  // Orange
    'rgba(163,230,53,0.8)',  // Lime
    'rgba(232,121,249,0.8)', // Fuchsia
    'rgba(56,189,248,0.8)',  // Sky
  ],

  getBgColors(opacity = 0.15) {
    return this.COLORS.map(c => c.replace('0.8', String(opacity)));
  },

  renderBotResponse(content, messageEl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'bot-response-wrapper';

    // Text/Summary
    if (content.text) {
      const textEl = document.createElement('div');
      textEl.className = 'response-text';
      textEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(content.text) : content.text.replace(/\n/g, '<br>');
      wrapper.appendChild(textEl);
    }

    // KPI Cards
    if (content.kpis?.length) {
      wrapper.appendChild(this.renderKPIs(content.kpis));
    }

    // Multi-Charts
    const chartsToRender = content.charts?.length ? content.charts : (content.chart && content.chart.type !== 'none' ? [content.chart] : []);
    if (chartsToRender.length > 0) {
      const chartsGrid = document.createElement('div');
      chartsGrid.className = 'charts-grid';
      chartsToRender.forEach(chartData => {
        if (chartData && chartData.type !== 'none') {
          chartsGrid.appendChild(this.renderChart(chartData));
        }
      });
      wrapper.appendChild(chartsGrid);
    }

    // Table
    if (content.table?.headers?.length) {
      wrapper.appendChild(this.renderTable(content.table));
    }

    // Insights
    if (content.insights?.length) {
      wrapper.appendChild(this.renderInsights(content.insights));
    }

    // SQL
    if (content.sql_used) {
      wrapper.appendChild(this.renderSQL(content.sql_used));
    }

    messageEl.appendChild(wrapper);
  },

  renderKPIs(kpis) {
    const grid = document.createElement('div');
    grid.className = 'kpi-grid';
    kpis.forEach(kpi => {
      const card = document.createElement('div');
      card.className = 'kpi-card';
      card.innerHTML = `
        <div class="kpi-label">${this.escape(kpi.label)}</div>
        <div class="kpi-value">${this.escape(kpi.value)}</div>
        ${kpi.delta ? `<div class="kpi-delta ${kpi.direction || 'neutral'}">${kpi.direction === 'up' ? '▲' : kpi.direction === 'down' ? '▼' : '●'} ${this.escape(kpi.delta)}</div>` : ''}
      `;
      grid.appendChild(card);
    });
    return grid;
  },

  // ==================== Chart Rendering (Enhanced) ====================
  renderChart(chartData) {
    const container = document.createElement('div');
    container.className = 'chart-container';

    // --- Chart Toolbar ---
    const toolbar = document.createElement('div');
    toolbar.className = 'chart-toolbar';

    // Chart title (optional)
    if (chartData.title) {
      const titleEl = document.createElement('span');
      titleEl.className = 'chart-title-label';
      titleEl.textContent = chartData.title;
      toolbar.appendChild(titleEl);
    }

    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'chart-toolbar-actions';

    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'chart-tool-btn';
    downloadBtn.title = 'Download Chart (PNG)';
    downloadBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    toolbarActions.appendChild(downloadBtn);

    // Fullscreen button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'chart-tool-btn';
    fullscreenBtn.title = 'Perbesar Chart';
    fullscreenBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
    toolbarActions.appendChild(fullscreenBtn);

    toolbar.appendChild(toolbarActions);
    container.appendChild(toolbar);

    // --- Canvas ---
    const canvas = document.createElement('canvas');
    const chartId = 'chart-' + Date.now() + Math.random().toString(36).substr(2, 5);
    canvas.id = chartId;
    container.appendChild(canvas);

    // Destroy old chart if exists
    if (this.chartInstances.has(chartId)) {
      this.chartInstances.get(chartId).destroy();
    }

    // --- Resolve internal chart type ---
    const resolvedType = this._resolveChartType(chartData.type);
    const isHorizontal = chartData.type === 'bar_horizontal';
    const isStacked = chartData.type === 'stacked_bar' || chartData.type === 'stacked_bar_horizontal';
    const isRadialType = ['doughnut', 'pie', 'polarArea'].includes(resolvedType);

    // --- Build config ---
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#9898b0' : '#64648a';

    const datasets = this._buildDatasets(chartData, resolvedType);
    const chartConfig = {
      type: resolvedType,
      data: { labels: chartData.labels || [], datasets },
      options: this._buildOptions(resolvedType, {
        isDark, gridColor, textColor, isHorizontal, isStacked, isRadialType,
        datasetCount: datasets.length
      })
    };

    // Adjust container height for radar / polarArea
    if (['radar', 'polarArea'].includes(resolvedType)) {
      container.style.maxHeight = '400px';
      canvas.style.maxHeight = '360px';
    }

    // --- Create chart with small delay so DOM is ready ---
    setTimeout(() => {
      const ctx = document.getElementById(chartId);
      if (!ctx) return;
      const chart = new Chart(ctx, chartConfig);
      this.chartInstances.set(chartId, chart);

      // Wire toolbar buttons
      downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `databot-chart-${Date.now()}.png`;
        link.href = chart.toBase64Image('image/png', 1);
        link.click();
      });

      fullscreenBtn.addEventListener('click', () => {
        this._openFullscreenChart(chart, chartData);
      });
    }, 100);

    return container;
  },

  /**
   * Map user-facing chart type strings to Chart.js types.
   */
  _resolveChartType(type) {
    const typeMap = {
      'line': 'line',
      'area': 'line',        // line with fill
      'bar': 'bar',
      'bar_horizontal': 'bar',
      'stacked_bar': 'bar',
      'stacked_bar_horizontal': 'bar',
      'doughnut': 'doughnut',
      'donut': 'doughnut',
      'pie': 'pie',
      'radar': 'radar',
      'polarArea': 'polarArea',
      'polar_area': 'polarArea',
      'scatter': 'scatter',
      'bubble': 'bubble',
    };
    return typeMap[type] || 'bar';
  },

  /**
   * Build styled datasets based on chart type.
   */
  _buildDatasets(chartData, resolvedType) {
    const colors = this.COLORS;
    const bgColors = this.getBgColors(0.15);
    const bgColorsSolid = this.getBgColors(0.6);

    return (chartData.datasets || []).map((ds, i) => {
      const base = { ...ds };
      const color = colors[i % colors.length];
      const bgColor = bgColors[i % bgColors.length];

      switch (resolvedType) {
        case 'line': {
          const isArea = chartData.type === 'area';
          Object.assign(base, {
            borderColor: color,
            backgroundColor: isArea ? bgColor : bgColors[i % bgColors.length],
            borderWidth: 2.5,
            tension: 0.4,
            fill: isArea,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: color,
            pointBorderColor: 'transparent',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
          });
          break;
        }

        case 'bar': {
          Object.assign(base, {
            borderColor: color,
            backgroundColor: bgColorsSolid[i % bgColorsSolid.length],
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false,
            hoverBackgroundColor: color,
          });
          break;
        }

        case 'doughnut':
        case 'pie': {
          Object.assign(base, {
            backgroundColor: colors.slice(0, (ds.data || []).length),
            borderColor: 'transparent',
            borderWidth: 2,
            hoverOffset: 8,
          });
          break;
        }

        case 'radar': {
          Object.assign(base, {
            borderColor: color,
            backgroundColor: bgColors[i % bgColors.length],
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            fill: true,
          });
          break;
        }

        case 'polarArea': {
          Object.assign(base, {
            backgroundColor: colors.map(c => c.replace('0.8', '0.55')),
            borderColor: colors,
            borderWidth: 1.5,
          });
          break;
        }

        case 'scatter': {
          Object.assign(base, {
            borderColor: color,
            backgroundColor: color,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBorderWidth: 0,
          });
          break;
        }

        case 'bubble': {
          Object.assign(base, {
            borderColor: color,
            backgroundColor: bgColorsSolid[i % bgColorsSolid.length],
            borderWidth: 1,
            hoverRadius: 2,
          });
          break;
        }

        default: {
          Object.assign(base, {
            borderColor: color,
            backgroundColor: bgColor,
            borderWidth: 1,
          });
        }
      }
      return base;
    });
  },

  /**
   * Build chart options per chart type.
   */
  _buildOptions(resolvedType, { isDark, gridColor, textColor, isHorizontal, isStacked, isRadialType, datasetCount }) {
    const tooltipStyle = {
      backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
      titleColor: isDark ? '#f0f0f5' : '#1a1a2e',
      bodyColor: isDark ? '#9898b0' : '#64648a',
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
      usePointStyle: true,
      boxPadding: 6,
    };

    const legendStyle = {
      display: datasetCount > 1 || isRadialType,
      position: isRadialType ? 'bottom' : 'top',
      labels: {
        color: textColor,
        font: { family: 'Inter', size: 11 },
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 16,
      }
    };

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 600,
        easing: 'easeOutQuart',
      },
      plugins: {
        legend: legendStyle,
        tooltip: tooltipStyle,
      },
    };

    // --- Axis-based charts ---
    if (!isRadialType && resolvedType !== 'radar') {
      baseOptions.indexAxis = isHorizontal ? 'y' : 'x';
      baseOptions.scales = {
        x: {
          stacked: isStacked,
          grid: { color: gridColor, drawBorder: false },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 }, maxRotation: 45 },
          border: { display: false },
        },
        y: {
          stacked: isStacked,
          grid: { color: gridColor, drawBorder: false },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
          border: { display: false },
        }
      };
    }

    // --- Radar-specific ---
    if (resolvedType === 'radar') {
      baseOptions.scales = {
        r: {
          angleLines: { color: gridColor },
          grid: { color: gridColor },
          pointLabels: { color: textColor, font: { family: 'Inter', size: 11 } },
          ticks: { color: textColor, backdropColor: 'transparent', font: { size: 10 } },
        }
      };
    }

    // --- PolarArea-specific ---
    if (resolvedType === 'polarArea') {
      baseOptions.scales = {
        r: {
          grid: { color: gridColor },
          ticks: { color: textColor, backdropColor: 'transparent', font: { size: 10 } },
        }
      };
    }

    // --- Scatter-specific ---
    if (resolvedType === 'scatter') {
      baseOptions.scales = {
        x: {
          type: 'linear',
          position: 'bottom',
          grid: { color: gridColor, drawBorder: false },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
          border: { display: false },
        },
        y: {
          grid: { color: gridColor, drawBorder: false },
          ticks: { color: textColor, font: { family: 'Inter', size: 11 } },
          border: { display: false },
        }
      };
    }

    // --- Doughnut cutout ---
    if (resolvedType === 'doughnut') {
      baseOptions.cutout = '65%';
    }

    return baseOptions;
  },

  _openFullscreenChart(chartInstance, chartData) {
    // Remove any existing fullscreen overlay first
    const existing = document.querySelector('.chart-fullscreen-overlay');
    if (existing) existing.remove();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'chart-fullscreen-overlay';
    overlay.innerHTML = `
      <div class="chart-fullscreen-container">
        <div class="chart-fullscreen-header">
          <span class="chart-fullscreen-title">${this.escape(chartData.title || 'Chart')}</span>
          <button class="chart-fullscreen-close" title="Tutup">&times;</button>
        </div>
        <div class="chart-fullscreen-body">
          <canvas id="fullscreenChartCanvas"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    const closeOverlay = () => {
      if (overlay.parentNode) overlay.remove();
      document.removeEventListener('keydown', escHandler);
    };
    const escHandler = (e) => { if (e.key === 'Escape') closeOverlay(); };
    overlay.querySelector('.chart-fullscreen-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', escHandler);

    // Rebuild chart from original chartData (not from chartInstance which has internal refs)
    setTimeout(() => {
      const canvas = document.getElementById('fullscreenChartCanvas');
      if (!canvas) return;

      const resolvedType = this._resolveChartType(chartData.type);
      const isHorizontal = chartData.type === 'bar_horizontal';
      const isStacked = chartData.type === 'stacked_bar' || chartData.type === 'stacked_bar_horizontal';
      const isRadialType = ['doughnut', 'pie', 'polarArea'].includes(resolvedType);

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      const textColor = isDark ? '#9898b0' : '#64648a';

      const datasets = this._buildDatasets(chartData, resolvedType);
      const options = this._buildOptions(resolvedType, {
        isDark, gridColor, textColor, isHorizontal, isStacked, isRadialType,
        datasetCount: datasets.length
      });
      options.responsive = true;
      options.maintainAspectRatio = false;

      new Chart(canvas, {
        type: resolvedType,
        data: { labels: chartData.labels || [], datasets },
        options
      });
    }, 100);
  },

  // ==================== Table ====================
  renderTable(tableData) {
    const wrapper = document.createElement('div');
    wrapper.className = 'data-table-wrapper';
    let html = '<table class="data-table"><thead><tr>';
    tableData.headers.forEach(h => { html += `<th>${this.escape(h)}</th>`; });
    html += '</tr></thead><tbody>';
    (tableData.rows || []).forEach(row => {
      html += '<tr>';
      row.forEach(cell => { html += `<td>${this.escape(String(cell))}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrapper.innerHTML = html;
    return wrapper;
  },

  // ==================== Insights ====================
  renderInsights(insights) {
    const list = document.createElement('div');
    list.className = 'insights-list';
    insights.forEach(insight => {
      const item = document.createElement('div');
      item.className = `insight-item ${insight.type}`;
      const icons = { positive: '✅', warning: '⚠️', info: 'ℹ️' };
      item.innerHTML = `<span class="insight-icon">${icons[insight.type] || 'ℹ️'}</span><span>${this.escape(insight.text)}</span>`;
      list.appendChild(item);
    });
    return list;
  },

  // ==================== SQL Display ====================
  renderSQL(sql) {
    const div = document.createElement('div');
    div.className = 'sql-display';
    div.innerHTML = `<div class="sql-label">SQL Query</div><code>${this.escape(sql)}</code>`;
    return div;
  },

  // ==================== Typing Indicator ====================
  renderTypingIndicator() {
    const msg = document.createElement('div');
    msg.className = 'message bot';
    msg.id = 'typingIndicator';
    msg.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-body">
        <div class="typing-indicator">
          <div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>
          <span style="color:var(--text-muted);font-size:0.85rem;">Menganalisis...</span>
        </div>
      </div>
    `;
    return msg;
  },

  removeTypingIndicator() {
    document.getElementById('typingIndicator')?.remove();
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
