import { installEvidenceLab } from './evidence-lab.js';
import {
  applyFixtureMode,
  isDefectActive,
  resolveFixtureMode,
} from './fixture-mode.js';

applyFixtureMode(resolveFixtureMode());

const state = {
  selectedSku: 'alpha',
  contextTarget: null as string | null,
  dragSku: null as string | null,
};

function $(testid: string): HTMLElement {
  const el = document.querySelector(`[data-testid="${testid}"]`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Missing testid: ${testid}`);
  }
  return el;
}

function toast(message: string): void {
  const el = $('toast');
  el.hidden = false;
  el.textContent = message;
  window.setTimeout(() => {
    el.hidden = true;
  }, 1600);
}

function setCurrencyGlyph(): void {
  const el = $('advanced-currency');
  const globalBroken =
    document.documentElement.dataset.reproFixture === 'broken' &&
    document.documentElement.dataset.reproDefect === undefined;
  el.textContent = globalBroken ? '€' : '$';
}

function injectPromoBanner(): void {
  const slot = $('promo-slot');
  if (!isDefectActive('BUG-1009')) {
    const reserved = document.createElement('div');
    reserved.className = 'promo-banner';
    reserved.dataset.testid = 'promo-banner';
    reserved.textContent = 'Spring promo: free shipping over $50';
    slot.replaceChildren(reserved);
    return;
  }

  window.setTimeout(() => {
    const banner = document.createElement('div');
    banner.className = 'promo-banner';
    banner.dataset.testid = 'promo-banner';
    banner.textContent = 'Flash sale — prices drop in place (CLS)';
    slot.replaceChildren(banner);
  }, 600);
}

function wireMenus(): void {
  const actions = $('btn-actions');
  const menu = $('menu-actions');
  const exportBtn = $('btn-export');
  const exportMenu = $('menu-export');
  const terms = $('chk-terms') as HTMLInputElement;

  actions.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    exportMenu.hidden = true;
  });

  exportBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    exportMenu.hidden = !exportMenu.hidden;
  });

  $('btn-export-csv').addEventListener('click', () => {
    if (!terms.checked) {
      toast('Accept terms before exporting');
      return;
    }
    const status = $('export-status');
    status.hidden = false;
    status.textContent = 'CSV export queued';
    menu.hidden = true;
    exportMenu.hidden = true;
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!$('actions-menu').contains(target)) {
      menu.hidden = true;
      exportMenu.hidden = true;
    }
  });
}

function wireSaveErrors(): void {
  $('btn-save').addEventListener('click', () => {
    if (!isDefectActive('BUG-1008')) {
      toast('Saved');
      return;
    }

    console.error('Secondary validation failed for notify email');
    const boom: { missing: { nested: string } } = {
      missing: null as unknown as { nested: string },
    };
    // Intentional TypeError for console overlay demos.
    void boom.missing.nested.toUpperCase();
  });
}

function wireRecalculateFreeze(): void {
  $('btn-recalculate').addEventListener('click', () => {
    if (!isDefectActive('BUG-1010')) {
      toast('Totals recalculated');
      return;
    }

    const end = performance.now() + 1200;
    while (performance.now() < end) {
      // Busy-wait to simulate a main-thread freeze.
    }
    toast('Recalculated (blocked UI)');
  });
}

function wireHeavySortFreeze(): void {
  $('btn-sort-heavy').addEventListener('click', () => {
    if (!isDefectActive('BUG-1016')) {
      toast('Sorted');
      return;
    }
    const end = performance.now() + 900;
    while (performance.now() < end) {
      // Second long-task freeze for design-language coverage.
    }
    toast('Heavy sort finished');
  });
}

function injectToastStackCls(): void {
  if (!isDefectActive('BUG-1015')) {
    return;
  }
  const stack = $('toast-stack');
  window.setTimeout(() => {
    const item = document.createElement('div');
    item.className = 'stack-toast';
    item.dataset.testid = 'stack-toast';
    item.textContent = 'Inventory sync pushed layout';
    stack.append(item);
  }, 500);
}

function wireStickyTipStack(): void {
  const tip = $('sticky-tip');
  $('btn-actions').addEventListener('click', () => {
    if (!isDefectActive('BUG-1015') && !isDefectActive('BUG-1004')) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!$('actions-menu').contains(target) && target !== $('btn-actions')) {
      tip.hidden = true;
    }
  });
}

function wireContextMenu(): void {
  const menu = $('context-menu');
  for (const row of document.querySelectorAll('.sku')) {
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const sku = (row as HTMLElement).dataset.sku ?? 'alpha';
      // Broken: always target alpha regardless of row.
      state.contextTarget = isDefectActive('BUG-1006') ? 'alpha' : sku;
      menu.hidden = false;
      menu.style.left = `${String(event.clientX)}px`;
      menu.style.top = `${String(event.clientY)}px`;
    });
  }

  $('ctx-delete').addEventListener('click', () => {
    toast(`Delete requested for ${state.contextTarget ?? 'unknown'}`);
    menu.hidden = true;
  });

  document.addEventListener('click', () => {
    menu.hidden = true;
  });
}

function wireDragReorder(): void {
  const list = $('sku-list');
  let dragEl: HTMLElement | null = null;

  list.querySelectorAll('.sku').forEach((item) => {
    item.addEventListener('dragstart', () => {
      dragEl = item as HTMLElement;
      dragEl.classList.add('dragging');
      state.dragSku = dragEl.dataset.sku ?? null;
    });
    item.addEventListener('dragend', () => {
      if (!dragEl) {
        return;
      }
      dragEl.classList.remove('dragging');
      if (isDefectActive('BUG-1007')) {
        dragEl.style.setProperty('--drag-offset-current', '8px');
      } else {
        dragEl.style.removeProperty('--drag-offset-current');
      }
      dragEl = null;
    });
  });

  list.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!dragEl) {
      return;
    }
    const after = [...list.querySelectorAll('.sku:not(.dragging)')].find(
      (child) => {
        const box = child.getBoundingClientRect();
        return event.clientY < box.top + box.height / 2;
      },
    );
    if (after === undefined) {
      list.append(dragEl);
      return;
    }
    list.insertBefore(dragEl, after);
  });
}

function wireModalTrap(): void {
  const dialog = $('help-modal') as HTMLDialogElement;
  const close = $('modal-close');
  const a = $('modal-a');
  const b = $('modal-b');

  $('btn-help').addEventListener('click', () => {
    dialog.showModal();
    a.focus();
  });

  close.addEventListener('click', () => {
    dialog.close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !isDefectActive('BUG-1013')) {
      return;
    }
    // Broken: Tab from B jumps to A forever (skips Close).
    if (document.activeElement === b && !event.shiftKey) {
      event.preventDefault();
      a.focus();
    }
  });

  if (!isDefectActive('BUG-1013')) {
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        dialog.close();
      }
    });
  }
}

function wireInvoicePopup(): void {
  $('btn-invoice').addEventListener('click', () => {
    const broken = isDefectActive('BUG-1014');
    const total = broken ? '999.00' : '84.50';
    const html = `<!doctype html><html data-repro-fixture="${
      broken ? 'broken' : 'fixed'
    }"><head><title>Invoice</title></head><body>
      <h1 data-testid="invoice-title">Invoice preview</h1>
      <p>Cart total: <strong data-testid="invoice-total">${total}</strong></p>
    </body></html>`;
    const win = window.open('', 'invoice', 'width=420,height=320');
    win?.document.write(html);
    win?.document.close();
  });
}

function wireAdvancedPanel(): void {
  const panel = $('advanced-panel');
  if (!isDefectActive('BUG-1005')) {
    panel.hidden = false;
  }
  setCurrencyGlyph();
}

function wireRowSelect(): void {
  for (const button of document.querySelectorAll('.sku-row')) {
    button.addEventListener('click', () => {
      const sku = button.closest('.sku');
      state.selectedSku = (sku as HTMLElement | null)?.dataset.sku ?? 'alpha';
      toast(`Selected ${state.selectedSku}`);
    });
  }
}

if (new URLSearchParams(location.search).has('lab')) {
  installEvidenceLab();
} else {
  wireMenus();
  wireSaveErrors();
  wireRecalculateFreeze();
  wireHeavySortFreeze();
  wireContextMenu();
  wireDragReorder();
  wireModalTrap();
  wireInvoicePopup();
  wireAdvancedPanel();
  wireRowSelect();
  wireStickyTipStack();
  injectPromoBanner();
  injectToastStackCls();

  document.documentElement.dataset.reproReady = '1';
}
