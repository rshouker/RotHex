// @ts-check

import { Texture } from "pixi.js";
import { create_hex_points } from "../core/coords.js";

/**
 * @typedef {{ q: number, r: number }} Cell
 */

/**
 * @typedef {{ x: number, y: number }} WorldPoint
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number
 * }} Rect
 */

/**
 * @param {CanvasRenderingContext2D} canvas_context
 * @param {WorldPoint[]} hex_points
 * @param {number} center_x
 * @param {number} center_y
 */
function add_hex_clip_path(canvas_context, hex_points, center_x, center_y) {
  canvas_context.beginPath();
  canvas_context.moveTo(center_x + hex_points[0].x, center_y + hex_points[0].y);
  for (let point_index = 1; point_index < hex_points.length; point_index += 1) {
    const point = hex_points[point_index];
    canvas_context.lineTo(center_x + point.x, center_y + point.y);
  }
  canvas_context.closePath();
}

/**
 * @param {{
 *   image: HTMLImageElement,
 *   tile_size_px: number,
 *   home_cells: Cell[],
 *   get_cell_world: (cell: Cell) => WorldPoint,
 *   image_rect: Rect
 * }} options
 * @returns {Map<string, Texture>}
 */
export function bake_tile_textures(options) {
  const hex_width = Math.sqrt(3) * options.tile_size_px;
  const hex_height = 2 * options.tile_size_px;
  const canvas_width = Math.ceil(hex_width) + 2;
  const canvas_height = Math.ceil(hex_height) + 2;
  const canvas_center_x = canvas_width / 2;
  const canvas_center_y = canvas_height / 2;
  const hex_points = create_hex_points(options.tile_size_px);
  /** @type {Map<string, Texture>} */
  const textures = new Map();

  for (const home_cell of options.home_cells) {
    const tile_id = `${home_cell.q},${home_cell.r}`;
    const tile_world = options.get_cell_world(home_cell);
    const canvas_element = document.createElement("canvas");
    canvas_element.width = canvas_width;
    canvas_element.height = canvas_height;
    const canvas_context = canvas_element.getContext("2d");
    if (!canvas_context) {
      throw new Error("Could not get 2D context for baking.");
    }

    // Clip to hex, then draw the aligned source image into local tile coordinates.
    canvas_context.save();
    add_hex_clip_path(canvas_context, hex_points, canvas_center_x, canvas_center_y);
    canvas_context.clip();
    canvas_context.drawImage(
      options.image,
      options.image_rect.x - tile_world.x + canvas_center_x,
      options.image_rect.y - tile_world.y + canvas_center_y,
      options.image_rect.width,
      options.image_rect.height
    );
    canvas_context.restore();

    textures.set(tile_id, Texture.from(canvas_element));
  }

  return textures;
}

