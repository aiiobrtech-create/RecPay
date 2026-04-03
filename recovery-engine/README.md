# Recovery Engine — Landing Page

Este diretório é a **landing page oficial** do produto (Vite + React + Tailwind v4 + Motion).

## Rodar localmente

**Requisito:** Node.js 20+ (recomendado)

```bash
cd recovery-engine
npm install
npm run dev
```

Abre em `http://localhost:3000` (porta definida no `package.json`).

## Build

```bash
npm run build
npm run preview
```

## Copy e conteúdo

Textos de referência consolidados na raiz do monorepo: `../landing-page-copy.md` (espelha a LP em `apps/web` quando quiser alinhar mensagem entre projetos).

## Variáveis opcionais

- `GEMINI_API_KEY` — usada se integrar recursos com Gemini (`@google/genai`). Para só a LP estática, não é obrigatória.

## Licença

Trechos do template original podem estar sob Apache-2.0 (ver cabeçalhos em `App.tsx`).
