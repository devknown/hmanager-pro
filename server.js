/**
 * Huawei Manager Web Server & Router Proxy
 * Reverse engineered from Huawei Manager APK
 * 
 * - Zero external dependencies (uses standard Node.js libraries)
 * - Acts as an intelligent CORS-bypassing proxy for Huawei HiLink & Flybox routers
 * - Manages challenge-response authentication, session cookies, and CSRF tokens
 * - Serves the modern Web dashboard
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const nodeCrypto = require('crypto');
const Crypto = require('./public/js/crypto.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

let isRouterLoggedIn = false;
let routerCredentials = {
  username: 'admin',
  password: ''
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8'
};

// Set default router host
let defaultRouterHost = 'http://192.168.1.1';

// Server-side active session memory
let activeSession = '';
let activeToken = '';
let activeTokens = [];

// Helper to set standard CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, __RequestVerificationToken, Cookie, X-Router-Host, X-Requested-With, Cache-Control');
  res.setHeader('Access-Control-Expose-Headers', '__RequestVerificationToken, __requestverificationtoken, __requestverificationtokenone, __requestverificationtokentwo, X-Router-Cookie, X-Router-Token, Set-Cookie, Content-Type');
}

// Low-level HTTP helper to talk to router
function routerRequest(routerBase, pagePath, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve) => {
    let cleanBase = routerBase.trim();
    if (!cleanBase.endsWith('/')) cleanBase += '/';
    const targetUrl = new URL(cleanBase + pagePath.replace(/^\/+/, ''));

    const isHttps = targetUrl.protocol === 'https:';
    const clientModule = isHttps ? https : http;

    const defaultHeaders = {
      'Host': targetUrl.host,
      'Connection': 'close',
      'Accept': '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `${cleanBase}home/index.html`,
      'Origin': cleanBase.replace(/\/+$/, '')
    };

    const finalHeaders = Object.assign(defaultHeaders, headers);
    if (body) {
      finalHeaders['Content-Length'] = Buffer.byteLength(body);
      if (!finalHeaders['Content-Type']) {
        finalHeaders['Content-Type'] = 'application/xml; charset=UTF-8';
      }
    }

    const r = clientModule.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method,
      headers: finalHeaders,
      timeout: 5000
    }, resp => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: data }));
    });

    r.on('error', err => resolve({ status: 500, headers: {}, body: '', error: err.message }));
    r.on('timeout', () => {
      r.destroy();
      resolve({ status: 504, headers: {}, body: '', error: 'Timeout' });
    });

    if (body) r.write(body);
    r.end();
  });
}

// Session initialization: extracts Flybox meta tokens or HiLink SesTokInfo
async function fetchRouterSession(routerBase) {
  let session = '';
  let tokens = [];

  // 1. Try home/index.html (Flybox B310s, B315, B525, B535, etc.)
  let pageRes = await routerRequest(routerBase, 'home/index.html', 'GET');
  if (pageRes.status !== 200 || !pageRes.body.includes('csrf_token')) {
    pageRes = await routerRequest(routerBase, 'html/home.html', 'GET');
  }
  if (pageRes.status !== 200 || !pageRes.body.includes('csrf_token')) {
    pageRes = await routerRequest(routerBase, 'html/index.html', 'GET');
  }

  const setCookie = pageRes.headers['set-cookie'];
  if (setCookie) {
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    const m = cookieStr.match(/SessionID=([^;]+)/i);
    if (m) session = `SessionID=${m[1]}`;
  }

  const metaRegex = /<meta\s+name=["']csrf_token["']\s+content=["']([^"']+)["']/gi;
  let match;
  while ((match = metaRegex.exec(pageRes.body)) !== null) {
    tokens.push(match[1]);
  }

  // 2. If no meta tokens found in HTML or missing session, try api/webserver/SesTokInfo (standard HiLink)
  if (tokens.length === 0 || !session) {
    const sestokRes = await routerRequest(routerBase, 'api/webserver/SesTokInfo', 'GET', session ? { 'Cookie': session } : {});
    const sesMatch = sestokRes.body.match(/<SesInfo>(.*?)<\/SesInfo>/);
    const tokMatch = sestokRes.body.match(/<TokInfo>(.*?)<\/TokInfo>/);
    if (sesMatch && !session) session = sesMatch[1];
    if (tokMatch) tokens.push(tokMatch[1]);
  }

  activeSession = session;
  activeTokens = tokens;
  activeToken = tokens[0] || '';

  return { session, tokens, token: activeToken };
}

function hexToBase64Url(hex) {
  let buf = Buffer.from(hex, 'hex');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function rsaEncrypt(xmlStr, pubKeyN, pubKeyE) {
  const jwk = {
    kty: 'RSA',
    n: hexToBase64Url(pubKeyN),
    e: hexToBase64Url(pubKeyE)
  };
  const pubKey = nodeCrypto.createPublicKey({ key: jwk, format: 'jwk' });

  const b64 = Buffer.from(xmlStr, 'utf8').toString('base64');
  let resultHex = '';
  const chunkSize = 245;
  const numChunks = Math.ceil(b64.length / chunkSize);

  for (let i = 0; i < numChunks; i++) {
    const chunk = b64.substr(i * chunkSize, chunkSize);
    const encBuf = nodeCrypto.publicEncrypt({
      key: pubKey,
      padding: nodeCrypto.constants.RSA_PKCS1_PADDING
    }, Buffer.from(chunk, 'utf8'));
    resultHex += encBuf.toString('hex');
  }

  return resultHex;
}

// Executes full authenticated router login using RSA PKCS#1 if supported
async function executeRouterLogin(routerBase, username = routerCredentials.username, password = routerCredentials.password) {
  if (!password) {
    throw new Error('Router admin password is required. Please log in.');
  }
  routerCredentials.username = username;
  routerCredentials.password = password;

  console.log(`[Auth] Executing router login for user '${username}' at ${routerBase}...`);
  const init = await fetchRouterSession(routerBase);
  const session = init.session;
  const token = init.token;

  if (!token) {
    throw new Error('Unable to extract CSRF token from router page');
  }

  // Check if router supports RSA encryption (e.g. Orange Flybox, B310s, B525)
  let pubKeyN = '';
  let pubKeyE = '';
  try {
    const pkRes = await routerRequest(routerBase, 'api/webserver/publickey', 'GET', {
      'Cookie': session,
      '__RequestVerificationToken': token
    });
    const nMatch = pkRes.body.match(/<encpubkeyn>([^<]+)<\/encpubkeyn>/);
    const eMatch = pkRes.body.match(/<encpubkeye>([^<]+)<\/encpubkeye>/);
    if (nMatch && eMatch) {
      pubKeyN = nMatch[1].trim();
      pubKeyE = eMatch[1].trim();
    }
  } catch (e) {
    console.log('[Auth] Public key query skipped:', e.message);
  }

  const hashed = Crypto.hashPasswordType4(username, password, token);
  const loginXml = `<?xml version="1.0" encoding="UTF-8"?><request><Username>${username}</Username><Password>${hashed}</Password><password_type>4</password_type></request>`;

  let headers = {
    'Cookie': session,
    '__RequestVerificationToken': token,
    'Content-Type': 'application/xml; charset=UTF-8'
  };
  let bodyToSend = loginXml;

  if (pubKeyN && pubKeyE) {
    console.log('[Auth] Encrypting login payload with RSA-2048 public key...');
    headers['encrypt_transmit'] = 'encrypt_transmit';
    bodyToSend = rsaEncrypt(loginXml, pubKeyN, pubKeyE);
  }

  const loginRes = await routerRequest(routerBase, 'api/user/login', 'POST', headers, bodyToSend);
  console.log(`[Auth] Login response status: ${loginRes.status}, body: ${loginRes.body.slice(0, 150)}`);

  if (loginRes.body.includes('<response>OK</response>') || loginRes.body.includes('OK')) {
    if (loginRes.headers['set-cookie']) {
      const cookieStr = Array.isArray(loginRes.headers['set-cookie']) ? loginRes.headers['set-cookie'].join('; ') : loginRes.headers['set-cookie'];
      const m = cookieStr.match(/SessionID=([^;]+)/i);
      if (m) activeSession = `SessionID=${m[1]}`;
    }

    let nextTok = loginRes.headers['__requestverificationtokenone'] || 
                  loginRes.headers['__requestverificationtoken']?.split('#')[0] || 
                  activeTokens[1] || activeToken;
    activeToken = nextTok.trim();
    isRouterLoggedIn = true;

    console.log('[Auth] Logged into router successfully! Admin session active.');
    return {
      success: true,
      message: 'Login successful',
      session: activeSession,
      token: activeToken
    };
  } else {
    isRouterLoggedIn = false;
    const codeMatch = loginRes.body.match(/<code>(\d+)<\/code>/);
    const code = codeMatch ? codeMatch[1] : '';

    let friendlyMessage = 'Incorrect username or password. Please check your router credentials.';
    if (code === '108009' || loginRes.body.includes('108009')) {
      friendlyMessage = 'Incorrect username or password. Please verify your credentials.';
    } else if (code === '108006' || loginRes.body.includes('108006')) {
      friendlyMessage = 'Incorrect password. Please verify your router admin password.';
    } else if (code === '108007' || loginRes.body.includes('108007')) {
      friendlyMessage = 'Maximum login attempts exceeded. Your router is temporarily locked (usually 2-5 minutes). Please wait and try again.';
    } else if (code === '108001' || code === '108002' || loginRes.body.includes('108001') || loginRes.body.includes('108002')) {
      friendlyMessage = 'Another administrator is currently logged into the router. Please log out from other devices or wait a moment.';
    } else if (code === '100003' || loginRes.body.includes('100003')) {
      friendlyMessage = 'Session expired or unauthorized. Please try again.';
    } else if (code === '100002') {
      friendlyMessage = 'Router is busy. Please wait a moment and try again.';
    } else if (code) {
      friendlyMessage = `Login failed (Router error code ${code}). Please verify your router IP and credentials.`;
    }

    throw new Error(friendlyMessage);
  }
}

// Full Login Handler executed on the server
async function handleServerLogin(req, res) {
  let bodyData = '';
  req.on('data', chunk => bodyData += chunk);
  req.on('end', async () => {
    let payload = {};
    try {
      payload = JSON.parse(bodyData || '{}');
    } catch (e) {
      payload = {};
    }

    const customHost = req.headers['x-router-host'] || payload.routerUrl;
    let routerBase = (customHost || defaultRouterHost).trim();
    if (!routerBase.endsWith('/')) routerBase += '/';

    const username = (payload.username || routerCredentials.username || 'admin').trim();
    const password = (payload.password || routerCredentials.password || '').trim();

    if (!password) {
      setCorsHeaders(res);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Router password is required. Please enter your password.'
      }));
      return;
    }

    try {
      const loginInfo = await executeRouterLogin(routerBase, username, password);
      setCorsHeaders(res);
      res.setHeader('X-Router-Cookie', activeSession);
      res.setHeader('X-Router-Token', activeToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(loginInfo));
    } catch (err) {
      console.error(`[Auth] Login exception: ${err.message}`);
      setCorsHeaders(res);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }
  });
}

// Serve static files
function serveStaticFile(req, res, pathname) {
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (path.extname(safePath) === '') {
        const indexHtml = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexHtml, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
          }
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Proxy request to Huawei Router with session persistence and auto-authentication
function handleRouterProxy(req, res, targetPath) {
  const customHost = req.headers['x-router-host'];
  let routerBase = (customHost || defaultRouterHost).trim();
  if (!routerBase.endsWith('/')) routerBase += '/';

  const normalizedPath = targetPath.startsWith('/') ? targetPath.slice(1) : targetPath;
  const targetUrlStr = routerBase + normalizedPath;
  const targetParsed = new URL(targetUrlStr);

  const isHttps = targetParsed.protocol === 'https:';
  const clientModule = isHttps ? https : http;

  const bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', async () => {
    let bodyBuffer = Buffer.concat(bodyChunks);

    // If client sent POST, normalize any <response> tags to <request>
    if (req.method === 'POST' && bodyBuffer.length > 0) {
      let str = bodyBuffer.toString('utf8');
      if (str.includes('<response>') && str.includes('</response>')) {
        str = str.replace(/<response>/gi, '<request>').replace(/<\/response>/gi, '</request>');
        bodyBuffer = Buffer.from(str, 'utf8');
      }
    }

    // If client is sending a POST to net-mode, ussd, control, etc., ensure admin login is active!
    if (req.method === 'POST' && !targetPath.includes('api/user/login') && !isRouterLoggedIn && routerCredentials.password) {
      try {
        console.log(`[Proxy] Performing admin login before POST to ${targetPath}...`);
        await executeRouterLogin(routerBase);
      } catch (err) {
        console.warn('[Proxy] Initial admin login attempt error:', err.message);
      }
    }

    // Ensure session & token exist
    if (!activeSession || !activeToken) {
      try {
        await fetchRouterSession(routerBase);
      } catch (e) {
        console.warn('[Proxy] Failed to pre-fetch router session:', e.message);
      }
    }

    function doProxyRequest(isRetry = false) {
      const headersToSend = {};

      // Always use the server's authenticated router session & token
      headersToSend['Cookie'] = activeSession;
      headersToSend['__RequestVerificationToken'] = activeToken;

      if (req.headers['content-type']) {
        headersToSend['Content-Type'] = req.headers['content-type'];
      } else if (req.method === 'POST') {
        headersToSend['Content-Type'] = 'application/xml; charset=UTF-8';
      }

      headersToSend['User-Agent'] = req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      headersToSend['Accept'] = '*/*';
      headersToSend['X-Requested-With'] = 'XMLHttpRequest';
      headersToSend['Referer'] = `${routerBase}home/index.html`;
      headersToSend['Origin'] = routerBase.replace(/\/+$/, '');
      headersToSend['Host'] = targetParsed.host;
      headersToSend['Connection'] = 'close';

      if (bodyBuffer.length > 0) {
        headersToSend['Content-Length'] = bodyBuffer.length;
      }

      if (req.method === 'POST') {
        console.log(`[Proxy] POST ${targetPath} | Body: ${bodyBuffer.toString('utf8').replace(/\r?\n|\r/g, '')}`);
      }

      const options = {
        protocol: targetParsed.protocol,
        hostname: targetParsed.hostname,
        port: targetParsed.port || (isHttps ? 443 : 80),
        path: targetParsed.pathname + targetParsed.search,
        method: req.method,
        headers: headersToSend,
        timeout: 8000
      };

      const proxyReq = clientModule.request(options, proxyRes => {
        // Capture new session cookie
        if (proxyRes.headers['set-cookie']) {
          const cookieStr = Array.isArray(proxyRes.headers['set-cookie']) ? proxyRes.headers['set-cookie'].join('; ') : proxyRes.headers['set-cookie'];
          const m = cookieStr.match(/SessionID=([^;]+)/i);
          if (m) activeSession = `SessionID=${m[1]}`;
        }

        // Capture new verification token
        const newTok = proxyRes.headers['__requestverificationtokenone'] || 
                       proxyRes.headers['__requestverificationtoken']?.split('#')[0];
        if (newTok) {
          activeToken = newTok.trim();
        }

        // For GET requests, pipe immediately for lowest latency
        if (req.method === 'GET') {
          if (res.headersSent) return;
          setCorsHeaders(res);
          if (activeSession) res.setHeader('X-Router-Cookie', activeSession);
          if (activeToken) {
            res.setHeader('__RequestVerificationToken', activeToken);
            res.setHeader('X-Router-Token', activeToken);
          }
          res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/xml; charset=utf-8');
          res.writeHead(proxyRes.statusCode);
          proxyRes.pipe(res);
          return;
        }

        // For POST requests, inspect response body for auto-healing on auth errors
        const chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', async () => {
          if (res.headersSent) return;
          const resBuffer = Buffer.concat(chunks);
          const resText = resBuffer.toString('utf8');

          if (req.method === 'POST') {
            console.log(`[Proxy] POST ${targetPath} -> Status ${proxyRes.statusCode} | Response: ${resText.replace(/\r?\n|\r/g, '').slice(0, 150)}`);
          }

          if (!isRetry && (resText.includes('100003') || resText.includes('125003')) && routerCredentials.password) {
            console.warn(`[Proxy] POST ${targetPath} returned auth error (${resText.includes('100003') ? '100003 No Rights' : '125003 Token Error'}). Auto-healing session...`);
            try {
              await executeRouterLogin(routerBase);
              return doProxyRequest(true);
            } catch (err) {
              console.error('[Proxy] Auto-healing re-login failed:', err.message);
            }
          }

          if (res.headersSent) return;
          setCorsHeaders(res);
          if (activeSession) res.setHeader('X-Router-Cookie', activeSession);
          if (activeToken) {
            res.setHeader('__RequestVerificationToken', activeToken);
            res.setHeader('X-Router-Token', activeToken);
          }
          res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/xml; charset=utf-8');
          res.writeHead(proxyRes.statusCode);
          res.end(resBuffer);
        });
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (res.headersSent) return;
        setCorsHeaders(res);
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Router connection timed out', targetUrl: targetUrlStr }));
      });

      proxyReq.on('error', err => {
        if (res.headersSent) return;
        setCorsHeaders(res);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to communicate with router', details: err.message, targetUrl: targetUrlStr }));
      });

      if (bodyBuffer.length > 0) {
        proxyReq.write(bodyBuffer);
      }
      proxyReq.end();
    }

    doProxyRequest(false);
  });
}

// Router health check
function handlePing(req, res) {
  const customHost = req.headers['x-router-host'];
  let routerBase = (customHost || defaultRouterHost).trim();
  if (!routerBase.endsWith('/')) routerBase += '/';

  const targetUrl = new URL(routerBase + 'api/monitoring/status');
  const startTime = Date.now();

  const pingReq = http.get({
    hostname: targetUrl.hostname,
    port: targetUrl.port || 80,
    path: targetUrl.pathname + targetUrl.search,
    headers: {
      'Cookie': activeSession,
      '__RequestVerificationToken': activeToken
    },
    timeout: 3000
  }, pingRes => {
    const latency = Date.now() - startTime;
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reachable: true,
      statusCode: pingRes.statusCode,
      latencyMs: latency,
      routerUrl: routerBase
    }));
  });

  pingReq.on('timeout', () => {
    pingReq.destroy();
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reachable: false,
      error: 'Timeout connecting to router',
      routerUrl: routerBase
    }));
  });

  pingReq.on('error', err => {
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reachable: false,
      error: err.message,
      routerUrl: routerBase
    }));
  });
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Session & token initialization
  if (pathname === '/api/auth/session-init') {
    fetchRouterSession(req.headers['x-router-host'] || defaultRouterHost).then(info => {
      setCorsHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
    }).catch(err => {
      setCorsHeaders(res);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Server-handled router login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    handleServerLogin(req, res);
    return;
  }

  // Server-handled router logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    activeSession = '';
    activeToken = '';
    activeTokens = [];
    isRouterLoggedIn = false;
    routerCredentials.password = '';
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
    return;
  }

  // Desktop App Exit Endpoint
  if (pathname === '/api/app/exit' && req.method === 'POST') {
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    setTimeout(() => {
      process.exit(0);
    }, 300);
    return;
  }

  // API router proxy
  if (pathname.startsWith('/api/proxy/')) {
    const targetPath = pathname.replace('/api/proxy/', '');
    handleRouterProxy(req, res, targetPath + (parsedUrl.search || ''));
    return;
  }

  // Ping router test
  if (pathname === '/api/server/ping') {
    handlePing(req, res);
    return;
  }

  // Server metadata
  if (pathname === '/api/server/info') {
    setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Huawei Manager Web',
      version: '1.0.0',
      defaultRouterHost,
      hasActiveSession: !!activeSession,
      hasActiveToken: !!activeToken,
      uptime: process.uptime()
    }));
    return;
  }

  // Otherwise serve static assets from public/
  serveStaticFile(req, res, pathname);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Server Error] Port ${PORT} is already in use by another process.`);
    console.error(`If another Hmanager Pro instance is running, please close it or free port ${PORT}.\n`);
    process.exit(1);
  } else {
    console.error('[Server Error]', err);
    process.exit(1);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`  Huawei Manager Web Server Started!`);
  console.log(`  Access dashboard in your browser:`);
  console.log(`  -> Local:   http://localhost:${PORT}`);
  console.log(`  -> Network: http://[your-pc-ip]:${PORT}`);
  console.log(`  Target Router: ${defaultRouterHost}`);
  console.log(`====================================================`);

  // Initialize router session at startup (login will occur when user inputs password)
  if (routerCredentials.password) {
    executeRouterLogin(defaultRouterHost).then(() => {
      console.log(`[Init] Logged into router as Admin at ${defaultRouterHost}. Ready for Band Locking!`);
    }).catch(err => {
      console.warn(`[Init] Router login notice: ${err.message}`);
      fetchRouterSession(defaultRouterHost).catch(() => {});
    });
  } else {
    fetchRouterSession(defaultRouterHost).then(() => {
      console.log(`[Init] Router session initialized at ${defaultRouterHost}. Ready for user login.`);
    }).catch(err => {
      console.warn(`[Init] Initial session notice: ${err.message}`);
    });
  }
});
