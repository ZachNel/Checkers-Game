const BOARD_SIZE = 8;
const HUMAN_CAPTURE_FORCED = false;
const BOT_CAPTURE_FORCED = true;

const STORAGE_HUMAN_SIDE_KEY = "checkers-human-side";

/** @returns {"red"|"black"} */
function readStoredHumanSide() {
  try {
    const v = localStorage.getItem(STORAGE_HUMAN_SIDE_KEY);
    if (v === "black" || v === "red") {
      return v;
    }
  } catch (_) {
    /* private mode */
  }
  return "red";
}

/** Human plays red ('r') or black ('b'); bot takes the other side. */
let humanSide = readStoredHumanSide();
let humanPlayer = "r";
let botPlayer = "b";

function syncPieceRolesFromHumanSide() {
  if (humanSide === "black") {
    humanPlayer = "b";
    botPlayer = "r";
  } else {
    humanPlayer = "r";
    botPlayer = "b";
  }
}

syncPieceRolesFromHumanSide();

function humanColorWord() {
  return humanSide === "red" ? "red" : "black";
}

function botColorWord() {
  return humanSide === "red" ? "black" : "red";
}

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");
const newGameBtn = document.getElementById("new-game-btn");
const undoBtn = document.getElementById("undo-btn");
const gameSubtitleEl = document.getElementById("game-subtitle");
const sideRedBtn = document.getElementById("side-red");
const sideBlackBtn = document.getElementById("side-black");

function updateGameSubtitle() {
  if (!gameSubtitleEl) {
    return;
  }
  gameSubtitleEl.textContent = `American checkers basics; you play as ${humanColorWord()} vs the bot (${botColorWord()}). Suggested moves optional.`;
}

function updateSideControls() {
  if (!sideRedBtn || !sideBlackBtn) {
    return;
  }
  const isRed = humanSide === "red";
  sideRedBtn.classList.toggle("is-active", isRed);
  sideBlackBtn.classList.toggle("is-active", !isRed);
  sideRedBtn.setAttribute("aria-pressed", isRed ? "true" : "false");
  sideBlackBtn.setAttribute("aria-pressed", isRed ? "false" : "true");
}

function setHumanSide(next) {
  if (next !== "red" && next !== "black") {
    return;
  }
  if (humanSide === next) {
    return;
  }
  humanSide = next;
  syncPieceRolesFromHumanSide();
  try {
    localStorage.setItem(STORAGE_HUMAN_SIDE_KEY, humanSide);
  } catch (_) {
    /* private mode */
  }
  state = createInitialState();
  selected = null;
  botThinking = false;
  pendingMoveAnimation = null;
  clearMoveAnimationTimer();
  updateSideControls();
  updateGameSubtitle();
  render();
}

if (sideRedBtn) {
  sideRedBtn.addEventListener("click", () => setHumanSide("red"));
}
if (sideBlackBtn) {
  sideBlackBtn.addEventListener("click", () => setHumanSide("black"));
}

let state = createInitialState();
let selected = null;
let botThinking = false;

/** @type {{ from: [number, number], to: [number, number] } | null} */
let pendingMoveAnimation = null;
let moveAnimCleanupTimer = null;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {
    return false;
  }
}

function clearMoveAnimationTimer() {
  if (moveAnimCleanupTimer != null) {
    window.clearTimeout(moveAnimCleanupTimer);
    moveAnimCleanupTimer = null;
  }
}

function scheduleMoveAnimationCleanup() {
  clearMoveAnimationTimer();
  const ms = prefersReducedMotion() ? 16 : 560;
  moveAnimCleanupTimer = window.setTimeout(() => {
    moveAnimCleanupTimer = null;
    pendingMoveAnimation = null;
    render();
  }, ms);
}

if (newGameBtn) {
  newGameBtn.addEventListener("click", () => {
    state = createInitialState();
    selected = null;
    botThinking = false;
    pendingMoveAnimation = null;
    clearMoveAnimationTimer();
    render();
  });
}

if (undoBtn) {
  undoBtn.addEventListener("click", () => {
    if (state.history.length === 0 || botThinking) {
      return;
    }
    // Undo one full round when possible so it is usually your turn.
    state = restoreFromHistory(state, state.history.length >= 2 ? 2 : 1);
    selected = null;
    pendingMoveAnimation = null;
    clearMoveAnimationTimer();
    render();
  });
}

function createInitialState() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (!isDarkSquare(row, col)) {
        continue;
      }
      if (row < 3) {
        board[row][col] = { player: botPlayer, king: false };
      } else if (row > 4) {
        board[row][col] = { player: humanPlayer, king: false };
      }
    }
  }
  return {
    board,
    turn: humanPlayer,
    winner: null,
    history: [],
  };
}

function cloneState(game) {
  return {
    board: game.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
    turn: game.turn,
    winner: game.winner,
    history: game.history.map((entry) => ({
      board: entry.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
      turn: entry.turn,
      winner: entry.winner,
    })),
  };
}

function saveToHistory(game) {
  game.history.push({
    board: game.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
    turn: game.turn,
    winner: game.winner,
  });
  if (game.history.length > 30) {
    game.history.shift();
  }
}

function restoreFromHistory(game, steps) {
  const copy = cloneState(game);
  for (let i = 0; i < steps; i += 1) {
    const prev = copy.history.pop();
    if (!prev) {
      break;
    }
    copy.board = prev.board;
    copy.turn = prev.turn;
    copy.winner = prev.winner;
  }
  return copy;
}

function isDarkSquare(row, col) {
  return (row + col) % 2 === 1;
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function getDirections(piece) {
  if (piece.king) {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  return piece.player === humanPlayer
    ? [
        [-1, -1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [1, 1],
      ];
}

function isCaptureForced(player) {
  return player === humanPlayer ? HUMAN_CAPTURE_FORCED : BOT_CAPTURE_FORCED;
}

function generateAllMoves(board, player, options = {}) {
  const enforceCapture = options.enforceCapture ?? isCaptureForced(player);
  const captures = [];
  const quietMoves = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = board[row][col];
      if (!piece || piece.player !== player) {
        continue;
      }
      const pieceMoves = generateMovesForPiece(board, row, col, { enforceCapture });
      for (const move of pieceMoves) {
        if (move.captures.length > 0) {
          captures.push(move);
        } else {
          quietMoves.push(move);
        }
      }
    }
  }
  if (enforceCapture && captures.length > 0) {
    return captures;
  }
  return [...captures, ...quietMoves];
}

function generateMovesForPiece(board, row, col, options = {}) {
  const enforceCapture = options.enforceCapture ?? true;
  const piece = board[row][col];
  if (!piece) {
    return [];
  }

  const jumpMoves = [];
  collectJumps(board, row, col, row, col, piece, [], jumpMoves);
  if (jumpMoves.length > 0 && enforceCapture) {
    return jumpMoves;
  }

  const moves = [];
  for (const [dr, dc] of getDirections(piece)) {
    const r2 = row + dr;
    const c2 = col + dc;
    if (inBounds(r2, c2) && !board[r2][c2]) {
      moves.push({
        from: [row, col],
        to: [r2, c2],
        captures: [],
      });
    }
  }
  return [...jumpMoves, ...moves];
}

function collectJumps(board, startRow, startCol, row, col, piece, captures, outMoves) {
  const dirs = getDirections(piece);
  let foundFurtherJump = false;

  for (const [dr, dc] of dirs) {
    const midRow = row + dr;
    const midCol = col + dc;
    const landRow = row + dr * 2;
    const landCol = col + dc * 2;

    if (!inBounds(landRow, landCol) || !inBounds(midRow, midCol)) {
      continue;
    }

    const jumped = board[midRow][midCol];
    if (!jumped || jumped.player === piece.player || board[landRow][landCol]) {
      continue;
    }

    foundFurtherJump = true;
    const nextBoard = board.map((r) => r.map((p) => (p ? { ...p } : null)));
    nextBoard[row][col] = null;
    nextBoard[midRow][midCol] = null;

    const movedPiece = { ...piece };
    const reachesBackRow =
      (movedPiece.player === humanPlayer && landRow === 0) ||
      (movedPiece.player === botPlayer && landRow === BOARD_SIZE - 1);

    let promotedNow = false;
    if (!movedPiece.king && reachesBackRow) {
      movedPiece.king = true;
      promotedNow = true;
    }
    nextBoard[landRow][landCol] = movedPiece;

    const nextCaptures = [...captures, [midRow, midCol]];

    // American checkers: promotion ends move immediately.
    if (promotedNow) {
      outMoves.push({
        from: [startRow, startCol],
        to: [landRow, landCol],
        captures: nextCaptures,
      });
    } else {
      collectJumps(nextBoard, startRow, startCol, landRow, landCol, movedPiece, nextCaptures, outMoves);
    }
  }

  if (!foundFurtherJump && captures.length > 0) {
    outMoves.push({
      from: [startRow, startCol],
      to: [row, col],
      captures: [...captures],
    });
  }
}

function sameCell(a, b) {
  if (!a || !b) {
    return false;
  }
  return a[0] === b[0] && a[1] === b[1];
}

function normalizeMovesForPiece(moves, row, col) {
  return moves.filter((m) => sameCell(m.from, [row, col]));
}

function applyMove(board, move) {
  const nextBoard = board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
  const [fromRow, fromCol] = move.from;
  const [toRow, toCol] = move.to;
  const piece = nextBoard[fromRow][fromCol];
  nextBoard[fromRow][fromCol] = null;
  for (const [capR, capC] of move.captures) {
    nextBoard[capR][capC] = null;
  }
  if (!piece.king) {
    if (piece.player === humanPlayer && toRow === 0) {
      piece.king = true;
    }
    if (piece.player === botPlayer && toRow === BOARD_SIZE - 1) {
      piece.king = true;
    }
  }
  nextBoard[toRow][toCol] = piece;
  return nextBoard;
}

function isPromotionMove(board, move) {
  const [fromRow, fromCol] = move.from;
  const [toRow] = move.to;
  const piece = board[fromRow][fromCol];
  if (!piece || piece.king) {
    return false;
  }
  return (piece.player === humanPlayer && toRow === 0) || (piece.player === botPlayer && toRow === BOARD_SIZE - 1);
}

function scoreSuggestedHumanMove(board, move) {
  const nextBoard = applyMove(board, move);
  const capturePriority = move.captures.length > 0 ? 100 + move.captures.length * 10 : 0;
  const promotionBonus = isPromotionMove(board, move) ? 12 : 0;
  // Lower board score favors the human because evaluateBoard is bot-centric.
  const positionScore = -evaluateBoard(nextBoard);
  return capturePriority + promotionBonus + positionScore;
}

function getSuggestedHumanMoves(board, moves) {
  if (moves.length === 0) {
    return [];
  }
  let bestScore = -Infinity;
  let suggestions = [];
  for (const move of moves) {
    const score = scoreSuggestedHumanMove(board, move);
    if (score > bestScore) {
      bestScore = score;
      suggestions = [move];
    } else if (Math.abs(score - bestScore) < 0.001) {
      suggestions.push(move);
    }
  }
  return suggestions;
}

function formatSuggestedMoves(moves) {
  const maxToShow = 3;
  const shown = moves.slice(0, maxToShow).map((move) => `(${move.to[0] + 1}, ${move.to[1] + 1})`);
  const extra = moves.length > maxToShow ? "..." : "";
  return shown.join(", ") + extra;
}

function handleSquareClick(row, col) {
  if (state.winner || state.turn !== humanPlayer || botThinking) {
    return;
  }
  const piece = state.board[row][col];
  const allMoves = generateAllMoves(state.board, humanPlayer, { enforceCapture: false });

  if (piece && piece.player === humanPlayer) {
    if (selected && selected.row === row && selected.col === col) {
      selected = null;
      if (hintEl) {
        hintEl.textContent = "";
      }
      render();
      return;
    }
    const pieceMoves = normalizeMovesForPiece(allMoves, row, col);
    if (pieceMoves.length === 0) {
      if (hintEl) {
        hintEl.textContent = "That piece has no legal move.";
      }
      selected = null;
    } else {
      selected = { row, col, moves: pieceMoves };
      if (hintEl) {
        hintEl.textContent = "Choose a highlighted target square. Gold-ring targets are suggested for this piece.";
      }
    }
    render();
    return;
  }

  if (!selected) {
    return;
  }

  const chosenMove = selected.moves.find((m) => sameCell(m.to, [row, col]));
  if (!chosenMove) {
    /** Clicked somewhere that isn’t a legal destination — cancel selection (e.g. empty square). */
    selected = null;
    render();
    return;
  }

  saveToHistory(state);
  pendingMoveAnimation = {
    from: /** @type {[number, number]} */ (chosenMove.from.slice()),
    to: /** @type {[number, number]} */ (chosenMove.to.slice()),
  };
  state.board = applyMove(state.board, chosenMove);
  selected = null;
  endTurn();
  render();
  scheduleMoveAnimationCleanup();
}

function endTurn() {
  const nextPlayer = state.turn === humanPlayer ? botPlayer : humanPlayer;
  state.turn = nextPlayer;
  const nextMoves = generateAllMoves(state.board, nextPlayer);
  if (nextMoves.length === 0) {
    state.winner = state.turn === humanPlayer ? botPlayer : humanPlayer;
    return;
  }
  if (nextPlayer === botPlayer) {
    runBotTurn();
  }
}

function runBotTurn() {
  botThinking = true;
  if (hintEl) {
    hintEl.textContent = "Bot is thinking...";
  }
  render();

  window.setTimeout(() => {
    if (state.winner || state.turn !== botPlayer) {
      botThinking = false;
      render();
      return;
    }
    const move = chooseBotMove(state.board, botPlayer, 5);
    if (!move) {
      state.winner = humanPlayer;
      botThinking = false;
      render();
      return;
    }

    saveToHistory(state);
    pendingMoveAnimation = {
      from: /** @type {[number, number]} */ (move.from.slice()),
      to: /** @type {[number, number]} */ (move.to.slice()),
    };
    state.board = applyMove(state.board, move);
    botThinking = false;
    endTurn();
    render();
    scheduleMoveAnimationCleanup();
  }, 1000);
}

function chooseBotMove(board, player, depth) {
  const moves = generateAllMoves(board, player);
  if (moves.length === 0) {
    return null;
  }

  let bestScore = -Infinity;
  let bestMove = moves[0];
  for (const move of moves) {
    const next = applyMove(board, move);
    const score = minimax(next, depth - 1, false, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

function minimax(board, depth, maximizing, alpha, beta) {
  const player = maximizing ? botPlayer : humanPlayer;
  const moves = generateAllMoves(board, player);
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      return maximizing ? -10000 : 10000;
    }
    return evaluateBoard(board);
  }

  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      const next = applyMove(board, move);
      value = Math.max(value, minimax(next, depth - 1, false, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) {
        break;
      }
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    const next = applyMove(board, move);
    value = Math.min(value, minimax(next, depth - 1, true, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) {
      break;
    }
  }
  return value;
}

function evaluateBoard(board) {
  let score = 0;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = board[row][col];
      if (!piece) {
        continue;
      }
      const base = piece.king ? 3 : 1;
      const advanceBonus =
        !piece.king && piece.player === botPlayer ? row * 0.05 : !piece.king && piece.player === humanPlayer ? (7 - row) * 0.05 : 0;
      const val = base + advanceBonus;
      score += piece.player === botPlayer ? val : -val;
    }
  }
  return score;
}

function getStatusText() {
  if (state.winner === humanPlayer) {
    return "You win! The bot has no legal moves.";
  }
  if (state.winner === botPlayer) {
    return "Bot wins. You have no legal moves.";
  }
  if (botThinking) {
    return "Bot turn...";
  }
  return state.turn === humanPlayer
    ? `Your turn (${humanColorWord()}).`
    : `Bot turn (${botColorWord()}).`;
}

function render() {
  if (!boardEl || !statusEl) {
    return;
  }
  boardEl.innerHTML = "";
  const legalMovesForHuman =
    state.turn === humanPlayer && !state.winner ? generateAllMoves(state.board, humanPlayer, { enforceCapture: false }) : [];
  const suggestedMoves = state.turn === humanPlayer && !state.winner ? getSuggestedHumanMoves(state.board, legalMovesForHuman) : [];
  const selectedTargets = selected ? selected.moves.map((m) => m.to) : [];
  let suggestedTargets = [];
  if (selected && state.turn === humanPlayer && !state.winner) {
    const forSelectedPiece = suggestedMoves.filter((m) => sameCell(m.from, [selected.row, selected.col]));
    suggestedTargets = forSelectedPiece.map((m) => m.to);
  }

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${isDarkSquare(row, col) ? "dark" : "light"}`;
      square.setAttribute("aria-label", `Square ${row}, ${col}`);
      square.addEventListener("click", () => handleSquareClick(row, col));

      if (selectedTargets.some((t) => sameCell(t, [row, col]))) {
        square.classList.add("valid-target");
      }
      if (suggestedTargets.some((t) => sameCell(t, [row, col]))) {
        square.classList.add("suggested-target");
      }

      const piece = state.board[row][col];
      if (piece) {
        const pieceEl = document.createElement("div");
        const colorClass =
          piece.player === humanPlayer ? (humanSide === "red" ? "red" : "black") : humanSide === "red" ? "black" : "red";
        pieceEl.className = `piece ${colorClass}`;
        if (selected && selected.row === row && selected.col === col) {
          pieceEl.classList.add("selected");
        }
        if (pendingMoveAnimation && sameCell(pendingMoveAnimation.to, [row, col])) {
          const [fr, fc] = pendingMoveAnimation.from;
          const [tr, tc] = pendingMoveAnimation.to;
          const dr = tr - fr;
          const dc = tc - fc;
          const len = Math.max(Math.abs(dr), Math.abs(dc), 1);
          const ndr = dr / len;
          const ndc = dc / len;
          pieceEl.style.setProperty("--piece-slide-x", String(-ndc));
          pieceEl.style.setProperty("--piece-slide-y", String(-ndr));
          if (!prefersReducedMotion()) {
            pieceEl.classList.add("piece--just-moved");
          }
        }
        pieceEl.textContent = piece.king ? "K" : "";
        square.appendChild(pieceEl);
      }

      boardEl.appendChild(square);
    }
  }

  statusEl.textContent = getStatusText();
  if (hintEl) {
    if (!state.winner && state.turn === humanPlayer && !botThinking) {
      if (!selected) {
        if (suggestedMoves.length > 0) {
          const hasCaptureSuggestion = suggestedMoves.some((move) => move.captures.length > 0);
          const suggestionType = hasCaptureSuggestion ? "capture" : "move";
          hintEl.textContent = `Suggested ${suggestionType} target(s): ${formatSuggestedMoves(suggestedMoves)}. Select a piece to see gold rings on its best targets; you may choose any legal move.`;
        } else {
          hintEl.textContent = `Select one of your ${humanColorWord()} pieces.`;
        }
      } else {
        hintEl.textContent = "Choose a highlighted target square. Gold-ring targets are suggested for this piece.";
      }
    } else if (!botThinking && !selected && !state.winner) {
      hintEl.textContent = "";
    }
  }
}

updateSideControls();
updateGameSubtitle();
render();

/**
 * YouTube embed: official iframe on youtube.com/embed (URL-built params; no JS API / no origin).
 * Audio is streamed by YouTube inside the player — not extracted as MP3 (would violate ToS).
 */
(function setupYouTubePanel() {
  const COPY_TIP =
    "Paste a YouTube video URL (Share → Copy link), click Load, then use the small player for play, pause, and volume.";

  const ytPanel = document.getElementById("yt-panel");
  const ytMinBtn = document.getElementById("yt-minimize");
  const urlInput = document.getElementById("yt-url-input");
  const loadBtn = document.getElementById("yt-load-btn");
  const clearBtn = document.getElementById("yt-clear-btn");
  const copyTipBtn = document.getElementById("yt-copy-tip-btn");
  const openExternalBtn = document.getElementById("yt-open-external-btn");
  const FILE_PROTOCOL_WARNING_STORAGE = "checkers-hide-file-protocol-warning";
  const fileProtocolWarningRow = document.getElementById("yt-file-protocol-warning-row");
  const fileProtocolDismissBtn = document.getElementById("yt-file-protocol-dismiss");
  const iframe = document.getElementById("yt-iframe");
  const pipWrap = document.getElementById("yt-pip-wrap");
  const ytStatus = document.getElementById("yt-status");

  if (!iframe || !pipWrap || !urlInput || !loadBtn) {
    return;
  }

  /** @type {string | null} */
  let loadedVideoId = null;

  const isFileProtocol = window.location.protocol === "file:";

  if (fileProtocolWarningRow) {
    const dismissed = sessionStorage.getItem(FILE_PROTOCOL_WARNING_STORAGE) === "1";
    const show = isFileProtocol && !dismissed;
    fileProtocolWarningRow.hidden = !show;
    if (show) {
      fileProtocolWarningRow.removeAttribute("aria-hidden");
    } else {
      fileProtocolWarningRow.setAttribute("aria-hidden", "true");
    }
  }

  fileProtocolDismissBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    sessionStorage.setItem(FILE_PROTOCOL_WARNING_STORAGE, "1");
    if (fileProtocolWarningRow) {
      fileProtocolWarningRow.hidden = true;
      fileProtocolWarningRow.setAttribute("hidden", "");
      fileProtocolWarningRow.setAttribute("aria-hidden", "true");
    }
  });

  /**
   * @param {string} raw
   * @returns {string | null}
   */
  function extractYouTubeVideoId(raw) {
    const s = String(raw || "").trim();
    if (!s) {
      return null;
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) {
      return s;
    }
    const tryUrl = s.includes("://") ? s : `https://${s}`;
    try {
      const u = new URL(tryUrl);
      const host = (u.hostname || "").replace(/^www\./, "");
      if (host === "youtu.be") {
        const id = u.pathname.replace(/^\//, "").split("/").filter(Boolean)[0];
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        const v = u.searchParams.get("v");
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
          return v;
        }
        const path = u.pathname || "";
        const watchLive = path.match(/\/watch\/live\/([a-zA-Z0-9_-]{11})(?:\/|$|\?)/);
        if (watchLive) {
          return watchLive[1];
        }
        const seg = path.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})(?:\/|$)/);
        if (seg) {
          return seg[1];
        }
      }
    } catch (_) {
      /* regex fallback */
    }
    const loose = s.match(
      /(?:youtube\.com\/watch\/live\/|youtube\.com\/watch\?(?:[^#&\s]+&)*v=|youtu\.be\/|youtube\.com\/(?:embed|shorts|live)\/)([a-zA-Z0-9_-]{11})\b/
    );
    return loose ? loose[1] : null;
  }

  /**
   * Build embed URL without duplicate keys or manual query concatenation.
   * Omit `enablejsapi` and `origin` unless driving the iframe via the JS API — mismatched or
   * redundant origin has been linked to player configuration errors (e.g. Error 153) in embedded contexts.
   *
   * @param {string} id
   */
  function embedUrl(id) {
    const u = new URL(`https://www.youtube.com/embed/${id}`);
    u.searchParams.set("rel", "0");
    u.searchParams.set("modestbranding", "1");
    u.searchParams.set("playsinline", "1");
    return u.toString();
  }

  /**
   * @param {boolean} visible
   */
  function setOpenExternalVisible(visible) {
    if (!openExternalBtn) {
      return;
    }
    openExternalBtn.hidden = !visible;
    openExternalBtn.disabled = !visible;
  }

  function syncLoadedWatchUrl() {
    if (!loadedVideoId) {
      return;
    }
    urlInput.value = `https://www.youtube.com/watch?v=${loadedVideoId}`;
  }

  function loadedSuccessStatus() {
    if (isFileProtocol) {
      return "Loaded. Embedded playback often fails when this page is opened as file:// — use a local server or HTTPS, or tap Open on YouTube (full player).";
    }
    return "Loaded. Use the on-screen player for play, pause, and volume (YouTube’s stream, not a downloaded file).";
  }

  /**
   * @param {string} msg
   */
  function setStatus(msg) {
    if (ytStatus) {
      ytStatus.textContent = msg || "";
    }
  }

  /**
   * @param {boolean} hasVideo
   */
  function setLoaded(hasVideo) {
    pipWrap.classList.toggle("yt-pip--loaded", hasVideo);
    if (!hasVideo) {
      pipWrap.classList.remove("yt-pip--embed-error");
      iframe.src = "about:blank";
      loadedVideoId = null;
      setOpenExternalVisible(false);
    }
  }

  /**
   * @param {string} id
   */
  function loadVideoById(id) {
    loadedVideoId = id;
    iframe.src = embedUrl(id);
    setLoaded(true);
    syncLoadedWatchUrl();
    setOpenExternalVisible(true);
    setStatus(loadedSuccessStatus());
  }

  function loadFromInput() {
    const raw = urlInput.value;
    const id = extractYouTubeVideoId(raw);
    if (!id) {
      setStatus("Could not find an 11-character video ID. Paste a watch, youtu.be, Shorts, Live, embed, or /watch/live/ URL.");
      setOpenExternalVisible(false);
      loadedVideoId = null;
      return;
    }
    loadVideoById(id);
  }

  function clearPlayer() {
    urlInput.value = "";
    loadedVideoId = null;
    setLoaded(false);
    setStatus("Embed cleared.");
  }

  loadBtn.addEventListener("click", loadFromInput);
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadFromInput();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", clearPlayer);
  }

  if (copyTipBtn) {
    copyTipBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(COPY_TIP);
        setStatus("Tip copied to clipboard.");
      } catch (_) {
        setStatus(COPY_TIP);
      }
    });
  }

  iframe.addEventListener("error", () => {
    pipWrap.classList.add("yt-pip--embed-error");
    setStatus(
      "The embedded player failed to load. Try Open on YouTube (full player), or serve this folder over http://localhost or HTTPS (file:// often blocks embeds)."
    );
  });

  iframe.addEventListener("load", () => {
    pipWrap.classList.remove("yt-pip--embed-error");
    if (!loadedVideoId) {
      return;
    }
    const src = iframe.src || "";
    if (!src || src === "about:blank" || src.startsWith("about:")) {
      return;
    }
    setStatus(loadedSuccessStatus());
  });

  if (openExternalBtn) {
    openExternalBtn.addEventListener("click", () => {
      if (!loadedVideoId) {
        return;
      }
      const url = `https://www.youtube.com/watch?v=${encodeURIComponent(loadedVideoId)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      setStatus("Opened this video on youtube.com in a new tab.");
    });
  }

  if (ytMinBtn && ytPanel) {
    ytMinBtn.addEventListener("click", () => {
      const collapsed = ytPanel.classList.toggle("yt-panel--collapsed");
      ytMinBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      ytMinBtn.textContent = collapsed ? "Show panel" : "Hide panel";
    });
  }

  setLoaded(false);
})();

const STORAGE_BG_IMAGE_KEY = "checkers-bg-image";
/** 3 MB cap for stored data URLs (FileReader / localStorage) */
const MAX_BG_IMAGE_STORAGE_BYTES = 3 * 1024 * 1024;

(function setupCustomBackground() {
  const panel = document.getElementById("bg-image-panel");
  const minBtn = document.getElementById("bg-image-minimize");
  const layer = document.getElementById("custom-bg");
  const urlInput = document.getElementById("bg-url-input");
  const applyUrlBtn = document.getElementById("bg-apply-url-btn");
  const fileInput = document.getElementById("bg-file-input");
  const resetDefaultBtn = document.getElementById("bg-reset-default-btn");
  const statusEl = document.getElementById("bg-image-status");
  const bgFx = document.querySelector(".bg-fx");

  if (!layer) {
    return;
  }

  if (minBtn && panel) {
    minBtn.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("bg-image-panel--collapsed");
      minBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      minBtn.textContent = collapsed ? "Show panel" : "Hide panel";
    });
  }

  function setStatus(msg) {
    if (statusEl) {
      statusEl.textContent = msg || "";
    }
  }

  function applyBackground(urlOrDataUrl) {
    const v = String(urlOrDataUrl || "").trim();
    if (!v) {
      layer.classList.remove("custom-bg--active");
      layer.style.backgroundImage = "";
      return;
    }
    layer.style.backgroundImage = `url(${JSON.stringify(v)})`;
    layer.classList.add("custom-bg--active");
  }

  function persistAndApply(stored) {
    try {
      localStorage.setItem(STORAGE_BG_IMAGE_KEY, stored);
    } catch (_) {
      setStatus("Could not save background (private mode or storage full). Image may apply for this session only.");
      applyBackground(stored);
      return;
    }
    applyBackground(stored);
    setStatus("Background saved.");
  }

  function loadStored() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_BG_IMAGE_KEY);
    } catch (_) {
      raw = null;
    }
    if (!raw) {
      return;
    }
    applyBackground(raw);
  }

  function resetToDefaultBackground() {
    try {
      localStorage.removeItem(STORAGE_BG_IMAGE_KEY);
    } catch (_) {
      /* private mode */
    }
    if (urlInput) {
      urlInput.value = "";
    }
    if (fileInput) {
      fileInput.value = "";
    }
    layer.classList.remove("custom-bg--active");
    layer.removeAttribute("style");
    if (bgFx) {
      bgFx.removeAttribute("style");
    }
    setStatus("Restored default background.");
  }

  if (applyUrlBtn && urlInput) {
    applyUrlBtn.addEventListener("click", () => {
      const raw = urlInput.value.trim();
      if (!raw) {
        setStatus("Enter an image URL.");
        return;
      }
      if (!/^https?:\/\//i.test(raw)) {
        setStatus("Use a full URL starting with http:// or https://.");
        return;
      }
      persistAndApply(raw);
    });
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyUrlBtn.click();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        return;
      }
      if (file.size > MAX_BG_IMAGE_STORAGE_BYTES) {
        setStatus(
          `File is too large to store (~${(MAX_BG_IMAGE_STORAGE_BYTES / (1024 * 1024)).toFixed(1)} MB max). Use a smaller image or paste an HTTPS image URL.`
        );
        fileInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          setStatus("Could not read that file.");
          return;
        }
        if (result.length > MAX_BG_IMAGE_STORAGE_BYTES) {
          setStatus("Encoded image exceeds storage limit. Try a smaller file or an image URL.");
          fileInput.value = "";
          return;
        }
        persistAndApply(result);
        fileInput.value = "";
      };
      reader.onerror = () => {
        setStatus("Could not read that file.");
      };
      reader.readAsDataURL(file);
    });
  }

  if (resetDefaultBtn) {
    resetDefaultBtn.addEventListener("click", () => {
      resetToDefaultBackground();
    });
  }

  loadStored();
})();
