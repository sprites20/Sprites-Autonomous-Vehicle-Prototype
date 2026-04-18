import { Vector3 } from 'three';

// This is a simple, shared object that holds all terrain edits.
// It acts as a single source of truth for all components.
const editsStore = {
  burrows: [],
  flattens: [],
  adds: [],
};

/**
 * Adds a new burrowing edit to the terrain.
 * @param {Vector3} position The world position of the center of the burrow.
 * @param {number} radius The radius of influence for the burrow.
 * @param {number} depth The maximum depth of the burrow.
 */
export const addBurrow = (position, radius, depth) => {
  editsStore.burrows.push({ position: position.clone(), radius, depth });
  console.log(`Added burrow at (${position.x}, ${position.y}, ${position.z})`);
};

/**
 * Adds a new flattening edit to the terrain.
 * @param {Vector3} position The world position of the center of the flattening area.
 * @param {number} radius The radius of influence for the flattening.
 * @param {number} height The target height to flatten to.
 */
export const addFlatten = (position, radius, height) => {
  editsStore.flattens.push({ position: position.clone(), radius, height });
  console.log(`Added flatten at (${position.x}, ${position.y}, ${position.z})`);
};

/**
 * Adds a new raising/adding edit to the terrain.
 * @param {Vector3} position The world position of the center of the raising area.
 * @param {number} radius The radius of influence for the raising.
 * @param {number} height The height to add to the existing terrain.
 */
export const addAdd = (position, radius, height) => {
  editsStore.adds.push({ position: position.clone(), radius, height });
  console.log(`Added add at (${position.x}, ${position.y}, ${position.z})`);
};

/**
 * Retrieves all current terrain edits.
 * @returns {object} An object containing arrays of burrows, flattens, and adds.
 */
export const getEdits = () => editsStore;