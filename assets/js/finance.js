(function (global) {
  "use strict";
  const EPSILON = 1e-10;
  const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const formatCurrencyBRL = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  const formatPercentBR = (value, decimals = 2) => `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format((Number(value) || 0) * 100)}%`;

  function parseNumberBR(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    let text = String(value ?? "").trim().replace(/\s/g, "").replace(/R\$|%/g, "");
    if (!text) return NaN;
    if (text.includes(",") && text.includes(".")) {
      text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
    } else if (text.includes(",")) {
      text = text.replace(/\./g, "").replace(",", ".");
    }
    return Number(text);
  }
  const jurosSimples = (capital, taxa, prazo) => capital * taxa * prazo;
  const montanteSimples = (capital, taxa, prazo) => capital * (1 + taxa * prazo);
  const montanteComposto = (capital, taxa, prazo) => capital * ((1 + taxa) ** prazo);
  const taxaEquivalente = (taxa, periodosOrigem, periodosDestino) => ((1 + taxa) ** (periodosOrigem / periodosDestino)) - 1;
  const taxaReal = (taxaNominal, inflacao) => ((1 + taxaNominal) / (1 + inflacao)) - 1;
  const valorPresenteSerieUniforme = (pmt, taxa, periodos) => Math.abs(taxa) < EPSILON ? pmt * periodos : pmt * (1 - (1 + taxa) ** (-periodos)) / taxa;
  const valorFuturoSerieUniforme = (pmt, taxa, periodos) => Math.abs(taxa) < EPSILON ? pmt * periodos : pmt * (((1 + taxa) ** periodos) - 1) / taxa;
  const valorPresenteSerieDiferida = (pmt, taxa, periodos, carencia) => valorPresenteSerieUniforme(pmt, taxa, periodos) * ((1 + taxa) ** (-carencia));
  const descontoComercial = (valorNominal, taxa, prazo) => ({ desconto: valorNominal * taxa * prazo, valorAtual: valorNominal * (1 - taxa * prazo) });
  const vpl = (investimentoInicial, taxa, fluxos) => fluxos.reduce((total, fluxo, index) => total + fluxo / ((1 + taxa) ** (index + 1)), -investimentoInicial);

  function tir(investimentoInicial, fluxos) {
    const cash = [-investimentoInicial, ...fluxos];
    const npv = (rate) => cash.reduce((sum, flow, t) => sum + flow / ((1 + rate) ** t), 0);
    let low = -0.9999, high = 1;
    let fLow = npv(low), fHigh = npv(high);
    while (fLow * fHigh > 0 && high < 1e6) { high *= 2; fHigh = npv(high); }
    if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) return null;
    for (let i = 0; i < 200; i += 1) {
      const mid = (low + high) / 2, fMid = npv(mid);
      if (Math.abs(fMid) < 1e-8) return mid;
      if (fLow * fMid <= 0) { high = mid; } else { low = mid; fLow = fMid; }
    }
    return (low + high) / 2;
  }
  function summarize(table) {
    return {
      initialInstallment: table[0]?.installment || 0,
      finalInstallment: table.at(-1)?.installment || 0,
      totalPaid: table.reduce((sum, row) => sum + row.installment, 0),
      totalInterest: table.reduce((sum, row) => sum + row.interest, 0)
    };
  }
  function row(period, initialBalance, interest, amortization, installment, remainingBalance) {
    return { period, initialBalance: round2(initialBalance), interest: round2(interest), amortization: round2(amortization), installment: round2(installment), remainingBalance: round2(Math.max(0, remainingBalance)) };
  }
  function parcelaUnica(valor, taxa, prazo) {
    const table = []; let balance = valor;
    for (let p = 1; p <= prazo; p += 1) {
      const interest = balance * taxa;
      const installment = p === prazo ? balance + interest : 0;
      const amortization = p === prazo ? balance : -interest;
      const finalBalance = p === prazo ? 0 : balance + interest;
      table.push(row(p, balance, interest, amortization, installment, finalBalance)); balance = finalBalance;
    }
    return { name: "Plano A", description: "Parcela única no final, com juros capitalizados.", table, summary: summarize(table) };
  }
  function jurosPeriodicos(valor, taxa, prazo) {
    const table = [];
    for (let p = 1; p <= prazo; p += 1) {
      const interest = valor * taxa, amortization = p === prazo ? valor : 0;
      table.push(row(p, valor, interest, amortization, interest + amortization, p === prazo ? 0 : valor));
    }
    return { name: "Plano B", description: "Juros pagos periodicamente e principal no vencimento.", table, summary: summarize(table) };
  }
  function sac(valor, taxa, prazo) {
    const table = []; let balance = valor; const amortBase = valor / prazo;
    for (let p = 1; p <= prazo; p += 1) {
      const interest = balance * taxa, amortization = p === prazo ? balance : amortBase;
      table.push(row(p, balance, interest, amortization, interest + amortization, balance - amortization)); balance -= amortization;
    }
    return { name: "Plano C", description: "Sistema de Amortização Constante (SAC).", table, summary: summarize(table) };
  }
  function pricePostecipada(valor, taxa, prazo) {
    const table = []; let balance = valor;
    const payment = Math.abs(taxa) < EPSILON ? valor / prazo : valor * taxa / (1 - (1 + taxa) ** (-prazo));
    for (let p = 1; p <= prazo; p += 1) {
      const interest = balance * taxa, amortization = p === prazo ? balance : payment - interest;
      const installment = p === prazo ? interest + amortization : payment;
      table.push(row(p, balance, interest, amortization, installment, balance - amortization)); balance -= amortization;
    }
    return { name: "Plano D", description: "Price postecipado: parcelas iguais ao fim de cada período.", table, summary: summarize(table) };
  }
  function priceAntecipada(valor, taxa, prazo) {
    const table = []; let balance = valor;
    const postPayment = Math.abs(taxa) < EPSILON ? valor / prazo : valor * taxa / (1 - (1 + taxa) ** (-prazo));
    const payment = Math.abs(taxa) < EPSILON ? postPayment : postPayment / (1 + taxa);
    let amortization = Math.min(payment, balance);
    table.push(row(0, balance, 0, amortization, amortization, balance - amortization)); balance -= amortization;
    for (let p = 1; p < prazo; p += 1) {
      const interest = balance * taxa;
      amortization = p === prazo - 1 ? balance : payment - interest;
      const installment = p === prazo - 1 ? interest + amortization : payment;
      table.push(row(p, balance, interest, amortization, installment, balance - amortization)); balance -= amortization;
    }
    return { name: "Plano E", description: "Price antecipado: primeira parcela paga no ato.", table, summary: summarize(table) };
  }

  global.FinanceMath = {
    round2, formatCurrencyBRL, formatPercentBR, parseNumberBR, jurosSimples, montanteSimples,
    montanteComposto, taxaEquivalente, taxaReal, valorPresenteSerieUniforme,
    valorFuturoSerieUniforme, valorPresenteSerieDiferida, descontoComercial, vpl, tir,
    parcelaUnica, jurosPeriodicos, sac, pricePostecipada, priceAntecipada
  };
})(window);
