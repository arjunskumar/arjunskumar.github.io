/* Page behaviour: typeset equation, scroll reveals, word-by-word abstract,
   count-up numbers, project pop-ups and live GitHub stats. */
document.addEventListener('DOMContentLoaded', () => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Reveal-on-scroll with a small stagger for siblings
  const revealEls = Array.from(document.querySelectorAll('.reveal, .stat, .entry, .work-card, .skills > div, .repo, .remark'));
  revealEls.forEach((el, i) => {
    if (!el.classList.contains('reveal')) el.classList.add('reveal');
    const sibs = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.classList.contains('reveal')) : [];
    el.style.setProperty('--d', Math.min(sibs.indexOf(el), 4) * 80 + 'ms');
  });
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  // Abstract: wrap words, light them up with scroll progress through the pinned chapter
  const scrub = document.querySelector('[data-scrub]');
  const pinChapter = document.getElementById('abstract');
  const pinFoot = pinChapter && pinChapter.querySelector('.pin-foot');
  if (scrub && pinChapter) {
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(scrub);
    const words = Array.from(scrub.querySelectorAll('.w'));
    const update = () => {
      const r = pinChapter.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
      const lit = reduced ? words.length : Math.round(clamp((p - 0.04) / 0.7, 0, 1) * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < lit));
      if (pinFoot) pinFoot.classList.toggle('on', reduced || p > 0.72);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // Navigation: mobile menu, scroll progress, active section
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('nav-toggle');
  const bar = document.getElementById('nav-progress');
  const setMenu = (open) => {
    if (!nav || !toggle) return;
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  if (toggle) toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  document.querySelectorAll('#nav-links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  const navLinks = Array.from(document.querySelectorAll('#nav-links a[href^="#"]'));
  const spyTargets = navLinks.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0).toFixed(2) + '%';
    let current = null;
    spyTargets.forEach((t) => { if (t.getBoundingClientRect().top <= window.innerHeight * 0.4) current = t; });
    navLinks.forEach((a) => {
      const on = current && a.getAttribute('href') === '#' + current.id;
      a.classList.toggle('active', !!on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Work cards: still poster by default, animated GIF only on hover / focus
  document.querySelectorAll('.work-open').forEach((btn) => {
    const img = btn.querySelector('.work-thumb[data-gif]');
    if (!img) return;
    const poster = img.getAttribute('src');
    const play = () => { if (!reduced) img.src = img.dataset.gif; };
    const stop = () => { img.src = poster; };
    btn.addEventListener('pointerenter', play);
    btn.addEventListener('focus', play);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('blur', stop);
  });

  // Pop-up windows for Selected work (native <dialog>)
  document.querySelectorAll('[data-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dlg = document.getElementById(btn.dataset.modal);
      if (!dlg) return;
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      document.body.classList.add('modal-open');
    });
  });
  document.querySelectorAll('dialog.modal').forEach((dlg) => {
    dlg.addEventListener('close', () => { if (!document.querySelector('dialog.modal[open]')) document.body.classList.remove('modal-open'); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });   // backdrop click
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  });

  // Pop-up previous / next
  const dialogs = Array.from(document.querySelectorAll('dialog.modal'));
  dialogs.forEach((dlg, i) => {
    if (dialogs.length < 2) return;
    const body = dlg.querySelector('.modal-body');
    const prev = dialogs[(i - 1 + dialogs.length) % dialogs.length];
    const next = dialogs[(i + 1) % dialogs.length];
    const title = (d) => (d.querySelector('h3') || {}).textContent || '';
    const wrap = document.createElement('div');
    wrap.className = 'modal-nav';
    wrap.innerHTML = '<button type="button" class="btn" data-go="prev">← ' + 'Previous</button><button type="button" class="btn" data-go="next">Next →</button>';
    wrap.querySelector('[data-go=prev]').title = title(prev);
    wrap.querySelector('[data-go=next]').title = title(next);
    wrap.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (!go) return;
      const target = go.dataset.go === 'prev' ? prev : next;
      dlg.close();
      target.showModal();
      document.body.classList.add('modal-open');
    });
    if (body) body.appendChild(wrap);
  });

  // Count-up for the headline numbers
  const counters = Array.from(document.querySelectorAll('[data-count]'));
  if ('IntersectionObserver' in window && !reduced) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        const el = e.target;
        const suffix = el.dataset.suffix || '';
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / 1300);
          const v = Math.round((1 - Math.pow(1 - p, 3)) * Number(el.dataset.count));
          el.textContent = v.toLocaleString('en-US') + suffix;
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = Number(el.dataset.count).toLocaleString('en-US') + suffix;
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => cio.observe(el));
  }

  // Live GitHub stats; markup carries cached values as fallback
  fetch('https://api.github.com/repos/arjunskumar/Robotics_CPP_Notes')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('GitHub API ' + r.status))))
    .then((d) => {
      if (d.stargazers_count === undefined) return;
      const set = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };
      set('repo-stars', '★ ' + d.stargazers_count);
      set('repo-forks', d.forks_count + ' forks');
      set('repo-stars-metric', String(d.stargazers_count));
      const sm = document.getElementById('repo-stars-metric');
      if (sm) sm.dataset.count = String(d.stargazers_count);
    })
    .catch((err) => console.debug('Using cached GitHub stats:', err));
});
