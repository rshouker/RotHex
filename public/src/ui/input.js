// @ts-check

/**
 * @typedef {{
 *   operator_id: string,
 *   anchor_id: string,
 *   anchor_world: { x: number, y: number },
 *   cells: string[],
 *   rotation_steps_cw: number
 * }} AnchorInstance
 */

/**
 * @param {{
 *   canvas_element: HTMLCanvasElement,
 *   pivot_hit_radius_px: number,
 *   allowed_operator_ids: string[],
 *   initial_operator_id: string,
 *   on_operator_change: (operator_id: string) => void,
 *   on_hover_change: (hover_instance: AnchorInstance | null) => void,
 *   on_move_request: (direction_sign: 1 | -1, hover_instance: AnchorInstance) => void
 * }} options
 * @returns {{
 *   set_instances: (instances: AnchorInstance[]) => void,
 *   set_interaction_locked: (is_locked: boolean) => void,
 *   set_pivot_hit_radius: (pivot_hit_radius_px: number) => void,
 *   get_selected_operator_id: () => string
 * }}
 */
export function create_input_controller(options) {
  /** @type {AnchorInstance[]} */
  let active_instances = [];
  /** @type {AnchorInstance | null} */
  let hover_instance = null;
  /** @type {{ x: number, y: number } | null} */
  let last_pointer_world = null;
  let pivot_hit_radius_px = options.pivot_hit_radius_px;
  let interaction_locked = false;
  let selected_operator_id = options.initial_operator_id;

  /**
   * @param {PointerEvent} pointer_event
   * @returns {{ x: number, y: number }}
   */
  function get_pointer_world(pointer_event) {
    const canvas_bounds = options.canvas_element.getBoundingClientRect();
    return {
      x: pointer_event.clientX - canvas_bounds.left,
      y: pointer_event.clientY - canvas_bounds.top
    };
  }

  /**
   * @param {{ x: number, y: number }} pointer_world
   * @returns {AnchorInstance | null}
   */
  function find_nearest_anchor(pointer_world) {
    /** @type {{ instance: AnchorInstance, distance: number } | null} */
    let best_anchor_match = null;
    for (const anchor_instance of active_instances) {
      const delta_x = anchor_instance.anchor_world.x - pointer_world.x;
      const delta_y = anchor_instance.anchor_world.y - pointer_world.y;
      const distance = Math.hypot(delta_x, delta_y);
      if (distance > pivot_hit_radius_px) {
        continue;
      }
      if (!best_anchor_match || distance < best_anchor_match.distance) {
        best_anchor_match = { instance: anchor_instance, distance };
      }
    }
    return best_anchor_match ? best_anchor_match.instance : null;
  }

  /**
   * @param {AnchorInstance | null} next_hover_instance
   */
  function set_hover_instance(next_hover_instance) {
    if (hover_instance?.anchor_id === next_hover_instance?.anchor_id) {
      return;
    }
    hover_instance = next_hover_instance;
    options.on_hover_change(hover_instance);
  }

  function recompute_hover_from_last_pointer() {
    if (interaction_locked || !last_pointer_world) {
      set_hover_instance(null);
      return;
    }
    set_hover_instance(find_nearest_anchor(last_pointer_world));
  }

  options.canvas_element.addEventListener("contextmenu", (context_event) => {
    context_event.preventDefault();
  });

  options.canvas_element.addEventListener("pointermove", (pointer_event) => {
    last_pointer_world = get_pointer_world(pointer_event);
    recompute_hover_from_last_pointer();
  });

  options.canvas_element.addEventListener("pointerdown", (pointer_event) => {
    if (interaction_locked || !hover_instance) {
      return;
    }
    if (pointer_event.button === 0) {
      options.on_move_request(-1, hover_instance);
    } else if (pointer_event.button === 2) {
      options.on_move_request(1, hover_instance);
    }
  });

  /**
   * @param {KeyboardEvent} keyboard_event
   * @returns {string | undefined}
   */
  function get_operator_id_from_keyboard_event(keyboard_event) {
    let operator_index = -1;
    if (/^Digit[1-9]$/.test(keyboard_event.code)) {
      operator_index = Number(keyboard_event.code.slice("Digit".length)) - 1;
    } else if (/^Numpad[1-9]$/.test(keyboard_event.code)) {
      operator_index = Number(keyboard_event.code.slice("Numpad".length)) - 1;
    } else if (/^[1-9]$/.test(keyboard_event.key)) {
      operator_index = Number(keyboard_event.key) - 1;
    }
    return options.allowed_operator_ids[operator_index];
  }

  /**
   * @param {KeyboardEvent} keyboard_event
   */
  function on_keydown(keyboard_event) {
    const operator_id = get_operator_id_from_keyboard_event(keyboard_event);
    if (!operator_id || operator_id === selected_operator_id) {
      return;
    }
    keyboard_event.preventDefault();
    selected_operator_id = operator_id;
    set_hover_instance(null);
    options.on_operator_change(selected_operator_id);
  }

  window.addEventListener("keydown", on_keydown);
  document.addEventListener("keydown", on_keydown);

  return {
    /**
     * @param {AnchorInstance[]} instances
     */
    set_instances(instances) {
      active_instances = instances;
      recompute_hover_from_last_pointer();
    },
    /**
     * @param {boolean} is_locked
     */
    set_interaction_locked(is_locked) {
      interaction_locked = is_locked;
      recompute_hover_from_last_pointer();
    },
    /**
     * @param {number} next_pivot_hit_radius_px
     */
    set_pivot_hit_radius(next_pivot_hit_radius_px) {
      pivot_hit_radius_px = next_pivot_hit_radius_px;
      recompute_hover_from_last_pointer();
    },
    /**
     * @returns {string}
     */
    get_selected_operator_id() {
      return selected_operator_id;
    }
  };
}

