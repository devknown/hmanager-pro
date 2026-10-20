class HuaweiRouterApi {
  constructor(config = {}) {
    this.routerUrl = (config.routerUrl || 'http://192.168.1.1').replace(/\/+$/, '');
    this.username = config.username || 'admin';
    this.password = config.password || '';
    this.useProxy = config.useProxy !== undefined ? config.useProxy : true;
    this.proxyBase = '/api/proxy/';

    this.token = '';
    this.session = '';
    this.tokens = [];
    this.passwordType = '4';
    this.isLoggedIn = false;
    this.onLog = config.onLog || console.log;
  }

  setRouterUrl(url) {
    this.routerUrl = (url || 'http://192.168.1.1').replace(/\/+$/, '');
  }

  setCredentials(username, password) {
    this.username = username;
    this.password = password;
  }

  setUseProxy(useProxy) {
    this.useProxy = !!useProxy;
  }

  /**
   * Builds the full request URL depending on proxy mode
   */
  buildUrl(endpoint) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    if (this.useProxy) {
      return `${this.proxyBase}${cleanEndpoint}`;
    }
    return `${this.routerUrl}/${cleanEndpoint}`;
  }

  isTauri() {
    return typeof window !== 'undefined' && !!(window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke);
  }

  /**
   * Generic HTTP request with token and session cookies
   */
  async request(endpoint, options = {}) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
      'Accept': 'application/xml, text/xml, */*',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['__RequestVerificationToken'] = this.token;
    }

    if (this.session) {
      headers['Cookie'] = this.session;
    }

    if (method === 'POST' || method === 'PUT') {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/xml; charset=UTF-8';
      }
    }

    // TAURI NATIVE EXECUTION (Offline, Bypasses CORS, No Node server needed)
    if (this.isTauri()) {
      try {
        const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;
        const targetUrl = `${this.routerUrl}/${cleanEndpoint}`;
        const res = await invoke('router_http_request', {
          url: targetUrl,
          method,
          headers,
          body: options.body || null
        });

        const headersMap = {
          get: (name) => {
            const lower = name.toLowerCase();
            return res.headers ? (res.headers[lower] || null) : null;
          },
          ...(res.headers || {})
        };

        const rawTokenHeader = headersMap.get('x-router-token') ||
                               headersMap.get('__requestverificationtokenone') ||
                               headersMap.get('__requestverificationtoken') ||
                               headersMap.get('__requestverificationtokentwo');
        if (rawTokenHeader) {
          const cleanTok = rawTokenHeader.split('#')[0].trim();
          if (cleanTok) this.token = cleanTok;
        }

        const routerCookie = headersMap.get('set-cookie') || headersMap.get('x-router-cookie');
        if (routerCookie) {
          const match = routerCookie.match(/SessionID=([^;]+)/i);
          if (match) this.session = `SessionID=${match[1]}`;
        }

        const text = res.body || '';

        if (text.includes('125001') || text.includes('125002') || text.includes('125003')) {
          this.onLog('Session or token expired. Refreshing tokens...');
          await this.refreshSesTok();
        }

        const xmlDoc = this.parseXml(text);
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          headers: headersMap,
          text,
          xml: xmlDoc
        };
      } catch (err) {
        this.onLog(`Native request error [${cleanEndpoint}]: ${err.message}`);
        throw err;
      }
    }

    // BROWSER / PROXY EXECUTION
    const url = this.buildUrl(endpoint);
    if (this.useProxy) {
      headers['X-Router-Host'] = this.routerUrl;
    }

    const fetchOptions = {
      method,
      headers
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    try {
      const response = await fetch(url, fetchOptions);

      // Extract updated token from response headers if returned by router or proxy
      const rawTokenHeader = response.headers.get('x-router-token') ||
                             response.headers.get('__requestverificationtokenone') ||
                             response.headers.get('__requestverificationtoken') ||
                             response.headers.get('__RequestVerificationToken');
      if (rawTokenHeader) {
        const cleanTok = rawTokenHeader.split('#')[0].trim();
        if (cleanTok) {
          this.token = cleanTok;
        }
      }

      // Extract set-cookie or custom proxy cookie
      const routerCookie = response.headers.get('x-router-cookie') || response.headers.get('set-cookie');
      if (routerCookie) {
        const match = routerCookie.match(/SessionID=([^;]+)/i);
        if (match) {
          this.session = `SessionID=${match[1]}`;
        }
      }

      const text = await response.text();

      // Check if session/token expired (Error 125001, 125002, 125003)
      if (text.includes('125001') || text.includes('125002') || text.includes('125003')) {
        this.onLog('Session or token expired. Refreshing tokens...');
        await this.refreshSesTok();
      }

      const xmlDoc = this.parseXml(text);
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        text,
        xml: xmlDoc
      };
    } catch (err) {
      this.onLog(`Network error requesting ${endpoint}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Helper to parse XML string into DOM document
   */
  parseXml(xmlString) {
    if (!xmlString) return null;
    try {
      const parser = new DOMParser();
      return parser.parseFromString(xmlString, 'application/xml');
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract tag content from XML Document
   */
  findTag(xmlDoc, tagName, defaultValue = '') {
    if (!xmlDoc) return defaultValue;
    const el = xmlDoc.querySelector(tagName);
    return el ? el.textContent.trim() : defaultValue;
  }

  /**
   * 1. Check Login State (api/user/state-login)
   */
  async checkLoginState() {
    try {
      if (!this.session || !this.token) {
        await this.refreshSesTok();
      }

      const res = await this.request('api/user/state-login');
      const state = this.findTag(res.xml, 'State');
      const passType = this.findTag(res.xml, 'password_type');

      if (passType) {
        this.passwordType = passType;
      }

      this.isLoggedIn = (state === '0');
      return {
        isLoggedIn: this.isLoggedIn,
        state,
        passwordType: this.passwordType
      };
    } catch (err) {
      return { isLoggedIn: false, error: err.message };
    }
  }

  /**
   * 2. Fetch Session & Token Info (Supports Flybox meta-tokens and HiLink SesTokInfo)
   */
  /**
   * 2. Fetch Session & Token Info (Supports Flybox meta-tokens and HiLink SesTokInfo)
   */
  async refreshSesTok() {
    try {
      if (this.useProxy && !this.isTauri()) {
        try {
          const initRes = await fetch('/api/auth/session-init', {
            headers: { 'X-Router-Host': this.routerUrl }
          });
          if (initRes.ok) {
            const data = await initRes.json();
            if (data.session) this.session = data.session;
            if (data.tokens && data.tokens.length > 0) this.tokens = data.tokens;
            if (data.token) this.token = data.token;
            return { session: this.session, token: this.token };
          }
        } catch (e) {
          // Fallback to direct requests below
        }
      }

      // Try router HTML pages to extract meta tokens and cookies (Flybox / newer firmwares)
      const pagesToTry = ['home/index.html', 'html/home.html', 'html/index.html'];
      for (const page of pagesToTry) {
        try {
          const pageRes = await this.request(page);
          if (pageRes.text && pageRes.text.includes('csrf_token')) {
            const tokens = [];
            const metaRegex = /<meta\s+name=["']csrf_token["']\s+content=["']([^"']+)["']/gi;
            let m;
            while ((m = metaRegex.exec(pageRes.text)) !== null) {
              tokens.push(m[1]);
            }
            if (tokens.length > 0) {
              this.tokens = tokens;
              this.token = tokens[0];
              return { session: this.session, token: this.token };
            }
          }
        } catch (e) {}
      }

      // Standard HiLink fallback:
      const res = await this.request('api/webserver/SesTokInfo');
      const sesInfo = this.findTag(res.xml, 'SesInfo');
      const tokInfo = this.findTag(res.xml, 'TokInfo');

      if (sesInfo) this.session = sesInfo;
      if (tokInfo) this.token = tokInfo;

      if (!this.token) {
        try {
          const oldTokRes = await this.request('api/webserver/token');
          const oldTok = this.findTag(oldTokRes.xml, 'token');
          if (oldTok) this.token = oldTok;
        } catch (e) {}
      }

      return { session: this.session, token: this.token };
    } catch (err) {
      this.onLog(`Failed to fetch session tokens: ${err.message}`);
      throw err;
    }
  }

  /**
   * 3. Authenticate / Login to Router (api/user/login)
   * Supports RSA-2048 PKCS#1 v1.5 encryption (Flybox, B310s, B525, B535) and Type 4 / Type 0 hashing
   */
  async login(user, pass) {
    if (user) this.username = user;
    if (pass) this.password = pass;

    // In web dev mode with server.js (proxy mode and NOT in Tauri), try server login
    if (this.useProxy && !this.isTauri()) {
      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Router-Host': this.routerUrl
          },
          body: JSON.stringify({
            username: this.username,
            password: this.password,
            routerUrl: this.routerUrl
          })
        });

        if (loginRes.ok) {
          const data = await loginRes.json();
          if (data.success) {
            this.isLoggedIn = true;
            if (data.session) this.session = data.session;
            if (data.token) this.token = data.token;
            return { success: true, message: 'Login successful' };
          } else {
            throw new Error(data.error || 'Login failed');
          }
        }
      } catch (err) {
        this.onLog(`Server login error: ${err.message}. Trying direct router login...`);
      }
    }

    // Direct / Tauri native login:
    // 1. Get fresh Session & Token
    await this.refreshSesTok();

    if (!this.token) {
      throw new Error('Unable to obtain security token from router.');
    }

    // 2. Check if router supports RSA encryption
    let pubKeyN = '';
    let pubKeyE = '';
    try {
      const pkRes = await this.request('api/webserver/publickey');
      const n = this.findTag(pkRes.xml, 'encpubkeyn');
      const e = this.findTag(pkRes.xml, 'encpubkeye');
      if (n && e) {
        pubKeyN = n.trim();
        pubKeyE = e.trim();
      }
    } catch (e) {
      this.onLog(`Public key check: ${e.message}`);
    }

    // 3. Compute password payload
    let hashed = '';
    if (this.passwordType === '4' || this.passwordType === 4 || !this.passwordType) {
      hashed = HuaweiCrypto.hashPasswordType4(this.username, this.password, this.token);
    } else {
      hashed = HuaweiCrypto.hashPasswordBasic(this.password);
    }

    const loginXml = `<?xml version="1.0" encoding="UTF-8"?><request><Username>${this.username}</Username><Password>${hashed}</Password><password_type>4</password_type></request>`;

    const headers = {
      'Content-Type': 'application/xml; charset=UTF-8'
    };
    let bodyToSend = loginXml;

    if (pubKeyN && pubKeyE && typeof HuaweiCrypto.rsaEncrypt === 'function') {
      headers['encrypt_transmit'] = 'encrypt_transmit';
      bodyToSend = HuaweiCrypto.rsaEncrypt(loginXml, pubKeyN, pubKeyE);
    }

    const res = await this.request('api/user/login', {
      method: 'POST',
      headers,
      body: bodyToSend
    });

    const responseText = res.text || '';
    if (responseText.includes('<response>OK</response>') || this.findTag(res.xml, 'response') === 'OK' || responseText.includes('OK')) {
      this.isLoggedIn = true;

      // Extract new session from Set-Cookie header if returned
      const setCookie = res.headers.get ? res.headers.get('set-cookie') : res.headers['set-cookie'];
      if (setCookie) {
        const match = setCookie.match(/SessionID=([^;]+)/i);
        if (match) {
          this.session = `SessionID=${match[1]}`;
        }
      }

      // Update active token from response headers
      const rawTok = (res.headers.get ? res.headers.get('__requestverificationtokenone') : res.headers['__requestverificationtokenone']) || 
                     (res.headers.get ? res.headers.get('__requestverificationtoken') : res.headers['__requestverificationtoken']) || 
                     (res.headers.get ? res.headers.get('__RequestVerificationToken') : res.headers['__RequestVerificationToken']);
      if (rawTok) {
        const cleanTok = rawTok.split('#')[0].trim();
        if (cleanTok) {
          this.token = cleanTok;
        }
      } else if (this.tokens && this.tokens.length > 1) {
        this.token = this.tokens[1];
      }

      return { success: true, message: 'Login successful' };
    }

    // Handle error codes from Huawei HiLink
    const code = this.findTag(res.xml, 'code');
    if (code === '108009' || responseText.includes('108009')) {
      throw new Error('Incorrect username or password. Please verify your credentials.');
    } else if (code === '108006' || responseText.includes('108006')) {
      throw new Error('Incorrect password. Please verify your router admin password.');
    } else if (code === '108007' || responseText.includes('108007')) {
      throw new Error('Maximum login attempts exceeded. Your router is temporarily locked (usually 2-5 minutes). Please wait and try again.');
    } else if (code === '108001' || code === '108002' || responseText.includes('108001') || responseText.includes('108002')) {
      throw new Error('Another administrator is currently logged into the router. Please log out from other devices or wait a moment.');
    } else if (code === '100003' || responseText.includes('100003')) {
      throw new Error('Session expired or unauthorized. Please try logging in again.');
    } else if (code === '100002') {
      throw new Error('Router is busy. Please wait a moment and try again.');
    } else if (code) {
      throw new Error(`Login failed (Router error code ${code}). Please verify your credentials.`);
    }

    throw new Error('Unable to log into router. Please check your username, password, and router IP address.');
  }

  async logout() {
    try {
      await this.request('api/user/logout', {
        method: 'POST',
        body: '<?xml version="1.0" encoding="UTF-8"?><request><LogoutUser>1</LogoutUser></request>'
      });
    } catch (e) {}
    this.isLoggedIn = false;
    this.session = '';
    this.token = '';
    this.password = '';
  }

  /**
   * 4. Connection & Monitoring Status (api/monitoring/status)
   */
  async getStatus() {
    const res = await this.request('api/monitoring/status');
    const xml = res.xml;

    const errCode = this.findTag(xml, 'code');
    if (errCode && errCode !== '0') {
      throw new Error(`Router error ${errCode}`);
    }

    const connectionStatus = this.findTag(xml, 'ConnectionStatus');
    if (!connectionStatus) {
      throw new Error('Empty connection status');
    }

    return {
      connectionStatus,
      signalStrength: parseInt(this.findTag(xml, 'SignalIcon', '0'), 10),
      signalIcon: this.findTag(xml, 'SignalIcon', '0'),
      networkTypeEx: this.findTag(xml, 'CurrentNetworkTypeEx'),
      currentWifiUser: parseInt(this.findTag(xml, 'CurrentWifiUser', '0'), 10),
      roamingStatus: this.findTag(xml, 'RoamingStatus'),
      batteryStatus: this.findTag(xml, 'BatteryStatus'),
      batteryLevel: this.findTag(xml, 'BatteryLevel'),
      batteryPercent: this.findTag(xml, 'BatteryPercent'),
      wanIpAddress: this.findTag(xml, 'WanIPAddress'),
      simStatus: this.findTag(xml, 'SimStatus'),
      rawXml: res.text
    };
  }

  /**
   * 5. Real-Time Traffic Statistics (api/monitoring/traffic-statistics)
   */
  async getTraffic() {
    const res = await this.request('api/monitoring/traffic-statistics');
    const xml = res.xml;

    const errCode = this.findTag(xml, 'code');
    if (errCode && errCode !== '0') {
      throw new Error(`Router error ${errCode}`);
    }

    const currentDownloadRate = parseInt(this.findTag(xml, 'CurrentDownloadRate', '0'), 10);
    const currentUploadRate = parseInt(this.findTag(xml, 'CurrentUploadRate', '0'), 10);
    const currentDownload = parseInt(this.findTag(xml, 'CurrentDownload', '0'), 10);
    const currentUpload = parseInt(this.findTag(xml, 'CurrentUpload', '0'), 10);
    const totalDownload = parseInt(this.findTag(xml, 'TotalDownload', '0'), 10);
    const totalUpload = parseInt(this.findTag(xml, 'TotalUpload', '0'), 10);
    const currentConnectTime = parseInt(this.findTag(xml, 'CurrentConnectTime', '0'), 10);

    return {
      currentConnectTime,
      currentDownloadRate, // B/s
      currentUploadRate,   // B/s
      currentDownload,     // Bytes
      currentUpload,       // Bytes
      totalDownload,       // Bytes
      totalUpload,         // Bytes
      totalTraffic: totalDownload + totalUpload
    };
  }

  /**
   * 6. Detailed Signal Metrics (api/device/signal)
   */
  async getSignal() {
    const res = await this.request('api/device/signal');
    const xml = res.xml;

    const errCode = this.findTag(xml, 'code');
    if (errCode && errCode !== '0') {
      throw new Error(`Router error ${errCode}`);
    }

    const pci = this.findTag(xml, 'pci') || this.findTag(xml, 'sc');
    const cellId = this.findTag(xml, 'cell_id');
    const rssi = this.findTag(xml, 'rssi');
    const rsrp = this.findTag(xml, 'rsrp');
    const rsrq = this.findTag(xml, 'rsrq');
    const sinr = this.findTag(xml, 'sinr');
    const rscp = this.findTag(xml, 'rscp') || this.findTag(xml, 'Rscp');
    const ecio = this.findTag(xml, 'ecio') || this.findTag(xml, 'Ecio');
    const dlBandwidth = this.findTag(xml, 'dlbandwidth');
    const ulBandwidth = this.findTag(xml, 'ulbandwidth');
    const neiCellId = this.findTag(xml, 'nei_cellid');
    const txPower = this.findTag(xml, 'txpower');

    return {
      pci,
      cellId,
      rssi,
      rsrp,
      rsrq,
      sinr,
      rscp,
      ecio,
      dlBandwidth,
      ulBandwidth,
      neiCellId,
      txPower,
      rawXml: res.text
    };
  }

  /**
   * 7. 3G Signal Parameters (api/net/signal-para)
   */
  async getSignalPara() {
    try {
      const res = await this.request('api/net/signal-para');
      return {
        rscp: this.findTag(res.xml, 'Rscp'),
        ecio: this.findTag(res.xml, 'Ecio')
      };
    } catch (e) {
      return { rscp: '', ecio: '' };
    }
  }

  /**
   * 8. Current Operator / PLMN (api/net/current-plmn)
   */
  async getPlmn() {
    const res = await this.request('api/net/current-plmn');
    const xml = res.xml;

    const errCode = this.findTag(xml, 'code');
    if (errCode && errCode !== '0') {
      throw new Error(`Router error ${errCode}`);
    }

    const fullName = this.findTag(xml, 'FullName');
    const shortName = this.findTag(xml, 'ShortName');
    const rat = this.findTag(xml, 'Rat');
    const numeric = this.findTag(xml, 'Numeric');

    return {
      fullName,
      shortName,
      brand: fullName || shortName || 'Unknown Operator',
      rat,
      numeric
    };
  }

  /**
   * 9. Device Hardware Information (api/device/information)
   */
  async getDeviceInfo() {
    const res = await this.request('api/device/information');
    const xml = res.xml;

    return {
      deviceName: this.findTag(xml, 'DeviceName'),
      wanIpAddress: this.findTag(xml, 'WanIPAddress'),
      imei: this.findTag(xml, 'Imei'),
      imsi: this.findTag(xml, 'Imsi'),
      serialNumber: this.findTag(xml, 'Serial'),
      msisdn: this.findTag(xml, 'Msisdn'),
      hardwareVersion: this.findTag(xml, 'HardwareVersion'),
      softwareVersion: this.findTag(xml, 'SoftwareVersion'),
      webUiVersion: this.findTag(xml, 'WebUIVersion'),
      macAddress1: this.findTag(xml, 'MacAddress1'),
      macAddress2: this.findTag(xml, 'MacAddress2'),
      productFamily: this.findTag(xml, 'ProductFamily'),
      classify: this.findTag(xml, 'Classify')
    };
  }

  /**
   * 10. Get Network Mode & Band (api/net/net-mode)
   */
  async getNetMode() {
    const res = await this.request('api/net/net-mode');
    const xml = res.xml;

    const errCode = this.findTag(xml, 'code');
    if (errCode && errCode !== '0') {
      throw new Error(`Router error ${errCode}`);
    }

    return {
      networkMode: this.findTag(xml, 'NetworkMode'),
      networkBand: this.findTag(xml, 'NetworkBand'),
      lteBand: this.findTag(xml, 'LTEBand'),
      rawXml: res.text
    };
  }

  /**
   * 10b. Get Network Supported & Allowed Bands (api/net/net-mode-list)
   * Queries the cellular network and router modem for supported frequency bands
   */
  async getNetModeList() {
    try {
      const res = await this.request('api/net/net-mode-list');
      const text = res.text || '';

      let supportedLteHex = '';
      const lteMatches = [...text.matchAll(/<LTEBand>[\s\S]*?<Value>([0-9a-fA-F]+)<\/Value>[\s\S]*?<\/LTEBand>/gi)];
      for (const m of lteMatches) {
        const val = m[1].trim();
        if (!val.toLowerCase().startsWith('7fffffff')) {
          supportedLteHex = val;
          break;
        }
      }

      if (!supportedLteHex && lteMatches.length > 0) {
        supportedLteHex = lteMatches[0][1].trim();
      }

      return {
        supportedLteHex: (supportedLteHex || '20000800C5').toUpperCase(),
        rawXml: text
      };
    } catch (e) {
      console.warn('[HuaweiApi] getNetModeList warning:', e);
      return { supportedLteHex: '20000800C5' };
    }
  }

  /**
   * 11. Lock Network Mode & Band (api/net/net-mode)
   * The core feature of Huawei Manager!
   * NetworkMode:
   * '00' = Auto
   * '01' = 2G Only
   * '02' = 3G Only
   * '03' = 4G Only
   */
  async setNetMode(networkMode, networkBand, lteBand) {
    const mode = networkMode || '00';
    const netBand = networkBand || '3FFFFFFF';
    const lte = lteBand || '7FFFFFFFFFFFFFFF';

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?><request><NetworkMode>${mode}</NetworkMode><NetworkBand>${netBand}</NetworkBand><LTEBand>${lte}</LTEBand></request>`;

    const res = await this.request('api/net/net-mode', {
      method: 'POST',
      body: xmlPayload
    });

    if (res.text.includes('OK') || this.findTag(res.xml, 'response') === 'OK') {
      return { success: true, message: 'Band locked successfully' };
    }

    const code = this.findTag(res.xml, 'code');
    if (code === '100003') {
      throw new Error('Admin privileges required (100003). Please verify password in Settings.');
    }

    throw new Error(`Failed to lock band: ${res.text}`);
  }

  /**
   * 12. Router Reboot (api/device/control)
   */
  async reboot() {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><request><Control>1</Control></request>';
    const res = await this.request('api/device/control', {
      method: 'POST',
      body: xml
    });
    if (res.text.includes('OK')) {
      return { success: true, message: 'Router reboot initiated' };
    }
    throw new Error(`Reboot failed: ${res.text}`);
  }

  /**
   * 13. Mobile Data Switch (api/dialup/mobile-dataswitch)
   */
  async setMobileData(enabled) {
    const val = enabled ? '1' : '0';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><request><dataswitch>${val}</dataswitch></request>`;
    const res = await this.request('api/dialup/mobile-dataswitch', {
      method: 'POST',
      body: xml
    });
    if (res.text.includes('OK')) {
      return { success: true, enabled: !!enabled };
    }
    throw new Error(`Failed to toggle mobile data: ${res.text}`);
  }

  /**
   * 14. Wi-Fi Connected Clients (api/wlan/host-list)
   */
  async getWlanHosts() {
    try {
      const res = await this.request('api/wlan/host-list');
      const xml = res.xml;
      if (!xml) return [];

      const hosts = [];
      const hostNodes = xml.querySelectorAll('Host');
      hostNodes.forEach(node => {
        const hostName = node.querySelector('HostName')?.textContent?.trim() || 'Unknown';
        const ipAddress = node.querySelector('IpAddress')?.textContent?.trim() || '';
        const macAddress = node.querySelector('MacAddress')?.textContent?.trim() || '';
        const associatedTime = node.querySelector('AssociatedTime')?.textContent?.trim() || '';
        hosts.push({ hostName, ipAddress, macAddress, associatedTime });
      });

      return hosts;
    } catch (e) {
      return [];
    }
  }

  /**
   * 15. SMS Count (api/sms/sms-count)
   */
  async getSmsCount() {
    try {
      const res = await this.request('api/sms/sms-count');
      return {
        unread: parseInt(this.findTag(res.xml, 'LocalUnread', '0'), 10),
        inbox: parseInt(this.findTag(res.xml, 'LocalInbox', '0'), 10),
        outbox: parseInt(this.findTag(res.xml, 'LocalOutbox', '0'), 10)
      };
    } catch (e) {
      return { unread: 0, inbox: 0, outbox: 0 };
    }
  }

  /**
   * 16. USSD Console (api/ussd/send and api/ussd/get)
   */
  async sendUssd(code) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><request><content>${code}</content><codeType>CodeType</codeType><timeout></timeout></request>`;
    const sendRes = await this.request('api/ussd/send', {
      method: 'POST',
      body: xml
    });

    if (!sendRes.text.includes('OK')) {
      throw new Error(`USSD Send failed: ${sendRes.text}`);
    }

    // Wait 1.5 seconds then fetch USSD response
    await new Promise(r => setTimeout(r, 1500));
    const getRes = await this.request('api/ussd/get');
    const content = this.findTag(getRes.xml, 'content');
    return content || getRes.text;
  }

  /**
   * 17. Raw API Debugger
   */
  async rawRequest(endpoint, method = 'GET', body = '') {
    return await this.request(endpoint, {
      method,
      body: body || undefined
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HuaweiRouterApi;
}
