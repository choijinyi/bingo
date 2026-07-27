// 이름 비교 시 공백 차이로 인한 불일치를 막기 위해 모든 공백을 제거하고 비교한다.
export function normalizeName(name) {
  return String(name ?? "").replace(/\s+/g, "").toLowerCase();
}

export function makeGameCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// board: 길이 25 이름 배열, calledSet: normalize된 호출 이름 Set
export function getBingoState(board, calledSet) {
  const hit = board.map((name) => calledSet.has(normalizeName(name)));
  const lines = [];
  for (let r = 0; r < 5; r += 1) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c += 1) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);

  const completedLines = lines.filter((line) => line.every((i) => hit[i]));
  const lineCells = new Set(completedLines.flat());
  return { hit, bingoCount: completedLines.length, lineCells };
}

export function parseBulkNames(text) {
  return String(text ?? "")
    .split(/[\n,、，;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
