const stage = document.querySelector('#scene');
const notice = document.querySelector('#graphics-notice');
const heading = document.querySelector('#graphics-title');
const detail = document.querySelector('#graphics-detail');

function showNotice(title, message) {
  heading.textContent = title;
  detail.textContent = message;
  if (!notice.open) notice.showModal();
}

notice.addEventListener('cancel', event => event.preventDefault());
document.querySelector('#reload-exhibit').addEventListener('click', () => location.reload());

// Context events do not bubble. Listen in capture so this also covers a
// replacement canvas if the renderer is reinitialized.
stage.addEventListener('webglcontextlost', () => {
  showNotice('Restoring the 3D view', 'Your view will return when the browser restores graphics.');
}, true);
stage.addEventListener('webglcontextrestored', () => notice.close(), true);

try {
  await import('./app.js');
} catch (error) {
  console.error('Pixel City could not start.', error);
  if (/WebGL context/i.test(error.message)) {
    showNotice('3D view unavailable', 'Pixel City needs WebGL 2. Enable graphics acceleration in your browser, then reload the exhibit.');
  } else {
    showNotice('Pixel City could not start', 'Reload the exhibit to try again.');
  }
}
