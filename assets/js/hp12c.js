(function () {
  "use strict";
  const shell = document.querySelector("[data-hp12c]");
  if (!shell) return;
  const display = document.getElementById("hpDisplayValue");
  const status = document.getElementById("hpStatus");
  const registerElements = Object.fromEntries(["n", "i", "PV", "PMT", "FV"].map((key) => [key, document.querySelector(`[data-register="${key}"]`)]));
  const registers = { n: null, i: null, PV: null, PMT: null, FV: null };
  let stack = [0, 0, 0, 0], entry = "0", entering = false, lastAction = "";

  const show = (value = Number(entry)) => {
    display.textContent = Number.isFinite(value) ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(value) : "Erro";
    status.textContent = lastAction;
  };
  const refreshRegisters = () => Object.entries(registerElements).forEach(([key, el]) => { el.textContent = registers[key] === null ? "—" : Number(registers[key].toFixed(4)).toLocaleString("pt-BR"); });
  const lift = (value) => { stack = [value, stack[0], stack[1], stack[2]]; };
  const commit = () => { if (entering) { stack[0] = Number(entry); entering = false; } return stack[0]; };
  const resetEntry = (value = 0) => { entry = String(value); stack[0] = value; entering = false; show(value); };
  const error = (message) => { lastAction = message; display.textContent = "Erro"; status.textContent = message; entering = false; };

  function digit(value) {
    if (!entering) { entry = value === "." ? "0." : value; entering = true; }
    else if (value === "." && entry.includes(".")) return;
    else entry += value;
    show(Number(entry));
  }
  function enter() { const value = commit(); lift(value); entry = String(value); lastAction = "ENTER — valor duplicado na pilha"; show(value); }
  function operation(op) {
    commit(); const x = stack[0], y = stack[1];
    if (op === "/" && x === 0) return error("Divisão por zero");
    const result = { "+": y + x, "-": y - x, "*": y * x, "/": y / x }[op];
    stack = [result, stack[2], stack[3], stack[3]]; entry = String(result); lastAction = `${y} ${op} ${x}`; show(result);
  }
  function store(key) {
    const value = commit(); registers[key] = value; lastAction = `${key} armazenado`; refreshRegisters(); show(value);
  }
  const paymentEquation = (n, i, pv, pmt, fv) => {
    if (Math.abs(i) < 1e-12) return pv + pmt * n + fv;
    return pv * ((1 + i) ** n) + pmt * (((1 + i) ** n - 1) / i) + fv;
  };
  function solve(key) {
    const known = Object.entries(registers).filter(([name, value]) => name !== key && value !== null);
    if (known.length < 4) return error(`Informe as outras quatro variáveis antes de calcular ${key}`);
    let { n, i, PV, PMT, FV } = registers;
    const rate = i === null ? null : i / 100;
    let answer;
    if (key === "FV") answer = -(PV * ((1 + rate) ** n) + PMT * (Math.abs(rate) < 1e-12 ? n : (((1 + rate) ** n - 1) / rate)));
    else if (key === "PV") answer = -(PMT * (Math.abs(rate) < 1e-12 ? n : (((1 + rate) ** n - 1) / rate)) + FV) / ((1 + rate) ** n);
    else if (key === "PMT") answer = -(PV * ((1 + rate) ** n) + FV) / (Math.abs(rate) < 1e-12 ? n : (((1 + rate) ** n - 1) / rate));
    else if (key === "n") {
      if (Math.abs(rate) < 1e-12) answer = -(PV + FV) / PMT;
      else {
        const ratio = (PMT - FV * rate) / (PMT + PV * rate);
        if (ratio <= 0 || 1 + rate <= 0) return error("Não há solução real para n com esses sinais");
        answer = Math.log(ratio) / Math.log(1 + rate);
      }
    } else if (key === "i") {
      let low = -0.9999, high = 1, fLow = paymentEquation(n, low, PV, PMT, FV), fHigh = paymentEquation(n, high, PV, PMT, FV);
      while (fLow * fHigh > 0 && high < 1000) { high *= 2; fHigh = paymentEquation(n, high, PV, PMT, FV); }
      if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) return error("Não foi possível encontrar i; revise os sinais");
      for (let count = 0; count < 160; count += 1) {
        const mid = (low + high) / 2, fMid = paymentEquation(n, mid, PV, PMT, FV);
        if (fLow * fMid <= 0) high = mid; else { low = mid; fLow = fMid; }
      }
      answer = ((low + high) / 2) * 100;
    }
    if (!Number.isFinite(answer)) return error("Resultado financeiro inválido");
    registers[key] = answer; refreshRegisters(); lift(answer); entry = String(answer); entering = false; lastAction = `${key} calculado`; show(answer);
  }
  shell.addEventListener("click", (event) => {
    const button = event.target.closest("[data-key]"); if (!button) return;
    const key = button.dataset.key;
    if (/^\d$/.test(key) || key === ".") digit(key);
    else if (key === "ENTER") enter();
    else if (["+", "-", "*", "/"].includes(key)) operation(key);
    else if (key === "CHS") { const value = -commit(); resetEntry(value); lastAction = "Sinal alterado"; show(value); }
    else if (key === "CLX") { resetEntry(0); lastAction = "Registro X limpo"; show(0); }
    else if (key === "CLEAR") { stack = [0, 0, 0, 0]; Object.keys(registers).forEach((name) => { registers[name] = null; }); refreshRegisters(); resetEntry(0); lastAction = "Pilha e registradores limpos"; show(0); }
    else if (Object.hasOwn(registers, key)) {
      if (button.dataset.solve === "true") solve(key); else store(key);
    }
  });
  shell.addEventListener("dblclick", (event) => {
    const button = event.target.closest("[data-finance]"); if (button) { event.preventDefault(); solve(button.dataset.key); }
  });
  document.addEventListener("keydown", (event) => {
    if (/^\d$/.test(event.key) || event.key === ".") digit(event.key);
    else if (event.key === "Enter") enter();
    else if (["+", "-", "*", "/"].includes(event.key)) operation(event.key);
    else return;
    event.preventDefault();
  });
  refreshRegisters(); show(0);
})();
