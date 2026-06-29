const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function createCalculator() {
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

  vm.runInNewContext(fs.readFileSync("assets/js/hp12c.js", "utf8"), {
    document,
    console,
    Number,
    Math,
    Object,
    Array,
    String,
    Date,
  });

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
