/* One-click copy for the email address, with inline confirmation. */
function copyEmailToClipboard(email, button) {
  const done = () => {
    if (!button) return;
    const label = button.textContent;
    button.textContent = 'copied';
    setTimeout(() => { button.textContent = label; }, 1800);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).then(done).catch((err) => console.error('Copy failed:', err));
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = email;
  ta.style.position = 'fixed';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (err) { console.error('Copy failed:', err); }
  document.body.removeChild(ta);
}
