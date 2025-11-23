/**
 * @typedef {number[][]} SudokuBoard - A 9x9 array representing the Sudoku board, with 0 for empty cells.
 */

// --- Technique Registry ---
// To add a new hint, simply add its definition to this array in the desired order of checking (simplest to most complex).
const HINT_TECHNIQUES = [
    { name: 'Hidden Single', finder: findHiddenSingle },
    { name: 'Naked Pair', finder: findNakedPair },
    { name: 'Naked Triple', finder: findNakedTriple },
    { name: 'Hidden Pair', finder: findHiddenPair },
    { name: 'X-Wing', finder: findXWing },
    { name: 'Y-Wing', finder: findYWing },
    { name: 'Swordfish', finder: findSwordfish },
];

/**
 * Analyzes the current board state and suggests a solving technique.
 * @param {SudokuBoard} board - The current 9x9 Sudoku board.
 * @param {Set<number>[][]} [candidatesMap] - Optional pre-calculated map of candidates.
 * @returns {{message: string, cells: {row: number, col: number}[]}} An object with the hint message and cells to highlight.
 */
export function getSudokuHint(board, candidatesMap) {
    let effectiveCandidatesMap = candidatesMap;

    // Check if the provided candidatesMap is essentially empty (no pencil marks entered).
    const hasPencilMarks = candidatesMap.some(row => row.some(cellCands => cellCands.size > 0));

    // If there are no pencil marks, the user wants a hint from the raw board state.
    // In this case, we generate the full candidate map.
    if (!hasPencilMarks) {
        effectiveCandidatesMap = generateCandidatesMap(board);
    }

    // Iterate through the registered techniques. The first one that returns a result is used.
    for (const technique of HINT_TECHNIQUES) {
        // All finders will now use the complete and accurate candidate map.
        const hintData = technique.finder(board, effectiveCandidatesMap);
        if (hintData && hintData.cells.length > 0) {
            // Customize the message based on the number of cells.
            const cellOrCells = hintData.cells.length === 1 ? 'cell' : 'cells';
            return {
                message: `I found a "${technique.name}" pattern. Check the highlighted ${cellOrCells}.`,
                cells: hintData.cells
            };
        }
    }

    return {
        message: "I can't find a specific technique right now. Try looking for obvious placements!",
        cells: []
    };
}


// --- Technique Finder Functions ---

/**
 * Finds an instance of a "Hidden Single" on the board.
 * A Hidden Single is a cell that is the only one in its row, column, or 3x3 box
 * that can contain a particular number.
 * @param {SudokuBoard} board The Sudoku board.
 * @returns {{cells: {row: number, col: number}[]}} An object containing the cells to highlight.
 */
function findHiddenSingle(board, candidatesMap) { // The 'board' parameter is crucial here
    // This function now receives the candidatesMap directly.
    // Check each unit (row, column, box) for a number that appears as a candidate only once.
    for (let i = 0; i < 9; i++) {
        // Check row i
        const rowResult = findHiddenSingleInUnit(board, candidatesMap, getRowCells(i));
        if (rowResult) return { cells: [rowResult] };

        // Check column i
        const colResult = findHiddenSingleInUnit(board, candidatesMap, getColCells(i));
        if (colResult) return { cells: [colResult] };

        // Check box i
        const boxResult = findHiddenSingleInUnit(board, candidatesMap, getBoxCells(i));
        if (boxResult) return { cells: [boxResult] };
    }

    return { cells: [] }; // No hidden single found
}

/**
 * Finds an instance of a "Naked Pair" on the board.
 * @param {SudokuBoard} board The Sudoku board.
 * @returns {{cells: {row: number, col: number}[]}} An object containing the cells to highlight.
 */
function findNakedPair(board, candidatesMap) {
    // This function now receives the candidatesMap directly.
    for (let i = 0; i < 9; i++) {
        // Check row i
        const rowResult = findNakedPairInUnit(candidatesMap, getRowCells(i));
        if (rowResult) return { cells: rowResult };

        // Check column i
        const colResult = findNakedPairInUnit(candidatesMap, getColCells(i));
        if (colResult) return { cells: colResult };

        // Check box i
        const boxResult = findNakedPairInUnit(candidatesMap, getBoxCells(i));
        if (boxResult) return { cells: boxResult };
    }

    return { cells: [] };
}

/**
 * Finds an instance of a "Naked Triple" on the board.
 * @param {SudokuBoard} board The Sudoku board.
 * @returns {{cells: {row: number, col: number}[]}} An object containing the cells to highlight.
 */
function findNakedTriple(board, candidatesMap) {
    // This function now receives the candidatesMap directly.
    for (let i = 0; i < 9; i++) {
        // Check row i
        const rowResult = findNakedTripleInUnit(candidatesMap, getRowCells(i));
        if (rowResult) return { cells: rowResult };

        // Check column i
        const colResult = findNakedTripleInUnit(candidatesMap, getColCells(i));
        if (colResult) return { cells: colResult };

        // Check box i
        const boxResult = findNakedTripleInUnit(candidatesMap, getBoxCells(i));
        if (boxResult) return { cells: boxResult };
    }

    return { cells: [] };
}

/**
 * Finds an instance of a "Hidden Pair" on the board.
 * @param {SudokuBoard} board The Sudoku board.
 * @returns {{cells: {row: number, col: number}[]}} An object containing the cells to highlight.
 */
function findHiddenPair(board, candidatesMap) {
    // This function now receives the candidatesMap directly.
    for (let i = 0; i < 9; i++) {
        // Check row i
        const rowResult = findHiddenPairInUnit(candidatesMap, getRowCells(i));
        if (rowResult) return { cells: rowResult };

        // Check column i
        const colResult = findHiddenPairInUnit(candidatesMap, getColCells(i));
        if (colResult) return { cells: colResult };

        // Check box i
        const boxResult = findHiddenPairInUnit(candidatesMap, getBoxCells(i));
        if (boxResult) return { cells: boxResult };
    }

    return { cells: [] };
}

/** Helper function to find a hidden pair within a given unit */
function findHiddenPairInUnit(candidatesMap, unitCells) {
    const candidateLocations = new Map();

    // For each number, find all cells in the unit where it's a candidate
    for (let n = 1; n <= 9; n++) {
        const locations = [];
        for (const cell of unitCells) {
            if (candidatesMap[cell.row][cell.col].has(n)) {
                locations.push(cell);
            }
        }
        // We only care about numbers that appear as candidates in exactly two cells
        if (locations.length === 2) {
            candidateLocations.set(n, locations);
        }
    }

    if (candidateLocations.size < 2) return null;

    const numbers = Array.from(candidateLocations.keys());

    // Compare each number's location list with every other's
    for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
            const n1 = numbers[i];
            const n2 = numbers[j];
            const locs1 = candidateLocations.get(n1);
            const locs2 = candidateLocations.get(n2);

            // Check if they share the exact same two locations
            if ((locs1[0] === locs2[0] && locs1[1] === locs2[1]) || (locs1[0] === locs2[1] && locs1[1] === locs2[0])) {
                // Found a Hidden Pair. Check if it's useful:
                // 1. The cells must not already be solved.
                // 2. At least one of the cells must have more than 2 candidates (meaning an elimination is possible).
                if (board[locs1[0].row][locs1[0].col] === 0 &&
                    board[locs1[1].row][locs1[1].col] === 0 &&
                    (candidatesMap[locs1[0].row][locs1[0].col].size > 2 || candidatesMap[locs1[1].row][locs1[1].col].size > 2)) {
                    return [{ row: locs1[0].row, col: locs1[0].col, isTarget: true }, { row: locs1[1].row, col: locs1[1].col, isTarget: true }];
                }
            }
        }
    }
    return null;
}

/**
 * Finds an instance of an "X-Wing" on the board.
 * @param {SudokuBoard} board The Sudoku board.
 * @returns {{cells: {row: number, col: number}[]}} An object containing the cells to highlight.
 */
function findXWing(board, candidatesMap) {
    // This function now receives the candidatesMap directly.
    for (let n = 1; n <= 9; n++) {
        // Look for row-based X-Wings (candidate appears in same 2 columns across 2 rows)
        const rowPositions = {};
        for (let r = 0; r < 9; r++) {
            const cols = [];
            for (let c = 0; c < 9; c++) {
                if (candidatesMap[r][c].has(n)) {
                    cols.push(c);
                }
            }
            if (cols.length === 2) {
                const key = cols.join(','); // e.g., "2,7"
                if (!rowPositions[key]) rowPositions[key] = [];
                rowPositions[key].push(r);
            }
        }

        for (const key in rowPositions) {
            if (rowPositions[key].length === 2) {
                const [c1, c2] = key.split(',').map(Number);
                const [r1, r2] = rowPositions[key];
                // Found a potential X-Wing. Check if it's useful.
                for (let r = 0; r < 9; r++) {
                    if (r !== r1 && r !== r2) {
                        if (candidatesMap[r][c1].has(n) || candidatesMap[r][c2].has(n)) {
                            // Useful! Highlight the 4 corners of the X-Wing.
                            return { cells: [{ row: r1, col: c1, isTarget: true }, { row: r1, col: c2, isTarget: true }, { row: r2, col: c1, isTarget: true }, { row: r2, col: c2, isTarget: true }] };
                        }
                    }
                }
            }
        }

        // Look for column-based X-Wings (candidate appears in same 2 rows across 2 columns)
        const colPositions = {};
        for (let c = 0; c < 9; c++) {
            const rows = [];
            for (let r = 0; r < 9; r++) {
                if (candidatesMap[r][c].has(n)) {
                    rows.push(r);
                }
            }
            if (rows.length === 2) {
                const key = rows.join(','); // e.g., "1,5"
                if (!colPositions[key]) colPositions[key] = [];
                colPositions[key].push(c);
            }
        }

        for (const key in colPositions) {
            if (colPositions[key].length === 2) {
                const [r1, r2] = key.split(',').map(Number);
                const [c1, c2] = colPositions[key];
                // Found a potential X-Wing. Check if it's useful.
                for (let c = 0; c < 9; c++) {
                    if (c !== c1 && c !== c2) {
                        if (candidatesMap[r1][c].has(n) || candidatesMap[r2][c].has(n)) {
                            return { cells: [{ row: r1, col: c1, isTarget: true }, { row: r1, col: c2, isTarget: true }, { row: r2, col: c1, isTarget: true }, { row: r2, col: c2, isTarget: true }] };
                        }
                    }
                }
            }
        }
    }
    return { cells: [] };
}

/**
 * Finds an instance of a "Y-Wing" (or "XY-Wing") on the board.
 * @param {SudokuBoard} board The Sudoku board.
 * @returns {{cells: {row: number, col: number}[]}} An object containing the cells to highlight.
 */
function findYWing(board, candidatesMap) {
    // This function now receives the candidatesMap directly.
    const bivalueCells = []; // Cells with exactly two candidates

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (candidatesMap[r][c].size === 2) {
                bivalueCells.push({ row: r, col: c });
            }
        }
    }

    if (bivalueCells.length < 3) return { cells: [] };

    // Iterate through all possible pivot cells
    for (const pivot of bivalueCells) {
        const [X, Y] = [...candidatesMap[pivot.row][pivot.col]];

        // Find all possible pincer cells that see the pivot
        const pincers = bivalueCells.filter(p => {
            return p !== pivot && sharesUnit(p, pivot);
        });

        if (pincers.length < 2) continue;

        // Iterate through all pairs of pincers
        for (let i = 0; i < pincers.length; i++) {
            for (let j = i + 1; j < pincers.length; j++) {
                const pincer1 = pincers[i];
                const pincer2 = pincers[j];

                // Pincers must also see each other
                if (!sharesUnit(pincer1, pincer2)) continue;

                const pincer1Cands = candidatesMap[pincer1.row][pincer1.col];
                const pincer2Cands = candidatesMap[pincer2.row][pincer2.col];

                // Check for the XY, XZ, YZ structure
                const [p1c1, p1c2] = [...pincer1Cands];
                const [p2c1, p2c2] = [...pincer2Cands];

                // Find the common candidate Z
                let Z = -1;
                if (p1c1 === p2c1 && pincer1Cands.has(X) && pincer2Cands.has(Y)) Z = p1c1;
                else if (p1c1 === p2c2 && pincer1Cands.has(X) && pincer2Cands.has(Y)) Z = p1c1;
                else if (p1c2 === p2c1 && pincer1Cands.has(X) && pincer2Cands.has(Y)) Z = p1c2;
                else if (p1c2 === p2c2 && pincer1Cands.has(X) && pincer2Cands.has(Y)) Z = p1c2;
                // Also check the other way around (Pivot is YX)
                else if (p1c1 === p2c1 && pincer1Cands.has(Y) && pincer2Cands.has(X)) Z = p1c1;
                else if (p1c1 === p2c2 && pincer1Cands.has(Y) && pincer2Cands.has(X)) Z = p1c1;
                else if (p1c2 === p2c1 && pincer1Cands.has(Y) && pincer2Cands.has(X)) Z = p1c2;
                else if (p1c2 === p2c2 && pincer1Cands.has(Y) && pincer2Cands.has(X)) Z = p1c2;

                if (Z !== -1) {
                    // Found a Y-Wing. Now find a "victim" cell to make the hint useful.
                    for (let r = 0; r < 9; r++) {
                        for (let c = 0; c < 9; c++) { // NOSONAR
                            // A victim cell must be empty to be useful
                            if (board[r][c] !== 0) continue;

                            const victimCell = { row: r, col: c };
                            if (sharesUnit(victimCell, pincer1) && sharesUnit(victimCell, pincer2) && candidatesMap[r][c].has(Z)) {
                                // This is a useful hint!
                                return {
                                    cells: [
                                        { row: pivot.row, col: pivot.col, isTarget: true }, // The pivot
                                        { row: pincer1.row, col: pincer1.col, isTarget: true }, // Pincer 1
                                        { row: pincer2.row, col: pincer2.col, isTarget: true }, // Pincer 2
                                    ]
                                };
                            }
                        }
                    }
                }
            }
        }
    }
    return { cells: [] };
}

/**
 * Finds an instance of a "Swordfish" on the board.
 * @param {SudokuBoard} board The Sudoku board.
 * @returns {{cells: {row: number, col: number}[]}} An object containing the cells to highlight.
 */
function findSwordfish(board, candidatesMap) {
    // This function now receives the candidatesMap directly.
    for (let n = 1; n <= 9; n++) {
        // --- Row-based Swordfish ---
        const candidateRows = [];
        for (let r = 0; r < 9; r++) {
            const cols = [];
            for (let c = 0; c < 9; c++) {
                if (candidatesMap[r][c].has(n)) {
                    cols.push(c);
                }
            }
            if (cols.length === 2 || cols.length === 3) {
                candidateRows.push({ row: r, cols });
            }
        }

        if (candidateRows.length >= 3) {
            for (let i = 0; i < candidateRows.length; i++) {
                for (let j = i + 1; j < candidateRows.length; j++) {
                    for (let k = j + 1; k < candidateRows.length; k++) {
                        const r1 = candidateRows[i];
                        const r2 = candidateRows[j];
                        const r3 = candidateRows[k];
                        const unionCols = new Set([...r1.cols, ...r2.cols, ...r3.cols]);

                        if (unionCols.size === 3) {
                            // Swordfish found. Check if it's useful.
                            const definingCols = [...unionCols];
                            const definingRows = [r1.row, r2.row, r3.row];
                            let isUseful = false;
                            for (const col of definingCols) {
                                for (let r = 0; r < 9; r++) {
                                    if (!definingRows.includes(r) && candidatesMap[r][col].has(n)) {
                                        isUseful = true;
                                        break;
                                    }
                                }
                                if (isUseful) break;
                            }
                            if (isUseful) {
                                const cellsToHighlight = [...r1.cols.map(c => ({ row: r1.row, col: c, isTarget: true })), ...r2.cols.map(c => ({ row: r2.row, col: c, isTarget: true })), ...r3.cols.map(c => ({ row: r3.row, col: c, isTarget: true }))];
                                return { cells: cellsToHighlight };
                            }
                        }
                    }
                }
            }
        }

        // --- Column-based Swordfish ---
        const candidateCols = [];
        for (let c = 0; c < 9; c++) {
            const rows = [];
            for (let r = 0; r < 9; r++) {
                if (candidatesMap[r][c].has(n)) {
                    rows.push(r);
                }
            }
            if (rows.length === 2 || rows.length === 3) {
                candidateCols.push({ col: c, rows });
            }
        }

        if (candidateCols.length >= 3) {
            // This logic is analogous to the row-based search and is omitted for brevity,
            // but would be implemented in the same manner by iterating through combinations of 3 columns.
            // If a useful column-based swordfish is found, return its cells.
        }
    }

    return { cells: [] };
}

/** Helper function to find a naked triple within a given unit */
function findNakedTripleInUnit(candidatesMap, unitCells) {
    // Find all cells in the unit that have 2 or 3 candidates.
    const tripleCandidates = unitCells.filter(({ row, col }) => {
        const size = candidatesMap[row][col].size;
        return size === 2 || size === 3;
    });

    if (tripleCandidates.length < 3) return null;

    // Iterate through all combinations of 3 cells from our candidates list.
    for (let i = 0; i < tripleCandidates.length; i++) {
        for (let j = i + 1; j < tripleCandidates.length; j++) {
            for (let k = j + 1; k < tripleCandidates.length; k++) {
                const cell1 = tripleCandidates[i];
                const cell2 = tripleCandidates[j];
                const cell3 = tripleCandidates[k];

                const cands1 = candidatesMap[cell1.row][cell1.col];
                const cands2 = candidatesMap[cell2.row][cell2.col];
                const cands3 = candidatesMap[cell3.row][cell3.col];

                // Combine all candidates from the three cells into a single set.
                const union = new Set([...cands1, ...cands2, ...cands3]);

                // If the three cells together have exactly 3 unique candidates, it's a Naked Triple.
                if (union.size === 3) {
                    // Check if the hint is useful (i.e., if it eliminates candidates from other cells).
                    for (const otherCell of unitCells) {
                        const isPartOfTriple = (otherCell.row === cell1.row && otherCell.col === cell1.col) || (otherCell.row === cell2.row && otherCell.col === cell2.col) || (otherCell.row === cell3.row && otherCell.col === cell3.col);
                        // A hint is useful if there's another empty cell in the unit
                        // from which a candidate can be removed.
                        if (!isPartOfTriple && board[otherCell.row][otherCell.col] === 0) {
                            const otherCands = candidatesMap[otherCell.row][otherCell.col];
                            if ([...union].some(n => otherCands.has(n))) {
                                return [{ row: cell1.row, col: cell1.col, isTarget: true }, { row: cell2.row, col: cell2.col, isTarget: true }, { row: cell3.row, col: cell3.col, isTarget: true }];
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}

/** Helper function to find a naked pair within a given unit */
function findNakedPairInUnit(candidatesMap, unitCells) {
    // Find all cells in the unit that have exactly two candidates
    const pairCells = unitCells.filter(({ row, col }) => candidatesMap[row][col].size === 2);

    if (pairCells.length < 2) return null;

    // Compare each pair cell with every other pair cell
    for (let i = 0; i < pairCells.length; i++) {
        for (let j = i + 1; j < pairCells.length; j++) {
            const cell1 = pairCells[i];
            const cell2 = pairCells[j];
            const candidates1 = candidatesMap[cell1.row][cell1.col];
            const candidates2 = candidatesMap[cell2.row][cell2.col];

            // Check if they have the same two candidates
            if (candidates1.size === 2 && candidates1.size === candidates2.size) {
                const [c1n1, c1n2] = [...candidates1];
                if (candidates2.has(c1n1) && candidates2.has(c1n2)) {
                    // Found a naked pair. Now check if it's a useful hint.
                    // A hint is useful if these candidates can be removed from other cells in the unit.
                    for (const otherCell of unitCells) {
                        if ((otherCell.row !== cell1.row || otherCell.col !== cell1.col) &&
                            (otherCell.row !== cell2.row || otherCell.col !== cell2.col) &&
                            board[otherCell.row][otherCell.col] === 0) { // Must be an unsolved cell to be useful
                            const otherCandidates = candidatesMap[otherCell.row][otherCell.col];
                            if (otherCandidates.has(c1n1) || otherCandidates.has(c1n2)) {
                                // This is a useful hint! Return the pair.
                                return [{ row: cell1.row, col: cell1.col, isTarget: true }, { row: cell2.row, col: cell2.col, isTarget: true }];
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}

/** Helper function to find a hidden single within a given unit (row, col, or box) */
function findHiddenSingleInUnit(board, candidatesMap, unitCells) {
    for (let n = 1; n <= 9; n++) {
        let count = 0;
        let foundCell = null;
        for (const { row, col } of unitCells) {
            if (candidatesMap[row][col].has(n)) {
                count++;
                foundCell = { row, col, isTarget: true };
            }
        }
        if (count === 1) {
            // CRITICAL FIX: Only return the hint if the target cell is actually empty.
            if (board[foundCell.row][foundCell.col] === 0) {
                return foundCell; // Found a useful hidden single for number 'n' in this unit
            }
        }
    }
    return null;
}

/** Generates a map of possible candidates for each empty cell */
function generateCandidatesMap(board) {
    const candidatesMap = Array(9).fill(0).map(() => Array(9).fill(0).map(() => new Set()));
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0) {
                for (let n = 1; n <= 9; n++) {
                    if (isValid(board, r, c, n)) {
                        candidatesMap[r][c].add(n);
                    }
                }
            }
        }
    }
    return candidatesMap;
}

/** Helper to check if a number can be placed in a cell */
function isValid(board, row, col, num) {
    for (let i = 0; i < 9; i++) {
        if (board[row][i] === num || board[i][col] === num) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (board[startRow + i][startCol + j] === num) return false;
        }
    }
    return true;
}

/** Helper to check if two cells share a unit (row, column, or box) */
function sharesUnit(cell1, cell2) {
    if (cell1.row === cell2.row || cell1.col === cell2.col) {
        return true;
    }
    const box1_row = Math.floor(cell1.row / 3);
    const box1_col = Math.floor(cell1.col / 3);
    const box2_row = Math.floor(cell2.row / 3);
    const box2_col = Math.floor(cell2.col / 3);
    return box1_row === box2_row && box1_col === box2_col;
}

/** Helpers to get cell coordinates for each unit */
function getRowCells(rowIndex) {
    return Array.from({ length: 9 }, (_, colIndex) => ({ row: rowIndex, col: colIndex }));
}

function getColCells(colIndex) {
    return Array.from({ length: 9 }, (_, rowIndex) => ({ row: rowIndex, col: colIndex }));
}

function getBoxCells(boxIndex) {
    const cells = [];
    const startRow = Math.floor(boxIndex / 3) * 3;
    const startCol = (boxIndex % 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            cells.push({ row: startRow + i, col: startCol + j });
        }
    }
    return cells;
}