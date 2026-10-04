/** The bar's widest, in cells. */
const BAR_CELLS = 20

/** How many cells a bar takes in a body `columns` wide: 5 to 20. */
export function barCells(columns: number): number {
  return Math.max(5, Math.min(BAR_CELLS, columns - 14))
}

/** A bar of `cells` cells, filled in the share `done` is of `total`. */
export function progressBar(done: number, total: number, cells: number): string {
  const filled = total <= 0 ? 0 : Math.round((Math.min(done, total) / total) * cells)

  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}
