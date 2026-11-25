export function setupGestureDemo() {
  const demo = document.querySelector('#gesture-demo');
  const replay = document.querySelector('#gesture-replay');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function stop() {
    demo.classList.remove('playing');
  }

  function play() {
    if (reducedMotion.matches) return;
    demo.classList.add('playing');
    for (const animation of demo.getAnimations({ subtree: true })) {
      animation.currentTime = 0;
      animation.play();
    }
  }

  replay.addEventListener('click', play);
  reducedMotion.addEventListener('change', event => {
    if (event.matches) stop();
  });
  return { play, stop };
}
