const x1 = 450000.123; const y1 = 4300000.456;
const x2 = 450100.123; const y2 = 4300050.456;
const x3 = 450050.123; const y3 = 4300100.456;

// shifted
const xp1 = x1 + 0.720; const yp1 = y1 - 0.330;
const xp2 = x2 + 0.720; const yp2 = y2 - 0.330;
const xp3 = x3 + 0.720; const yp3 = y3 - 0.330;

// Old Method
const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
const ax_old = ((xp1 - xp2) * (y2 - y3) - (xp2 - xp3) * (y1 - y2)) / det;
const bx_old = ((x1 - x2) * (xp2 - xp3) - (x2 - x3) * (xp1 - xp2)) / det;
const cx_old = xp1 - ax_old * x1 - bx_old * y1;
const ay_old = ((yp1 - yp2) * (y2 - y3) - (yp2 - yp3) * (y1 - y2)) / det;
const by_old = ((x1 - x2) * (yp2 - yp3) - (x2 - x3) * (yp1 - yp2)) / det;
const cy_old = yp1 - ay_old * x1 - by_old * y1;

console.log("OLD:");
console.log({ax: ax_old, bx: bx_old, cx: cx_old});
console.log({ay: ay_old, by: by_old, cy: cy_old});

// New Method
const dx2 = x2 - x1; const dy2 = y2 - y1;
const dx3 = x3 - x1; const dy3 = y3 - y1;

const dxp2 = xp2 - xp1; const dyp2 = yp2 - yp1;
const dxp3 = xp3 - xp1; const dyp3 = yp3 - yp1;

const D = dx2*dy3 - dx3*dy2;
const ax = (dxp2*dy3 - dxp3*dy2) / D;
const bx = (dx2*dxp3 - dx3*dxp2) / D;
const cx = xp1 - ax*x1 - bx*y1;

const ay = (dyp2*dy3 - dyp3*dy2) / D;
const by = (dx2*dyp3 - dx3*dyp2) / D;
const cy = yp1 - ay*x1 - by*y1;

console.log("NEW:");
console.log({ax, bx, cx});
console.log({ay, by, cy});
