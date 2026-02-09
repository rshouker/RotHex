# Game Design (GDD): Hex Tile Unscramble (Prototype)

## High concept
A reversible “unscramble” puzzle on a flat-top hex grid. A single source image is cut into hex tiles. The player restores the original image by applying rotational move operators anchored at valid pivot points.

## Player goal / win condition
- **Win:** all tiles are back at their **home cell** with **rotation = 0** (upright).

Notes:
- Prototype uses the strict win condition above.
- No equivalence classes (no global rotations/reflections) in v1.

## Board
- **Grid type:** flat-top hex grid.
- **Coordinate system:** axial coords \((q, r)\).
- **Shape:** “rectangular-ish” parallelogram region.
  - Valid cells: \(0 \le q < GRID\_W\), \(0 \le r < GRID\_H\).
- **Tile size:** constant `TILE_SIZE_PX` (unassigned, ~100px scale).
- **Tile count target:** ~100.

## Visuals
- Tiles display the image portion they correspond to (unique per tile).
- Tiles have a **visible border** at all times.
- Background image display is optional; tiles cover the board portion so no special interior masking is required.
- **Hover affordance:** when the cursor is near a valid pivot, highlight the **borders of all tiles** in the affected set.

## Core mechanic: rotational move operators
Moves are **reversible rotations** of a set of tiles around an anchor.

### Tile orientation model
- Each tile has discrete orientation `rot ∈ {0,1,2,3,4,5}`.
- Each step represents a 60° rotation.
- A move applies both:
  - a **permutation** of which tile occupies which affected cell, and
  - an **orientation delta** to every moved tile.

### Move application rule (conceptual)
Given an operator instance with:
- affected cell cycle `cells[]` in CW order,
- `rotationStepsCW` in 60° steps (1 → 60°, 2 → 120°),

Then:
- **CW move:** tile at `cells[i]` moves to `cells[(i+1) mod N]`.
- **CCW move:** tile at `cells[i]` moves to `cells[(i-1) mod N]`.
- For each moved tile:
  - `rot = (rot + rotationStepsCW * dirSign) mod 6`,
  - where `dirSign = +1` for CW and `-1` for CCW.

## Operator set (v1 prototype: 4 operators)

### 1) Ring-of-6 (CELL anchor, 60°)
- Anchor: center of a cell.
- Affected tiles: the 6 neighboring cells around the anchor.
- Turn: 60° CW/CCW.
- Valid only when **all 6 neighbors** exist in the grid.

### 2) Alternating-3 EVEN (CELL anchor, 120°)
- Anchor: center of a cell.
- Affected tiles: 3 alternating neighbors (the “even” subset).
- Turn: 120° CW/CCW.
- Valid only when **all 3** exist.

### 3) Alternating-3 ODD (CELL anchor, 120°)
- Anchor: center of a cell.
- Affected tiles: the other 3 alternating neighbors (the “odd” subset).
- Turn: 120° CW/CCW.
- Valid only when **all 3** exist.

### 4) Vertex Triad (VERTEX anchor, 120°)
- Anchor: intersection point where 3 tiles meet.
- Affected tiles: the 3 cells touching that vertex.
- Turn: 120° CW/CCW.
- Valid only when **all 3** exist.

## Controls (prototype)
- Operator selection: keys `1..4` or simple on-screen buttons.
- Pivot selection is implicit via cursor position:
  - If the cursor is within `PIVOT_HIT_RADIUS_PX` of a valid pivot, that pivot becomes “hovered”.
  - Hovered pivot causes the **borders of all affected tiles** to highlight.
- **Left click:** apply CW rotation at the hovered pivot.
- **Right click:** apply CCW rotation at the hovered pivot.
- Browser context menu is disabled on right click.

## Scramble / solvability
- Start from the solved state.
- Scramble by applying `SCRAMBLE_MOVES` random legal moves (CW or CCW).
- Because all moves are reversible, every scramble is guaranteed solvable.

## Feedback & feel targets (prototype)
- Clear visual feedback: the player always knows which tiles will rotate.
- Fast, readable rotations (short animations or instant).
- No ambiguous pivots: only valid pivots for the selected operator respond to input.
