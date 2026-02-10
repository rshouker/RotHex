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
 *   on_operator_change: (operator_id: string) => void,
 *   on_hover_change: (hover_instance: AnchorInstance | null) => void,
 *   on_move_request: (direction_sign: 1 | -1, hover_instance: AnchorInstance) => void
 * }} options
 * @returns {{
 *   set_instances: (instances: AnchorInstance[]) => void,
 *   set_interaction_locked: (is_locked: boolean) => void,
 *   get_selected_operator_id: () => string
 * }}
 */
export function create_input_controller(options) {
  // CHANGE NOTE: input-side restriction to vertex3 only.
  // ROLLBACK: include all operator ids or remove this allowlist check in on_keydown.
  const enabled_operator_ids = ["vertex3_120"];
  /** @type {AnchorInstance[]} */
  let active_instances = [];
  /** @type {AnchorInstance | null} */
  let hover_instance = null;
  /** @type {{ x: number, y: number } | null} */
  let last_pointer_world = null;
  let interaction_locked = false;
  let selected_operator_id = "ring6_60";

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
      if (distance > options.pivot_hit_radius_px) {
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
      options.on_move_request(1, hover_instance);
    } else if (pointer_event.button === 2) {
      options.on_move_request(-1, hover_instance);
    }
  });

  /**
   * @param {KeyboardEvent} keyboard_event
   * @returns {string | undefined}
   */
  function get_operator_id_from_keyboard_event(keyboard_event) {
    const code_to_operator_id = {
      Digit1: "ring6_60",
      Digit2: "alt3_even_120",
      Digit3: "alt3_odd_120",
      Digit4: "vertex3_120",
      Numpad1: "ring6_60",
      Numpad2: "alt3_even_120",
      Numpad3: "alt3_odd_120",
      Numpad4: "vertex3_120"
    };
    const key_to_operator_id = {
      "1": "ring6_60",
      "2": "alt3_even_120",
      "3": "alt3_odd_120",
      "4": "vertex3_120"
    };
    const by_code =
      code_to_operator_id[
        /** @type {"Digit1" | "Digit2" | "Digit3" | "Digit4" | "Numpad1" | "Numpad2" | "Numpad3" | "Numpad4"} */ (
          keyboard_event.code
        )
      ];
    if (by_code) {
      return by_code;
    }
    return key_to_operator_id[/** @type {"1" | "2" | "3" | "4"} */ (keyboard_event.key)];
  }

  /**
   * @param {KeyboardEvent} keyboard_event
   */
  function on_keydown(keyboard_event) {
    const operator_id = get_operator_id_from_keyboard_event(keyboard_event);
    if (operator_id && !enabled_operator_ids.includes(operator_id)) {
      return;
    }
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
     * @returns {string}
     */
    get_selected_operator_id() {
      return selected_operator_id;
    }
  };
}

