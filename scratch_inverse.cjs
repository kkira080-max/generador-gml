const transpose = (m) => m[0].map((_, i) => m.map(row => row[i]));
const multiplyMatrices = (a, b) => a.map(row => transpose(b).map(col => row.reduce((sum, val, i) => sum + val * col[i], 0)));

const gaussJordanInverse = (matrix) => {
  const n = matrix.length;
  const m = matrix.map(row => [...row]);
  const inv = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));

  for (let i = 0; i < n; i++) {
    let pivot = m[i][i];
    if (pivot === 0) {
      let swapRow = -1;
      for (let k = i + 1; k < n; k++) {
        if (m[k][i] !== 0) { swapRow = k; break; }
      }
      if (swapRow === -1) throw new Error("Matriz singular");
      [m[i], m[swapRow]] = [m[swapRow], m[i]];
      [inv[i], inv[swapRow]] = [inv[swapRow], inv[i]];
      pivot = m[i][i];
    }
    const invPivot = 1 / pivot;
    for (let j = 0; j < n; j++) {
      m[i][j] *= invPivot;
      inv[i][j] *= invPivot;
    }
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = m[k][i];
        for (let j = 0; j < n; j++) {
          m[k][j] -= factor * m[i][j];
          inv[k][j] -= factor * inv[i][j];
        }
      }
    }
  }
  return inv;
};

const A = [[400000, -4000000, 1, 0], [4000000, 400000, 0, 1], [400010, -4000010, 1, 0], [4000010, 400010, 0, 1]];
const AT = transpose(A);
const ATA = multiplyMatrices(AT, A);
console.log("ATA", ATA);
try {
  const inv = gaussJordanInverse(ATA);
  console.log("inv", inv);
} catch(e) {
  console.log(e);
}
