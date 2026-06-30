const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

test("carrega o Google Analytics uma única vez em todas as páginas", () => {
  const appendedScripts = [];
  const document = {
    body: { dataset: { root: ".", page: "home" } },
    head: {
      appendChild(script) {
        appendedScripts.push(script);
      },
    },
    createElement(tagName) {
      return { tagName, dataset: {} };
    },
    querySelector(selector) {
      if (selector === "script[data-google-analytics]") {
        return appendedScripts.find((script) => script.dataset.googleAnalytics) || null;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
  };
  const window = {};
  const context = { document, window, Date };
  const source = fs.readFileSync("assets/js/common.js", "utf8");

  vm.runInNewContext(source, context);
  vm.runInNewContext(source, context);

  assert.equal(appendedScripts.length, 1);
  assert.equal(appendedScripts[0].async, true);
  assert.equal(appendedScripts[0].dataset.googleAnalytics, "G-ZMBRCR3HDB");
  assert.equal(
    appendedScripts[0].src,
    "https://www.googletagmanager.com/gtag/js?id=G-ZMBRCR3HDB"
  );
  assert.equal(window.dataLayer.length, 2);
  assert.equal(window.dataLayer[0][0], "js");
  assert.equal(window.dataLayer[1][0], "config");
  assert.equal(window.dataLayer[1][1], "G-ZMBRCR3HDB");
});
