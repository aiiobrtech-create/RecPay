# 🚀 SaaS Recovery Engine Brasil
## Sistema de Recuperação Automática de Receita para Infoprodutores

---

# 🧠 VISÃO DO PRODUTO

## 💡 Proposta
Sistema que detecta pagamentos falhos em tempo real e recupera automaticamente a venda via WhatsApp + métodos alternativos (Pix/cartão).

## 🎯 Promessa
"Recupere vendas perdidas automaticamente enquanto seu lançamento ainda está acontecendo."

---

# 🔥 PROBLEMA QUE RESOLVE

Durante lançamentos:
- Pagamentos falham constantemente
- Leads estão quentes (prontos para comprar)
- Não existe recuperação imediata

Resultado:
👉 Dinheiro perdido em tempo real

---

# 💎 SOLUÇÃO

Sistema que:
- Detecta falha de pagamento
- Age em segundos
- Envia mensagem automática
- Oferece alternativa de pagamento
- Acompanha até conversão

---

# 🧩 FLUXO DO SISTEMA

1. Cliente tenta comprar
2. Pagamento falha
3. Webhook é enviado pela plataforma
4. Sistema recebe evento
5. Evento é padronizado
6. Motor de decisão escolhe ação
7. WhatsApp é enviado
8. Cliente recebe link de pagamento
9. Cliente paga
10. Sistema registra recuperação

---

# 🏗️ ARQUITETURA DO SISTEMA

Webhook Receiver → Event Processor → Decision Engine → Action Layer → Tracking

---

# 🧱 COMPONENTES

## 1. Webhook Receiver
- Receber eventos
- Validar
- Salvar dados

## 2. Event Processor
- Padronizar dados

## 3. Decision Engine
- Regras simples (MVP)
- Evolução futura com inteligência

## 4. Action Layer
- WhatsApp
- Links de pagamento
- Follow-ups

## 5. Tracking
- Registrar eventos
- Registrar recuperações

## 6. Dashboard
- Valor recuperado
- Taxa de recuperação

---

# 🔌 INTEGRAÇÕES

- Hotmart
- Kiwify
- Hubla
- WhatsApp API

---

# 🗄️ BANCO DE DADOS

- events
- customers
- recoveries

---

# ⚙️ STACK

- Node.js
- PostgreSQL
- Vercel/Railway
- WhatsApp API

---

# 💰 MODELO DE NEGÓCIO (ATUALIZADO)

## 💎 Estrutura

Mensalidade recorrente (e opção anual com desconto na LP). Modelo **mensal + % sobre valor recuperado** pode ser adotado como evolução comercial; ver `docs/PRECIFICACAO.md`.

**Referência pública:** planos e entregáveis na landing (`recovery-engine`), espelhados em `docs/PRECIFICACAO.md`.

---

## 💰 Planos (alinhados à LP)

### Essencial — R$ 197/mês

*Para estruturar recuperação com volume moderado.*

- Até 100 recuperações/mês
- Webhooks no limite do plano
- Painel e métricas
- Suporte por e-mail

### Growth — R$ 497/mês

*O equilíbrio entre escala e custo — o mais escolhido.*

- Até 300 recuperações/mês
- Mais eventos que o Essencial
- Retry + WhatsApp
- API e webhook com token
- Suporte prioritário

### Scale — R$ 997/mês

*Volume alto, multi-tenant e requisitos enterprise.*

- Limites e excedente no contrato
- Pacote fechado com o comercial
- Times e permissões (quem vê o quê)
- SLA e onboarding
- Customer success

---

## ⚙️ Funcionamento da cobrança

Durante o mês:

- sistema pode acumular valor recuperado (atribuído) para relatório e, se houver modelo híbrido, para faturamento variável.

No fechamento (se houver % sobre recuperação):

- mensalidade + % sobre recuperação

Exemplo ilustrativo:

- recuperado: R$ 8.000
- cobrança: R$ 197 (mensalidade do tier) + eventual % sobre recuperação conforme contrato

---

## 🔐 Estrutura de pagamento

- cliente cadastra cartão
- cobrança automática mensal
- cobrança variável baseada em uso

---

# ⚠️ RISCOS

- dependência de webhook
- dados incompletos
- necessidade de telefone válido

---

# 🧠 PRINCÍPIOS DE ESCALABILIDADE

1. Padronização
2. Modularização
3. Separação de lógica
4. Logs completos

---

# 🚀 CONCLUSÃO

Sistema simples de iniciar e altamente escalável

Diferencial:
👉 Recuperação de dinheiro em tempo real

Modelo:
👉 Receita recorrente + performance

Posicionamento:
👉 Infraestrutura de geração de receita

