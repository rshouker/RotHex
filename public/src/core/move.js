// @ts-check

/**
 * @typedef {{
 *   cell_to_tile_id: Map<string, string>,
 *   tile_id_to_cell: Map<string, string>,
 *   tile_rot: Map<string, number>,
 *   tile_home_cell: Map<string, string>
 * }} BoardState
 */

/**
 * @typedef {{
 *   operator_id: string,
 *   anchor_id: string,
 *   anchor_world: { x: number, y: number },
 *   cells: string[],
 *   spin_cells?: string[],
 *   rotation_steps_cw: number
 * }} AnchorInstance
 */

/**
 * @param {number} value
 * @param {number} modulus
 * @returns {number}
 */
function positive_mod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

/**
 * @param {BoardState} state
 * @param {AnchorInstance} anchor_instance
 * @param {1 | -1} direction_sign
 * @returns {string[]}
 */
export function apply_move(state, anchor_instance, direction_sign) {
  const cycle_cell_keys = anchor_instance.cells;
  const spin_cell_keys = anchor_instance.spin_cells ?? [];
  const cycle_length = cycle_cell_keys.length;
  const source_tile_ids = cycle_cell_keys.map((cell_key_value) => {
    const tile_id = state.cell_to_tile_id.get(cell_key_value);
    if (!tile_id) {
      throw new Error(`Missing tile in cell ${cell_key_value}.`);
    }
    return tile_id;
  });

  for (let source_index = 0; source_index < cycle_length; source_index += 1) {
    const tile_id = source_tile_ids[source_index];
    const destination_index =
      direction_sign === 1
        ? (source_index + 1) % cycle_length
        : (source_index - 1 + cycle_length) % cycle_length;
    const destination_cell_key = cycle_cell_keys[destination_index];
    const previous_rotation_steps = state.tile_rot.get(tile_id) ?? 0;

    state.cell_to_tile_id.set(destination_cell_key, tile_id);
    state.tile_id_to_cell.set(tile_id, destination_cell_key);
    state.tile_rot.set(
      tile_id,
      positive_mod(previous_rotation_steps - anchor_instance.rotation_steps_cw * direction_sign, 6)
    );
  }

  /** @type {string[]} */
  const spin_tile_ids = [];
  for (const spin_cell_key of spin_cell_keys) {
    const spin_tile_id = state.cell_to_tile_id.get(spin_cell_key);
    if (!spin_tile_id) {
      continue;
    }
    const previous_rotation_steps = state.tile_rot.get(spin_tile_id) ?? 0;
    state.tile_rot.set(
      spin_tile_id,
      positive_mod(previous_rotation_steps - anchor_instance.rotation_steps_cw * direction_sign, 6)
    );
    spin_tile_ids.push(spin_tile_id);
  }

  return [...new Set([...source_tile_ids, ...spin_tile_ids])];
}

