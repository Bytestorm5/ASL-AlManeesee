/* Matn switcher for the reading page (web).
   Adds a compact "Mutūn" dropdown to the sticky top navbar so a reader can jump
   to another matn — or Home — from anywhere on the page, without scrolling back
   to the top. In the installed app the bottom bar + More sheet already handle
   this, so the switcher is hidden in app mode (html.appmode).

   The list is the registry's listed mutūn (drafts are left out of menus). It
   only appears when there is at least one matn OTHER than this one to switch
   to: with none (a site with a single matn, or a draft being proofed before
   anything is listed) the menu would hold just Home and the page itself, and
   Home is already one tap away in the back link above the hero. */
import { currentPoemId, esc, listedPoems, poemHref } from '../page.ts';

const CSS = '.matn-switch .navprint{gap:6px}'
  + '.matn-switch .navprint svg{width:15px;height:15px;flex:0 0 auto}'
  + '.matn-switch .menu-pop a{justify-content:flex-start;gap:11px;align-items:baseline}'
  + '.matn-switch .menu-pop .ms-ar{font-family:"Scheherazade New","Amiri",serif;font-size:1.08rem;line-height:1.2;flex:1 1 auto;min-width:0}'
  + '.matn-switch .menu-pop .ms-en{font-family:"Montserrat",sans-serif;font-size:.66rem;font-weight:600;letter-spacing:.03em;color:var(--sage,#9c7f80);flex:0 0 auto}'
  + '.matn-switch .menu-pop a.active{background:var(--madder);color:#fbeee8}'
  + '.matn-switch .menu-pop a.active .ms-en{color:#fbeee8}'
  + '.matn-switch .menu-pop .ms-home{border-bottom:1px solid var(--paper-edge);border-radius:0;margin-bottom:3px;padding-bottom:11px}'
  + 'html.appmode .matn-switch{display:none!important}';

export function init(): void {
  const navMenus = document.querySelector('.navbar .nav-menus');
  if (!navMenus || document.querySelector('.matn-switch')) return;

  const here = currentPoemId();
  const mutun = listedPoems();
  if (!mutun.some((m) => m.id !== here)) return;
  const mode = (location.search.match(/[?&]mode=(read|memorize)/) || [])[1];

  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  const menu = document.createElement('div');
  menu.className = 'menu matn-switch';

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'navprint';
  btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
  btn.title = 'Switch to another matn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 16l10 5 10-5"/></svg>Mutūn <span class="caret">▾</span>';

  const pop = document.createElement('div');
  pop.className = 'menu-pop'; pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'Switch matn');

  const home = document.createElement('a');
  home.href = '/'; home.setAttribute('role', 'menuitem');
  home.className = 'ms-home';
  home.innerHTML = '<span class="ms-ar" style="font-family:inherit;font-size:.82rem">⌂ Home</span>';
  pop.appendChild(home);

  for (const m of mutun) {
    const a = document.createElement('a');
    a.href = poemHref(m.id, { mode }); a.setAttribute('role', 'menuitem');
    if (m.id === here) { a.className = 'active'; a.setAttribute('aria-current', 'page'); }
    a.innerHTML = '<span class="ms-ar">' + esc(m.shortAr) + '</span><span class="ms-en">' + esc(m.shortEn) + '</span>';
    pop.appendChild(a);
  }

  menu.appendChild(btn); menu.appendChild(pop);
  navMenus.insertBefore(menu, navMenus.firstChild);

  function closeAll() {
    document.querySelectorAll('.menu-pop.open').forEach((d) => {
      d.classList.remove('open');
      d.parentElement?.querySelector('.navprint')?.setAttribute('aria-expanded', 'false');
    });
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !pop.classList.contains('open');
    closeAll();
    pop.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  // Outside-click / Escape are also handled by the page's own menu handlers
  // (render.ts), which act on any .menu / .menu-pop — including this one.
  document.addEventListener('click', (e) => { if (!(e.target as Element | null)?.closest?.('.menu')) closeAll(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}
