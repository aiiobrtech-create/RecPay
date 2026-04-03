---
name: lp-next-stack
description: >-
  Padrões para landing pages com Next.js, Tailwind, Shadcn UI e Framer Motion:
  estrutura de pastas, seções de conversão, design system, performance e animações.
  Use ao implementar ou revisar LPs, páginas de captura, marketing sites nesta stack,
  ou quando o usuário pedir landing page moderna, hero/CTA, ou stack Next+Tailwind+Shadcn.
---

# Desenvolvedor LP — Next.js + Tailwind + Shadcn + Framer Motion

## Quando aplicar

- Nova landing page ou seção de marketing no repositório.
- Refatoração de LP existente para performance ou conversão.
- Geração de componentes `sections/` ou `ui/` nesta stack.

Documento de origem na raiz do repositório: `frontend_lp_stack_guidelines_next.md` (ler quando precisar do texto integral ou alinhar copy).

---

## Princípios

1. **Performance first**: priorizar SSG; menos JS; componentizar só quando valer; lazy para blocos pesados.
2. **Conversão > estética**: cada seção com objetivo; hierarquia clara; CTA sempre acessível.
3. **Simplicidade escalável**: layout previsível; componentes pequenos e reutilizáveis.

**Regra de ouro:** se não melhora conversão nem performance, remover.

---

## Estrutura de pastas (App Router)

```
src/
  app/
    page.tsx
  components/
    ui/
    sections/
  lib/
  styles/
```

- `sections/`: blocos da landing (Hero, Problema, etc.).
- `ui/`: primitivos reutilizáveis (Button, Card, etc.).
- Componentes pequenos e desacoplados.

---

## Ordem e objetivo das seções

| Seção    | Objetivo              | Notas |
|----------|------------------------|-------|
| Hero     | Impacto imediato       | Acima da dobra; headline ≤ 2 linhas; subheadline; CTA primário; visual (mockup/ilustração) |
| Problema | Identificação          | Dor e situação atual |
| Solução  | Apresentar o produto   | Explicação simples; como resolve |
| Benefícios | Reforçar valor       | Grid 3–4 colunas; ícone + título + descrição |
| Prova    | Confiança              | Depoimentos, números, logos (opcional) |
| CTA final | Conversão             | Reforço da oferta; botão claro |

---

## Design system (Tailwind)

- **Tipografia**: headings `font-bold`, body `font-normal`; escala consistente (`text-xl`, `text-3xl`, etc.).
- **Espaçamento**: padding/margin consistentes; seções com `py-20` ou mais quando fizer sentido.
- **Cores**: uma primária, uma secundária, neutros.
- **Layout**: `max-w-7xl mx-auto`; grids responsivos.

---

## Shadcn UI

Usar como base: Button, Card, Input, Badge.

- Não alterar a estrutura base dos componentes de forma drástica.
- Personalizar principalmente com classes Tailwind.

---

## Framer Motion

- Uso moderado; entrada suave; sem distrair.
- Padrões: fade in, slide up, stagger em listas.
- Scroll: elementos entram no viewport; delays progressivos em grids.

---

## Performance

- `next/image` para imagens; evitar assets pesados.
- Minimizar re-renders e estado desnecessário.

---

## Responsividade

- **Mobile first**; depois refinar `sm`, `md`, `lg`, `xl`.

---

## Boas práticas de código

- Sem lógica desnecessária nos componentes de apresentação.
- Evitar overengineering; nomes claros; separação de responsabilidades.

---

## Checklist rápido (entrega)

- [ ] Rápida (SSG, imagens otimizadas)
- [ ] Clara e escaneável
- [ ] CTA visível no fluxo
- [ ] Seções alinhadas à jornada (problema → solução → prova → CTA)
- [ ] Animações discretas e com propósito
