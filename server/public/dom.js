export const el = (id) => document.getElementById(id);

let timer;
export function toast(message) {
  const box = el('toast');
  box.textContent = message;
  box.dataset.show = 'true';
  clearTimeout(timer);
  timer = setTimeout(() => (box.dataset.show = 'false'), 2800);
}
