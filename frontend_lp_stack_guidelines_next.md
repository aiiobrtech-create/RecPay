# 📦 Frontend Stack Guidelines — Landing Pages Modernas

## 🎯 Objetivo
Definir padrões profissionais para construção de landing pages modernas, rápidas, escaláveis e orientadas à conversão utilizando:

- Next.js
- Tailwind CSS
- Shadcn UI
- Framer Motion

Este documento deve guiar decisões de arquitetura, layout, UI e performance como um desenvolvedor sênior.

---

# 🧠 Princípios Fundamentais

## 1. Performance First
- Priorizar SSG (Static Site Generation)
- Evitar JavaScript desnecessário
- Componentizar apenas quando necessário
- Lazy loading para elementos pesados

## 2. Conversão acima de estética
- Cada seção deve ter objetivo claro
- Hierarquia visual forte
- CTA sempre visível

## 3. Simplicidade escalável
- Layout previsível
- Reutilização de componentes
- Código limpo e legível

---

# 🏗️ Estrutura do Projeto

```
/src
  /app
    /page.tsx
  /components
    /ui
    /sections
  /lib
  /styles
```

## Convenções
- `sections/` → blocos da landing page
- `ui/` → componentes reutilizáveis
- Componentes sempre pequenos e desacoplados

---

# 🧩 Estrutura da Landing Page

## 1. Hero Section
Objetivo: impacto imediato

Elementos:
- Headline forte
- Subheadline clara
- CTA primário
- Elemento visual (mockup/ilustração)

Regras:
- Acima da dobra
- Texto direto
- Máximo 2 linhas na headline

---

## 2. Problema
Objetivo: gerar identificação

Elementos:
- Dor do usuário
- Situação atual

---

## 3. Solução
Objetivo: apresentar produto

Elementos:
- Explicação simples
- Como resolve o problema

---

## 4. Benefícios
Objetivo: reforçar valor

Formato:
- Grid (3 ou 4 colunas)
- Ícone + título + descrição

---

## 5. Prova
Objetivo: gerar confiança

Elementos:
- Depoimentos
- Números
- Logos (opcional)

---

## 6. CTA Final
Objetivo: conversão

- Reforço da oferta
- Botão claro

---

# 🎨 Design System (Tailwind)

## Tipografia
- Headings: font-bold
- Body: font-normal
- Escala consistente (text-xl, text-3xl, etc)

## Espaçamento
- Uso consistente de padding e margin
- Sections com espaçamento vertical amplo (py-20 ou mais)

## Cores
- 1 cor primária
- 1 cor secundária
- Tons neutros

## Layout
- Container centralizado (max-w-7xl mx-auto)
- Grid responsivo

---

# 🧱 Componentes (Shadcn)

Utilizar:
- Button
- Card
- Input
- Badge

Regras:
- Não modificar estrutura base drasticamente
- Estilizar via Tailwind

---

# 🎬 Animações (Framer Motion)

## Diretrizes
- Usar com moderação
- Foco em entrada suave
- Evitar distração

## Tipos
- Fade in
- Slide up
- Stagger em listas

## Exemplo mental
- Elementos aparecem conforme scroll
- Delay progressivo em grids

---

# ⚡ Performance

- Evitar imagens pesadas
- Usar next/image
- Minimizar re-renders
- Evitar estados desnecessários

---

# 📱 Responsividade

## Mobile First
- Começar pelo mobile
- Ajustar para desktop

## Breakpoints
- sm
- md
- lg
- xl

---

# 🧠 Boas práticas

- Componentes sem lógica desnecessária
- Evitar overengineering
- Nomeação clara
- Separação de responsabilidades

---

# 🚀 Padrão final esperado

Uma landing page deve ser:

- Rápida
- Clara
- Escaneável
- Focada em conversão
- Visualmente moderna

---

# 🔥 Regra de ouro

Se algo não melhora conversão ou performance:

→ remover

---

Este documento deve ser seguido como base para qualquer geração automática de landing pages com IA utilizando esta stack.

