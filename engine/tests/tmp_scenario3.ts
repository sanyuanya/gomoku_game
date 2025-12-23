import { createBoard, setCell } from '../rules';
import { searchBestMove } from '../search';
import type { Player } from '../types';

const data = {"size":15,"moves":[{"x":7,"y":7,"player":1},{"x":6,"y":6,"player":2},{"x":6,"y":5,"player":1},{"x":7,"y":5,"player":2},{"x":8,"y":4,"player":1},{"x":8,"y":6,"player":2},{"x":9,"y":7,"player":1},{"x":8,"y":7,"player":2},{"x":8,"y":9,"player":1},{"x":9,"y":6,"player":2},{"x":7,"y":6,"player":1},{"x":7,"y":8,"player":2},{"x":6,"y":9,"player":1},{"x":10,"y":6,"player":2},{"x":10,"y":5,"player":1},{"x":5,"y":8,"player":2},{"x":11,"y":6,"player":1},{"x":5,"y":7,"player":2},{"x":4,"y":8,"player":1},{"x":5,"y":9,"player":2},{"x":5,"y":6,"player":1},{"x":7,"y":4,"player":2},{"x":5,"y":10,"player":1},{"x":11,"y":7,"player":2},{"x":10,"y":7,"player":1},{"x":9,"y":8,"player":2},{"x":6,"y":8,"player":1},{"x":6,"y":11,"player":2},{"x":13,"y":9,"player":1},{"x":12,"y":7,"player":2},{"x":8,"y":5,"player":1},{"x":11,"y":8,"player":2},{"x":8,"y":8,"player":1},{"x":10,"y":9,"player":2},{"x":9,"y":10,"player":1},{"x":12,"y":8,"player":2},{"x":10,"y":8,"player":1},{"x":13,"y":7,"player":2},{"x":11,"y":10,"player":1},{"x":13,"y":6,"player":2},{"x":14,"y":5,"player":1},{"x":14,"y":7,"player":2},{"x":15,"y":7,"player":1},{"x":12,"y":5,"player":2},{"x":12,"y":6,"player":1}]};

const size = data.size as 15 | 19;
const board = createBoard(size);
for (const m of data.moves) setCell(board, size, m.x, m.y, m.player as Player);
const lastPlayer = data.moves[data.moves.length - 1].player as Player;
const toMove = (lastPlayer === 1 ? 2 : 1) as Player;
const res = searchBestMove(board, size, toMove, { maxDepth: 4, timeBudgetMs: 1200, useIterative: true, difficulty: 'hard' });
console.log({ toMove, best: res.bestMove, topK: res.topK.slice(0,5), depth: res.depth });
