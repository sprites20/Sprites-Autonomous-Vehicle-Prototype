let userData = null;
let isChatting = false;

export function setGlobalUserData(data) {
  userData = data;
}

export function getGlobalUserData() {
  return userData;
}

export function setGlobalIsChatting(state) {
  isChatting = state;
}

export function getGlobalIsChatting() {
  return isChatting;
}
