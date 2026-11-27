/**
 * Touch screens, overview pages: a quick swipe moves a whole "screen".
 *  - Quick short swipe up   → glide to the start of the next section, or one full screen further
 *                             if the current section is longer than the screen (nothing is skipped).
 *  - Quick short swipe down → the same, backwards.
 *  - Slow drag              → left alone: the page stays exactly where the finger leaves it, so
 *                             people can line up a panel photo or a paragraph and keep it in view.
 *  - Fast / long flick      → left to the browser's normal momentum (goes as far as the flick carries).
 * Sideways swipes, swipes that start in form fields or the open menu are left alone.
 * Only runs when <html class="snap"> (set by Base.astro; off on builder, portal, staff,
 * panel catalogue / product pages, articles and projects).
 */
const root = document.documentElement;

if (root.classList.contains('snap') && matchMedia('(pointer: coarse)').matches) {
  const STOPS = '.header, main > section:not(.ticker), main > div > section, footer';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = () => parseFloat(getComputedStyle(root).scrollPaddingTop) || 0; // pinned top bar
  const maxY = () => root.scrollHeight - innerHeight;

  let startY = 0, startX = 0, startT = 0, startScroll = 0, active = false;

  addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const el = e.target as Element;
    active = e.touches.length === 1 && !el.closest('input, textarea, select, [contenteditable], .mnav, [data-no-swipe]');
    if (!active) return;
    startY = t.clientY; startX = t.clientX; startT = performance.now(); startScroll = scrollY;
  }, { passive: true });

  addEventListener('touchend', (e) => {
    if (!active) return;
    active = false;
    const t = e.changedTouches[0];
    const dy = startY - t.clientY; // > 0: finger moved up = scroll down
    const dx = startX - t.clientX;
    const dt = Math.max(1, performance.now() - startT);
    const speed = Math.abs(dy) / dt; // px per ms
    const screen = innerHeight - pad();
    // Only quick, short, mostly-vertical swipes glide. A slow drag (finger on the glass for a
    // while, or moving slowly) means "put it here": never move the page after it. Fast or long
    // flicks keep native momentum.
    if (dt > 260 || speed < 0.25) return;
    if (Math.abs(dy) < 30 || Math.abs(dx) > Math.abs(dy) || speed > 0.9 || Math.abs(dy) > screen * 0.6) return;

    const down = dy > 0;
    const step = screen - 24; // one screen, with a sliver of overlap so you keep your place
    // stop positions: the very top of the page, then the start of each section (just under the top bar)
    const sectionTops = [...document.querySelectorAll<HTMLElement>(STOPS)].map((s) => Math.round(s.getBoundingClientRect().top + scrollY - pad()));
    const ys = [...new Set([0, ...sectionTops])].filter((y) => y >= 0).sort((a, b) => a - b);

    let target: number;
    if (down) {
      const next = ys.find((y) => y > startScroll + 80); // skip tiny steps (e.g. just hiding the logo row)
      target = next !== undefined && next - startScroll <= screen ? next : startScroll + step;
    } else {
      const prev = [...ys].reverse().find((y) => y < startScroll - 4);
      target = prev !== undefined && startScroll - prev <= screen ? prev : startScroll - step;
    }
    target = Math.max(0, Math.min(maxY(), target));
    if (Math.abs(target - scrollY) < 2) return;
    // let the finger's own small movement finish, then glide to the target
    requestAnimationFrame(() => scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' }));
  }, { passive: true });
}
