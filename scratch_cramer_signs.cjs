const x1 = 450000.123; const y1 = 4300000.456;
const x2 = 450100.123; const y2 = 4300050.456;
const x3 = 450050.123; const y3 = 4300100.456;

// Translated AND rotated by small angle t=0.001 rad
const tx = 0.720, ty = -0.330;
const t = 0.001;
const a = Math.cos(t), b = Math.sin(t);

const rot = (x, y) => [a*x - b*y + tx, b*x + a*y + ty];

const [xp1, yp1] = rot(x1, y1);
const [xp2, yp2] = rot(x2, y2);
const [xp3, yp3] = rot(x3, y3);

// Method Cramer
const dx2 = x2 - x1; const dy2 = y2 - y1;
const dx3 = x3 - x1; const dy3 = y3 - y1;

const dxp2 = xp2 - xp1; const dyp2 = yp2 - yp1;
const dxp3 = xp3 - xp1; const dyp3 = yp3 - yp1;

const D = dx2 * dy3 - dx3 * dy2;

const ax = (dxp2 * dy3 - dxp3 * dy2) / D;
const bx = (dx2 * dxp3 - dx3 * dxp2) / D;
const cx = xp1 - ax * x1 - bx * y1;

const ay = (dyp2 * dy3 - dyp3 * dy2) / D;
const by = (dx2 * dyp3 - dx3 * dyp2) / D;
const cy = yp1 - ay * x1 - by * y1;

console.log("Expected AX:", a, "Calc:", ax);
console.log("Expected BX:", -b, "Calc:", bx);
console.log("Expected CX:", tx, "Calc:", cx);
console.log("Expected AY:", b, "Calc:", ay);
console.log("Expected BY:", a, "Calc:", by);
console.log("Expected CY:", ty, "Calc:", cy);
