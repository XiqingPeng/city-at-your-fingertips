import { setupGestureDemo } from './gesture-hint.js';

const leafletUrl = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet';

function loadLeaflet() {
  if (document.querySelector('#leaflet-script')) return;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = leafletUrl + '.css';
  const styleReady = new Promise(resolve => {
    stylesheet.addEventListener('load', resolve, { once: true });
    stylesheet.addEventListener('error', resolve, { once: true });
  });

  const script = document.createElement('script');
  script.id = 'leaflet-script';
  script.src = leafletUrl + '.js';
  script.addEventListener('load', async () => {
    await styleReady;
    window.dispatchEvent(new Event('leaflet-ready'));
  }, { once: true });
  script.addEventListener('error', () => {
    script.remove();
    stylesheet.remove();
  }, { once: true });
  document.head.append(stylesheet, script);
}

export function setupDisplay({ onPanelChange, onTourToggle }) {
  const app = document.querySelector('.app');
  const panels = {
    map: {
      toggle: document.querySelector('#map-toggle'),
      element: document.querySelector('#map-panel'),
      close: document.querySelector('#close-map')
    },
    hands: {
      toggle: document.querySelector('#help-toggle'),
      element: document.querySelector('#help'),
      close: document.querySelector('#close-help')
    }
  };
  const areaEditor = document.querySelector('#area-editor');
  areaEditor.addEventListener('toggle', () => {
    if (areaEditor.open) loadLeaflet();
  });
  const sceneName = document.querySelector('#scene-name');
  const sceneDescription = document.querySelector('#scene-description');
  const tourButton = document.querySelector('#tour-toggle');
  const tourAction = document.querySelector('#tour-action');
  const tourNote = document.querySelector('#tour-note');
  const runningNote = tourNote.textContent;
  const gestureDemo = setupGestureDemo();
  let activePanel = null;

  function showPanel(next) {
    if (next === activePanel) return;

    const previous = panels[activePanel];
    const restoreFocus = previous?.element.contains(document.activeElement);
    if (previous) {
      previous.element.hidden = true;
      previous.toggle.setAttribute('aria-expanded', 'false');
      if (activePanel === 'map') areaEditor.open = false;
      if (activePanel === 'hands') gestureDemo.stop();
    }
    activePanel = next;
    if (next) {
      const panel = panels[next];
      app.dataset.panel = next;
      panel.element.hidden = false;
      panel.toggle.setAttribute('aria-expanded', 'true');
      panel.element.querySelector('.panel-body').scrollTop = 0;
      if (next === 'hands') gestureDemo.play();
      panel.close.focus({ preventScroll: true });
    } else {
      delete app.dataset.panel;
      if (restoreFocus) previous.toggle.focus({ preventScroll: true });
    }
    onPanelChange(next);
  }

  function closePanels() {
    showPanel(null);
  }

  for (const [name, panel] of Object.entries(panels)) {
    panel.toggle.addEventListener('click', () => showPanel(activePanel === name ? null : name));
    panel.close.addEventListener('click', closePanels);
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activePanel && !event.defaultPrevented) {
      event.preventDefault();
      closePanels();
    }
  });
  tourButton.addEventListener('click', () => onTourToggle());

  function setTour({ name, description, running }) {
    if (sceneName.textContent !== name) sceneName.textContent = name;
    if (sceneDescription.textContent !== description) sceneDescription.textContent = description;
    const state = String(running);
    if (tourButton.dataset.running === state) return;
    tourButton.dataset.running = state;
    tourAction.textContent = running ? 'Pause tour' : 'Resume tour';
    tourNote.textContent = running ? runningNote : 'Tour paused.';
  }

  return { setTour, closePanels };
}
