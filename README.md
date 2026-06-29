# Matemática Financeira Interativa

Portal educacional, estático e responsivo para apoiar aulas de Matemática Financeira. O projeto reúne explicações conceituais, fórmulas, exemplos resolvidos, exercícios e simuladores executados inteiramente no navegador.

## Autoria e contato

Projeto desenvolvido pelo **Professor Douglas de Almeida Ribeiro**.

Contato: [douglasdealmeidaribeiro@gmail.com](mailto:douglasdealmeidaribeiro@gmail.com)

## Módulos

1. Juros Simples
2. Juros Compostos
3. Planos de Amortização
4. Taxas Nominal, Efetiva, Equivalente e Real
5. Séries Uniformes Diferidas
6. Previdência com Séries Uniformes
7. Desconto Comercial Simples
8. Equivalência de Fluxos de Caixa
9. Valor Presente Líquido
10. Simulador didático da HP 12C

## Estrutura

```text
.
├── index.html
├── README.md
├── assets/
│   ├── css/styles.css
│   ├── img/
│   └── js/
│       ├── common.js
│       ├── finance.js
│       ├── simuladores.js
│       └── hp12c.js
└── pages/
    ├── juros-simples.html
    ├── juros-compostos.html
    ├── amortizacao.html
    ├── taxas.html
    ├── series-diferidas.html
    ├── previdencia.html
    ├── desconto-comercial.html
    ├── equivalencia-fluxos.html
    ├── vpl.html
    └── hp12c.html
```

## Como executar

Não há etapa de build nem dependências.

- Abra `index.html` diretamente em um navegador; ou
- use a extensão Live Server no VS Code; ou
- na pasta do projeto, execute `python -m http.server 8000` e acesse `http://localhost:8000`.

## Publicação no GitHub Pages

1. Envie os arquivos para um repositório no GitHub.
2. Abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Selecione a branch (normalmente `main`) e a pasta `/ (root)`.
5. Salve e aguarde a URL de publicação.

Todos os caminhos são relativos, portanto o portal funciona tanto em domínio de usuário quanto em subdiretório de projeto.

## Tecnologias

- HTML5 semântico
- CSS responsivo
- JavaScript puro
- `Intl.NumberFormat` para moeda e percentuais no padrão brasileiro

## Observação

Este projeto é educacional. Resultados de simuladores são aproximações matemáticas e não substituem contratos, regulamentos ou orientação financeira profissional.
