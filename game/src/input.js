// input.js — keyboard and mouse, read as one plain input state each frame.
// W/S work the throttle lever, the arrow keys pitch and bank, A/D bank too,
// and the mouse steers while it moves over the canvas: recent mouse position
// becomes a pitch/roll target the keyboard can always override.

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    keys,
    mouseX: 0.5, mouseY: 0.5, mouseT: -10, // last mouse move, seconds
    pressed: new Set(),                    // keys that went down this frame
  };

  const down = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) state.pressed.add(e.code);
    keys.add(e.code);
  };
  const up = (e) => keys.delete(e.code);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.mouseX = (e.clientX - r.left) / r.width;
    state.mouseY = (e.clientY - r.top) / r.height;
    state.mouseT = performance.now() / 1000;
  });

  // The flight controls as numbers in [-1, 1] (throttleDelta in [-1, 1]).
  state.read = (now) => {
    let pitch = 0, roll = 0, throttleDelta = 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (keys.has('KeyW')) throttleDelta += 1;
    if (keys.has('KeyS')) throttleDelta -= 1;
    if (pitch === 0 && roll === 0 && now - state.mouseT < 2.5) {
      roll = clampN((state.mouseX - 0.5) * 2.2);
      pitch = clampN((0.5 - state.mouseY) * 1.6);
    }
    return { pitch, roll, throttleDelta };
  };

  state.wasPressed = (code) => state.pressed.has(code);
  state.endFrame = () => state.pressed.clear();
  return state;
}

function clampN(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
