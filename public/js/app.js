const App = {
  api: null,
  graph: null,
  pollTimer: null,
  pollIntervalMs: 1500,
  isPolling: false,
  isApplyingBand: false,
  firewallEnabled: true,
  isAuthenticated: false,

  // Global state
  state: {
    routerUrl: localStorage.getItem('hm_routerUrl') || 'http://192.168.1.1',
    username: localStorage.getItem('hm_username') || 'admin',
    password: localStorage.getItem('hm_password') || '',
    autoRefresh: true,

    // Telemetry
    connectionStatus: '',
    networkMode: '00',
    selectedMode: '03',
    hasUserModifiedBands: false,
    networkAllowedBands: [1, 3, 7, 8, 20, 38],
    networkType: '',
    carrierName: '',
    pci: '0',
    cellId: '0',
    rsrp: 0,
    rsrq: 0,
    sinr: 0,
    rssi: '',
    dlBandwidth: '',
    ulBandwidth: '',
    currentBandHex: '',
    currentBandSummary: 'Auto',
    dlSpeed: 0,
    ulSpeed: 0,
    totalDlBytes: 0,
    totalUlBytes: 0,
    totalTraffic: 0,
    wifiUsers: 0,
    wanIp: '',
    deviceModel: '',
    signalBars: 5
  },

  formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes <= 0) return '0.00 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = (bytes / Math.pow(k, i)).toFixed(i > 0 ? decimals : 0);
    return `${val} ${sizes[i]}`;
  },

  formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    const val = (bytesPerSec / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0);
    return `${val} ${sizes[i]}`;
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `gw-toast toast-${type}`;
    el.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="font-semibold text-slate-800">${message}</span>
      </div>
      <button class="text-slate-400 hover:text-slate-700 font-bold ml-3" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  },

  init() {
    this.isAndroid = /Android/i.test(navigator.userAgent) || !!window.__TAURI_ANDROID__;
    if (this.isAndroid) {
      document.documentElement.classList.add('is-android');
      document.body.classList.add('is-android');
    }

    this.api = new HuaweiRouterApi({
      routerUrl: this.state.routerUrl,
      username: this.state.username,
      password: this.state.password,
      useProxy: true,
      onLog: msg => console.log('[HuaweiApi]', msg)
    });

    // Populate header IP
    this.updateHeaderGatewayIp();

    // Initialize Canvas Graph
    try {
      this.graph = new CleanGraph('networkWaveCanvas', {
        timeframeSec: 300,
        maxPoints: 300
      });
    } catch (e) {
      console.warn('Canvas init warning:', e);
    }

    this.setupEventListeners();
    this.updateNetworkAllowedBadges();

    // Check if router is reachable and authenticated
    this.checkInitialSession();
  },

  updateHeaderGatewayIp() {
    const headerIp = document.getElementById('headerGatewayIp');
    if (headerIp) {
      try {
        const u = new URL(this.state.routerUrl);
        headerIp.textContent = u.hostname;
      } catch (e) {
        headerIp.textContent = this.state.routerUrl;
      }
    }
  },

  setupEventListeners() {
    // Modal background close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('show');
      });
    });

    // Reboot confirm button
    document.getElementById('confirmRebootBtn')?.addEventListener('click', () => this.performReboot());

    // Hex mask input
    document.getElementById('applyHexMaskBtn')?.addEventListener('click', () => this.applyCustomHex());
    document.getElementById('customHexInput')?.addEventListener('input', e => this.updateHexPreview(e.target.value));

    // Window resize / fullscreen sync
    document.addEventListener('fullscreenchange', () => {
      this.updateMaximizeIcon(!!document.fullscreenElement);
    });
    window.addEventListener('resize', () => {
      this.checkTauriMaximizeState();
    });

    // Initial maximize state check
    setTimeout(() => this.checkTauriMaximizeState(), 200);
  },

  async checkInitialSession() {
    try {
      if (this.state.password) {
        this.api.setRouterUrl(this.state.routerUrl);
        this.api.setCredentials(this.state.username, this.state.password);
        const data = await this.api.login(this.state.username, this.state.password);
        if (data.success) {
          this.isAuthenticated = true;
          this.showDashboard();
          this.startPolling();
          setTimeout(() => this.scanConnectedDevices(), 800);
          setTimeout(() => this.checkNetworkBands(true), 900);
          return;
        }
      }
      this.isAuthenticated = false;
      this.showLoginScreen();
    } catch (err) {
      console.warn('Session check failed:', err);
      this.isAuthenticated = false;
      this.showLoginScreen(err.message);
    }
  },

  showDashboard() {
    const login = document.getElementById('loginScreen');
    const dash = document.getElementById('mainDashboard');
    const navTabs = document.getElementById('frameNavTabs');
    const actions = document.getElementById('frameRouterActions');

    if (login) login.classList.add('hidden');
    if (dash) dash.classList.remove('hidden');
    if (navTabs) navTabs.classList.remove('hidden');
    if (actions) actions.classList.remove('hidden');

    if (this.graph) {
      setTimeout(() => this.graph.handleResize(), 60);
    }
  },

  showLoginScreen(errorMessage) {
    this.stopPolling();
    const login = document.getElementById('loginScreen');
    const dash = document.getElementById('mainDashboard');
    const navTabs = document.getElementById('frameNavTabs');
    const actions = document.getElementById('frameRouterActions');

    if (dash) dash.classList.add('hidden');
    if (login) login.classList.remove('hidden');
    if (navTabs) navTabs.classList.add('hidden');
    if (actions) actions.classList.add('hidden');

    const errBox = document.getElementById('loginErrorMessage');
    if (errBox) {
      if (errorMessage) {
        errBox.textContent = this.formatErrorMessage(errorMessage);
        errBox.classList.remove('hidden');
      } else {
        errBox.classList.add('hidden');
      }
    }

    const urlInput = document.getElementById('loginRouterUrl');
    const userInput = document.getElementById('loginUsername');
    const passInput = document.getElementById('loginPassword');
    if (urlInput && this.state.routerUrl) urlInput.value = this.state.routerUrl;
    if (userInput && this.state.username) userInput.value = this.state.username;
    if (passInput) passInput.value = this.state.password || '';

    if (passInput && !this.state.password) {
      setTimeout(() => passInput.focus(), 100);
    }
  },

  formatErrorMessage(err) {
    let msg = (typeof err === 'string' ? err : err?.message) || '';
    if (!msg) return 'Unable to connect to router. Check IP address and credentials.';

    // Check for Huawei HiLink error codes
    if (msg.includes('108009')) {
      return 'Incorrect username or password. Please verify your credentials.';
    }
    if (msg.includes('108006')) {
      return 'Incorrect password. Please verify your router admin password.';
    }
    if (msg.includes('108007')) {
      return 'Maximum login attempts exceeded. Your router is temporarily locked (usually 2-5 minutes).';
    }
    if (msg.includes('108001') || msg.includes('108002')) {
      return 'Another user or session is already logged into the router. Please log out on other devices.';
    }
    if (msg.includes('100003')) {
      return 'Session expired or unauthorized. Please try again.';
    }

    // Strip raw XML strings if present
    if (msg.includes('<error>') || msg.includes('<?xml')) {
      const codeMatch = msg.match(/<code>(\d+)<\/code>/);
      if (codeMatch) {
        return `Login failed (Router error code ${codeMatch[1]}). Please verify your credentials.`;
      }
      return 'Login failed. Please verify your router credentials and IP address.';
    }

    return msg;
  },

  // ==========================================================
  // Custom Frameless Window Controls
  // ==========================================================
  async windowMinimize() {
    try {
      if (window.__TAURI__?.core?.invoke) {
        await window.__TAURI__.core.invoke('app_minimize');
        return;
      }
      if (window.__TAURI__?.invoke) {
        await window.__TAURI__.invoke('app_minimize');
        return;
      }
      if (window.__TAURI__?.window?.getCurrentWindow) {
        await window.__TAURI__.window.getCurrentWindow().minimize();
        return;
      }
    } catch (err) {
      console.warn('Minimize failed:', err);
    }
  },

  async windowToggleMaximize() {
    try {
      if (window.__TAURI__?.core?.invoke) {
        const isMax = await window.__TAURI__.core.invoke('app_toggle_maximize');
        this.updateMaximizeIcon(isMax);
        return;
      }
      if (window.__TAURI__?.invoke) {
        const isMax = await window.__TAURI__.invoke('app_toggle_maximize');
        this.updateMaximizeIcon(isMax);
        return;
      }
      if (window.__TAURI__?.window?.getCurrentWindow) {
        const win = window.__TAURI__.window.getCurrentWindow();
        const isMax = await win.isMaximized();
        if (isMax) {
          await win.unmaximize();
          this.updateMaximizeIcon(false);
        } else {
          await win.maximize();
          this.updateMaximizeIcon(true);
        }
        return;
      }
    } catch (err) {
      console.warn('Toggle maximize failed:', err);
    }
  },

  async windowClose() {
    try {
      if (window.__TAURI__?.core?.invoke) {
        await window.__TAURI__.core.invoke('app_close');
        return;
      }
      if (window.__TAURI__?.invoke) {
        await window.__TAURI__.invoke('app_close');
        return;
      }
      if (window.__TAURI__?.window?.getCurrentWindow) {
        await window.__TAURI__.window.getCurrentWindow().destroy();
        return;
      }
    } catch (err) {
      console.warn('Close failed:', err);
    }

    // Standalone desktop / browser fallback:
    try {
      await fetch('/api/app/exit', { method: 'POST' });
    } catch (e) {}
    window.close();
  },

  updateMaximizeIcon(isMax) {
    const maxIcon = document.getElementById('maximizeIcon');
    const restoreIcon = document.getElementById('restoreIcon');
    const maxBtn = document.getElementById('windowBtnMaximize');
    if (isMax) {
      if (maxIcon) maxIcon.classList.add('hidden');
      if (restoreIcon) restoreIcon.classList.remove('hidden');
      if (maxBtn) maxBtn.title = 'Restore Down';
    } else {
      if (maxIcon) maxIcon.classList.remove('hidden');
      if (restoreIcon) restoreIcon.classList.add('hidden');
      if (maxBtn) maxBtn.title = 'Maximize';
    }
  },

  async checkTauriMaximizeState() {
    if (this.isAndroid) return;
    try {
      if (window.__TAURI__?.core?.invoke) {
        const isMax = await window.__TAURI__.core.invoke('app_is_maximized');
        this.updateMaximizeIcon(isMax);
      } else if (window.__TAURI__?.invoke) {
        const isMax = await window.__TAURI__.invoke('app_is_maximized');
        this.updateMaximizeIcon(isMax);
      } else if (window.__TAURI__?.window?.getCurrentWindow) {
        const isMax = await window.__TAURI__.window.getCurrentWindow().isMaximized();
        this.updateMaximizeIcon(isMax);
      }
    } catch (e) {}
  },

  handleFrameDblClick(e) {
    if (this.isAndroid) return;
    if (e.target.closest('button, a, input, nav')) return;
    this.windowToggleMaximize();
  },

  togglePasswordVisibility(inputId) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
  },

  async handleUserLogin() {
    const urlInput = document.getElementById('loginRouterUrl');
    const userInput = document.getElementById('loginUsername');
    const passInput = document.getElementById('loginPassword');
    const btn = document.getElementById('loginSubmitBtn');
    const errBox = document.getElementById('loginErrorMessage');

    const routerUrl = (urlInput?.value || 'http://192.168.1.1').trim();
    const username = (userInput?.value || 'admin').trim();
    const password = (passInput?.value || '').trim();

    if (!password) {
      if (errBox) {
        errBox.textContent = 'Please enter your router admin password.';
        errBox.classList.remove('hidden');
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Connecting...</span>
      `;
    }
    if (errBox) errBox.classList.add('hidden');

    try {
      this.api.setRouterUrl(routerUrl);
      this.api.setCredentials(username, password);

      const data = await this.api.login(username, password);
      if (data.success) {
        this.state.routerUrl = routerUrl;
        this.state.username = username;
        this.state.password = password;
        localStorage.setItem('hm_routerUrl', routerUrl);
        localStorage.setItem('hm_username', username);
        localStorage.setItem('hm_password', password);

        this.updateHeaderGatewayIp();

        this.isAuthenticated = true;
        this.showDashboard();
        this.toast('Connected to router successfully!', 'success');
        this.startPolling();
        setTimeout(() => this.scanConnectedDevices(), 1000);
        setTimeout(() => this.checkNetworkBands(true), 1100);
      } else {
        throw new Error(data.message || 'Login rejected by router');
      }
    } catch (err) {
      const friendlyMsg = this.formatErrorMessage(err);
      if (errBox) {
        errBox.textContent = friendlyMsg;
        errBox.classList.remove('hidden');
      }
      this.toast(friendlyMsg, 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Connect to Router</span>`;
      }
    }
  },

  async handleUserLogout() {
    try {
      if (this.api) await this.api.logout();
    } catch (e) {}

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}

    // Clear saved password
    this.state.password = '';
    localStorage.removeItem('hm_password');
    if (this.api) {
      this.api.setCredentials(this.state.username, '');
    }

    const passInput = document.getElementById('loginPassword');
    if (passInput) passInput.value = '';

    this.stopPolling();
    this.isAuthenticated = false;
    this.showLoginScreen();
    this.toast('Logged out successfully', 'info');
  },

  // Navigation: Switch between 2 primary tabs (Overview & Connectivity)
  switchMainTab(tabId) {
    document.querySelectorAll('.gw-nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    const overviewPane = document.getElementById('tabOverview');
    const connPane = document.getElementById('tabConnectivity');

    if (tabId === 'tabOverview') {
      overviewPane?.classList.remove('hidden');
      connPane?.classList.add('hidden');
      if (this.graph) {
        setTimeout(() => this.graph.handleResize(), 50);
      }
    } else if (tabId === 'tabConnectivity') {
      overviewPane?.classList.add('hidden');
      connPane?.classList.remove('hidden');
      this.refreshCurrentMode();
    }
  },

  // Sub-views inside Overview tab: Wave Canvas vs Columns
  switchOverviewSubView(view) {
    const subGraph = document.getElementById('subViewGraph');
    const subCols = document.getElementById('subViewColumns');
    const btnGraph = document.getElementById('viewBtnGraph');
    const btnCols = document.getElementById('viewBtnColumns');

    [btnGraph, btnCols].forEach(b => b?.classList.remove('active'));

    if (view === 'graph') {
      subGraph?.classList.remove('hidden');
      subCols?.classList.add('hidden');
      btnGraph?.classList.add('active');
      if (this.graph) setTimeout(() => this.graph.handleResize(), 50);
    } else {
      subGraph?.classList.add('hidden');
      subCols?.classList.remove('hidden');
      btnCols?.classList.add('active');
    }
  },

  onTimeframeChanged(val) {
    const sec = parseInt(val, 10) || 300;
    if (this.graph) {
      this.graph.setTimeframe(sec);
    }
  },

  toggleFilterMenu() {
    this.toast('Showing all router cellular data & Wi-Fi LAN traffic', 'info');
  },

  toggleFirewallSwitch() {
    const sw = document.getElementById('firewallSwitch');
    const label = document.getElementById('firewallSwitchLabel');
    if (!sw || !label) return;

    this.firewallEnabled = !this.firewallEnabled;
    if (this.firewallEnabled) {
      sw.classList.remove('off');
      label.textContent = 'ON';
      this.toast('Cellular mobile data active', 'success');
      this.api.setMobileData(true).catch(() => {});
    } else {
      sw.classList.add('off');
      label.textContent = 'OFF';
      this.toast('Cellular mobile data blocked', 'warning');
      this.api.setMobileData(false).catch(() => {});
    }
  },

  onSearchBand(query) {
    const q = (query || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#firewallTableBody tr');
    rows.forEach(r => {
      const text = r.textContent.toLowerCase();
      r.style.display = text.includes(q) ? '' : 'none';
    });
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
  },

  startPolling() {
    this.stopPolling();
    this.isPolling = true;
    this.pollLoop();
  },

  stopPolling() {
    this.isPolling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  },

  async pollLoop() {
    if (!this.isPolling) return;
    await this.pollOnce();
    if (this.isPolling) {
      this.pollTimer = setTimeout(() => this.pollLoop(), this.pollIntervalMs);
    }
  },

  async pollOnce() {
    try {
      const [statusRes, signalRes, trafficRes, plmnRes, netModeRes] = await Promise.allSettled([
        this.api.getStatus(),
        this.api.getSignal(),
        this.api.getTraffic(),
        this.api.getPlmn(),
        this.api.getNetMode()
      ]);

      if (trafficRes.status === 'fulfilled' && trafficRes.value) {
        this.updateTrafficUi(trafficRes.value);
      }
      if (signalRes.status === 'fulfilled' && signalRes.value) {
        this.updateSignalUi(signalRes.value);
      }
      if (plmnRes.status === 'fulfilled' && plmnRes.value) {
        this.updatePlmnUi(plmnRes.value);
      }
      if (netModeRes.status === 'fulfilled' && netModeRes.value) {
        this.updateNetModeUi(netModeRes.value);
      }
      if (statusRes.status === 'fulfilled' && statusRes.value) {
        this.updateStatusUi(statusRes.value);
      }

      // Lazy load device info once
      if (!this.state.deviceModel) {
        this.api.getDeviceInfo().then(d => {
          this.state.deviceModel = d.deviceName || 'Huawei 4G Router';
          const popupModel = document.getElementById('hoverPopupRouterModel');
          if (popupModel) popupModel.textContent = this.state.deviceModel;
          const headerModel = document.getElementById('headerModelText');
          if (headerModel) headerModel.textContent = this.state.deviceModel;
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Telemetry poll error:', e);
    }
  },

  // 1. Live Traffic Wave & Bottom Arc Visualizer
  updateTrafficUi(data) {
    const dlBps = data.currentDownloadRate || 0;
    const ulBps = data.currentUploadRate || 0;
    const dlTotal = data.totalDownload || data.currentDownload || 0;
    const ulTotal = data.totalUpload || data.currentUpload || 0;
    const grandTotal = dlTotal + ulTotal;

    this.state.dlSpeed = dlBps;
    this.state.ulSpeed = ulBps;
    this.state.totalDlBytes = dlTotal;
    this.state.totalUlBytes = ulTotal;
    this.state.totalTraffic = grandTotal;

    // Feed to Clean mountain wave chart
    if (this.graph) {
      this.graph.addDataPoint(dlBps, ulBps);
    }

    // Format numbers
    const dlSpeedFmt = this.formatSpeed(dlBps);
    const ulSpeedFmt = this.formatSpeed(ulBps);
    const dlTotalFmt = this.formatBytes(dlTotal);
    const ulTotalFmt = this.formatBytes(ulTotal);
    const grandTotalFmt = this.formatBytes(grandTotal);

    // Update bottom status strip
    const elDlTot = document.getElementById('statDlTotal');
    const elDlSpd = document.getElementById('statDlSpeed');
    const elUlTot = document.getElementById('statUlTotal');
    const elUlSpd = document.getElementById('statUlSpeed');
    const elGndTot = document.getElementById('statGrandTotal');

    if (elDlTot) elDlTot.textContent = dlTotalFmt;
    if (elDlSpd) elDlSpd.textContent = dlSpeedFmt;
    if (elUlTot) elUlTot.textContent = ulTotalFmt;
    if (elUlSpd) elUlSpd.textContent = ulSpeedFmt;
    if (elGndTot) elGndTot.textContent = grandTotalFmt;

    // Update Clean Half-Donut SVG arc:
    // Radius 40, Center (50, 50). Arc spans from 180° (x=10, y=50) to 0° (x=90, y=50)
    const arcYellow = document.getElementById('arcYellow');
    const arcPink = document.getElementById('arcPink');
    if (arcYellow && arcPink) {
      let ratio = 0.5;
      if (grandTotal > 0) {
        ratio = Math.max(0.05, Math.min(0.95, dlTotal / grandTotal));
      }
      // Angle goes from PI (180 deg) down to 0 (0 deg)
      // Dividing angle:
      const divAngle = Math.PI - (ratio * Math.PI);
      const splitX = (50 + 40 * Math.cos(divAngle)).toFixed(2);
      const splitY = (50 - 40 * Math.sin(divAngle)).toFixed(2);

      // Yellow arc: from (10, 50) to (splitX, splitY)
      arcYellow.setAttribute('d', `M 10 50 A 40 40 0 0 1 ${splitX} ${splitY}`);
      // Pink arc: from (splitX, splitY) to (90, 50)
      arcPink.setAttribute('d', `M ${splitX} ${splitY} A 40 40 0 0 1 90 50`);
    }

    // Update WAN / LAN Stacked Dual Bars
    const elWanBytes = document.getElementById('statWanBytes');
    const elLanBytes = document.getElementById('statLanBytes');
    if (elWanBytes) elWanBytes.textContent = dlTotalFmt;
    if (elLanBytes) elLanBytes.textContent = this.formatBytes(Math.round(grandTotal * 0.05));

    if (grandTotal > 0) {
      const dlPct = Math.round((dlTotal / grandTotal) * 100);
      const ulPct = 100 - dlPct;
      const barWanYellow = document.getElementById('barWanYellow');
      const barWanPink = document.getElementById('barWanPink');
      if (barWanYellow) barWanYellow.style.width = `${dlPct}%`;
      if (barWanPink) barWanPink.style.width = `${ulPct}%`;
    }

    // Live table rates for Band 1 & Band 3 in Connectivity tab
    const rB1Dl = document.getElementById('rateB1Dl');
    const rB1Ul = document.getElementById('rateB1Ul');
    const rB3Dl = document.getElementById('rateB3Dl');
    const rB3Ul = document.getElementById('rateB3Ul');

    if (this.state.currentBandSummary.includes('B1') && !this.state.currentBandSummary.includes('B3')) {
      if (rB1Dl) rB1Dl.textContent = dlSpeedFmt;
      if (rB1Ul) rB1Ul.textContent = ulSpeedFmt;
      if (rB3Dl) rB3Dl.textContent = '0 KB/s';
      if (rB3Ul) rB3Ul.textContent = '0 KB/s';
    } else if (this.state.currentBandSummary.includes('B3') && !this.state.currentBandSummary.includes('B1')) {
      if (rB3Dl) rB3Dl.textContent = dlSpeedFmt;
      if (rB3Ul) rB3Ul.textContent = ulSpeedFmt;
      if (rB1Dl) rB1Dl.textContent = '0 KB/s';
      if (rB1Ul) rB1Ul.textContent = '0 KB/s';
    } else {
      if (rB1Dl) rB1Dl.textContent = dlSpeedFmt;
      if (rB1Ul) rB1Ul.textContent = ulSpeedFmt;
      if (rB3Dl) rB3Dl.textContent = dlSpeedFmt;
      if (rB3Ul) rB3Ul.textContent = ulSpeedFmt;
    }
  },

  // 2. Signal Metrics & RF Telemetry
  updateSignalUi(data) {
    const pci = data.pci || '0';
    const cellId = data.cellId || '0';
    const bw = data.dlBandwidth ? `${data.dlBandwidth} DL / ${data.ulBandwidth || '0'} UL` : '--';

    this.state.pci = pci;
    this.state.cellId = cellId;

    // Subview columns
    const elColPci = document.getElementById('colPci');
    const elColCell = document.getElementById('colCellId');
    const elColBw = document.getElementById('colBandwidth');
    if (elColPci) elColPci.textContent = pci;
    if (elColCell) elColCell.textContent = cellId;
    if (elColBw) elColBw.textContent = bw;

    // Hover tooltip card
    const hoverCell = document.getElementById('hoverPopupCell');
    if (hoverCell) hoverCell.textContent = `PCI ${pci} / Cell ${cellId}`;

    // Compact Signal Cards on Overview Tab
    const elValPci = document.getElementById('valPci');
    const elValCell = document.getElementById('valCellId');
    if (elValPci) elValPci.textContent = pci;
    if (elValCell) elValCell.textContent = cellId;

    // RSRP
    if (data.rsrp) {
      const rsrpVal = parseInt(data.rsrp.replace(/[^\d\-]/g, ''), 10) || 0;
      this.state.rsrp = rsrpVal;

      const valRsrp = document.getElementById('valRsrp');
      const barRsrp = document.getElementById('barRsrp');
      const colRsrp = document.getElementById('colRsrp');
      const hoverRsrp = document.getElementById('hoverPopupRsrp');

      if (valRsrp) valRsrp.textContent = `${rsrpVal} dBm`;
      if (colRsrp) colRsrp.textContent = `${rsrpVal} dBm`;
      if (hoverRsrp) hoverRsrp.textContent = `${rsrpVal} dBm`;

      // Progress bar & color coding (-120 to -60 dBm)
      const pct = Math.max(5, Math.min(100, Math.round(((rsrpVal + 120) / 60) * 100)));
      if (barRsrp) {
        barRsrp.style.width = `${pct}%`;
        let colorClass = 'bg-rose-500';
        if (rsrpVal >= -85) {
          colorClass = 'bg-emerald-500';
        } else if (rsrpVal >= -98) {
          colorClass = 'bg-blue-500';
        } else if (rsrpVal >= -108) {
          colorClass = 'bg-amber-500';
        }
        barRsrp.className = `h-full ${colorClass} rounded-full transition-all duration-300`;
      }

      this.updateSignalBarsUi(null, `${rsrpVal} dBm`);
    }

    // RSRQ
    if (data.rsrq) {
      const rsrqVal = parseInt(data.rsrq.replace(/[^\d\-]/g, ''), 10) || 0;
      const valRsrq = document.getElementById('valRsrq');
      const barRsrq = document.getElementById('barRsrq');
      if (valRsrq) valRsrq.textContent = `${rsrqVal} dB`;

      // Progress bar & color coding (-20 to -3 dB)
      const pct = Math.max(5, Math.min(100, Math.round(((rsrqVal + 20) / 17) * 100)));
      if (barRsrq) {
        barRsrq.style.width = `${pct}%`;
        let colorClass = 'bg-rose-500';
        if (rsrqVal >= -10) {
          colorClass = 'bg-emerald-500';
        } else if (rsrqVal >= -15) {
          colorClass = 'bg-blue-500';
        } else if (rsrqVal >= -18) {
          colorClass = 'bg-amber-500';
        }
        barRsrq.className = `h-full ${colorClass} rounded-full transition-all duration-300`;
      }
    }

    // SINR
    if (data.sinr) {
      const sinrVal = parseInt(data.sinr.replace(/[^\d\-]/g, ''), 10) || 0;
      const valSinr = document.getElementById('valSinr');
      const barSinr = document.getElementById('barSinr');
      if (valSinr) valSinr.textContent = `${sinrVal} dB`;

      // Progress bar & color coding (-10 to 30 dB)
      const pct = Math.max(5, Math.min(100, Math.round(((sinrVal + 10) / 40) * 100)));
      if (barSinr) {
        barSinr.style.width = `${pct}%`;
        let colorClass = 'bg-rose-500';
        if (sinrVal >= 15) {
          colorClass = 'bg-emerald-500';
        } else if (sinrVal >= 8) {
          colorClass = 'bg-blue-500';
        } else if (sinrVal >= 0) {
          colorClass = 'bg-amber-500';
        }
        barSinr.className = `h-full ${colorClass} rounded-full transition-all duration-300`;
      }
    }

    // RSSI Total
    if (data.rssi) {
      const valRssi = document.getElementById('valRssi');
      if (valRssi) valRssi.textContent = `${data.rssi} dBm`;
    }

    // RSCP & Ec/Io in columns view
    const colRscp = document.getElementById('colRscp');
    const colEcio = document.getElementById('colEcio');
    if (colRscp) colRscp.textContent = data.rscp ? `${data.rscp} dBm` : '-- dBm';
    if (colEcio) colEcio.textContent = data.ecio ? `${data.ecio} dB` : '-- dB';
  },

  // 3. PLMN / Mobile Operator
  updatePlmnUi(data) {
    const brand = data.brand || 'Orange';
    this.state.carrierName = brand;
    const colCarrier = document.getElementById('colCarrier');
    if (colCarrier) colCarrier.textContent = brand;
  },

  // 4. Band Telemetry & Mode Sync
  updateNetModeUi(data) {
    if (!data.lteBand && !data.networkMode) return;

    this.state.networkMode = data.networkMode || '00';
    this.state.currentBandHex = (data.lteBand || '').toUpperCase();

    const parsed = HuaweiBands.parseLteHex(data.lteBand);
    this.state.currentBandSummary = parsed.summary;

    // Header badge
    const headerBand = document.getElementById('headerBandBadge');
    if (headerBand) {
      if (parsed.activeBandNumbers.length === 1) {
        headerBand.textContent = `Band ${parsed.activeBandNumbers[0]} Locked`;
      } else if (parsed.activeBandNumbers.length > 1) {
        headerBand.textContent = `${parsed.summary} (CA Locked)`;
      } else {
        headerBand.textContent = data.networkMode === '03' ? '4G LTE (Auto)' : 'Auto Mode';
      }
    }

    const hoverBand = document.getElementById('hoverPopupBandTag');
    if (hoverBand) hoverBand.textContent = parsed.summary;

    const statSigMode = document.getElementById('statSignalMode');
    if (statSigMode && parsed.summary && parsed.summary !== 'Auto') {
      statSigMode.textContent = parsed.summary;
    }

    const activeBands = parsed.activeBandNumbers || [];

    // Sync active mode button & checkboxes only if user isn't currently interacting
    if (!this.state.hasUserModifiedBands) {
      this.state.selectedMode = data.networkMode || '00';
      this.highlightActiveModeButton(this.state.selectedMode);

      const checkboxes = document.querySelectorAll('.gw-band-checkbox');
      checkboxes.forEach(cb => {
        const val = parseInt(cb.value, 10);
        cb.checked = activeBands.includes(val);
      });
      this.refreshBandCardStyles();
    }
  },

  async checkNetworkBands(silent = false) {
    if (!silent) this.toast('Checking network-allowed frequency bands...', 'info');

    try {
      const modeList = await this.api.getNetModeList();
      if (modeList && modeList.supportedLteHex) {
        const parsed = HuaweiBands.parseLteHex(modeList.supportedLteHex);
        if (parsed.activeBandNumbers && parsed.activeBandNumbers.length > 0) {
          this.state.networkAllowedBands = parsed.activeBandNumbers;
        }
      }
    } catch (e) {
      console.warn('[App] checkNetworkBands warning:', e);
    }

    this.updateNetworkAllowedBadges();

    const badgeText = document.getElementById('networkAllowedBadgeText');
    if (badgeText) {
      badgeText.textContent = `${this.state.networkAllowedBands.length} Allowed`;
    }

    if (!silent) {
      this.toast(`Network check complete: ${this.state.networkAllowedBands.length} bands allowed by mobile network.`, 'success');
    }
  },

  updateNetworkAllowedBadges() {
    const allowed = this.state.networkAllowedBands || [1, 3, 7, 8, 20, 38];
    const checkboxes = document.querySelectorAll('.gw-band-checkbox');
    const svgDown = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16m0 0l-6-6m6 6l6-6"/></svg>';
    const svgUp = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V4m0 0l-6 6m6-6l6 6"/></svg>';

    checkboxes.forEach(cb => {
      const bNum = parseInt(cb.value, 10);
      const inBadge = document.getElementById(`badgeB${bNum}In`);
      const outBadge = document.getElementById(`badgeB${bNum}Out`);
      if (!inBadge || !outBadge) return;

      const isAllowedByNetwork = allowed.includes(bNum);

      if (isAllowedByNetwork) {
        inBadge.className = 'pill-allowed';
        inBadge.innerHTML = svgDown;
        inBadge.title = 'Downlink (In): Allowed';

        // Band 32 is SDL (Supplementary Downlink only, no uplink)
        if (bNum === 32) {
          outBadge.className = 'pill-blocked';
          outBadge.innerHTML = svgUp;
          outBadge.title = 'Uplink (Out): Blocked (SDL - Downlink Only)';
        } else {
          outBadge.className = 'pill-allowed';
          outBadge.innerHTML = svgUp;
          outBadge.title = 'Uplink (Out): Allowed';
        }
      } else {
        inBadge.className = 'pill-blocked';
        inBadge.innerHTML = svgDown;
        inBadge.title = 'Downlink (In): Blocked';
        outBadge.className = 'pill-blocked';
        outBadge.innerHTML = svgUp;
        outBadge.title = 'Uplink (Out): Blocked';
      }
    });
  },

  highlightActiveModeButton(mode) {
    this.state.selectedMode = mode;
    const btnAuto = document.getElementById('btnModeAuto');
    const btn4G = document.getElementById('btnMode4G');
    const btn3G = document.getElementById('btnMode3G');
    const btn2G = document.getElementById('btnMode2G');

    const map = {
      '00': btnAuto,
      '03': btn4G,
      '02': btn3G,
      '01': btn2G
    };

    [btnAuto, btn4G, btn3G, btn2G].forEach(b => {
      if (b) {
        b.classList.remove('active');
        const svg = b.querySelector('svg');
        if (svg) svg.classList.add('text-slate-500');
      }
    });

    const activeBtn = map[mode];
    if (activeBtn) {
      activeBtn.classList.add('active');
      const svg = activeBtn.querySelector('svg');
      if (svg) svg.classList.remove('text-slate-500');
    }
  },

  selectMode(modeVal) {
    this.state.hasUserModifiedBands = true;
    this.state.selectedMode = modeVal;
    this.highlightActiveModeButton(modeVal);

    const summaryText = document.getElementById('bandSelectionSummaryText');
    const bandCards = document.querySelectorAll('.gw-band-card');
    const bandCheckboxes = document.querySelectorAll('.gw-band-checkbox');

    if (modeVal === '03') {
      bandCards.forEach(c => c.classList.remove('disabled'));
      bandCheckboxes.forEach(cb => cb.disabled = false);
      this.refreshBandCardStyles();
    } else {
      bandCards.forEach(c => c.classList.add('disabled'));
      bandCheckboxes.forEach(cb => cb.disabled = true);
      const modeLabels = { '00': 'Auto (All bands)', '02': '3G Only', '01': '2G Only' };
      if (summaryText) {
        summaryText.textContent = `${modeLabels[modeVal] || 'Profile'} selected. Connection may drop momentarily.`;
      }
    }
  },

  onBandSelectionChanged() {
    this.state.hasUserModifiedBands = true;

    // If not currently in 4G mode, automatically select 4G Only
    if (this.state.selectedMode !== '03') {
      this.state.selectedMode = '03';
      this.highlightActiveModeButton('03');
      const bandCards = document.querySelectorAll('.gw-band-card');
      const bandCheckboxes = document.querySelectorAll('.gw-band-checkbox');
      bandCards.forEach(c => c.classList.remove('disabled'));
      bandCheckboxes.forEach(cb => cb.disabled = false);
    }

    this.refreshBandCardStyles();
  },

  refreshBandCardStyles() {
    const bandCards = document.querySelectorAll('.gw-band-card');
    let count = 0;
    bandCards.forEach(card => {
      const cb = card.querySelector('.gw-band-checkbox');
      if (cb && cb.checked) {
        card.classList.add('selected');
        count++;
      } else {
        card.classList.remove('selected');
      }
    });

    const summaryText = document.getElementById('bandSelectionSummaryText');
    if (!summaryText) return;

    if (this.state.selectedMode && this.state.selectedMode !== '03') {
      const modeLabels = { '00': 'Auto (All bands)', '02': '3G Only', '01': '2G Only' };
      summaryText.textContent = `${modeLabels[this.state.selectedMode] || 'Profile'} selected. Connection may drop momentarily.`;
      return;
    }

    summaryText.textContent = `${count} band(s) selected. Connection may drop momentarily.`;
  },

  refreshCurrentMode() {
    this.api.getNetMode().then(res => this.updateNetModeUi(res)).catch(() => {});
  },

  // 5. General Router Status
  updateStatusUi(data) {
    if (data.wanIpAddress) {
      this.state.wanIp = data.wanIpAddress;
      const colWan = document.getElementById('colWanIp');
      if (colWan) colWan.textContent = `WAN IP: ${data.wanIpAddress}`;
    }
    if (data.currentWifiUser !== undefined) {
      this.state.wifiUsers = data.currentWifiUser;
      const badge = document.getElementById('devicesCountBadge');
      if (badge) badge.textContent = `${data.currentWifiUser} active`;
    }

    // Cellular Signal Strength (SignalIcon 0-5)
    if (data.signalStrength !== undefined || data.signalIcon !== undefined) {
      const bars = data.signalStrength !== undefined ? data.signalStrength : parseInt(data.signalIcon, 10);
      const netType = this.formatNetworkType(data.networkTypeEx);
      this.updateSignalBarsUi(bars, null, netType);
    }
  },

  formatNetworkType(typeEx) {
    if (!typeEx) return '4G LTE';
    const val = parseInt(typeEx, 10);
    if (val === 101) return '4G';
    if (val === 1011) return '4G+';
    if (val === 19) return 'LTE';
    if (val >= 41 && val <= 46) return '3G';
    if (val === 0) return 'No Service';
    return '4G LTE';
  },

  updateSignalBarsUi(barCount, rsrp, netType) {
    let bars = barCount !== null && barCount !== undefined ? parseInt(barCount, 10) : this.state.signalBars;

    // Fallback calculation from RSRP if SignalIcon is 0 or unavailable
    if ((isNaN(bars) || bars === 0) && this.state.rsrp) {
      const r = this.state.rsrp;
      if (r >= -85) bars = 5;
      else if (r >= -95) bars = 4;
      else if (r >= -105) bars = 3;
      else if (r >= -115) bars = 2;
      else if (r >= -125) bars = 1;
      else bars = 0;
    }

    bars = Math.max(0, Math.min(5, isNaN(bars) ? 0 : bars));
    this.state.signalBars = bars;

    // Update the 5 bars in the status strip (using blue-500 for active, slate-200 for inactive)
    for (let i = 1; i <= 5; i++) {
      const bar = document.getElementById(`sigBar${i}`);
      if (bar) {
        if (i <= bars) {
          bar.classList.remove('bg-slate-200');
          bar.classList.add('bg-blue-500');
        } else {
          bar.classList.remove('bg-blue-500');
          bar.classList.add('bg-slate-200');
        }
      }
    }

    const elStrength = document.getElementById('statSignalStrength');
    if (elStrength) {
      elStrength.textContent = bars > 0 ? `${bars}/5 Bars` : 'No Signal';
    }

    const elRsrp = document.getElementById('statSignalRsrp');
    if (elRsrp) {
      const currentRsrp = rsrp || (this.state.rsrp ? `${this.state.rsrp} dBm` : null);
      if (currentRsrp) {
        elRsrp.textContent = typeof currentRsrp === 'number' ? `${currentRsrp} dBm` : currentRsrp;
      }
    }

    const elMode = document.getElementById('statSignalMode');
    if (elMode) {
      if (netType) {
        elMode.textContent = netType;
      } else if (this.state.currentBandSummary && this.state.currentBandSummary !== 'Auto') {
        elMode.textContent = this.state.currentBandSummary;
      }
    }
  },

  // 6. Connected Wi-Fi Devices Accordion & Scanner
  toggleConnectedDevices() {
    const content = document.getElementById('devicesAccordionContent');
    const chevron = document.getElementById('devicesAccordionChevron');
    const toggle = document.getElementById('devicesAccordionToggle');
    if (!content) return;

    const isHidden = content.classList.contains('hidden');
    if (isHidden) {
      content.classList.remove('hidden');
      chevron?.classList.add('rotate-180');
      toggle?.setAttribute('aria-expanded', 'true');
      this.scanConnectedDevices();
    } else {
      content.classList.add('hidden');
      chevron?.classList.remove('rotate-180');
      toggle?.setAttribute('aria-expanded', 'false');
    }
  },

  onDevicesAccordionKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggleConnectedDevices();
    }
  },

  async scanConnectedDevices(forceOpen = false) {
    if (forceOpen) {
      const content = document.getElementById('devicesAccordionContent');
      const chevron = document.getElementById('devicesAccordionChevron');
      const toggle = document.getElementById('devicesAccordionToggle');
      if (content && content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        chevron?.classList.add('rotate-180');
        toggle?.setAttribute('aria-expanded', 'true');
      }
    }

    const tableBody = document.getElementById('thingsTableBody');
    if (!tableBody) return;

    try {
      const hosts = await this.api.getWlanHosts();
      if (!hosts || hosts.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="py-6 text-center text-slate-400 font-medium">No connected Wi-Fi devices detected.</td>
          </tr>
        `;
        const badge = document.getElementById('devicesCountBadge');
        if (badge) badge.textContent = '0 active';
        return;
      }

      const badge = document.getElementById('devicesCountBadge');
      if (badge) badge.textContent = `${hosts.length} active`;

      let html = '';
      hosts.forEach(host => {
        html += `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3 px-3 font-semibold text-slate-800 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              ${host.hostName || 'Connected Client'}
            </td>
            <td class="py-3 px-3 font-mono text-blue-600 font-medium">${host.ipAddress || '--'}</td>
            <td class="py-3 px-3 font-mono text-slate-400">${host.macAddress || '--'}</td>
            <td class="py-3 px-3 text-slate-500">${host.associatedTime ? host.associatedTime + 's' : 'Active'}</td>
            <td class="py-3 px-3">
              <span class="pill-allowed">Connected</span>
            </td>
          </tr>
        `;
      });
      tableBody.innerHTML = html;
    } catch (e) {
      console.warn('WLAN hosts scan error:', e);
    }
  },

  // 7. Band Locking Operations
  async applyConnectivitySettings() {
    const selectedMode = this.state.selectedMode || '03';

    if (selectedMode === '00') {
      await this.applyNetMode('00', HuaweiBands.ALL_3G_BAND, HuaweiBands.AUTO_LTE_BAND, 'Switched router to Auto mode');
      this.state.hasUserModifiedBands = false;
      return;
    }
    if (selectedMode === '02') {
      await this.applyNetMode('02', HuaweiBands.ALL_3G_BAND, HuaweiBands.AUTO_LTE_BAND, 'Locked router to 3G Only');
      this.state.hasUserModifiedBands = false;
      return;
    }
    if (selectedMode === '01') {
      await this.applyNetMode('01', HuaweiBands.ALL_3G_BAND, HuaweiBands.AUTO_LTE_BAND, 'Locked router to 2G Only');
      this.state.hasUserModifiedBands = false;
      return;
    }

    // 4G LTE Mode
    const checkedCheckboxes = document.querySelectorAll('.gw-band-checkbox:checked');
    const checkedBands = [];
    checkedCheckboxes.forEach(cb => {
      const num = parseInt(cb.value, 10);
      if (!isNaN(num)) checkedBands.push(num);
    });

    if (checkedBands.length === 0) {
      this.toast('Please select at least 1 band, or choose Auto mode.', 'warning');
      return;
    }

    const hex = HuaweiBands.calcLteHex(checkedBands);
    const parsed = HuaweiBands.parseLteHex(hex);
    const label = checkedBands.length === 1 ? `Band ${checkedBands[0]}` : `CA (${parsed.summary})`;

    await this.applyNetMode('03', HuaweiBands.ALL_3G_BAND, hex, `Locked router to ${label} (0x${hex})`);
    this.state.hasUserModifiedBands = false;
  },

  async lockMode(modeVal) {
    this.selectMode(modeVal);
    await this.applyConnectivitySettings();
  },

  async lockSingleLteBand(bandNum) {
    const hex = HuaweiBands.calcLteHex([bandNum]);
    await this.applyNetMode('03', HuaweiBands.ALL_3G_BAND, hex, `Locked router to Band ${bandNum} (0x${hex})`);
  },

  async lockCaPreset(bandsArray, label) {
    const hex = HuaweiBands.calcLteHex(bandsArray);
    await this.applyNetMode('03', HuaweiBands.ALL_3G_BAND, hex, `Locked router to ${label} (0x${hex})`);
  },

  async lock3gBand(netBandHex, label) {
    await this.applyNetMode('02', netBandHex, HuaweiBands.AUTO_LTE_BAND, `Locked router to 3G ${label}`);
  },

  async applyCustomHex() {
    const input = document.getElementById('customHexInput');
    const hex = (input?.value || '').trim();
    if (!hex) {
      this.toast('Please enter a valid hex mask.', 'warning');
      return;
    }
    const parsed = HuaweiBands.parseLteHex(hex);
    await this.applyNetMode('03', HuaweiBands.ALL_3G_BAND, hex.toUpperCase(), `Applied hex 0x${hex.toUpperCase()} (${parsed.summary})`);
  },

  updateHexPreview(hex) {
    const preview = document.getElementById('hexPreviewText');
    if (!preview) return;
    if (!hex) {
      preview.textContent = '';
      return;
    }
    const parsed = HuaweiBands.parseLteHex(hex);
    preview.textContent = `Bands: ${parsed.summary}`;
  },

  async applyNetMode(mode, netBand, lteBand, successMessage) {
    this.toast('Applying band configuration to router...', 'info');

    try {
      await this.api.setNetMode(mode, netBand, lteBand);
      this.toast(successMessage || 'Band locked successfully!', 'success');
      setTimeout(() => this.pollOnce(), 1200);
    } catch (err) {
      this.toast(`Band Lock Failed: ${err.message}`, 'danger');
    }
  },

  // 8. Router Reboot
  async performReboot() {
    this.closeModal('rebootModal');
    this.toast('Sending reboot command to router...', 'info');

    try {
      await this.api.reboot();
      this.toast('Router is rebooting. Network will reconnect in 60-90s.', 'success');
    } catch (err) {
      this.toast(`Reboot failed: ${err.message}`, 'danger');
    }
  },

  // 9. Open Tip / Donate Link in Default Browser
  async openTipLink(event, targetUrl) {
    const url = targetUrl || 'https://ko-fi.com/w3simple/tip';
    const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI__);

    if (isTauri && event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    if (isTauri) {
      // 1. Try our native Tauri custom command first (handles opener plugin & OS process fallback)
      try {
        if (window.__TAURI__?.core?.invoke) {
          await window.__TAURI__.core.invoke('app_open_url', { url });
          return;
        }
        if (window.__TAURI__?.invoke) {
          await window.__TAURI__.invoke('app_open_url', { url });
          return;
        }
      } catch (err) {
        console.warn('Native app_open_url failed, trying plugin:opener:', err);
      }

      // 2. Try Tauri v2 opener plugin directly
      try {
        if (window.__TAURI__?.opener?.openUrl) {
          await window.__TAURI__.opener.openUrl(url);
          return;
        }
        if (window.__TAURI__?.core?.invoke) {
          await window.__TAURI__.core.invoke('plugin:opener|open_url', { url });
          return;
        }
        if (window.__TAURI__?.invoke) {
          await window.__TAURI__.invoke('plugin:opener|open_url', { url });
          return;
        }
      } catch (err) {
        console.warn('Tauri opener plugin failed, trying shell plugin:', err);
      }

      // 3. Try legacy Tauri v1 shell plugin
      try {
        if (window.__TAURI__?.shell?.open) {
          await window.__TAURI__.shell.open(url);
          return;
        }
        if (window.__TAURI__?.core?.invoke) {
          await window.__TAURI__.core.invoke('plugin:shell|open', { path: url });
          return;
        }
        if (window.__TAURI__?.invoke) {
          await window.__TAURI__.invoke('plugin:shell|open', { path: url });
          return;
        }
      } catch (err) {
        console.warn('Tauri shell open failed:', err);
      }
    }

    // If not running in Tauri or if event was prevented, open fallback
    if (!event || event.defaultPrevented) {
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (err) {
        window.location.href = url;
      }
    }
  }
};

// Auto-boot application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
