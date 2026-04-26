/* ── SWARMHAUL SHARED JS ──────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── CANVAS PARTICLE SYSTEM ─────────────────────────────────────────────────
  const canvas = document.getElementById('canvas');
  if (!canvas) return;

  const ctx   = canvas.getContext('2d');
  const N     = parseInt(canvas.dataset.agents || '40', 10);
  let W, H, agents = [], pulses = [];

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  function getThemeColors() {
    const light = document.documentElement.dataset.theme === 'light';
    return {
      ACCENT: light ? [0, 158, 124] : [0, 229, 176],
      DIM:    light ? [180, 170, 155] : [26, 37, 39],
    };
  }
  let { ACCENT, DIM } = getThemeColors();

  class Agent {
    constructor() { this.reset(); this.y = Math.random() * H; }
    reset() {
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.r  = Math.random() * 1.5 + 1.2;
      this.alpha  = Math.random() * 0.5 + 0.2;
      this.status = Math.random() < 0.12 ? 'active' : 'idle';
      this.pulse  = 0;
    }
    update() {
      this.x += this.vx; this.y += this.vy;
      if (this.x < 0 || this.x > W) this.vx *= -1;
      if (this.y < 0 || this.y > H) this.vy *= -1;
      if (this.pulse > 0) this.pulse -= 0.02;
    }
    draw() {
      const [r,g,b] = this.status === 'active' ? ACCENT : DIM;
      const a = this.status === 'active' ? this.alpha + 0.3 : this.alpha * 0.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + (this.pulse * 3), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fill();
      if (this.status === 'active' && this.pulse > 0) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, (this.r + 6) * this.pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${this.pulse * 0.4})`;
        ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }

  class Pulse {
    constructor(a, b) {
      this.ax = a.x; this.ay = a.y; this.bx = b.x; this.by = b.y; this.t = 0;
    }
    update() { this.t += 0.016; return this.t < 1; }
    draw() {
      const x = this.ax + (this.bx - this.ax) * this.t;
      const y = this.ay + (this.by - this.ay) * this.t;
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
      const [r,g,b] = ACCENT;
      ctx.fillStyle = `rgba(${r},${g},${b},${(1 - this.t) * 0.6})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < N; i++) agents.push(new Agent());

  const CONNECT_DIST = 130;
  let frame = 0;

  function animate() {
    requestAnimationFrame(animate);
    frame++;
    if (frame % 30 === 0) ({ ACCENT, DIM } = getThemeColors());

    const isLight = document.documentElement.dataset.theme === 'light';
    ctx.fillStyle = isLight ? 'rgba(245,241,234,0.18)' : 'rgba(4,7,8,0.18)';
    ctx.fillRect(0, 0, W, H);

    if (frame % 90 === 0) {
      const a = agents[Math.floor(Math.random() * agents.length)];
      a.status = 'active'; a.pulse = 1;
      setTimeout(() => { a.status = 'idle'; }, 3000);
    }

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const dx = agents[i].x - agents[j].x;
        const dy = agents[i].y - agents[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < CONNECT_DIST) {
          const alpha = (1 - dist / CONNECT_DIST) * 0.1;
          const isActive = agents[i].status === 'active' || agents[j].status === 'active';
          const [r,g,b] = isActive ? ACCENT : DIM;
          ctx.beginPath();
          ctx.moveTo(agents[i].x, agents[i].y);
          ctx.lineTo(agents[j].x, agents[j].y);
          ctx.strokeStyle = `rgba(${r},${g},${b},${isActive ? alpha * 2.5 : alpha})`;
          ctx.lineWidth = isActive ? 0.6 : 0.3; ctx.stroke();
          if (isActive && frame % 120 === 0 && Math.random() < 0.3)
            pulses.push(new Pulse(agents[i], agents[j]));
        }
      }
    }
    agents.forEach(a => { a.update(); a.draw(); });
    pulses = pulses.filter(p => { p.draw(); return p.update(); });
  }
  animate();

  // ── CUSTOM CURSOR ──────────────────────────────────────────────────────────
  const curDot  = document.getElementById('cur-dot');
  const curRing = document.getElementById('cur-ring');
  if (curDot && curRing) {
    let mx = -100, my = -100, rx = -100, ry = -100;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
    (function curLoop() {
      requestAnimationFrame(curLoop);
      rx += (mx - rx) * 0.14; ry += (my - ry) * 0.14;
      curDot.style.left  = mx + 'px'; curDot.style.top  = my + 'px';
      curRing.style.left = rx + 'px'; curRing.style.top = ry + 'px';
    })();
    document.querySelectorAll('a, button, .doc-card, .flow-node').forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cur-hover'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cur-hover'));
    });
    document.addEventListener('mouseleave', () => { curDot.style.opacity = '0'; curRing.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { curDot.style.opacity = ''; curRing.style.opacity = ''; });
  }

  // ── SCROLL PROGRESS ────────────────────────────────────────────────────────
  const progressBar = document.getElementById('scroll-progress');
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      progressBar.style.transform = `scaleX(${pct})`;
    }, { passive: true });
  }

  // ── NAV SCROLL ─────────────────────────────────────────────────────────────
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
    // start scrolled on doc pages (not hero pages)
    if (document.body.dataset.page === 'doc') nav.classList.add('scrolled');
  }

  // ── THEME TOGGLE ───────────────────────────────────────────────────────────
  const toggle = document.getElementById('theme-toggle');
  const iMoon  = document.getElementById('icon-moon');
  const iSun   = document.getElementById('icon-sun');

  function applyTheme(t) {
    document.documentElement.dataset.theme = t === 'light' ? 'light' : '';
    if (iMoon) iMoon.style.display = t === 'light' ? 'none' : '';
    if (iSun)  iSun.style.display  = t === 'light' ? '' : 'none';
    localStorage.setItem('sh-theme', t);
    ({ ACCENT, DIM } = getThemeColors());
    const isLight = t === 'light';
    ctx.fillStyle = isLight ? '#f5f1ea' : '#040708';
    ctx.fillRect(0, 0, W, H);
  }

  if (toggle) toggle.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });
  const saved = localStorage.getItem('sh-theme');
  if (saved) applyTheme(saved);

  // ── SCROLL REVEAL ──────────────────────────────────────────────────────────
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal, .section').forEach(el => revealObs.observe(el));

  // ── TYPEWRITER ─────────────────────────────────────────────────────────────
  function typewrite(pre, speed) {
    const full = pre.innerHTML;
    const tokens = [];
    let i = 0;
    while (i < full.length) {
      if (full[i] === '<') {
        const end = full.indexOf('>', i);
        if (end === -1) { tokens.push(full[i]); i++; continue; }
        tokens.push(full.slice(i, end + 1)); i = end + 1;
      } else { tokens.push(full[i]); i++; }
    }
    pre.innerHTML = '';
    let pos = 0, built = '';
    const cursor = '<span class="tw-cursor"></span>';
    function tick() {
      if (pos >= tokens.length) { pre.innerHTML = built; return; }
      const tok = tokens[pos++];
      built += tok;
      pre.innerHTML = built + cursor;
      setTimeout(tick, tok.startsWith('<') ? 0 : speed);
    }
    tick();
  }

  const twObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      twObs.unobserve(e.target);
      setTimeout(() => typewrite(e.target, 20), 180);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.terminal pre').forEach(pre => twObs.observe(pre));

  // ── HERO STAT COUNTERS ─────────────────────────────────────────────────────
  function animateCounter(el, target, suffix, dur) {
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const statsEl = document.getElementById('hero-stats');
  let countersStarted = false;
  if (statsEl) {
    const cObs = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || countersStarted) return;
      countersStarted = true;
      statsEl.querySelectorAll('[data-target]').forEach(el =>
        animateCounter(el, +el.dataset.target, el.dataset.suffix || '', 1400));
      statsEl.querySelectorAll('[data-static]').forEach((el, i) =>
        setTimeout(() => { el.textContent = el.dataset.static; }, 300 + i * 200));
    }, { threshold: 0.5 });
    cObs.observe(statsEl);
  }

  // ── HERO PARALLAX ──────────────────────────────────────────────────────────
  const heroTitle = document.querySelector('.hero-title');
  const heroSub   = document.querySelector('.hero-sub');
  if (heroTitle) {
    document.addEventListener('mousemove', e => {
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx, dy = (e.clientY - cy) / cy;
      heroTitle.style.transform = `translate(${dx * -4}px, ${dy * -3}px)`;
      if (heroSub) heroSub.style.transform = `translate(${dx * -2}px, ${dy * -1.5}px)`;
    }, { passive: true });
  }

  // ── ACTIVE SIDEBAR LINK ────────────────────────────────────────────────────
  const currentPath = window.location.pathname;
  document.querySelectorAll('.sidebar-links a').forEach(a => {
    if (a.getAttribute('href') === currentPath ||
        currentPath.endsWith(a.getAttribute('href'))) {
      a.classList.add('active');
    }
  });

  // ── MOBILE NAV + SIDEBAR DRAWER ───────────────────────────────────────────
  const sidebar = document.querySelector('.doc-sidebar');
  if (sidebar) {
    // Inject hamburger button into nav-right
    const navRight = document.querySelector('.nav-right');
    if (navRight) {
      const menuBtn = document.createElement('button');
      menuBtn.id = 'nav-menu';
      menuBtn.setAttribute('aria-label', 'Open navigation');
      menuBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg>';
      navRight.prepend(menuBtn);
    }

    // Inject overlay
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    document.body.appendChild(overlay);

    // Inject close button inside sidebar
    const closeBtn = document.createElement('button');
    closeBtn.id = 'sidebar-close';
    closeBtn.setAttribute('aria-label', 'Close navigation');
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>';
    sidebar.prepend(closeBtn);

    function openSidebar() {
      sidebar.classList.add('open');
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    document.getElementById('nav-menu').addEventListener('click', openSidebar);
    overlay.addEventListener('click', closeSidebar);
    closeBtn.addEventListener('click', closeSidebar);

    // Close on sidebar link click (mobile navigation)
    sidebar.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });
  }

  // ── WRAP TABLES FOR MOBILE SCROLL ─────────────────────────────────────────
  document.querySelectorAll('.prose table').forEach(table => {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

})();
