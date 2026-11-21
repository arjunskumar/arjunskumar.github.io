/* One-click copy for the email address, with inline confirmation. */
function copyEmailToClipboard(email, button) {
  const done = () => {
    if (!button) return;
    // Remember the resting label once, so a second click inside the 1.8 s window cannot make "copied" stick
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.textContent = 'copied';
    clearTimeout(button._copyTimer);
    button._copyTimer = setTimeout(() => { button.textContent = button.dataset.label; }, 1800);
  };
  const legacyCopy = () => {
    const ta = document.createElement('textarea');
    ta.value = email;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { if (document.execCommand('copy')) done(); } catch (err) { console.error('Copy failed:', err); }
    document.body.removeChild(ta);
  };

  // The async API can exist and still reject (permissions, unfocused document); fall back then too
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).then(done).catch(legacyCopy);
    return;
  }
  legacyCopy();
}
