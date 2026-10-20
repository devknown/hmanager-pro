const HuaweiBands = (function() {
  // LTE Band definitions
  const LTE_BANDS = [
    // FDD Bands
    { band: 1, name: 'B1', freq: '2100 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 2, name: 'B2', freq: '1900 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 3, name: 'B3', freq: '1800 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 4, name: 'B4', freq: '1700/2100 MHz AWS', type: 'FDD', duplex: 'FDD' },
    { band: 5, name: 'B5', freq: '850 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 7, name: 'B7', freq: '2600 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 8, name: 'B8', freq: '900 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 12, name: 'B12', freq: '700 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 17, name: 'B17', freq: '700 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 19, name: 'B19', freq: '850 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 20, name: 'B20', freq: '800 MHz DD', type: 'FDD', duplex: 'FDD' },
    { band: 26, name: 'B26', freq: '850 MHz', type: 'FDD', duplex: 'FDD' },
    { band: 28, name: 'B28', freq: '700 MHz APT', type: 'FDD', duplex: 'FDD' },
    { band: 32, name: 'B32', freq: '1500 MHz L-Band', type: 'FDD', duplex: 'SDL' },

    // TDD Bands
    { band: 38, name: 'B38', freq: '2600 MHz', type: 'TDD', duplex: 'TDD' },
    { band: 39, name: 'B39', freq: '1900 MHz', type: 'TDD', duplex: 'TDD' },
    { band: 40, name: 'B40', freq: '2300 MHz', type: 'TDD', duplex: 'TDD' },
    { band: 41, name: 'B41', freq: '2500 MHz BRS', type: 'TDD', duplex: 'TDD' },
    { band: 42, name: 'B42', freq: '3500 MHz', type: 'TDD', duplex: 'TDD' },
    { band: 43, name: 'B43', freq: '3700 MHz', type: 'TDD', duplex: 'TDD' }
  ];

  // Enrich with bitmask and hex
  LTE_BANDS.forEach(b => {
    const bit = 1n << BigInt(b.band - 1);
    b.bit = bit;
    b.hex = bit.toString(16).toUpperCase();
  });

  // Common Carrier Aggregation (CA / LTE+) combos
  const CA_PRESETS = [
    { label: 'B1 + B3 (2100 + 1800)', bands: [1, 3] },
    { label: 'B3 + B7 (1800 + 2600)', bands: [3, 7] },
    { label: 'B1 + B7 (2100 + 2600)', bands: [1, 7] },
    { label: 'B3 + B20 (1800 + 800)', bands: [3, 20] },
    { label: 'B1 + B20 (2100 + 800)', bands: [1, 20] },
    { label: 'B7 + B20 (2600 + 800)', bands: [7, 20] },
    { label: 'B3 + B8 (1800 + 900)', bands: [3, 8] },
    { label: 'B1 + B8 (2100 + 900)', bands: [1, 8] },
    { label: 'B28 + B3 (700 + 1800)', bands: [28, 3] },
    { label: 'B28 + B1 (700 + 2100)', bands: [28, 1] },
    { label: 'B1 + B3 + B7 (Triple CA)', bands: [1, 3, 7] },
    { label: 'B1 + B3 + B20 (Triple CA)', bands: [1, 3, 20] },
    { label: 'B38 + B41 (TDD CA)', bands: [38, 41] },
    { label: 'B40 + B40 (TDD CA)', bands: [40] }
  ];

  // 3G Specific Frequency Bands
  const BANDS_3G = [
    { name: '3G 2100 MHz (B1)', hex: '400000', label: '2100 MHz' },
    { name: '3G 1900 MHz (B2)', hex: '800000', label: '1900 MHz' },
    { name: '3G 850 MHz (B5)', hex: '4000000', label: '850 MHz' },
    { name: '3G 900 MHz (B8)', hex: '2000000000000', label: '900 MHz' }
  ];

  const AUTO_LTE_BAND = '7FFFFFFFFFFFFFFF';
  const ALL_3G_BAND = '3FFFFFFF';

  /**
   * Calculate LTE hex string for an array of band numbers
   * @param {number[]} bandsArray - e.g. [1, 3, 7]
   * @returns {string} hex mask e.g. "45"
   */
  function calcLteHex(bandsArray) {
    if (!bandsArray || bandsArray.length === 0) {
      return AUTO_LTE_BAND;
    }
    let mask = 0n;
    for (const b of bandsArray) {
      const bandNum = parseInt(b, 10);
      if (bandNum > 0 && bandNum <= 64) {
        mask |= (1n << BigInt(bandNum - 1));
      }
    }
    return mask === 0n ? AUTO_LTE_BAND : mask.toString(16).toUpperCase();
  }

  /**
   * Parse an LTE hex string returned by router or entered by user
   * @param {string} hexStr
   * @returns {{ isAuto: boolean, bands: Array, activeBandNumbers: number[], summary: string }}
   */
  function parseLteHex(hexStr) {
    if (!hexStr) {
      return { isAuto: true, bands: [], activeBandNumbers: [], summary: 'Unknown' };
    }

    const cleanHex = hexStr.trim().toUpperCase();
    if (cleanHex === AUTO_LTE_BAND || cleanHex === '0' || cleanHex === '') {
      return { isAuto: true, bands: [], activeBandNumbers: [], summary: 'Auto (All Bands)' };
    }

    let maskBigInt;
    try {
      maskBigInt = BigInt('0x' + cleanHex);
    } catch (e) {
      return { isAuto: false, bands: [], activeBandNumbers: [], summary: 'Invalid Hex: ' + hexStr };
    }

    const matchedBands = [];
    const activeBandNumbers = [];

    // Check each known band
    for (const b of LTE_BANDS) {
      if ((maskBigInt & b.bit) !== 0n) {
        matchedBands.push(b);
        activeBandNumbers.push(b.band);
      }
    }

    // Check if any other higher bits are set beyond known bands
    for (let i = 1; i <= 64; i++) {
      if (!activeBandNumbers.includes(i)) {
        const bit = 1n << BigInt(i - 1);
        if ((maskBigInt & bit) !== 0n) {
          activeBandNumbers.push(i);
          matchedBands.push({
            band: i,
            name: `B${i}`,
            freq: `Band ${i}`,
            type: 'LTE',
            duplex: 'Unknown'
          });
        }
      }
    }

    activeBandNumbers.sort((a, b) => a - b);

    let summary = '';
    if (matchedBands.length === 0) {
      summary = `Custom Hex (0x${cleanHex})`;
    } else if (matchedBands.length === 1) {
      summary = `${matchedBands[0].name} (${matchedBands[0].freq})`;
    } else {
      summary = matchedBands.map(b => b.name).join(' + ') + ` (CA / 0x${cleanHex})`;
    }

    return {
      isAuto: false,
      bands: matchedBands,
      activeBandNumbers,
      summary,
      hex: cleanHex
    };
  }

  /**
   * Formats current band display based on router values
   * Replicates _4GType function from main.js but enhanced
   */
  function formatCurrentBand(lteBandHex, is4g = true) {
    if (!is4g) return '';
    if (!lteBandHex) return '';
    const parsed = parseLteHex(lteBandHex);
    if (parsed.isAuto) return 'Auto (All Bands)';
    return parsed.summary;
  }

  return {
    LTE_BANDS,
    CA_PRESETS,
    BANDS_3G,
    AUTO_LTE_BAND,
    ALL_3G_BAND,
    calcLteHex,
    parseLteHex,
    formatCurrentBand
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HuaweiBands;
}
