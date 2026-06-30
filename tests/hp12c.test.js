const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function createCalculator({ timers = false } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { textContent: "" });
    return elements.get(id);
  };

  const shell = element("shell");
  const registers = Object.fromEntries(
    ["n", "i", "PV", "PMT", "FV"].map((key) => [key, element(`register-${key}`)])
  );
  let clickHandler;

  shell.addEventListener = (type, handler) => {
    if (type === "click") clickHandler = handler;
  };

  const document = {
    querySelector(selector) {
      if (selector === "[data-hp12c]") return shell;
      const match = selector.match(/^\[data-register="(.+)"\]$/);
      return match ? registers[match[1]] : null;
    },
    getElementById: element,
    addEventListener() {},
  };

  const context = {
    document,
    console,
    Number,
    Math,
    Object,
    Array,
    String,
    Date,
  };
  if (timers) {
    context.setTimeout = (callback) => setTimeout(callback, 1);
    context.clearTimeout = clearTimeout;
  }
  vm.runInNewContext(fs.readFileSync("assets/js/hp12c.js", "utf8"), context);

  const press = (...keys) => {
    for (const key of keys.flat()) {
      clickHandler({
        target: {
          closest: () => ({ dataset: { key: String(key) } }),
        },
      });
    }
  };
  const type = (value) => press(...String(value).split(""));
  const enterPair = (y, x) => {
    type(y);
    press("ENTER");
    type(x);
    press("SIGMA");
  };

  return {
    display: element("hpDisplayValue"),
    status: element("hpStatus"),
    press,
    type,
    enterPair,
  };
}

test("reproduz a estimativa linear e o r do exemplo do manual da HP 12C", () => {
  const hp = createCalculator();
  const data = [
    [32, 17000],
    [40, 25000],
    [45, 26000],
    [40, 20000],
    [38, 21000],
    [50, 28000],
    [35, 15000],
  ];

  hp.press("f", "SST");
  data.forEach(([y, x]) => hp.enterPair(y, x));
  hp.type(48);
  hp.press("g", "1");

  assert.equal(hp.display.textContent, "28818.93");
  hp.press("XSWAP");
  assert.equal(hp.display.textContent, "0.90");
});

test("reproduz médias e desvios amostrais do exemplo estatístico do manual", () => {
  const hp = createCalculator();
  const data = [
    [32, 17000],
    [40, 25000],
    [45, 26000],
    [40, 20000],
    [38, 21000],
    [50, 28000],
    [35, 15000],
  ];

  hp.press("f", "SST");
  data.forEach(([y, x]) => hp.enterPair(y, x));

  hp.press("g", "0");
  assert.equal(hp.display.textContent, "21714.29");
  hp.press("XSWAP");
  assert.equal(hp.display.textContent, "40.00");

  hp.press("g", ".");
  assert.equal(hp.display.textContent, "4820.59");
  hp.press("XSWAP");
  assert.equal(hp.display.textContent, "6.03");
});

test("preserva a pilha para obter intercepto e inclinação pela sequência do manual", () => {
  const hp = createCalculator();
  const data = [
    [32, 17000],
    [40, 25000],
    [45, 26000],
    [40, 20000],
    [38, 21000],
    [50, 28000],
    [35, 15000],
  ];

  hp.press("f", "SST", "f", "6");
  data.forEach(([y, x]) => hp.enterPair(y, x));

  hp.type(0);
  hp.press("g", "2");
  assert.equal(hp.display.textContent, "15.549180");

  hp.type(1);
  hp.press("g", "2", "XSWAP", "RDOWN", "XSWAP", "-");
  assert.equal(hp.display.textContent, "0.001126");
});

test("reproduz as duas previsões do módulo oficial de correlação", () => {
  const hp = createCalculator();
  const data = [
    [3120, 12000],
    [2560, 10000],
    [2920, 11000],
    [3300, 14000],
    [2080, 9000],
    [2700, 10000],
    [3280, 13000],
    [3080, 12000],
  ];

  hp.press("f", "SST");
  data.forEach(([y, x]) => hp.enterPair(y, x));

  hp.type(12500);
  hp.press("g", "2");
  assert.equal(hp.display.textContent, "3140.38");

  hp.type(3520);
  hp.press("g", "1");
  assert.equal(hp.display.textContent, "14140.22");
});

test("calcula a média ponderada com item em y e peso em x", () => {
  const hp = createCalculator();

  hp.press("f", "SST");
  hp.enterPair(1.16, 15);
  hp.enterPair(1.24, 7);
  hp.enterPair(1.20, 10);
  hp.enterPair(1.18, 17);
  hp.press("g", "6");

  assert.equal(hp.display.textContent, "1.19");
});

test("mantém resultados grandes em formato decimal", () => {
  const hp = createCalculator();

  hp.type(10000000000);
  hp.press("ENTER");
  hp.type(100);
  hp.press("*");

  assert.equal(hp.display.textContent, "1000000000000.00");
  assert.doesNotMatch(hp.display.textContent, /e[+-]?\d+/i);
});

test("RCL exibe resíduos financeiros pequenos no formato FIX, sem expoente", () => {
  const hp = createCalculator();

  hp.type("0.00000000000131");
  hp.press("PV", "RCL", "PV");

  assert.equal(hp.display.textContent, "0.00");
  assert.doesNotMatch(hp.display.textContent, /e[+-]?\d+/i);
});

test("eleva a pilha automaticamente ao iniciar uma nova entrada", () => {
  const hp = createCalculator();

  hp.type(8);
  hp.press("ENTER");
  hp.type(5);
  hp.press("+");
  hp.type(3);
  hp.press("*");

  assert.equal(hp.display.textContent, "39.00");
});

test("grava, exibe e executa o programa básico do manual", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN");
  hp.press("ENTER", "2", "5", "PERCENT", "-", "5", "+");

  assert.equal(hp.display.textContent, "07-  40");
  hp.press("SST");
  assert.equal(hp.display.textContent, "08-  43, 33 00");

  hp.press("f", "RS");
  hp.type(200);
  hp.press("RS");

  assert.equal(hp.display.textContent, "155.00");
});

test("agrupa instruções de registro em uma única linha de programa", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN", "STO", "+", "1");
  assert.equal(hp.display.textContent, "01-  44 40 1");

  hp.press("RCL", ".", "4");
  assert.equal(hp.display.textContent, "02-  45 48 4");
});

test("GTO com ponto navega e a próxima entrada substitui a linha seguinte", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN");
  hp.press("ENTER", "2", "5", "PERCENT", "-", "5", "+");
  hp.press("g", "RDOWN", ".", "0", "1", "3");

  assert.equal(hp.display.textContent, "02-  3");

  hp.press("f", "RS");
  hp.type(200);
  hp.press("RS");
  assert.equal(hp.display.textContent, "135.00");
});

test("testes condicionais pulam a próxima linha e GTO executa laços", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN");
  hp.press("1", "-", "g", "CLX", "g", "RDOWN", "0", "6", "g", "RDOWN", "0", "1", "RS");
  hp.press("f", "RS");

  hp.type(3);
  hp.press("RS");

  assert.equal(hp.display.textContent, "0.00");
  assert.match(hp.status.textContent, /R\/S/);
});

test("R/S retoma na linha posterior à instrução de parada", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN");
  hp.press("2", "+", "RS", "3", "*");
  hp.press("f", "RS");

  hp.type(4);
  hp.press("RS");
  assert.equal(hp.display.textContent, "6.00");

  hp.press("RS");
  assert.equal(hp.display.textContent, "18.00");
});

test("g MEM usa o formato P-nn r-nn do manual", () => {
  const hp = createCalculator();

  hp.press("g", "9");
  assert.equal(hp.display.textContent, "P-08 r-20");
});

test("PSE exibe o resultado intermediário e depois retoma o programa", async () => {
  const hp = createCalculator({ timers: true });

  hp.press("f", "RS", "f", "RDOWN");
  hp.press("2", "+", "g", "RS", "3", "*");
  hp.press("f", "RS");
  hp.type(4);
  hp.press("RS");

  assert.equal(hp.display.textContent, "6.00");
  assert.match(hp.status.textContent, /PSE/);

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(hp.display.textContent, "18.00");
});
