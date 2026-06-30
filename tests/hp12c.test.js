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

test("AMORT no modo BEGIN trata a primeira prestação como imediata", () => {
  const hp = createCalculator();

  hp.type(10);
  hp.press("i");
  hp.type("190.9090909091");
  hp.press("PV");
  hp.type(100);
  hp.press("CHS", "PMT", "g", "7");

  hp.type(1);
  hp.press("f", "n");
  assert.equal(hp.display.textContent, "0.00");
  hp.press("XSWAP");
  assert.equal(hp.display.textContent, "-100.00");
  hp.press("RCL", "PV");
  assert.equal(hp.display.textContent, "90.91");

  hp.type(1);
  hp.press("f", "n");
  assert.equal(hp.display.textContent, "-9.09");
  hp.press("XSWAP");
  assert.equal(hp.display.textContent, "-90.91");
  hp.press("RCL", "PV");
  assert.equal(hp.display.textContent, "0.00");
  hp.press("RCL", "n");
  assert.equal(hp.display.textContent, "2.00");
});

test("AMORT no modo END continua cobrando juros antes da primeira prestação", () => {
  const hp = createCalculator();

  hp.type(10);
  hp.press("i");
  hp.type("173.5537190083");
  hp.press("PV");
  hp.type(100);
  hp.press("CHS", "PMT");

  hp.type(1);
  hp.press("f", "n");
  assert.equal(hp.display.textContent, "-17.36");
  hp.press("XSWAP");
  assert.equal(hp.display.textContent, "-82.64");
  hp.press("RCL", "PV");
  assert.equal(hp.display.textContent, "90.91");
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

test("grava CLEAR FIN e CLEAR Σ, mas não grava CLEAR REG", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN");
  hp.press("f", "XSWAP");
  assert.equal(hp.display.textContent, "01-  42 34");

  hp.press("f", "CLX");
  assert.equal(hp.display.textContent, "01-  42 34");

  hp.press("f", "SST");
  assert.equal(hp.display.textContent, "02-  42 32");
});

test("grava e executa RCL g i em uma única linha", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN", "RCL", "g", "i");
  assert.equal(hp.display.textContent, "01-  45 43 12");

  hp.press("f", "RS");
  hp.type(1.5);
  hp.press("RS");
  assert.equal(hp.display.textContent, "18.00");
});

test("f CLEAR PRGM em modo RUN reposiciona sem apagar o programa", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN", "2", "+");
  hp.press("f", "RS");
  hp.press("f", "RDOWN");

  hp.type(4);
  hp.press("RS");
  assert.equal(hp.display.textContent, "6.00");
});

test("BST na linha 00 volta para a última linha de memória alocada", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "g", "SST");
  assert.equal(hp.display.textContent, "08-  43, 33 00");
});

test("expansão da memória de programa converte R.9 e produz Error 6", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN");
  hp.press("1", "1", "1", "1", "1", "1", "1", "1", "1");
  hp.press("f", "RS");

  hp.type(7);
  hp.press("STO", ".", "9");
  assert.equal(hp.display.textContent, "Error 6");
  assert.match(hp.status.textContent, /Error 6/);
});

test("aceita as 17 linhas do programa de leasing publicado no manual", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN");
  hp.press(
    "g", "8",
    "f", "XSWAP",
    "RCL", "0",
    "RCL", "1",
    "-",
    "n",
    "RCL", "2",
    "PMT",
    "RCL", "3",
    "CHS",
    "RCL", "1",
    "RCL", "PMT",
    "*",
    "+",
    "PV",
    "i",
    "RCL", "g", "i"
  );

  assert.equal(hp.display.textContent, "17-  45 43 12");
  hp.press("f", "RS", "g", "9");
  assert.equal(hp.display.textContent, "P-22 r-18");
});

test("executa o programa de leasing do manual e obtém 17,33% ao ano", () => {
  const hp = createCalculator();

  hp.press("f", "RS", "f", "RDOWN");
  hp.press(
    "g", "8",
    "f", "XSWAP",
    "RCL", "0",
    "RCL", "1",
    "-",
    "n",
    "RCL", "2",
    "PMT",
    "RCL", "3",
    "CHS",
    "RCL", "1",
    "RCL", "PMT",
    "*",
    "+",
    "PV",
    "i",
    "RCL", "g", "i"
  );
  hp.press("f", "RS");

  hp.type(60);
  hp.press("STO", "0");
  hp.type(3);
  hp.press("STO", "1");
  hp.type(600);
  hp.press("STO", "2");
  hp.type(25000);
  hp.press("STO", "3", "RS");

  assert.equal(hp.display.textContent, "17.33");
});
