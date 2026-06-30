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
  const memory = Array.from({ length: 20 }, () => 0);
  const statistics = { count: 0, sumX: 0, sumX2: 0, sumY: 0, sumY2: 0, sumXY: 0 };
  let cashFlows = [];
  let stack = [0, 0, 0, 0];
  let entry = "0";
  let entering = false;
  let stackLiftEnabled = true;
  let exponentMode = false;
  let prefix = null;
  let memoryAction = null;
  let memoryOperator = null;
  let memoryDecimal = false;
  let beginMode = false;
  let dateDmy = true;
  let displayDigits = 2;
  let lastX = 0;
  let financialInputPending = false;
  let programMode = false;
  let programRunning = false;
  let programCounter = 0;
  let program = [];
  let recordingPrefix = null;
  let recordingSequence = null;
  let gotoPending = null;
  let executingProgramInstruction = false;
  let programTimer = null;
  let programExecutionCount = 0;
  let poweredOn = true;
  let lastAction = "Pronta — digite um valor";

  const keyCodes = {
    n: "11", i: "12", PV: "13", PMT: "14", FV: "15", CHS: "16", "7": "7", "8": "8", "9": "9", "/": "10",
    POW: "21", RECIP: "22", PCT_TOTAL: "23", DELTA_PERCENT: "24", PERCENT: "25", EEX: "26", "4": "4", "5": "5", "6": "6", "*": "20",
    RS: "31", SST: "32", RDOWN: "33", XSWAP: "34", CLX: "35", ENTER: "36", "1": "1", "2": "2", "3": "3", "-": "30",
    f: "42", g: "43", STO: "44", RCL: "45", "0": "0", ".": "48", SIGMA: "49", "+": "40"
  };
  const formatDisplay = (value) => {
    if (!Number.isFinite(value)) return "Error";
    return value.toLocaleString("en-US", { useGrouping: false, minimumFractionDigits: displayDigits, maximumFractionDigits: displayDigits });
  };
  const programCapacity = () => Math.min(99, 8 + Math.ceil(Math.max(0, program.length - 8) / 7) * 7);
  const availableStorageRegisters = () => 20 - Math.ceil(Math.max(0, programCapacity() - 8) / 7);
  const programInstructionAt = (line) => line > 0 && line <= program.length ? program[line - 1] : null;
  const programCode = (instruction) => {
    if (!instruction) return "43, 33 00";
    const keys = instruction.keys;
    if (keys[0] === "g" && keys[1] === "RDOWN") return `43, 33 ${keys.slice(2).join("")}`;
    return keys.map((key) => keyCodes[key] || key).join(" ");
  };
  const showProgramLine = () => {
    const line = Math.max(0, Math.min(99, programCounter));
    display.textContent = line === 0
      ? "00-"
      : `${String(line).padStart(2, "0")}-  ${programCode(programInstructionAt(line))}`;
    status.textContent = lastAction;
    showIndicators();
  };
  const show = (value = stack[0]) => {
    display.textContent = poweredOn ? formatDisplay(value) : "";
    status.textContent = poweredOn ? lastAction : "";
    prefixIndicator.textContent = prefix ? prefix.toUpperCase() : "";
    modeIndicator.textContent = `${beginMode ? "BEGIN" : "END"}${dateDmy ? " · D.MY" : " · M.DY"}${programMode ? " · PGRM" : ""}`;
    memoryIndicator.textContent = memoryAction ? `${memoryAction}${memoryOperator || ""} ${memoryDecimal ? "." : ""}_` : programRunning ? "RUNNING" : "";
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
    memoryOperator = null;
    memoryDecimal = false;
    lastAction = message;
    display.textContent = message.match(/^Error \d+/)?.[0] || "Error";
    status.textContent = message;
    showIndicators();
  };
  const showIndicators = () => {
    prefixIndicator.textContent = prefix ? prefix.toUpperCase() : "";
    modeIndicator.textContent = `${beginMode ? "BEGIN" : "END"}${dateDmy ? " · D.MY" : " · M.DY"}${programMode ? " · PGRM" : ""}`;
    memoryIndicator.textContent = memoryAction ? `${memoryAction}${memoryOperator || ""} ${memoryDecimal ? "." : ""}_` : programRunning ? "RUNNING" : "";
  };
  const commit = () => {
    if (entering) {
      const value = Number(entry);
      if (!Number.isFinite(value)) { error("Entrada inválida"); return NaN; }
      stack[0] = value;
      entering = false;
      stackLiftEnabled = true;
      exponentMode = false;
    }
    return stack[0];
  };
  const setX = (value, message) => {
    if (!Number.isFinite(value)) return error("Resultado inválido");
    stack[0] = value;
    entry = String(value);
    entering = false;
    stackLiftEnabled = true;
    exponentMode = false;
    financialInputPending = true;
    lastAction = message;
    show(value);
  };
  const dropBinary = (value) => {
    stack = [value, stack[2], stack[3], stack[3]];
    entry = String(value);
    entering = false;
    stackLiftEnabled = true;
    exponentMode = false;
    financialInputPending = true;
  };

  function handleMemoryDigit(digit) {
    const index = Number(digit) + (memoryDecimal ? 10 : 0);
    if (index >= availableStorageRegisters()) {
      memoryAction = null;
      memoryOperator = null;
      memoryDecimal = false;
      return error("Error 6 — registro convertido em memória de programa");
    }
    const x = commit();
    if (memoryAction === "STO") {
      if (memoryOperator) {
        if (index > 4) {
          memoryAction = null;
          memoryOperator = null;
          memoryDecimal = false;
          return error("Error 1 — aritmética permitida apenas em R0–R4");
        }
        if (memoryOperator === "/" && x === 0) return error("Divisão por zero no registro");
        memory[index] = { "+": memory[index] + x, "-": memory[index] - x, "*": memory[index] * x, "/": memory[index] / x }[memoryOperator];
      } else memory[index] = x;
      lastAction = `Valor armazenado em R${memoryDecimal ? "." : ""}${digit}`;
    } else {
      let recalled = memory[index];
      if (memoryOperator) {
        if (memoryOperator === "/" && recalled === 0) return error("Divisão por zero no registro");
        recalled = { "+": x + recalled, "-": x - recalled, "*": x * recalled, "/": x / recalled }[memoryOperator];
      }
      if (stackLiftEnabled) stack = [recalled, stack[0], stack[1], stack[2]];
      else stack[0] = recalled;
      entry = String(stack[0]);
      entering = false;
      stackLiftEnabled = true;
      financialInputPending = true;
      lastAction = `Valor recuperado de R${memoryDecimal ? "." : ""}${digit}`;
    }
    memoryAction = null;
    memoryOperator = null;
    memoryDecimal = false;
    show();
  }
  function digit(value) {
    if (!poweredOn) return;
    if (memoryAction && /^\d$/.test(value)) return handleMemoryDigit(value);
    if (gotoPending !== null && /^\d$/.test(value)) {
      gotoPending += value;
      if (gotoPending.length >= 2) {
        const target = Number(gotoPending);
        if (target > programCapacity()) {
          gotoPending = null;
          return error("Error 4 — linha de programa inexistente");
        }
        programCounter = target === 0 ? 0 : target - 1;
        lastAction = `GTO ${String(target).padStart(2, "0")}`;
        gotoPending = null;
      }
      return show();
    }
    if (!entering) {
      if (stackLiftEnabled) stack = [0, stack[0], stack[1], stack[2]];
      entry = value === "." ? "0." : value;
      entering = true;
      stackLiftEnabled = false;
    } else if (value === "." && (entry.includes(".") || exponentMode)) {
      return;
    } else {
      entry += value;
    }
    stack[0] = Number(entry);
    financialInputPending = true;
    lastAction = "Digitando";
    show(Number(entry));
    display.textContent = entry;
  }
  function enter() {
    if (!poweredOn) return;
    const value = commit();
    if (!Number.isFinite(value)) return;
    stack = [value, value, stack[1], stack[2]];
    entry = String(value);
    stackLiftEnabled = false;
    financialInputPending = true;
    lastAction = "ENTER — valor elevado na pilha";
    show(value);
  }
  function binaryOperation(operator) {
    const x = commit();
    const y = stack[1];
    if (!Number.isFinite(x)) return;
    if (operator === "/" && x === 0) return error("Divisão por zero");
    const operations = { "+": y + x, "-": y - x, "*": y * x, "/": y / x };
    lastX = x;
    const result = operations[operator];
    dropBinary(result);
    lastAction = `${formatDisplay(y)} ${operator} ${formatDisplay(x)}`;
    show(result);
  }
  function unaryOperation(key) {
    const x = commit();
    const y = stack[1];
    if (!Number.isFinite(x)) return;
    lastX = x;
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
      show(stack[0]);
      display.textContent = entry;
      return;
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
    stackLiftEnabled = true;
    financialInputPending = true;
    lastAction = "Pilha rotacionada para baixo";
    show();
  }
  function swapXY() {
    commit();
    [stack[0], stack[1]] = [stack[1], stack[0]];
    entry = String(stack[0]);
    stackLiftEnabled = true;
    financialInputPending = true;
    lastAction = "X e Y trocados";
    show();
  }
  function clearX() {
    stack[0] = 0;
    entry = "0";
    entering = false;
    stackLiftEnabled = false;
    financialInputPending = true;
    exponentMode = false;
    lastAction = "Registro X limpo";
    show(0);
  }
  function clearAll() {
    stack = [0, 0, 0, 0];
    entry = "0";
    entering = false;
    stackLiftEnabled = false;
    financialInputPending = false;
    exponentMode = false;
    prefix = null;
    memoryAction = null;
    memoryOperator = null;
    memoryDecimal = false;
    cashFlows = [];
    Object.keys(financial).forEach((key) => { financial[key] = null; });
    memory.fill(0);
    Object.keys(statistics).forEach((key) => { statistics[key] = 0; });
    lastX = 0;
    refreshRegisters();
    lastAction = "Pilha, registros e fluxos limpos";
    if (programMode) showProgramLine();
    else show(0);
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
    financialInputPending = false;
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
    financialInputPending = false;
    refreshRegisters();
    stack[0] = answer;
    entry = String(answer);
    entering = false;
    lastAction = `${key} calculado no modo ${beginMode ? "BEGIN" : "END"}`;
    show(answer);
  }
  function financialKey(key) {
    if (financialInputPending) storeFinancial(key);
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
    const direction = financial.PMT < 0 ? -1 : 1;
    const interestResult = totalInterest * direction;
    const principalResult = totalPrincipal * direction;
    stack = [interestResult, principalResult, periods, stack[1]];
    entry = String(interestResult);
    financial.n = (financial.n ?? 0) + periods;
    financial.PV = (financial.PV ?? 0) + principalResult;
    refreshRegisters();
    lastAction = `AMORT: juros; pressione x↔y para principal (${formatDisplay(principalResult)})`;
    show(interestResult);
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

  function setXY(x, y, message) {
    if (![x, y].every(Number.isFinite)) return error("Resultado inválido");
    stack = [x, y, stack[1], stack[2]];
    entry = String(x);
    entering = false;
    stackLiftEnabled = true;
    lastAction = message;
    show(x);
  }
  function squareRoot() {
    const x = commit();
    if (x < 0) return error("Raiz de número negativo");
    lastX = x;
    setX(Math.sqrt(x), "Raiz quadrada");
  }
  function exponential() {
    const x = commit(); lastX = x;
    setX(Math.exp(x), "Exponencial de X");
  }
  function naturalLog() {
    const x = commit();
    if (x <= 0) return error("Logaritmo requer X positivo");
    lastX = x;
    setX(Math.log(x), "Logaritmo natural");
  }
  function fractionalPart() {
    const x = commit(); lastX = x;
    setX(x - Math.trunc(x), "Parte fracionária");
  }
  function integerPart() {
    const x = commit(); lastX = x;
    setX(Math.trunc(x), "Parte inteira");
  }
  function factorial() {
    const x = commit();
    if (!Number.isInteger(x) || x < 0 || x > 170) return error("n! requer inteiro entre 0 e 170");
    let result = 1;
    for (let value = 2; value <= x; value += 1) result *= value;
    lastX = x;
    setX(result, "Fatorial");
  }
  function statisticsMoments() {
    const n = statistics.count;
    if (n <= 0) return null;
    const meanX = statistics.sumX / n;
    const meanY = statistics.sumY / n;
    const centeredX2 = statistics.sumX2 - statistics.sumX ** 2 / n;
    const centeredY2 = statistics.sumY2 - statistics.sumY ** 2 / n;
    const centeredXY = statistics.sumXY - statistics.sumX * statistics.sumY / n;
    const varianceX = n > 1 ? centeredX2 / (n - 1) : 0;
    const varianceY = n > 1 ? centeredY2 / (n - 1) : 0;
    const covariance = n > 1 ? centeredXY / (n - 1) : 0;
    const stdX = Math.sqrt(Math.max(0, varianceX));
    const stdY = Math.sqrt(Math.max(0, varianceY));
    const correlationDenominator = Math.sqrt(centeredX2 * centeredY2);
    const correlation = correlationDenominator
      ? Math.max(-1, Math.min(1, centeredXY / correlationDenominator))
      : NaN;
    const slope = centeredX2 ? centeredXY / centeredX2 : NaN;
    const intercept = meanY - slope * meanX;
    return { meanX, meanY, stdX, stdY, correlation, slope, intercept, centeredX2, centeredY2 };
  }
  function statisticsMean() {
    const moments = statisticsMoments();
    if (!moments) return error("Error 2 — sem dados estatísticos");
    setXY(moments.meanX, moments.meanY, "Médias: X no visor; Y em y");
  }
  function statisticsDeviation() {
    const moments = statisticsMoments();
    if (!moments || statistics.count < 2 || moments.centeredX2 < 0 || moments.centeredY2 < 0) {
      return error("Error 2 — desvio requer ao menos duas amostras válidas");
    }
    setXY(moments.stdX, moments.stdY, "Desvios amostrais: sx no visor; sy em y");
  }
  function linearEstimateY() {
    const moments = statisticsMoments();
    if (!moments || statistics.count < 2 || moments.centeredX2 <= 0 || moments.centeredY2 <= 0) {
      return error("Error 2 — dados insuficientes para regressão");
    }
    const x = commit();
    lastX = x;
    setXY(moments.intercept + moments.slope * x, moments.correlation, "Estimativa ŷ; correlação r em y");
  }
  function linearEstimateX() {
    const moments = statisticsMoments();
    if (!moments || statistics.count < 2 || moments.centeredX2 <= 0 || moments.centeredY2 <= 0 || moments.slope === 0) {
      return error("Error 2 — dados insuficientes para regressão");
    }
    const y = commit();
    lastX = y;
    setXY((y - moments.intercept) / moments.slope, moments.correlation, "Estimativa x̂; correlação r em y");
  }
  function weightedMean() {
    if (statistics.sumX === 0) return error("Error 2 — soma dos pesos igual a zero");
    setX(statistics.sumXY / statistics.sumX, "Média ponderada");
  }

  function parseDate(value) {
    const absolute = Math.abs(value);
    const whole = Math.floor(absolute + 1e-9);
    const fraction = Math.round((absolute - whole) * 1000000);
    const first = Math.floor(fraction / 10000);
    const year = fraction % 10000;
    const day = dateDmy ? whole : first;
    const month = dateDmy ? first : whole;
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }
  const encodeDate = (date) => dateDmy
    ? date.getUTCDate() + (date.getUTCMonth() + 1) / 100 + date.getUTCFullYear() / 1000000
    : date.getUTCMonth() + 1 + date.getUTCDate() / 100 + date.getUTCFullYear() / 1000000;
  const daysBetween = (first, second) => Math.round((second.getTime() - first.getTime()) / 86400000);
  function dateAdd() {
    const days = Math.trunc(commit());
    const base = parseDate(stack[1]);
    if (!base) return error("Data inválida");
    lastX = stack[0];
    const result = new Date(base.getTime() + days * 86400000);
    const dayName = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][result.getUTCDay()];
    dropBinary(encodeDate(result));
    lastAction = `DATE: ${dayName}`;
    show();
    display.textContent = encodeDate(result).toFixed(6);
  }
  function dateDifference() {
    const first = parseDate(stack[1]), second = parseDate(commit());
    if (!first || !second) return error("Data inválida");
    const actual = daysBetween(first, second);
    const d1 = first.getUTCDate() === 31 ? 30 : first.getUTCDate();
    const d2 = second.getUTCDate() === 31 && d1 === 30 ? 30 : second.getUTCDate();
    const days360 = (second.getUTCFullYear() - first.getUTCFullYear()) * 360 +
      (second.getUTCMonth() - first.getUTCMonth()) * 30 + d2 - d1;
    lastX = stack[0];
    setXY(actual, days360, "ΔDYS: dias reais; base 30/360 em y");
  }

  function depreciation(method) {
    const year = Math.trunc(commit());
    const cost = Math.abs(financial.PV ?? 0);
    const salvage = Math.abs(financial.FV ?? 0);
    const life = Math.trunc(financial.n ?? 0);
    if (!cost || life <= 0 || year < 1 || year > life || salvage > cost) return error("Dados de depreciação inválidos");
    const basis = cost - salvage;
    let depreciationValue = 0, accumulated = 0;
    if (method === "SL") {
      depreciationValue = basis / life;
      accumulated = depreciationValue * year;
    } else if (method === "SOYD") {
      const denominator = life * (life + 1) / 2;
      for (let current = 1; current <= year; current += 1) {
        const amount = basis * (life - current + 1) / denominator;
        if (current === year) depreciationValue = amount;
        accumulated += amount;
      }
    } else {
      const rate = (financial.i ?? 0) / 100;
      if (rate <= 0) return error("DB requer taxa i positiva");
      let book = cost;
      for (let current = 1; current <= year; current += 1) {
        const amount = Math.min(book - salvage, book * rate);
        depreciationValue = Math.max(0, amount);
        accumulated += depreciationValue;
        book -= depreciationValue;
      }
    }
    setXY(depreciationValue, Math.max(0, basis - accumulated), `${method}: depreciação; saldo depreciável em y`);
  }

  function addMonthsUtc(date, months) {
    const day = date.getUTCDate();
    const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    result.setUTCDate(day);
    return result.getUTCDate() === day ? result : null;
  }
  function bondPriceForYield(yieldPercent) {
    const settlement = parseDate(stack[1]), maturity = parseDate(stack[0]);
    if (!settlement || !maturity || maturity <= settlement || yieldPercent <= -100) return null;
    const couponRate = financial.PMT ?? 0;
    let nextCoupon = new Date(maturity);
    let couponCount = 0;
    while (nextCoupon > settlement && couponCount < 1000) {
      const previous = addMonthsUtc(nextCoupon, -6);
      if (!previous) return null;
      if (previous <= settlement) break;
      nextCoupon = previous;
      couponCount += 1;
    }
    couponCount += 1;
    const previousCoupon = addMonthsUtc(nextCoupon, -6);
    if (!previousCoupon) return null;
    const couponDays = daysBetween(previousCoupon, nextCoupon);
    const daysToNext = daysBetween(settlement, nextCoupon);
    const fraction = daysToNext / couponDays;
    const coupon = couponRate / 2;
    const halfYield = yieldPercent / 200;
    let dirty = 0;
    for (let period = 0; period < couponCount; period += 1) {
      dirty += coupon / ((1 + halfYield) ** (period + fraction));
    }
    dirty += 100 / ((1 + halfYield) ** (couponCount - 1 + fraction));
    const accrued = coupon * daysBetween(previousCoupon, settlement) / couponDays;
    return { clean: dirty - accrued, accrued };
  }
  function bondPrice() {
    const result = bondPriceForYield(financial.i ?? 0);
    if (!result) return error("Dados do título ou datas inválidos");
    setXY(result.clean, result.accrued, "PRICE: preço líquido; juros acumulados em y");
  }
  function bondYield() {
    const target = Math.abs(financial.PV ?? 0);
    if (!target) return error("YTM requer preço em PV");
    let low = -99.9, high = 1000;
    const objective = (rate) => {
      const result = bondPriceForYield(rate);
      return result ? result.clean - target : NaN;
    };
    let lowValue = objective(low), highValue = objective(high);
    if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return error("YTM não encontrada");
    for (let count = 0; count < 180; count += 1) {
      const middle = (low + high) / 2, middleValue = objective(middle);
      if (lowValue * middleValue <= 0) high = middle;
      else { low = middle; lowValue = middleValue; }
    }
    setX((low + high) / 2, "YTM anual (%)");
  }

  function setDisplayFormat(key) {
    displayDigits = Number(key);
    lastAction = `Formato FIX ${displayDigits}`;
    show();
  }
  function keepDecimalFormat() {
    lastAction = "Visor mantido em formato decimal";
    show();
  }
  function showMemoryAvailability() {
    const lines = programCapacity();
    const registers = availableStorageRegisters();
    display.textContent = `P-${String(lines).padStart(2, "0")} r-${String(registers).padStart(2, "0")}`;
    lastAction = "Memória disponível";
    status.textContent = lastAction;
    showIndicators();
  }
  function clearFinancial() {
    Object.keys(financial).forEach((key) => { financial[key] = null; });
    cashFlows = [];
    beginMode = false;
    financialInputPending = false;
    refreshRegisters();
    lastAction = "Registros financeiros limpos";
    show();
  }
  function clearStatistics() {
    Object.keys(statistics).forEach((key) => { statistics[key] = 0; });
    memory.fill(0, 1, 7);
    stack = [0, 0, 0, 0];
    entry = "0";
    entering = false;
    stackLiftEnabled = false;
    exponentMode = false;
    setX(0, "Registros estatísticos e pilha limpos");
  }
  function clearProgram() {
    program = [];
    programCounter = 0;
    recordingPrefix = null;
    recordingSequence = null;
    lastAction = "Programa limpo";
    if (programMode) showProgramLine();
    else show();
  }
  function clearOrResetProgram() {
    if (programMode) return clearProgram();
    programCounter = 0;
    lastAction = "Programa reposicionado na linha 00";
    show();
  }
  function toggleProgramMode() {
    programMode = !programMode;
    programRunning = false;
    recordingPrefix = null;
    recordingSequence = null;
    if (!programMode) programCounter = 0;
    lastAction = programMode ? `Modo PRGM · linha ${programCounter}` : "Modo RUN · linha 00";
    if (programMode) showProgramLine();
    else show();
  }
  function recordProgramInstruction(keys) {
    if (programCounter >= 99) {
      recordingPrefix = null;
      recordingSequence = null;
      return error("Memória de programa cheia (99 passos)");
    }
    const previousAvailableRegisters = availableStorageRegisters();
    while (program.length < programCounter) program.push(null);
    program[programCounter] = { keys: [...keys] };
    programCounter += 1;
    const currentAvailableRegisters = availableStorageRegisters();
    if (currentAvailableRegisters < previousAvailableRegisters) {
      memory.fill(0, currentAvailableRegisters);
    }
    recordingPrefix = null;
    recordingSequence = null;
    lastAction = `PRGM · linha ${String(programCounter).padStart(2, "0")}`;
    showProgramLine();
  }
  function browseProgram(direction) {
    const lastBrowsableLine = programCapacity();
    if (direction < 0 && programCounter === 0) programCounter = lastBrowsableLine;
    else if (direction > 0 && programCounter === lastBrowsableLine) programCounter = 0;
    else programCounter = Math.min(lastBrowsableLine, Math.max(0, programCounter + direction));
    lastAction = `PRGM · linha ${String(programCounter).padStart(2, "0")}`;
    showProgramLine();
  }
  function executeProgramStep() {
    if (!program.length || programCounter >= program.length) {
      programCounter = 0;
      programRunning = false;
      lastAction = "Programa concluído · linha 00";
      return show();
    }
    const instruction = program[programCounter];
    if (!instruction) {
      programCounter = 0;
      programRunning = false;
      lastAction = "GTO 00 · programa interrompido";
      return show();
    }
    const line = programCounter + 1;
    programCounter = line;
    const keys = instruction.keys;
    if (keys[0] === "g" && keys[1] === "RDOWN") {
      const target = Number(keys.slice(2).join(""));
      if (target === 0) {
        programCounter = 0;
        programRunning = false;
        lastAction = "GTO 00 · programa interrompido";
        return show();
      }
      if (target > programCapacity()) {
        programRunning = false;
        return error("Error 4 — linha de programa inexistente");
      }
      programCounter = target - 1;
      lastAction = `GTO ${String(target).padStart(2, "0")}`;
      return show();
    }
    if (keys.length === 2 && keys[0] === "g" && keys[1] === "RS") {
      lastAction = "PSE · pausa de programa";
      show();
      return "pause";
    }
    if (keys.length === 3 && keys[0] === "RCL" && keys[1] === "g" && (keys[2] === "n" || keys[2] === "i")) {
      const x = commit();
      return setX(keys[2] === "n" ? x / 12 : x * 12, `RCL g ${keys[2]} executado`);
    }
    executingProgramInstruction = true;
    try {
      keys.forEach((key) => press(key, true));
    } finally {
      executingProgramInstruction = false;
    }
  }
  function continueProgram() {
    while (programRunning && programExecutionCount < 10000) {
      const result = executeProgramStep();
      programExecutionCount += 1;
      if (result === "pause" && programRunning) {
        if (typeof setTimeout === "function") {
          programTimer = setTimeout(() => {
            programTimer = null;
            continueProgram();
          }, 1000);
          return;
        }
      }
    }
    if (programExecutionCount >= 10000) {
      programRunning = false;
      return error("Limite de execução do programa");
    }
    show();
  }
  function runProgram() {
    if (programRunning) {
      programRunning = false;
      lastAction = "Programa interrompido";
      return show();
    }
    if (!program.length) return error("Programa vazio");
    if (!Number.isFinite(commit())) return;
    programRunning = true;
    programExecutionCount = 0;
    continueProgram();
  }

  function handlePrefix(key) {
    const activePrefix = prefix;
    prefix = null;
    showIndicators();
    if (activePrefix === "f") {
      if (/^\d$/.test(key)) return setDisplayFormat(key);
      const actions = {
        n: amortize,
        i: simpleInterest,
        PV: calculateNpv,
        PMT: () => {
          const scale = 10 ** displayDigits;
          setX(Math.round(commit() * scale) / scale, `Valor arredondado para ${displayDigits} casas`);
        },
        FV: calculateIrr,
        POW: bondPrice,
        RECIP: bondYield,
        PCT_TOTAL: () => depreciation("SL"),
        DELTA_PERCENT: () => depreciation("SOYD"),
        PERCENT: () => depreciation("DB"),
        RS: toggleProgramMode,
        SST: clearStatistics,
        RDOWN: clearOrResetProgram,
        XSWAP: clearFinancial,
        CLX: clearAll,
        ENTER: () => { lastAction = "Prefixo exibido/cancelado"; show(); },
        ".": keepDecimalFormat
      };
      return actions[key] ? actions[key]() : error("Tecla sem função laranja neste modelo");
    }
    const actions = {
      n: () => {
        financial.n = commit() * 12; refreshRegisters();
        setX(financial.n, "n anual convertido e armazenado em meses");
        financialInputPending = false;
      },
      i: () => {
        financial.i = commit() / 12; refreshRegisters();
        setX(financial.i, "i nominal anual convertido e armazenado ao mês");
        financialInputPending = false;
      },
      PV: () => addCashFlow(true),
      PMT: () => addCashFlow(false),
      FV: repeatCashFlow,
      CHS: dateAdd,
      "7": () => { beginMode = true; lastAction = "Pagamentos antecipados"; show(); },
      "8": () => { beginMode = false; lastAction = "Pagamentos postecipados"; show(); },
      "9": showMemoryAvailability,
      POW: squareRoot,
      RECIP: exponential,
      PCT_TOTAL: naturalLog,
      DELTA_PERCENT: fractionalPart,
      PERCENT: integerPart,
      EEX: dateDifference,
      "4": () => { dateDmy = true; lastAction = "Formato de data D.MY"; show(); },
      "5": () => { dateDmy = false; lastAction = "Formato de data M.DY"; show(); },
      "6": weightedMean,
      RS: () => { lastAction = "Pausa de programa"; show(); },
      SST: () => {
        programCounter = programCounter === 0 ? programCapacity() : programCounter - 1;
        lastAction = `BST · linha ${programCounter}`;
        show();
      },
      RDOWN: () => {
        gotoPending = "";
        lastAction = "GTO: informe dois dígitos";
        show();
      },
      XSWAP: () => {
        const condition = stack[0] <= stack[1];
        if (executingProgramInstruction && !condition) programCounter += 1;
        lastAction = `Teste x ≤ y: ${condition ? "verdadeiro" : "falso"}`;
        show();
      },
      CLX: () => {
        const condition = stack[0] === 0;
        if (executingProgramInstruction && !condition) programCounter += 1;
        lastAction = `Teste x = 0: ${condition ? "verdadeiro" : "falso"}`;
        show();
      },
      ENTER: () => setX(lastX, "LST x recuperado"),
      "1": linearEstimateX,
      "2": linearEstimateY,
      "3": factorial,
      "0": statisticsMean,
      ".": statisticsDeviation,
      SIGMA: () => sigma(false),
    };
    return actions[key] ? actions[key]() : error("Tecla sem função azul neste modelo");
  }

  function press(key, fromProgram = false) {
    if (key === "ON") {
      poweredOn = !poweredOn;
      if (poweredOn) { lastAction = "Calculadora ligada"; show(); }
      else show();
      return;
    }
    if (!poweredOn) return;
    if (programRunning && !fromProgram) {
      programRunning = false;
      if (programTimer !== null && typeof clearTimeout === "function") clearTimeout(programTimer);
      programTimer = null;
      lastAction = "Programa interrompido manualmente";
      return show();
    }
    if (programMode && !fromProgram) {
      if (recordingSequence) {
        const keys = recordingSequence;
        const isGoto = keys[0] === "g" && keys[1] === "RDOWN";
        if (isGoto && keys.length === 2 && key === ".") {
          recordingSequence.push(".");
          lastAction = "GTO: informe a linha de programa";
          return showProgramLine();
        }
        if (isGoto && /^\d$/.test(key)) {
          recordingSequence.push(key);
          const digitCount = recordingSequence.filter((item) => /^\d$/.test(item)).length;
          if (digitCount < 2) {
            lastAction = "GTO: informe o segundo dígito";
            return showProgramLine();
          }
          const navigation = recordingSequence.includes(".");
          const target = Number(recordingSequence.filter((item) => /^\d$/.test(item)).join(""));
          if (target > programCapacity()) {
            recordingSequence = null;
            return error("Error 4 — linha de programa inexistente");
          }
          if (navigation) {
            recordingSequence = null;
            programCounter = target;
            lastAction = `PRGM · linha ${String(programCounter).padStart(2, "0")}`;
            return showProgramLine();
          }
          return recordProgramInstruction(["g", "RDOWN", ...String(target).padStart(2, "0")]);
        }
        if ((keys[0] === "STO" || keys[0] === "RCL") && keys.length === 1 && ["+", "-", "*", "/", "."].includes(key)) {
          recordingSequence.push(key);
          lastAction = "PRGM: complete a instrução de registro";
          return showProgramLine();
        }
        if (keys[0] === "RCL" && keys.length === 1 && key === "g") {
          recordingSequence.push(key);
          lastAction = "PRGM: complete RCL g";
          return showProgramLine();
        }
        if (keys[0] === "RCL" && keys.length === 2 && keys[1] === "g" && (key === "n" || key === "i")) {
          recordingSequence.push(key);
          return recordProgramInstruction(recordingSequence);
        }
        if ((keys[0] === "STO" || keys[0] === "RCL") && (/^\d$/.test(key) || Object.hasOwn(financial, key))) {
          recordingSequence.push(key);
          return recordProgramInstruction(recordingSequence);
        }
        recordingSequence = null;
        return error("Instrução de programa incompleta");
      }
      if (key === "f" || key === "g") {
        recordingPrefix = key;
        lastAction = `PRGM: prefixo ${key}`;
        return showProgramLine();
      }
      if (!recordingPrefix && key === "SST") return browseProgram(1);
      if (recordingPrefix === "g" && key === "SST") {
        recordingPrefix = null;
        return browseProgram(-1);
      }
      if (recordingPrefix === "f" && ["RS", "RDOWN", "CLX"].includes(key)) {
        prefix = "f";
        recordingPrefix = null;
        return handlePrefix(key);
      }
      if (recordingPrefix === "g" && key === "RDOWN") {
        recordingSequence = ["g", "RDOWN"];
        recordingPrefix = null;
        lastAction = "GTO: informe dois dígitos; use ponto antes deles para navegar";
        return showProgramLine();
      }
      if (!recordingPrefix && (key === "STO" || key === "RCL")) {
        recordingSequence = [key];
        lastAction = `PRGM: complete ${key}`;
        return showProgramLine();
      }
      return recordProgramInstruction(recordingPrefix ? [recordingPrefix, key] : [key]);
    }
    if (memoryAction && ["+", "-", "*", "/"].includes(key)) {
      memoryOperator = key;
      lastAction = `${memoryAction}${key}: escolha o registro`;
      return show();
    }
    if (memoryAction && key === ".") {
      memoryDecimal = true;
      lastAction = `${memoryAction}: escolha R.0 a R.9`;
      return show();
    }
    if (memoryAction && Object.hasOwn(financial, key)) {
      if (memoryAction === "STO") {
        financial[key] = commit();
        refreshRegisters();
        lastAction = `${key} armazenado por STO`;
        memoryAction = null;
        return show(financial[key]);
      }
      const value = financial[key] ?? 0;
      memoryAction = null;
      if (stackLiftEnabled) stack = [value, stack[0], stack[1], stack[2]];
      else stack[0] = value;
      entry = String(value);
      entering = false;
      stackLiftEnabled = true;
      financialInputPending = true;
      lastAction = `${key} recuperado por RCL`;
      return show(value);
    }
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
      memoryOperator = null;
      memoryDecimal = false;
      lastAction = `${key}: escolha R0–R9 ou R.0–R.9`;
      return show();
    }
    if (key === "SIGMA") return sigma(true);
    if (key === "RS") {
      if (fromProgram && programRunning) {
        programRunning = false;
        lastAction = "Programa interrompido por R/S";
        return show();
      }
      return runProgram();
    }
    if (key === "SST") return executeProgramStep();
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
