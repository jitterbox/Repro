/** Isolated, user-triggered defects for public evidence strategy acceptance. */
export function installEvidenceLab(): void {
  const query = new URLSearchParams(location.search);
  const kind = query.get('case') ?? 'interaction';
  const broken = query.get('fixture') !== 'fixed';
  const theme = query.get('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.labTheme = theme;
  document.body.innerHTML = `<main class="evidence-lab"><h1>ShopLite evidence lab</h1>
    <p data-testid="lab-context"></p><section class="lab-stage">
    <div class="lab-action"><button data-testid="lab-trigger" aria-label="Run check">Run check</button><div data-testid="lab-interceptor"></div></div>
    <button data-testid="lab-next">Next control</button><button data-testid="lab-last">Last control</button>
    <div data-testid="lab-reference">Reference edge</div><div data-testid="lab-result" role="status">Ready</div>
    <label>Fixture-only email <input data-testid="lab-private" value="review-canary@example.invalid"></label>
    </section><p>Use the controls to reproduce the selected isolated defect.</p></main>`;
  const get = (id: string) =>
    document.querySelector<HTMLElement>(`[data-testid="lab-${id}"]`) ??
    (() => {
      throw new Error(`Missing lab control ${id}`);
    })();
  const result = get('result');
  get('context').textContent =
    `${kind} · ${broken ? 'Before' : 'After'} · ${theme}`;
  if (kind === 'interaction' && broken)
    get('interceptor').classList.add('active');
  get('trigger').addEventListener('keydown', (event) => {
    if (kind === 'keyboard' && broken && event.key === 'Tab') {
      event.preventDefault();
      get('last').focus();
    }
  });
  const colors: string[] = [];
  (window as unknown as { labColors: string[] }).labColors = colors;
  const sample = () => {
    colors.push(getComputedStyle(result).backgroundColor);
    if (colors.length < 300) requestAnimationFrame(sample);
  };
  if (kind === 'transient') requestAnimationFrame(sample);
  get('trigger').addEventListener('click', () => {
    const started = performance.now();
    if (kind === 'performance' && broken)
      while (performance.now() - started < 350) {
        /* intentional long task */
      }
    result.textContent = 'Completed';
    result.dataset.duration = String(performance.now() - started);
    if (kind === 'geometry' && broken)
      result.style.transform = 'translateX(12px)';
    if (kind === 'appearance' && broken) result.hidden = true;
    if (kind === 'console' && broken) {
      console.error('LAB-CONSOLE: save validation failed');
      result.textContent = 'Failed';
    }
    if (kind === 'accessibility') {
      get('trigger').textContent = '▶';
      if (broken) get('trigger').removeAttribute('aria-label');
    }
    if (kind === 'privacy')
      (get('private') as HTMLInputElement).value = broken
        ? 'review-canary@example.invalid'
        : '••••••';
    if (kind === 'transient') {
      result.style.background = broken ? 'rgb(230, 0, 0)' : 'rgb(0, 150, 60)';
      const progress = window.setInterval(() => {
        result.textContent = `Loading ${Math.min(100, Math.round((performance.now() - started) / 2))}%`;
      }, 16);
      window.setTimeout(() => {
        clearInterval(progress);
        result.textContent = 'Completed';
        result.style.background = 'rgb(0, 150, 60)';
      }, 200);
    }
    if (kind === 'network') {
      void fetch(
        broken
          ? '/__evidence_lab_missing__.json'
          : '/evidence-lab-response.json',
      ).then(async (response) => {
        const valid =
          response.ok &&
          response.headers.get('content-type')?.includes('application/json');
        result.textContent = valid ? 'Response accepted' : 'Request failed';
      });
    }
    if (kind === 'multipage') {
      const popup = window.open('', 'lab-proof');
      if (popup) {
        popup.document.body.innerHTML = `<h1>Invoice</h1><p data-testid="lab-total">${broken ? '999.00' : '84.50'}</p>`;
      }
    }
    if (kind === 'text') {
      result.style.whiteSpace = 'nowrap';
      result.style.overflow = broken ? 'visible' : 'hidden';
      result.style.textOverflow = 'ellipsis';
      result.textContent =
        query.get('text') === 'long'
          ? 'WWWW iiiii 0123456789 — Inventory validation for unusually long international product descriptions '.repeat(
              4,
            )
          : 'OK';
    }
  });
  document.documentElement.dataset.reproReady = '1';
}
