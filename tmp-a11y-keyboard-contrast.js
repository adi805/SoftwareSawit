const bad = Array.from(document.querySelectorAll('button:not([disabled]), a, input:not([disabled]), select:not([disabled])')).filter(el => el.tabIndex < 0);
const styles = Array.from(document.querySelectorAll('button, select, input, .text-sm, h1, h2, h3, p, span')).slice(0,15).map(el => {
  const st = window.getComputedStyle(el);
  return { tag: el.tagName, text: el.textContent.trim().slice(0,15), color: st.color, bg: st.backgroundColor };
});
JSON.stringify({ badKeyboard: {count: bad.length, examples: bad.slice(0,3).map(el => ({tag: el.tagName, text: el.textContent.trim().slice(0,20)})) }, styles });
