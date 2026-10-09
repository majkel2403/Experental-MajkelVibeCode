const SKY = [];
(function () {
  const r = mulberry(7);
  const cols = ['#BFD4FF', '#FFFFFF', '#FFE6C0', '#C9B8FF'];
  for (let i = 0; i < 320; i++) {
    const u = r() * 2 - 1;
    const a = r() * 6.2832;
    const s = Math.sqrt(1 - u * u);
    SKY.push({ x: s * Math.cos(a), y: u, z: s * Math.sin(a), sz: 0.6 + r() * 1.3, al: 0.22 + r() * 0.6, ph: r() * 6.28, c: cols[Math.floor(r() * 4)] });
  }
})();

