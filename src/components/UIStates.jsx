// sharedState.jsx
let pianoOpen = { pianoOpen: false };

export function isPianoOpen() {
  return pianoOpen.pianoOpen;
}

export function setPianoStateOpen(value) {
  pianoOpen.pianoOpen = value;
  console.log("Piano state: ", value);
}
