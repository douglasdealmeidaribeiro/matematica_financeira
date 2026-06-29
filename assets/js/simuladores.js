(function () {
  "use strict";
  const F = window.FinanceMath;
  const simulator = document.querySelector("[data-simulator]");
  if (!simulator || !F) return;
  const kind = simulator.dataset.simulator;
  const form = simulator.querySelector("form");
  const result = simulator.querySelector(".result-area");
  const error = simulator.querySelector(".error-message");
  const val = (id) => F.parseNumberBR(document.getElementById(id)?.value);
  const percent = (id) => val(id) / 100;
  const money = F.formatCurrencyBRL;
  const pct = F.formatPercentBR;
  const finite = (...values) => values.every(Number.isFinite);
  const card = (label, value, style = "") => `<div class="result-card ${style}"><span>${label}</span><strong>${value}</strong></div>`;
  const showError = (message) => { error.textContent = message; result.innerHTML = ""; };
  const clearError = () => { error.textContent = ""; };
  const table = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const bind = (handler) => form?.addEventListener("submit", (event) => {
    event.preventDefault(); clearError();
    try { handler(); } catch (exception) { showError(exception.message || "Não foi possível realizar o cálculo."); }
  });
  const requirePositive = (values, message = "Preencha todos os campos com valores maiores que zero.") => {
    if (!finite(...values) || values.some((value) => value <= 0)) throw new Error(message);
  };

  function simpleInterest() {
    const capital = val("capital"), rate = percent("taxa"), periods = val("periodos");
    requirePositive([capital, periods]); if (!Number.isFinite(rate) || rate < 0) throw new Error("Informe uma taxa válida.");
    const rateUnit = document.getElementById("unidadeTaxa").value;
    const timeUnit = document.getElementById("unidadeTempo").value;
    const factors = { dia: 1, mes: 30, ano: 360 };
    const adjustedPeriods = periods * factors[timeUnit] / factors[rateUnit];
    const interest = F.jurosSimples(capital, rate, adjustedPeriods), amount = capital + interest;
    const maxRows = Math.min(Math.ceil(adjustedPeriods), 360);
    const rows = Array.from({ length: maxRows }, (_, index) => {
      const p = Math.min(index + 1, adjustedPeriods);
      return [p.toLocaleString("pt-BR"), money(capital), money(capital * rate * p), money(F.montanteSimples(capital, rate, p))];
    });
    result.innerHTML = `<div class="result-grid">${card("Juros", money(interest))}${card("Montante", money(amount), "success")}${card("Prazo equivalente", `${adjustedPeriods.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${rateUnit}(es)`)}</div>${table(["Período", "Capital", "Juros acumulados", "Montante"], rows)}`;
  }

  function compoundInterest() {
    const capital = val("capital"), rate = percent("taxa"), periods = Math.trunc(val("periodos")), contribution = val("aporte") || 0;
    requirePositive([capital, periods]); if (!Number.isFinite(rate) || rate < 0 || contribution < 0) throw new Error("Informe taxa e aporte válidos.");
    let balance = capital, totalContributed = capital; const rows = [];
    for (let p = 1; p <= periods; p += 1) {
      const opening = balance, interest = opening * rate;
      balance = opening + interest + contribution; totalContributed += contribution;
      rows.push([p, money(opening), money(interest), money(contribution), money(balance)]);
    }
    const simple = F.montanteSimples(capital, rate, periods) + contribution * periods;
    result.innerHTML = `<div class="result-grid">${card("Montante final", money(balance), "success")}${card("Juros acumulados", money(balance - totalContributed))}${card("Total aportado", money(totalContributed))}</div>
      <div class="comparison-bars"><div class="bar-row"><span>Juros simples*</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, simple / balance * 100)}%"></div></div><strong>${money(simple)}</strong></div><div class="bar-row"><span>Compostos</span><div class="bar-track"><div class="bar-fill" style="width:100%"></div></div><strong>${money(balance)}</strong></div></div>
      <small>*Comparação simplificada: os aportes não rendem no cenário simples.</small>${table(["Período", "Saldo inicial", "Juros", "Aporte", "Saldo final"], rows)}`;
  }

  let amortizationPlans = [];
  function amortization() {
    const principal = val("valor"), periods = Math.trunc(val("prazo")), rate = percent("taxa");
    requirePositive([principal, periods]); if (!Number.isFinite(rate) || rate < 0) throw new Error("Informe uma taxa mensal válida.");
    amortizationPlans = [F.parcelaUnica(principal, rate, periods), F.jurosPeriodicos(principal, rate, periods), F.sac(principal, rate, periods), F.pricePostecipada(principal, rate, periods), F.priceAntecipada(principal, rate, periods)];
    renderPlan(0);
    const tabs = document.getElementById("planTabs");
    tabs.innerHTML = amortizationPlans.map((plan, index) => `<button type="button" data-plan="${index}" class="${index === 0 ? "active" : ""}">${plan.name}</button>`).join("");
    tabs.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      tabs.querySelectorAll("button").forEach((item) => item.classList.remove("active")); button.classList.add("active"); renderPlan(Number(button.dataset.plan));
    }));
    const max = Math.max(...amortizationPlans.map((plan) => plan.summary.totalPaid));
    document.getElementById("planComparison").innerHTML = `<h4>Comparação do total pago</h4><div class="comparison-bars">${amortizationPlans.map((plan) => `<div class="bar-row"><span>${plan.name}</span><div class="bar-track"><div class="bar-fill" style="width:${plan.summary.totalPaid / max * 100}%"></div></div><strong>${money(plan.summary.totalPaid)}</strong></div>`).join("")}</div>`;
  }
  function renderPlan(index) {
    const plan = amortizationPlans[index]; if (!plan) return;
    result.innerHTML = `<p><strong>${plan.name}:</strong> ${plan.description}</p><div class="result-grid">${card("Primeira parcela", money(plan.summary.initialInstallment))}${card("Última parcela", money(plan.summary.finalInstallment))}${card("Juros totais", money(plan.summary.totalInterest))}${card("Total pago", money(plan.summary.totalPaid), "success")}</div>
      ${table(["N", "Saldo inicial", "Juros", "Amortização", "Parcela", "Saldo final"], plan.table.map((r) => [r.period, money(r.initialBalance), money(r.interest), money(r.amortization), money(r.installment), money(r.remainingBalance)]))}
      <div class="button-row"><button class="btn btn-secondary" type="button" id="exportPlan">Exportar ${plan.name} em CSV</button></div>`;
    document.getElementById("exportPlan").addEventListener("click", () => exportPlan(plan));
  }
  function exportPlan(plan) {
    const lines = [["Plano", "Período", "Saldo inicial", "Juros", "Amortização", "Parcela", "Saldo final"], ...plan.table.map((r) => [plan.name, r.period, r.initialBalance, r.interest, r.amortization, r.installment, r.remainingBalance])];
    downloadCsv(lines, `${plan.name.toLowerCase().replace(" ", "-")}.csv`);
  }
  function exportAllPlans() {
    const header = ["Plano", "Período", "Saldo inicial", "Juros", "Amortização", "Parcela", "Saldo final"];
    const lines = [header, ...amortizationPlans.flatMap((plan) => plan.table.map((r) => [plan.name, r.period, r.initialBalance, r.interest, r.amortization, r.installment, r.remainingBalance]))];
    downloadCsv(lines, "comparativo-planos-amortizacao.csv");
  }
  function downloadCsv(lines, filename) {
    const csv = "\ufeff" + lines.map((line) => line.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
  }

  function rates() {
    const mode = document.getElementById("tipoConversao").value, rate = percent("taxa"), inflation = percent("inflacao");
    if (!Number.isFinite(rate) || rate <= -1) throw new Error("Informe uma taxa válida.");
    let converted, label, detail;
    if (mode === "mensal-anual") { converted = (1 + rate) ** 12 - 1; label = "Taxa efetiva anual"; detail = "(1 + iₘ)¹² − 1"; }
    else if (mode === "anual-mensal") { converted = (1 + rate) ** (1 / 12) - 1; label = "Taxa equivalente mensal"; detail = "(1 + iₐ)¹⁄¹² − 1"; }
    else if (mode === "nominal-efetiva") {
      const k = Math.trunc(val("capitalizacoes")); requirePositive([k], "Informe o número de capitalizações.");
      converted = (1 + rate / k) ** k - 1; label = "Taxa efetiva do período"; detail = `(1 + iₙ/${k})^${k} − 1`;
    } else {
      if (!Number.isFinite(inflation) || inflation <= -1) throw new Error("Informe a inflação.");
      converted = F.taxaReal(rate, inflation); label = "Taxa real"; detail = "(1 + taxa) / (1 + inflação) − 1";
    }
    result.innerHTML = `<div class="result-grid">${card("Taxa informada", pct(rate))}${card(label, pct(converted), converted >= 0 ? "success" : "danger")}${card("Fator", (1 + converted).toLocaleString("pt-BR", { maximumFractionDigits: 6 }))}</div><p class="calculation">${detail}</p>`;
  }

  function deferredSeries() {
    const payment = val("prestacao"), rate = percent("taxa"), periods = Math.trunc(val("parcelas")), grace = Math.trunc(val("carencia")), type = document.getElementById("tipoCalculo").value;
    requirePositive([payment, periods]); if (!finite(rate, grace) || rate < 0 || grace < 0) throw new Error("Informe taxa e carência válidas.");
    const pv = F.valorPresenteSerieDiferida(payment, rate, periods, grace);
    const fv = F.valorFuturoSerieUniforme(payment, rate, periods) * ((1 + rate) ** grace);
    const value = type === "pv" ? pv : fv;
    result.innerHTML = `<div class="result-grid">${card(type === "pv" ? "Valor presente" : "Valor futuro", money(value), "success")}${card("Total nominal", money(payment * periods))}${card("Carência", `${grace} período(s)`)}</div><p class="calculation">${type === "pv" ? "PV = PMT × [1 − (1 + i)⁻ⁿ] / i × (1 + i)⁻ᵏ" : "FV na data focal = PMT × [(1 + i)ⁿ − 1] / i × (1 + i)ᵏ"}</p>`;
  }

  function pension() {
    const payment = val("aporte"), initial = val("inicial") || 0, informedRate = percent("taxa"), years = val("anos"), incomeYears = val("anosRenda"), incomeRate = percent("taxaRenda");
    const contributionRate = document.getElementById("unidadeTaxa").value === "anual" ? ((1 + informedRate) ** (1 / 12)) - 1 : informedRate;
    requirePositive([payment, years, incomeYears]); if (!finite(initial, contributionRate, incomeRate) || initial < 0 || contributionRate < 0 || incomeRate < 0) throw new Error("Revise as taxas e o investimento inicial.");
    const months = Math.round(years * 12), incomeMonths = Math.round(incomeYears * 12);
    const accumulated = initial * ((1 + contributionRate) ** months) + F.valorFuturoSerieUniforme(payment, contributionRate, months);
    const total = initial + payment * months, income = incomeRate === 0 ? accumulated / incomeMonths : accumulated * incomeRate / (1 - (1 + incomeRate) ** (-incomeMonths));
    result.innerHTML = `<div class="result-grid">${card("Saldo acumulado", money(accumulated), "success")}${card("Total aportado", money(total))}${card("Rendimentos", money(accumulated - total))}${card("Renda mensal estimada", money(income), "success")}${card("Contribuições", `${months} meses`)}${card("Recebimentos", `${incomeMonths} meses`)}</div><div class="callout info"><span>ⓘ</span><div>Estimativa sem impostos, taxas administrativas ou inflação. A renda consome o saldo ao longo do prazo informado.</div></div>`;
  }

  function discount() {
    const nominal = val("nominal"), rate = percent("taxa"), periods = val("prazo");
    requirePositive([nominal, periods]); if (!Number.isFinite(rate) || rate < 0) throw new Error("Informe uma taxa válida.");
    const data = F.descontoComercial(nominal, rate, periods);
    if (data.valorAtual <= 0) throw new Error("A taxa multiplicada pelo prazo deve ser menor que 100%.");
    const effective = data.desconto / data.valorAtual;
    result.innerHTML = `<div class="result-grid">${card("Desconto comercial", money(data.desconto))}${card("Valor atual líquido", money(data.valorAtual), "success")}${card("Custo efetivo sobre o líquido", pct(effective))}</div><p class="calculation">A = ${money(nominal)} × (1 − ${rate.toLocaleString("pt-BR")} × ${periods.toLocaleString("pt-BR")}) = ${money(data.valorAtual)}</p>`;
  }

  function focalValue(rows, rate, focal) {
    return rows.reduce((sum, item) => sum + item.value * ((1 + rate) ** (focal - item.period)), 0);
  }
  const getFlows = (containerId) => Array.from(document.querySelectorAll(`#${containerId} .dynamic-row`)).map((row) => ({
    period: F.parseNumberBR(row.querySelector("[data-period]").value), value: F.parseNumberBR(row.querySelector("[data-value]").value)
  }));
  function equivalence() {
    const rate = percent("taxa"), focal = val("dataFocal"), a = getFlows("fluxoA"), b = getFlows("fluxoB");
    if (!finite(rate, focal) || rate <= -1) throw new Error("Informe taxa e data focal válidas.");
    if ([...a, ...b].some((item) => !finite(item.period, item.value))) throw new Error("Preencha todos os fluxos.");
    const valueA = focalValue(a, rate, focal), valueB = focalValue(b, rate, focal), difference = valueA - valueB;
    const tolerance = Math.max(0.01, Math.max(Math.abs(valueA), Math.abs(valueB)) * 0.0001);
    const equivalent = Math.abs(difference) <= tolerance;
    result.innerHTML = `<div class="result-grid">${card("Fluxo A na data focal", money(valueA))}${card("Fluxo B na data focal", money(valueB))}${card("Diferença A − B", money(difference), equivalent ? "success" : "danger")}</div><div class="callout ${equivalent ? "info" : ""}"><span>${equivalent ? "✓" : "ⓘ"}</span><div><strong>${equivalent ? "Os fluxos são equivalentes" : "Os fluxos não são equivalentes"}</strong> na data focal ${focal}, considerando tolerância de ${money(tolerance)}.</div></div>`;
  }
  function addDynamicRow(container, period = "", value = "") {
    const row = document.createElement("div"); row.className = "dynamic-row";
    row.innerHTML = `<div class="field"><label>Período</label><input data-period inputmode="decimal" value="${period}" aria-label="Período do fluxo"></div><div class="field"><label>Valor (R$)</label><input data-value inputmode="decimal" value="${value}" aria-label="Valor do fluxo"></div><button class="btn btn-danger" type="button" aria-label="Remover fluxo">Remover</button>`;
    row.querySelector("button").addEventListener("click", () => { if (container.children.length > 1) row.remove(); });
    container.appendChild(row);
  }

  function netPresentValue() {
    const initial = val("investimento"), rate = percent("taxa"), flows = Array.from(document.querySelectorAll("#vplFluxos .dynamic-row")).map((row) => F.parseNumberBR(row.querySelector("[data-value]").value));
    requirePositive([initial]); if (!Number.isFinite(rate) || rate <= -1 || flows.some((flow) => !Number.isFinite(flow))) throw new Error("Informe a taxa e todos os fluxos.");
    const net = F.vpl(initial, rate, flows), irr = F.tir(initial, flows);
    const pvs = flows.map((flow, index) => flow / ((1 + rate) ** (index + 1)));
    const style = Math.abs(net) < 0.005 ? "" : net > 0 ? "success" : "danger";
    const decision = Math.abs(net) < 0.005 ? "Indiferente: VPL igual a zero." : net > 0 ? "Projeto financeiramente atrativo." : "Projeto não atrativo sob a taxa informada.";
    result.innerHTML = `<div class="result-grid">${card("VPL", money(net), style)}${card("Fluxos nominais", money(flows.reduce((a, b) => a + b, 0)))}${card("TIR estimada", irr === null ? "Não encontrada" : pct(irr))}</div><div class="callout ${net >= 0 ? "info" : ""}"><span>${net >= 0 ? "✓" : "!"}</span><div><strong>${decision}</strong></div></div>${table(["Período", "Fluxo nominal", "Valor presente"], flows.map((flow, index) => [index + 1, money(flow), money(pvs[index])]))}`;
  }

  const handlers = { "juros-simples": simpleInterest, "juros-compostos": compoundInterest, amortizacao: amortization, taxas: rates, "series-diferidas": deferredSeries, previdencia: pension, "desconto-comercial": discount, "equivalencia-fluxos": equivalence, vpl: netPresentValue };
  bind(handlers[kind]);

  if (kind === "taxas") {
    const type = document.getElementById("tipoConversao"), nominal = document.getElementById("campoCapitalizacoes"), inflation = document.getElementById("campoInflacao");
    const toggle = () => { nominal.hidden = type.value !== "nominal-efetiva"; inflation.hidden = type.value !== "real"; };
    type.addEventListener("change", toggle); toggle();
  }
  if (kind === "equivalencia-fluxos") {
    [["fluxoA", 0, 1000], ["fluxoA", 2, 500], ["fluxoB", 1, 800], ["fluxoB", 3, 800]].forEach(([id, p, v]) => addDynamicRow(document.getElementById(id), p, v));
    document.querySelectorAll("[data-add-flow]").forEach((button) => button.addEventListener("click", () => addDynamicRow(document.getElementById(button.dataset.addFlow))));
  }
  if (kind === "vpl") {
    [3000, 3500, 4200].forEach((value, index) => addDynamicRow(document.getElementById("vplFluxos"), index + 1, value));
    document.querySelector("[data-add-vpl]").addEventListener("click", () => addDynamicRow(document.getElementById("vplFluxos"), document.getElementById("vplFluxos").children.length + 1, ""));
  }
  if (kind === "amortizacao") {
    document.getElementById("exportAllPlans").addEventListener("click", exportAllPlans);
  }
  form?.requestSubmit();
})();
