# Copy — Landing Page

**LP em produção desejada:** projeto `recovery-engine/` (Vite + React + Tailwind — ver `recovery-engine/src/App.tsx`).

Este documento foi extraído originalmente de `apps/web/src/LandingPageApp.tsx` (variante dark/roxo). Use-o como checklist de mensagem ao alinhar copy entre os dois apps. Valores dinâmicos (moeda, números do simulador) aparecem entre colchetes.

---

## Navegação

- **Marca:** Recovery Engine / Brasil  
- **Links:** Problema · Como funciona · Simulador · FAQ  
- **CTA:** Agendar demo  

---

## Hero

- **Badge:** RECUPERAÇÃO AUTOMÁTICA DE VENDAS  
- **Título (H1):** Recupere vendas perdidas no checkout de forma automática.  
- **Subtítulo:** Cartão recusado, PIX expirado e abandono deixam dinheiro na mesa. O produto reage por você e mostra quanto voltou em receita.  
- **Primário:** Quero recuperar mais vendas  
- **Secundário:** Ver como funciona  

### Ilustração (óbito / cards)

- **Núcleo:** RECOVERY  
- **Nós:** Cartão · Checkout · Ação  
- **Card receita:** Receita recuperável / [valor] / cenário mensal estimado  
- **Card vazamento:** Vazamento diário / [valor] / se nada for feito  

---

## Faixa (ticker) — itens

1. Falhas detectadas em tempo real  
2. PIX expirado e cartão recusado  
3. Abandono no último passo  
4. Recuperação automática  
5. Resultado em R$ no painel  
6. Multi-tenant por operação  

**Acessibilidade (aria-label da seção):** Capacidades: detecção de falhas, PIX e cartão, abandono, recuperação automática, métricas em reais e multi-tenant  

---

## Problema

- **Eyebrow:** Problema  
- **H2:** Você investe para vender. O checkout falha. A receita some.  
- **Lead:** Nem toda venda perdida foi realmente perdida. Muitas travam no último passo e ficam sem recuperação.  

### Abas (painéis)

**Cartão recusado**

- Título: Uma recusada não deveria encerrar uma venda quente.  
- Corpo: Quando o cartão falha, a intenção de compra continua viva. O problema costuma ser a ausência de reação rápida.  
- Ação: Aciona uma nova tentativa com recuperação automática.  

**PIX expirado**

- Título: PIX expirado e dinheiro parado no último passo.  
- Corpo: O cliente chegou até o pagamento, mas o prazo acabou. Sem retomada, a venda vira perda invisível.  
- Ação: Reengaja o cliente com novo caminho de pagamento.  

**Abandono**

- Título: Abandono no checkout ainda pode virar faturamento.  
- Corpo: Quem caiu no último clique está perto do sim. A página precisa transformar isso em nova chance de conversão.  
- Ação: Dispara o fluxo certo antes que a oportunidade esfrie.  

### Card lateral

- **H3:** Quem chegou no checkout não é lead frio.  
- **Texto:** Esta é a parte do funil em que pequenas falhas geram perdas grandes e silenciosas.  

---

## Simulador

- **Eyebrow:** Simulador  
- **H2:** Veja quanto dinheiro pode estar ficando para trás.  
- **Lead:** Movimente os controles e transforme perda invisível em número visível.  

### Labels dos controles

- Vendas por mês  
- Ticket médio  
- Percentual de perda no checkout  
- Percentual de recuperação  
- Investimento mensal estimado  

### Métricas (rótulos)

- Receita em risco / [valor] / valor mensal potencialmente travado no checkout  
- Receita recuperável / [valor] / cenário mensal estimado  
- Multiplicação do investimento / [valor]x / retorno estimado sobre o custo mensal  
- Receita bruta processada / [valor] / base de cálculo do cenário  

---

## Como funciona

- **Eyebrow:** Como funciona  
- **H2:** Da falha ao valor recuperado.  
- **Lead:** Sem aula técnica. O visitante precisa enxergar o fluxo em segundos.  

### Cards

1. **Detecta a falha** — Identifica cartão recusado, PIX expirado e abandono no checkout.  
2. **Aciona a recuperação** — Executa a próxima ação para tentar recuperar a venda.  
3. **Mostra o resultado** — Exibe recuperações e receita em um painel com leitura de negócio.  

---

## Benefícios

- **Eyebrow:** Benefícios  
- **H2:** Mais receita, menos retrabalho, mais clareza.  

### Cards

1. **Mais receita recuperada** — Recupere parte do que hoje se perde no último passo da compra.  
2. **Menos operação manual** — Sua equipe deixa de correr atrás de cada caso sem padrão.  
3. **Mais visibilidade** — O financeiro enxerga o retorno em número e não em suposição.  
4. **Mais controle** — Comunica uma operação mais organizada, mais segura e preparada para escalar.  

---

## Antes e depois

- **Eyebrow:** Antes e depois  
- **H2:** Antes a venda falhava. Agora ela entra em recuperação.  
- **Alternância:** Antes · Depois  

### Antes

- Pagamento falha e para ali.  
- Equipe tenta resolver no manual.  
- Ninguém sabe o impacto real.  

### Depois

- A falha vira gatilho de ação.  
- A recuperação acontece automaticamente.  
- O resultado aparece no painel.  

---

## FAQ

- **Eyebrow:** FAQ  
- **H2:** Respostas curtas para objeções reais.  

### Perguntas e respostas

1. **P:** Eu já uso checkout. Por que eu precisaria disso?  
   **R:** Porque checkout sozinho não faz recuperação automática nem mostra quanto voltou para o caixa.  

2. **P:** Como eu sei se vale a pena?  
   **R:** Pela receita recuperada. A proposta da LP é mostrar o retorno em número, não em discurso.  

3. **P:** Serve para operações com várias marcas ou contas?  
   **R:** Sim. A página foi desenhada para comunicar um produto preparado para operações multi-tenant.  

4. **P:** Isso reduz trabalho manual?  
   **R:** Sim. O foco é tirar a recuperação do improviso e transformar em fluxo padronizado.  

---

## CTA final

- **Eyebrow:** CTA final  
- **H2:** Se sua operação perde vendas no checkout, isso pode ser recuperado.  
- **Texto:** Veja onde sua receita está vazando e como transformar isso em retorno.  
- **Primário:** Agendar demonstração  
- **Secundário:** Simular recuperação  

---

## CTA fixo (mobile)

- Quero recuperar mais vendas  

---

## Notas

- Textos dinâmicos do simulador e dos cards do hero usam formatação de moeda BRL (sem centavos) no app.
