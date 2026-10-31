function check(name, actual, expected) {
  const ok = Math.abs(actual - expected) < 0.01;
  console.log(ok ? 'PASS' : 'FAIL', '-', name, '| got', Number(actual).toFixed(2), '| expected', expected);
  if (!ok) process.exitCode = 1;
}
module.exports = { check };
