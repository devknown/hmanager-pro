class CleanGraph {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`[CleanGraph] Canvas #${canvasId} not found.`);
      return;
    }
    this.ctx = this.canvas.getContext('2d');

    this.options = {
      maxPoints: options.maxPoints || 300,
      timeframeSec: options.timeframeSec || 300,
      bgMint: '#e8f1fd',
      gridBand: 'rgba(230, 243, 245, 0.7)',
      // Clean signature mountain colors
      dlColor: '#3b82f6', // Golden sunflower yellow
      dlFill: 'rgba(59, 131, 2462, 0.85)',
      ulColor: '#eb79ba', // Rose magenta pink
      ulFill: 'rgba(235, 121, 186, 0.82)',
      textColor: '#94a3b8',
      ...options
    };

    this.dataPoints = [];
    this.peakDl = 0;
    this.peakUl = 0;
    this.currentMaxY = 100 * 1024;
    this.isPaused = false;

    // Hover state
    this.mouseX = null;
    this.mouseY = null;
    this.isHovering = false;

    this.init();
  }

  init() {
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    // Use a shared handler for both mouseenter and mousemove so the
    // tooltip appears immediately on first hover and tracks the cursor.
    const onMouseMove = e => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.isHovering = true;
      this.draw();
      this.updateHoverCard();
    };

    this.canvas.addEventListener('mouseenter', onMouseMove);
    this.canvas.addEventListener('mousemove', onMouseMove);

    this.canvas.addEventListener('mouseleave', () => {
      this.isHovering = false;
      this.mouseX = null;
      this.mouseY = null;
      this.draw();
      const popup = document.getElementById('gwHoverPopup');
      if (popup) popup.classList.add('hidden');
    });

    // Populate initial baseline points
    const now = Date.now();
    for (let i = this.options.maxPoints; i >= 0; i--) {
      this.dataPoints.push({
        time: now - i * 1000,
        dl: 0,
        ul: 0
      });
    }

    this.draw();
  }

  handleResize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = (rect.height || 280) * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.cssWidth = rect.width;
    this.cssHeight = rect.height || 280;
    this.draw();
  }

  setTimeframe(seconds) {
    this.options.timeframeSec = seconds;
    this.options.maxPoints = seconds;
    if (this.dataPoints.length > seconds) {
      this.dataPoints = this.dataPoints.slice(this.dataPoints.length - seconds);
    }
    this.draw();
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  addDataPoint(dlRate, ulRate) {
    if (this.isPaused) return;

    const dl = Math.max(0, Number(dlRate) || 0);
    const ul = Math.max(0, Number(ulRate) || 0);

    if (dl > this.peakDl) this.peakDl = dl;
    if (ul > this.peakUl) this.peakUl = ul;

    this.dataPoints.push({
      time: Date.now(),
      dl,
      ul
    });

    while (this.dataPoints.length > this.options.maxPoints) {
      this.dataPoints.shift();
    }

    this.draw();
  }

  formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    const val = (bytesPerSec / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0);
    return `${val} ${sizes[i]}`;
  }

  formatTime(timestamp) {
    const d = new Date(timestamp);
    const pad = n => (n < 10 ? '0' + n : n);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  updateHoverCard() {
    const popup = document.getElementById('gwHoverPopup');
    if (!popup || !this.isHovering || this.mouseX === null) return;

    const w = this.cssWidth;
    const padding = { left: 10, right: 10 };
    const chartW = w - padding.left - padding.right;

    const relX = (this.mouseX - padding.left) / chartW;
    const ptIdx = Math.max(0, Math.min(this.dataPoints.length - 1, Math.round(relX * (this.dataPoints.length - 1))));
    const pt = this.dataPoints[ptIdx];

    if (!pt) {
      popup.classList.add('hidden');
      return;
    }

    // Populate popup fields
    const popupDl = document.getElementById('hoverPopupDl');
    const popupUl = document.getElementById('hoverPopupUl');
    const popupTime = document.getElementById('hoverPopupTime');

    if (popupDl) popupDl.textContent = this.formatSpeed(pt.dl);
    if (popupUl) popupUl.textContent = this.formatSpeed(pt.ul);
    if (popupTime) popupTime.textContent = this.formatTime(pt.time);

    // Position popup
    popup.classList.remove('hidden');
    let left = this.mouseX - 140;
    if (left < 15) left = 15;
    if (left + 300 > w) left = w - 315;
    popup.style.left = `${left}px`;
    popup.style.top = `60px`;
  }

  draw() {
    if (!this.ctx || !this.cssWidth || !this.cssHeight) return;

    const ctx = this.ctx;
    const w = this.cssWidth;
    const h = this.cssHeight;
    const padding = { top: 32, right: 0, bottom: 24, left: 0 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // 1. Clear background with Clean's pale icy mint
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.options.bgMint;
    ctx.fillRect(0, 0, w, h);

    // Draw subtle vertical shaded segment stripes (like Clean)
    const segments = 5;
    for (let i = 0; i < segments; i++) {
      if (i % 2 === 1) {
        ctx.fillStyle = '#dfecfc';
        ctx.fillRect((i / segments) * w, 0, w / segments, h);
      }
    }

    // Compute max scale
    let maxVal = 20 * 1024; // 20 KB/s min scale
    for (const pt of this.dataPoints) {
      if (pt.dl > maxVal) maxVal = pt.dl;
      if (pt.ul > maxVal) maxVal = pt.ul;
    }
    maxVal *= 1.2;

    this.currentMaxY += (maxVal - this.currentMaxY) * 0.25;
    if (this.currentMaxY < 20 * 1024) this.currentMaxY = 20 * 1024;
    const maxY = this.currentMaxY;

    // Update top-left rate indicator
    const scaleBadge = document.getElementById('gwCanvasScaleBadge');
    if (scaleBadge) {
      scaleBadge.textContent = `${this.formatSpeed(maxY)} ˅`;
    }

    // Coordinates mapping
    const getX = index => padding.left + (index / (this.options.maxPoints - 1)) * chartW;
    const getY = val => padding.top + chartH - (Math.max(0, val) / maxY) * chartH;

    // Helper for Clean organic mountain wave
    const drawMountain = (points, key, fillColor) => {
      if (points.length < 2) return;

      const coords = points.map((p, idx) => ({
        x: getX(idx),
        y: getY(p[key])
      }));

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(coords[0].x, padding.top + chartH);
      ctx.lineTo(coords[0].x, coords[0].y);

      for (let i = 0; i < coords.length - 1; i++) {
        const xc = (coords[i].x + coords[i + 1].x) / 2;
        const yc = (coords[i].y + coords[i + 1].y) / 2;
        ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
      }
      ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
      ctx.lineTo(coords[coords.length - 1].x, padding.top + chartH);
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.restore();
    };

    // 2. Draw Yellow Mountain (Download)
    drawMountain(this.dataPoints, 'dl', this.options.dlFill);

    // 3. Draw Pink Mountain (Upload)
    drawMountain(this.dataPoints, 'ul', this.options.ulFill);

    // 4. Time ruler at the bottom
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, h - 22, w, 22);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 22);
    ctx.lineTo(w, h - 22);
    ctx.stroke();

    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = this.options.textColor;
    ctx.textBaseline = 'middle';

    const tLabels = 3;
    for (let i = 0; i < tLabels; i++) {
      const idx = Math.round((i / (tLabels - 1)) * (this.dataPoints.length - 1));
      const pt = this.dataPoints[idx];
      if (pt) {
        const tStr = this.formatTime(pt.time);
        const xPos = getX(idx);
        ctx.textAlign = i === 0 ? 'left' : i === tLabels - 1 ? 'right' : 'center';
        const drawX = i === 0 ? 15 : i === tLabels - 1 ? w - 15 : xPos;
        ctx.fillText(tStr, drawX, h - 11);
      }
    }

    // 5. Hover vertical highlight column
    if (this.isHovering && this.mouseX !== null) {
      const relX = this.mouseX / w;
      const idx = Math.max(0, Math.min(this.dataPoints.length - 1, Math.round(relX * (this.dataPoints.length - 1))));
      const snappedX = getX(idx);

      ctx.save();
      // Translucent highlight band
      ctx.fillStyle = 'rgba(74, 222, 128, 0.18)';
      ctx.fillRect(snappedX - 16, 0, 32, h - 22);

      // Center laser line
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(snappedX, 0);
      ctx.lineTo(snappedX, h - 22);
      ctx.stroke();
      ctx.restore();
    }

    // Keep hover card in sync whenever the chart redraws (e.g. new data)
    if (this.isHovering) {
      this.updateHoverCard();
    }
  }
}

window.CleanGraph = CleanGraph;
