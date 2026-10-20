const HuaweiCrypto = (function() {
  const g_base64EncodeChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function base64encode(str) {
    if (typeof btoa === 'function') {
      try {
        return btoa(unescape(encodeURIComponent(str)));
      } catch (e) {
        // Fallback to manual encoder
      }
    }

    let out = '';
    const len = str.length;
    let i = 0;
    while (i < len) {
      const c1 = str.charCodeAt(i++) & 0xff;
      if (i === len) {
        out += g_base64EncodeChars.charAt(c1 >> 2);
        out += g_base64EncodeChars.charAt((c1 & 0x3) << 4);
        out += '==';
        break;
      }
      const c2 = str.charCodeAt(i++);
      if (i === len) {
        out += g_base64EncodeChars.charAt(c1 >> 2);
        out += g_base64EncodeChars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
        out += g_base64EncodeChars.charAt((c2 & 0xF) << 2);
        out += '=';
        break;
      }
      const c3 = str.charCodeAt(i++);
      out += g_base64EncodeChars.charAt(c1 >> 2);
      out += g_base64EncodeChars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
      out += g_base64EncodeChars.charAt(((c2 & 0xF) << 2) | ((c3 & 0xC0) >> 6));
      out += g_base64EncodeChars.charAt(c3 & 0x3F);
    }
    return out;
  }

  function sha256(s) {
    const chrsz = 8;
    const hexcase = 0;

    function safe_add(x, y) {
      const lsw = (x & 0xFFFF) + (y & 0xFFFF);
      const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
      return (msw << 16) | (lsw & 0xFFFF);
    }

    function S(X, n) {
      return (X >>> n) | (X << (32 - n));
    }

    function R(X, n) {
      return X >>> n;
    }

    function Ch(x, y, z) {
      return (x & y) ^ ((~x) & z);
    }

    function Maj(x, y, z) {
      return (x & y) ^ (x & z) ^ (y & z);
    }

    function Sigma0256(x) {
      return S(x, 2) ^ S(x, 13) ^ S(x, 22);
    }

    function Sigma1256(x) {
      return S(x, 6) ^ S(x, 11) ^ S(x, 25);
    }

    function Gamma0256(x) {
      return S(x, 7) ^ S(x, 18) ^ R(x, 3);
    }

    function Gamma1256(x) {
      return S(x, 17) ^ S(x, 19) ^ R(x, 10);
    }

    function core_sha256(m, l) {
      const K = [
        0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
        0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
        0xE49B69C1, 0xEFBE4786, 0xFC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
        0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x6CA6351, 0x14292967,
        0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
        0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
        0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
        0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
      ];
      const HASH = [
        0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
        0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
      ];
      const W = new Array(64);

      m[l >> 5] |= 0x80 << (24 - l % 32);
      m[((l + 64 >> 9) << 4) + 15] = l;

      for (let i = 0; i < m.length; i += 16) {
        let a = HASH[0];
        let b = HASH[1];
        let c = HASH[2];
        let d = HASH[3];
        let e = HASH[4];
        let f = HASH[5];
        let g = HASH[6];
        let h = HASH[7];

        for (let j = 0; j < 64; j++) {
          if (j < 16) {
            W[j] = m[j + i];
          } else {
            W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
          }

          const T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
          const T2 = safe_add(Sigma0256(a), Maj(a, b, c));

          h = g;
          g = f;
          f = e;
          e = safe_add(d, T1);
          d = c;
          c = b;
          b = a;
          a = safe_add(T1, T2);
        }

        HASH[0] = safe_add(a, HASH[0]);
        HASH[1] = safe_add(b, HASH[1]);
        HASH[2] = safe_add(c, HASH[2]);
        HASH[3] = safe_add(d, HASH[3]);
        HASH[4] = safe_add(e, HASH[4]);
        HASH[5] = safe_add(f, HASH[5]);
        HASH[6] = safe_add(g, HASH[6]);
        HASH[7] = safe_add(h, HASH[7]);
      }
      return HASH;
    }

    function str2binb(str) {
      const bin = [];
      const mask = (1 << chrsz) - 1;
      for (let i = 0; i < str.length * chrsz; i += chrsz) {
        bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
      }
      return bin;
    }

    function utf8Encode(string) {
      string = string.replace(/\r\n/g, '\n');
      let utftext = '';
      for (let n = 0; n < string.length; n++) {
        const c = string.charCodeAt(n);
        if (c < 128) {
          utftext += String.fromCharCode(c);
        } else if (c > 127 && c < 2048) {
          utftext += String.fromCharCode((c >> 6) | 192);
          utftext += String.fromCharCode((c & 63) | 128);
        } else {
          utftext += String.fromCharCode((c >> 12) | 224);
          utftext += String.fromCharCode(((c >> 6) & 63) | 128);
          utftext += String.fromCharCode((c & 63) | 128);
        }
      }
      return utftext;
    }

    function binb2hex(binarray) {
      const hex_tab = hexcase ? '0123456789ABCDEF' : '0123456789abcdef';
      let str = '';
      for (let i = 0; i < binarray.length * 4; i++) {
        str += hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) +
          hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
      }
      return str;
    }

    const utf8Str = utf8Encode(s);
    return binb2hex(core_sha256(str2binb(utf8Str), utf8Str.length * chrsz));
  }

  /**
   * Huawei Type 4 Password hashing formula:
   * pass1 = base64(sha256(username + base64(sha256(password)) + token))
   */
  function hashPasswordType4(username, password, token) {
    const passHashHex = sha256(password);
    const passHashBase64 = base64encode(passHashHex);
    const combined = username + passHashBase64 + token;
    const finalHashHex = sha256(combined);
    return base64encode(finalHashHex);
  }

  /**
   * Huawei Type 0/1 Password hashing formula:
   * pass1 = base64(password)
   */
  function hashPasswordBasic(password) {
    return base64encode(password);
  }

  function stringToUtf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    const utf8 = unescape(encodeURIComponent(str));
    const bytes = new Uint8Array(utf8.length);
    for (let i = 0; i < utf8.length; i++) {
      bytes[i] = utf8.charCodeAt(i);
    }
    return bytes;
  }

  function getRandomNonZeroByte() {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint8Array(1);
      while (true) {
        window.crypto.getRandomValues(arr);
        if (arr[0] !== 0) return arr[0];
      }
    }
    let r = 0;
    while (r === 0) {
      r = Math.floor(Math.random() * 256);
    }
    return r;
  }

  function modPow(base, exp, mod) {
    let res = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) res = (res * base) % mod;
      base = (base * base) % mod;
      exp = exp / 2n;
    }
    return res;
  }

  function rsaEncryptChunk(chunkBytes, pubKeyNHex, pubKeyEHex) {
    const n = BigInt('0x' + pubKeyNHex);
    const e = BigInt('0x' + pubKeyEHex);
    const k = (pubKeyNHex.length + 1) >> 1; // 256 for 2048-bit
    const padLen = k - 3 - chunkBytes.length;
    if (padLen < 8) throw new Error('Message too long for RSA chunk');

    const em = new Uint8Array(k);
    em[0] = 0x00;
    em[1] = 0x02;
    for (let i = 0; i < padLen; i++) {
      em[2 + i] = getRandomNonZeroByte();
    }
    em[2 + padLen] = 0x00;
    em.set(chunkBytes, 3 + padLen);

    let m = 0n;
    for (let i = 0; i < k; i++) {
      m = (m << 8n) | BigInt(em[i]);
    }

    const c = modPow(m, e, n);
    let hex = c.toString(16);
    while (hex.length < k * 2) {
      hex = '0' + hex;
    }
    return hex;
  }

  /**
   * RSA-2048 PKCS#1 v1.5 encryption for router login payloads
   * Chunks base64-encoded payload in 245-byte pieces and concatenates 512-hex blocks.
   */
  function rsaEncrypt(xmlStr, pubKeyN, pubKeyE) {
    const b64 = base64encode(xmlStr);
    let resultHex = '';
    const chunkSize = 245;
    const numChunks = Math.ceil(b64.length / chunkSize);

    for (let i = 0; i < numChunks; i++) {
      const chunk = b64.substr(i * chunkSize, chunkSize);
      const chunkBytes = stringToUtf8Bytes(chunk);
      resultHex += rsaEncryptChunk(chunkBytes, pubKeyN, pubKeyE);
    }
    return resultHex;
  }

  return {
    base64encode,
    sha256,
    hashPasswordType4,
    hashPasswordBasic,
    rsaEncrypt
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HuaweiCrypto;
}
