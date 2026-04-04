# Precificação — Recovery Engine Brasil

Documento de apoio com **pesquisa de mercado**, **lógica de preços** e **checagem de vendibilidade** dos planos. Complementa `PROJETO.md` (produto e regras técnicas), sem substituir definição fiscal/contábil.

**Valores atuais na LP** (`recovery-engine`): Essencial **R$ 497**, Growth **R$ 997**, Scale **R$ 1.997** (mensal); anual com desconto de **20%** sobre o total vs. 12× mensalidades.

---

## 1. Público-alvo (contexto)

- **SaaS B2B** para **infoprodutores** (vários tenants isolados por `tenant_id`).
- Integrações típicas: webhooks de plataformas (ex.: Hotmart, Kiwify, Hubla), recuperação via canais como WhatsApp, registro de **recuperações** atribuíveis.
- Dor central: **falha de pagamento**, abandono, **pagamento recusado** — receita que não entra sem ação.

---

## 2. Pesquisa na internet — achados úteis para narrativa e faixas

> Uso: **posicionamento** e **simulações** com faixas; não substitui métricas próprias do produto nem promessa de resultado.

### 2.1 Creator economy / infoprodutos (Brasil)

- Estudo **FGV em parceria com a Hotmart** (citado em matéria no Valor): crescimento de **30%** em 12 meses no número de **trabalhos diretos e indiretos** na Creator Economy; **42%** dos entrevistados afirmaram que a **venda de produtos digitais é a principal fonte de renda**.
- Fonte: [Valor Econômico (Dino), abr/2025](https://valor.globo.com/patrocinado/dino/noticia/2025/04/04/mercado-de-mkt-digital-cresce-30-no-brasil-em-12-meses.ghtml)

**Implicação para precificação:** parcela relevante do público **depende da receita digital** — software que recupera dinheiro pode ser precificado como **B2B de resultado**, não como ferramenta de hobby.

### 2.2 Pagamentos recusados e checkout (e-commerce Brasil)

- **Konduto** (citada no E-Commerce Brasil): taxa média de **transações recusadas** entre **15% e 25%** das tentativas de pagamento no e-commerce brasileiro.
- **ClearSale** (mesmo artigo): entre **20% e 30%** das transações recusadas por suspeita de fraude podem ser **falsos positivos** (cliente legítimo barrado).

Fonte: [E-Commerce Brasil — Pagamento recusado](https://www.ecommercebrasil.com.br/artigos/pagamento-recusado-por-que-voce-esta-perdendo-vendas)

**Implicação:** existe **vazamento estrutural** no pagamento; **retentativa**, **alternativa (ex.: Pix)** e **comunicação** (e-mail/WhatsApp) são narrativas alinhadas ao mercado.

**Ressalva:** dados são de **e-commerce** em geral; o infoprodutor em checkout próprio pode ter distribuição diferente — usar como **faixa**, não como número garantido por cliente.

### 2.3 Concorrência e ecossistema

- Plataformas como a **Hotmart** tratam **abandono de carrinho** e relatórios de recuperação na documentação oficial — o comportamento é reconhecido pelo mercado.
- Há oferta de conteúdo e integrações (WhatsApp, automação) para recuperação — **demanda** existe; diferenciação vem de **produto** (motor, multi-tenant, compliance, escala).

---

## 3. Lógica de precificação (sem dados próprios ainda)

### 3.1 Camadas

1. **Piso (custo de servir):** infra, filas, WhatsApp/API, suporte, impostos, inadimplência. O preço do plano deve cobrir isso com margem no **perfil de uso** daquele tier.
2. **Teto (valor percebido):** fração aceitável da **receita incremental recuperada** que o cliente aceita pagar como “taxa da ferramenta” (heurística comum em SaaS de receita: muitas operações miram **~5–15%** do incremental — referência de mercado, não regra fixa).
3. **Paridade com % sobre recuperado:** se no futuro houver **performance fee**, a mensalidade pode ser traduzida em **% implícito** sobre o recuperado esperado.

### 3.2 Fórmula prática (% implícito)

\[
\text{\% implícito} = \frac{\text{mensalidade}}{\text{recuperado mensal esperado (atribuído)}}
\]

**Faixas de taxa-alvo (heurística interna):**

| Plano   | Faixa sugerida (% do recuperado) |
|---------|-----------------------------------|
| Essencial | 8% a 15% (mensalidade menor, % maior) |
| Growth    | 5% a 10% |
| Scale     | 3% a 7% (+ mínimo contratual / overage) |

### 3.3 Ancoragem nos valores atuais da LP

Quanto o cliente precisaria **recuperar por mês** para a mensalidade equivaler a **~8%** ou **~10%** do recuperado (ordem de grandeza):

| Mensalidade | ~8% implícito | ~10% implícito |
|-------------|---------------|----------------|
| R$ 497      | ~R$ 6,2 mil   | ~R$ 5,0 mil    |
| R$ 997      | ~R$ 12,5 mil  | ~R$ 10,0 mil   |
| R$ 1.997    | ~R$ 25,0 mil  | ~R$ 20,0 mil   |

**Uso:** se o ICP típico **não** consegue enxergar **recuperação atribuída** nessa ordem, ou o discurso de valor está fraco, ou o tier/preço não combina com o segmento.

### 3.4 “Vazamento” teórico × pesquisa (15–25%)

Conceito para **simulações** na LP (sem afirmar taxa única por cliente):

\[
\text{Vazamento bruto (ordem de grandeza)} \approx \text{GMV mensal} \times (15\%\text{ a }25\%)
\]

Nem todo vazamento vira recuperação; serve para dimensionar **dor** compatível com a pesquisa de mercado.

**Exemplo ilustrativo:** GMV **R$ 100 mil/mês** → vazamento conceitual **R$ 15 mil–25 mil/mês**. Se a ferramenta ajudar a converter **10–20%** desse vazamento, recuperado **R$ 1,5 mil–5 mil/mês** — faixa onde **R$ 497** pode ser narrado com mais facilidade que **R$ 997**, dependendo do caso.

---

## 4. Os três planos — recomendações

1. Manter a **escada** (~2× entre tiers) alinhada a **limites de uso** (recuperações/mês, domínios, SLA) — coerente com a LP.
2. **Essencial:** entrada para volume moderado; messaging focado em quem já perde valor relevante no pagamento.
3. **Growth:** âncora principal (“mais escolhido”); exige ROI claro na página e na demo.
4. **Scale:** manter **contato com vendas** + **mínimo / overage** ao estourar franquia — evita subsidir grandes volumes com preço de PME.
5. **Opcional:** híbrido **mensal + % sobre recuperado** ou **% com piso** no enterprise — alinha incentivo quando houver medição confiável de recuperação.

---

## 5. Os valores atuais são vendíveis?

**Sim, podem ser vendíveis**, desde que:

1. **ICP certo:** infoprodutor (ou operação) com **volume e ticket** que gerem **falha/abandono relevante em valor** (tipicamente **vários milhares de reais por mês** “na mesa”), não apenas “quer testar”.
2. **Prova de valor:** problema grande (faixas de mercado) + o que o produto faz + **limites do plano**; sem isso, preço premium **parece alto**.

**Onde costuma falhar:** base muito pequena ou sem dor clara — até **R$ 497** pode parecer cara. Mitigação: **qualificação**, piloto com desconto contra compromisso de métricas, ou entrada mais baixa só se fizer sentido estratégico.

**Resumo:** para o **segmento certo** e **história de ROI**, os valores são **compatíveis com SaaS B2B de receita**; para o mercado amplo, **nem sempre** — o gargalo costuma ser **encaixe e demonstração de valor**, não só o número.

---

## 6. Próximos passos (dados próprios)

Substituir faixas de pesquisa por dados reais:

- Ticket médio e volume de vendas (faixa).
- Taxa de falha/abandono percebida pelo cliente.
- **Recuperado atribuído** ao motor (regra de atribuição clara e contratual).

Sugestão: **5 conversas** de discovery com perguntas sobre GMV, dor em pagamento e **teste de preço** (“se recuperasse +R$ X/mês, quanto pagaria?”).

---

## 7. Referências rápidas (links)

- [Valor — FGV/Hotmart, creator economy e infoprodutores](https://valor.globo.com/patrocinado/dino/noticia/2025/04/04/mercado-de-mkt-digital-cresce-30-no-brasil-em-12-meses.ghtml)
- [E-Commerce Brasil — Pagamento recusado (Konduto, ClearSale)](https://www.ecommercebrasil.com.br/artigos/pagamento-recusado-por-que-voce-esta-perdendo-vendas)

---

*Última consolidação: documento de trabalho interno; revisar quando houver baseline de recuperação por tenant e custo de servir atualizado.*
