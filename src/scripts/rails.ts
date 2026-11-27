/**
 * Arrows + "1–4 / 9" counter under every .rail / .rail--m (see global.css).
 * Shown only while the row actually scrolls sideways, so nothing is ever hidden without a cue.
 */
const ARROW = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

function setup(rail: HTMLElement) {
  if (rail.dataset.railReady) return;
  rail.dataset.railReady = '1';
  const items = () => [...rail.children].filter((c) => (c as HTMLElement).offsetParent !== null) as HTMLElement[];

  const nav = document.createElement('div');
  nav.className = 'rail-nav';
  nav.innerHTML = `<button type="button" class="rail-nav__btn" data-dir="-1" aria-label="Previous">${ARROW('M15 5l-7 7 7 7')}</button>
    <span class="rail-nav__count" aria-live="polite"></span>
    <button type="button" class="rail-nav__btn" data-dir="1" aria-label="Next">${ARROW('M9 5l7 7-7 7')}</button>`;
  rail.after(nav);
  const [prev, next] = nav.querySelectorAll<HTMLButtonElement>('button');
  const count = nav.querySelector<HTMLElement>('.rail-nav__count')!;

  const update = () => {
    const scrolls = rail.scrollWidth > rail.clientWidth + 4 && getComputedStyle(rail).overflowX !== 'visible';
    nav.hidden = !scrolls;
    if (!scrolls) return;
    const box = rail.getBoundingClientRect();
    const list = items();
    const visible = list
      .map((el, i) => ({ i, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.left >= box.left - 8 && r.right <= box.right + 8)
      .map(({ i }) => i + 1);
    const first = visible[0] ?? 1, last = visible[visible.length - 1] ?? first;
    count.textContent = `${first === last ? first : `${first}–${last}`} / ${list.length}`;
    prev.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
  };

  nav.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!b) return;
    const step = Math.max(rail.clientWidth * 0.9, 200);
    rail.scrollBy({ left: Number(b.dataset.dir) * step, behavior: 'smooth' });
  });
  let raf = 0;
  rail.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
  new ResizeObserver(update).observe(rail);
  // cards hidden/shown by filters change the count
  new MutationObserver(update).observe(rail, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  update();
}

document.querySelectorAll<HTMLElement>('.rail, .rail--m').forEach(setup);
