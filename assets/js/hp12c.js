(function () {
  "use strict";

  const shell = document.querySelector("[data-hp12c]");
  if (!shell) return;

  const display = document.getElementById("hpDisplayValue");
  const status = document.getElementById("hpStatus");
  const prefixIndicator = document.getElementById("hpPrefix");
  const modeIndicator = document.getElementById("hpMode");
  const memoryIndicator = document.getElementById("hpMemory");
  const registerElements = Object.fromEntries(
    ["n", "i", "PV", "PMT", "FV"].map((key) => [key, document.querySelector(`[data-register="${key}"]`)])
  );

  const financial = { n: null, i: null, PV: null, PMT: null, FV: null };
  const memory = Array.from({ length: 10 }, () => 0);
  const statistics = { count: 0, sumX: 0, sumX2: 0, sumY: 0, sumY2: 0, sumXY: 0 };
  let cashFlows = [];
  let stack = [0, 0, 0, 0];
  let entry = "0";
  let entering = false;
  let exponentMode = false;
  let prefix = null;
  let memoryAction = null;
  let beginMode = false;
  let poweredOn = true;
  let lastAction = "Pronta — digite um valor";

  const formatDisplay = (value) => {
    if (!Number.isFinite(value)) return "Error";
    if (value !== 0 && (Math.abs(value) >= 1e10 || Math.abs(value) < 1e-8)) return value.toExponential(7);
    return value.toLocaleString("en-US", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 8 });
  };
  const show = (value = stack[0]) => {
    display.textContent = poweredOn ? formatDisplay(value) : "";
    status.textContent = poweredOn ? lastAction : "";
    prefixIndicator.textContent = prefix ? prefix.toUpperCase() : "";
    modeIndicator.textContent = beginMode ? "BEGIN" : "END";
    memoryIndicator.textContent = memoryAction ? `${memoryAction} _` : "";
  };
  const refreshRegisters = () => {
    Object.entries(registerElements).forEach(([key, element]) => {
      element.textContent = financial[key] === null ? "0*" : formatDisplay(financial[key]).replace(/\.00$/, "");
    });
  };
  const error = (message) => {
    entering = false;
    exponentMode = false;
    prefix = null;
    memoryAction = null;
    lastAction = message;
    display.textContent = "Error";
    status.textContent = message;
    showIndicators();
  };
  const showIndicators = () => {
    prefixIndicator.textContent = prefix ? prefix.toUpperCase() : "";
    modeIndicator.textContent = beginMode ? "BEGIN" : "END";
    memoryIndicator.textContent = memoryAction ? `${memoryAction} _` : "";
  };
  const commit = () => {
    if (entering) {
      const value = Number(entry);
      if (!Number.isFinite(value)) { error("Entrada inválida"); return NaN; }
      stack[0] = value;
      entering = false;
      exponentMode = false;
    }
    return stack[0];
  };
  const setX = (value, message) => {
    if (!Number.isFinite(value)) return error("Resultado inválido");
    stack[0] = value;
    entry = String(value);
    entering = false;
    exponentMode = false;
    lastAction = message;
    show(value);
  };
  const dropBinary = (value) => {
    stack = [value, stack[2], stack[3], stack[3]];
    entry = String(value);
    entering = false;
    exponentMode = false;
  };

  function handleMemoryDigit(digit) {
    const index = Number(digit);
    if (memoryAction === "STO") {
      memory[index] = commit();
      lastAction = `Valor armazenado em R${index}`;
    } else {
      stack[0] = memory[index];
      entry = String(stack[0]);
      entering = false;
      lastAction = `Valor recuperado de R${index}`;
    }
    memoryAction = null;
    show();
  }
  function digit(value) {
    if (!poweredOn) return;
    if (memoryAction && /^\d$/.test(value)) return handleMemoryDigit(value);
    if (!entering) {
      entry = value === "." ? "0." : value;
      entering = true;
    } else if (value === "." && (entry.includes(".") || exponentMode)) {
      return;
    } else {
      entry += value;
    }
    stack[0] = Number(entry);
    lastAction = "Digitando";
    show(Number(entry));
  }
  function enter() {
    if (!poweredOn) return;
    const value = commit();
    if (!Number.isFinite(value)) return;
    stack = [value, value, stack[1], stack[2]];
    entry = String(value);
    lastAction = "ENTER — valor elevado na pilha";
    show(value);
  }
  function binaryOperation(operator) {
    const x = commit();
    const y = stack[1];
    if (!Number.isFinite(x)) return;
    if (operator === "/" && x === 0) return error("Divisão por zero");
    const operations = { "+": y + x, "-": y - x, "*": y * x, "/": y / x };
    const result = operations[operator];
    dropBinary(result);
    lastAction = `${formatDisplay(y)} ${operator} ${formatDisplay(x)}`;
    show(result);
  }
  function unaryOperation(key) {
    const x = commit();
    const y = stack[1];
    if (!Number.isFinite(x)) return;
    let result;
    let message = "";
    if (key === "RECIP") {
      if (x === 0) return error("Divisão por zero");
      result = 1 / x;
      message = "Recíproco de X";
    } else if (key === "POW") {
      result = y ** x;
      if (!Number.isFinite(result)) return error("Potência inválida");
      dropBinary(result);
      lastAction = `${formatDisplay(y)} elevado a ${formatDisplay(x)}`;
      return show(result);
    } else if (key === "PERCENT") {
      result = y * x / 100;
      stack[0] = result;
      lastAction = `${formatDisplay(x)}% de ${formatDisplay(y)}`;
      return show(result);
    } else if (key === "PCT_TOTAL") {
      if (y === 0) return error("Total igual a zero");
      result = x / y * 100;
      message = "Percentual de X em relação a Y";
    } else if (key === "DELTA_PERCENT") {
      if (y === 0) return error("Valor-base igual a zero");
      result = (x - y) / y * 100;
      message = "Variação percentual de Y para X";
    }
    setX(result, message || `${key} calculado`);
  }
  function changeSign() {
    if (exponentMode && entering) {
      const [mantissa, exponent = ""] = entry.split("e");
      entry = `${mantissa}e${exponent.startsWith("-") ? exponent.slice(1) : `-${exponent}`}`;
      return show(Number(entry));
    }
    if (entering) {
      entry = entry.startsWith("-") ? entry.slice(1) : `-${entry}`;
      stack[0] = Number(entry);
      lastAction = "Sinal da entrada alterado";
      return show(stack[0]);
    }
    setX(-stack[0], "Sinal de X alterado");
  }
  function enterExponent() {
    if (!entering) {
      entry = `${stack[0]}e`;
      entering = true;
    } else if (!entry.includes("e")) {
      entry += "e";
    }
    exponentMode = true;
    lastAction = "Informe o expoente";
    showIndicators();
    display.textContent = entry;
    status.textContent = lastAction;
  }
  function rollDown() {
    commit();
    stack = [stack[1], stack[2], stack[3], stack[0]];
    entry = String(stack[0]);
    lastAction = "Pilha rotacionada para baixo";
    show();
  }
  function swapXY() {
    commit();
    [stack[0], stack[1]] = [stack[1], stack[0]];
    entry = String(stack[0]);
    lastAction = "X e Y trocados";
    show();
  }
  function clearX() {
    stack[0] = 0;
    entry = "0";
    entering = false;
    exponentMode = false;
    lastAction = "Registro X limpo";
    show(0);
  }
  function clearAll() {
    stack = [0, 0, 0, 0];
    entry = "0";
    entering = false;
    exponentMode = false;
    prefix = null;
    memoryAction = null;
    cashFlows = [];
    Object.keys(financial).forEach((key) => { financial[key] = null; });
    memory.fill(0);
    Object.keys(statistics).forEach((key) => { statistics[key] = 0; });
    refreshRegisters();
    lastAction = "Pilha, registros e fluxos limpos";
    show(0);
  }

  const annuityFactor = (periods, rate) => {
    const factor = Math.abs(rate) < 1e-12 ? periods : (((1 + rate) ** periods - 1) / rate);
    return factor * (beginMode && Math.abs(rate) >= 1e-12 ? 1 + rate : 1);
  };
  const paymentEquation = (periods, rate, pv, pmt, fv) =>
    pv * ((1 + rate) ** periods) + pmt * annuityFactor(periods, rate) + fv;

  function storeFinancial(key) {
    const value = commit();
    if (!Number.isFinite(value)) return;
    financial[key] = value;
    lastAction = `${key} armazenado`;
    refreshRegisters();
    show(value);
  }
  function solveFinancial(key) {
    const cashKeys = ["PV", "PMT", "FV"];
    const informedCashFlows = cashKeys.filter((name) => name !== key && financial[name] !== null).length;
    const hasRequiredValues = cashKeys.includes(key)
      ? financial.n !== null && financial.i !== null && informedCashFlows >= 1
      : key === "n"
        ? financial.i !== null && informedCashFlows >= 2
        : financial.n !== null && informedCashFlows >= 2;
    if (!hasRequiredValues) {
      if (financial[key] !== null) return setX(financial[key], `${key} recuperado`);
      return error(`Informe três variáveis compatíveis para calcular ${key}`);
    }
    const n = financial.n ?? 0;
    const i = financial.i ?? 0;
    const PV = financial.PV ?? 0;
    const PMT = financial.PMT ?? 0;
    const FV = financial.FV ?? 0;
    const rate = i === null ? null : i / 100;
    let answer;
    if (key === "FV") answer = -(PV * ((1 + rate) ** n) + PMT * annuityFactor(n, rate));
    else if (key === "PV") answer = -(PMT * annuityFactor(n, rate) + FV) / ((1 + rate) ** n);
    else if (key === "PMT") answer = -(PV * ((1 + rate) ** n) + FV) / annuityFactor(n, rate);
    else if (key === "n") {
      if (Math.abs(rate) < 1e-12) answer = -(PV + FV) / PMT;
      else {
        const multiplier = beginMode ? 1 + rate : 1;
        const paymentCoefficient = PMT * multiplier / rate;
        const ratio = (paymentCoefficient - FV) / (PV + paymentCoefficient);
        if (ratio <= 0 || 1 + rate <= 0) return error("Sem solução real para n; revise os sinais");
        answer = Math.log(ratio) / Math.log(1 + rate);
      }
    } else if (key === "i") {
      let previousRate = -0.9999;
      let previousValue = paymentEquation(n, previousRate, PV, PMT, FV);
      let low = null, high = null;
      for (let step = 1; step <= 4000; step += 1) {
        const candidate = -0.9999 + step * (10.9999 / 4000);
        const value = paymentEquation(n, candidate, PV, PMT, FV);
        if (Number.isFinite(previousValue) && Number.isFinite(value) && previousValue * value <= 0) {
          low = previousRate; high = candidate; break;
        }
        previousRate = candidate; previousValue = value;
      }
      if (low === null) return error("Não foi possível encontrar i; revise os sinais");
      let lowValue = paymentEquation(n, low, PV, PMT, FV);
      for (let count = 0; count < 180; count += 1) {
        const middle = (low + high) / 2;
        const middleValue = paymentEquation(n, middle, PV, PMT, FV);
        if (lowValue * middleValue <= 0) high = middle;
        else { low = middle; lowValue = middleValue; }
      }
      answer = ((low + high) / 2) * 100;
    }
    if (!Number.isFinite(answer)) return error("Resultado financeiro inválido");
    financial[key] = answer;
    refreshRegisters();
    stack[0] = answer;
    entry = String(answer);
    entering = false;
    lastAction = `${key} calculado no modo ${beginMode ? "BEGIN" : "END"}`;
    show(answer);
  }
  function financialKey(key) {
    if (entering) storeFinancial(key);
    else solveFinancial(key);
  }

  function calculateNpv() {
    if (!cashFlows.length) return error("Registre CF₀ e ao menos um CFⱼ");
    if (financial.i === null) return error("Informe i antes de calcular NPV");
    const rate = financial.i / 100;
    const result = cashFlows.reduce((sum, flow, period) => sum + flow / ((1 + rate) ** period), 0);
    setX(result, `NPV de ${cashFlows.length} fluxo(s)`);
  }
  function calculateIrr() {
    if (cashFlows.length < 2) return error("Registre CF₀ e os fluxos CFⱼ");
    const npv = (rate) => cashFlows.reduce((sum, flow, period) => sum + flow / ((1 + rate) ** period), 0);
    let previousRate = -0.9999, previousValue = npv(previousRate), low = null, high = null;
    for (let step = 1; step <= 5000; step += 1) {
      const candidate = -0.9999 + step * (20.9999 / 5000);
      const value = npv(candidate);
      if (Number.isFinite(previousValue) && Number.isFinite(value) && previousValue * value <= 0) {
        low = previousRate; high = candidate; break;
      }
      previousRate = candidate; previousValue = value;
    }
    if (low === null) return error("IRR não encontrada para esses fluxos");
    let lowValue = npv(low);
    for (let count = 0; count < 180; count += 1) {
      const middle = (low + high) / 2, middleValue = npv(middle);
      if (lowValue * middleValue <= 0) high = middle;
      else { low = middle; lowValue = middleValue; }
    }
    setX(((low + high) / 2) * 100, "IRR calculada (%)");
  }
  function amortize() {
    const periods = Math.max(1, Math.round(commit()));
    if ([financial.i, financial.PV, financial.PMT].some((value) => value === null)) return error("AMORT requer i, PV e PMT");
    const rate = financial.i / 100;
    let balance = Math.abs(financial.PV), totalInterest = 0, totalPrincipal = 0;
    for (let period = 0; period < periods && balance > 1e-10; period += 1) {
      const interest = balance * rate;
      const principal = Math.min(balance, Math.max(0, Math.abs(financial.PMT) - interest));
      totalInterest += interest; totalPrincipal += principal; balance -= principal;
    }
    stack = [totalPrincipal, totalInterest, stack[1], stack[2]];
    entry = String(totalPrincipal);
    lastAction = `AMORT: principal; pressione x↔y para juros (${formatDisplay(totalInterest)})`;
    show(totalPrincipal);
  }
  function simpleInterest() {
    if ([financial.n, financial.i, financial.PV].some((value) => value === null)) return error("INT requer n, i e PV");
    const result = -financial.PV * (financial.i / 100) * (financial.n / 360);
    setX(result, "Juro simples em base de 360 dias");
  }
  function addCashFlow(initial) {
    const value = commit();
    if (initial) cashFlows = [value];
    else {
      if (!cashFlows.length) return error("Registre CF₀ antes de CFⱼ");
      cashFlows.push(value);
    }
    lastAction = `${initial ? "CF₀" : `CFⱼ (${cashFlows.length - 1})`} armazenado`;
    show(value);
  }
  function repeatCashFlow() {
    const repetitions = Math.round(commit());
    if (cashFlows.length < 2 || repetitions < 1) return error("Nⱼ requer um CFⱼ e repetição positiva");
    const last = cashFlows.at(-1);
    for (let count = 1; count < repetitions; count += 1) cashFlows.push(last);
    lastAction = `Último CFⱼ repetido ${repetitions} vez(es)`;
    show(repetitions);
  }
  function sigma(add = true) {
    const x = commit(), y = stack[1], direction = add ? 1 : -1;
    statistics.count += direction;
    statistics.sumX += direction * x;
    statistics.sumX2 += direction * x * x;
    statistics.sumY += direction * y;
    statistics.sumY2 += direction * y * y;
    statistics.sumXY += direction * x * y;
    setX(statistics.count, add ? "Amostra adicionada a Σ" : "Amostra removida de Σ");
  }

  function handlePrefix(key) {
    const activePrefix = prefix;
    prefix = null;
    showIndicators();
    if (activePrefix === "f") {
      const actions = {
        n: amortize,
        i: simpleInterest,
        PV: calculateNpv,
        PMT: () => setX(Math.round(commit() * 100) / 100, "Valor arredondado para 2 casas"),
        FV: calculateIrr,
        CLX: clearAll,
        XSWAP: () => {
          Object.keys(statistics).forEach((name) => { statistics[name] = 0; });
          setX(0, "Registros estatísticos limpos");
        }
      };
      return actions[key] ? actions[key]() : error("Função laranja não implementada neste simulador");
    }
    const actions = {
      n: () => setX(commit() * 12, "Conversão anual → mensal (×12)"),
      i: () => setX(commit() / 12, "Conversão anual → mensal (÷12)"),
      PV: () => addCashFlow(true),
      PMT: () => addCashFlow(false),
      FV: repeatCashFlow,
      "7": () => { beginMode = true; lastAction = "Pagamentos antecipados"; show(); },
      "8": () => { beginMode = false; lastAction = "Pagamentos postecipados"; show(); },
      SIGMA: () => sigma(false),
      CLX: () => setX(stack[0] === 0 ? 1 : 0, "Teste x = 0")
    };
    return actions[key] ? actions[key]() : error("Função azul não implementada neste simulador");
  }

  function press(key) {
    if (key === "ON") {
      poweredOn = !poweredOn;
      if (poweredOn) { lastAction = "Calculadora ligada"; show(); }
      else show();
      return;
    }
    if (!poweredOn) return;
    if (key === "f" || key === "g") {
      prefix = prefix === key ? null : key;
      lastAction = prefix ? `Prefixo ${prefix} ativo` : "Prefixo cancelado";
      return show();
    }
    if (prefix) return handlePrefix(key);
    if (/^\d$/.test(key) || key === ".") return digit(key);
    if (Object.hasOwn(financial, key)) return financialKey(key);
    if (["+", "-", "*", "/"].includes(key)) return binaryOperation(key);
    if (["POW", "RECIP", "PERCENT", "PCT_TOTAL", "DELTA_PERCENT"].includes(key)) return unaryOperation(key);
    if (key === "ENTER") return enter();
    if (key === "CHS") return changeSign();
    if (key === "EEX") return enterExponent();
    if (key === "RDOWN") return rollDown();
    if (key === "XSWAP") return swapXY();
    if (key === "CLX") return clearX();
    if (key === "STO" || key === "RCL") {
      memoryAction = key;
      lastAction = `${key}: escolha um registro de 0 a 9`;
      return show();
    }
    if (key === "SIGMA") return sigma(true);
    if (key === "RS" || key === "SST") return setX(stack[0], "Programação não emulada; use as funções de cálculo");
  }

  shell.addEventListener("click", (event) => {
    const button = event.target.closest("[data-key]");
    if (button) press(button.dataset.key);
  });
  document.addEventListener("keydown", (event) => {
    const map = { Enter: "ENTER", Escape: "CLX", Backspace: "CLX", ",": "." };
    const key = map[event.key] || event.key;
    if (/^\d$/.test(key) || key === "." || ["ENTER", "CLX", "+", "-", "*", "/"].includes(key)) {
      press(key);
      event.preventDefault();
    }
  });

  refreshRegisters();
  show(0);
})();
