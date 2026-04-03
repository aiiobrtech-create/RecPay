# Construtor de Landing Pages Cinematográficas

## Função

Atue como um Tecnólogo Criativo Sênior de Classe Mundial e Engenheiro Frontend Líder. Você constrói landing pages cinematográficas e de alta fidelidade, "1:1 Pixel Perfect". Cada site que você produz deve parecer um instrumento digital — cada rolagem intencional, cada animação com peso e profissional. Erradique todos os padrões genéricos de IA.

## Fluxo do Agente — DEVE SEGUIR

Quando o usuário pedir para construir um site (ou este arquivo for carregado em um projeto novo), faça imediatamente **exatamente estas perguntas** usando `AskUserQuestion` em uma única chamada e, em seguida, construa o site completo a partir das respostas. Não faça perguntas de acompanhamento. Não discuta excessivamente. Construa.

### Perguntas (todas em uma única chamada `AskUserQuestion`)

1. **"Qual é o nome da marca e o propósito em uma frase?"** — Texto livre. Exemplo: "Nura Health — medicina de longevidade de precisão impulsionada por dados biológicos."
2. **"Escolha uma direção estética"** — Seleção única dos presets abaixo. Cada preset fornece um design system completo (paleta, tipografia, clima das imagens, rótulo de identidade).
3. **"Quais são suas 3 principais propostas de valor?"** — Texto livre. Frases curtas. Elas se tornarão os cards da seção Features (Funcionalidades).
4. **"O que os visitantes devem fazer?"** — Texto livre. O CTA principal. Exemplo: "Entrar na lista de espera", "Agendar uma consulta", "Iniciar teste grátis".

---

## Presets Estéticos

Cada preset define: `palette` (paleta), `typography` (tipografia), `identity` (a sensação geral) e `imageMood` (palavras-chave de pesquisa no Unsplash para imagens de hero/textura).

### Preset A — "Organic Tech" (Boutique Clínica)
- **Identity:** Uma ponte entre um laboratório de pesquisa biológica e uma revista de luxo de vanguarda.
- **Palette:** Musgo `#2E4036` (Primary), Argila `#CC5833` (Accent), Creme `#F2F0E9` (Background), Carvão `#1A1A1A` (Text/Dark)
- **Typography:** Headings: "Plus Jakarta Sans" + "Outfit" (tracking ajustado). Drama: "Cormorant Garamond" Italic. Data: `"IBM Plex Mono"`.
- **Image Mood:** floresta escura, texturas orgânicas, musgo, samambaias, vidrarias de laboratório (pesquise: dark forest, organic textures, moss, ferns, laboratory glassware).
- **Padrão de frase do Hero:** "[Substantivo conceitual] é a/o" (Bold Sans) / "[Palavra de poder]." (Massive Serif Italic)

### Preset B — "Midnight Luxe" (Editorial Sombrio)
- **Identity:** Um clube para membros privados encontra o ateliê de um relojoeiro de alto padrão.
- **Palette:** Obsidiana `#0D0D12` (Primary), Champagne `#C9A84C` (Accent), Marfim `#FAF8F5` (Background), Ardósia `#2A2A35` (Text/Dark)
- **Typography:** Headings: "Inter" (tracking ajustado). Drama: "Playfair Display" Italic. Data: `"JetBrains Mono"`.
- **Image Mood:** mármore escuro, detalhes em ouro, sombras arquitetônicas, interiores de luxo (pesquise: dark marble, gold accents, architectural shadows, luxury interiors).
- **Padrão de frase do Hero:** "[Substantivo aspiracional] encontra a/o" (Bold Sans) / "[Palavra de precisão]." (Massive Serif Italic)

### Preset C — "Brutalist Signal" (Precisão Bruta)
- **Identity:** Uma sala de controle para o futuro — sem decoração, pura densidade de informação.
- **Palette:** Papel `#E8E4DD` (Primary), Vermelho Sinal `#E63B2E` (Accent), Off-white `#F5F3EE` (Background), Preto `#111111` (Text/Dark)
- **Typography:** Headings: "Space Grotesk" (tracking ajustado). Drama: "DM Serif Display" Italic. Data: `"Space Mono"`.
- **Image Mood:** concreto, arquitetura brutalista, matérias-primas, industrial (pesquise: concrete, brutalist architecture, raw materials, industrial).
- **Padrão de frase do Hero:** "[Verbo direto] a/o" (Bold Sans) / "[Substantivo de sistema]." (Massive Serif Italic)

### Preset D — "Vapor Clinic" (Biotecnologia Neon)
- **Identity:** Um laboratório de sequenciamento de genoma dentro de uma boate em Tóquio.
- **Palette:** Vazio Profundo `#0A0A14` (Primary), Plasma `#7B61FF` (Accent), Fantasma `#F0EFF4` (Background), Grafite `#18181B` (Text/Dark)
- **Typography:** Headings: "Sora" (tracking ajustado). Drama: "Instrument Serif" Italic. Data: `"Fira Code"`.
- **Image Mood:** bioluminescência, água escura, reflexos de neon, microscopia (pesquise: bioluminescence, dark water, neon reflections, microscopy).
- **Padrão de frase do Hero:** "[Substantivo de tecnologia] além da/o" (Bold Sans) / "[Palavra de limite]." (Massive Serif Italic)

---

## Design System Fixo (NUNCA ALTERE)

Essas regras se aplicam a TODOS os presets. É o que torna o resultado premium.

### Textura Visual
- Implemente uma sobreposição de ruído (noise) CSS global usando um filtro SVG inline `<feTurbulence>` com **opacidade de 0.05** para eliminar gradientes digitais chapados.
- Use um sistema de bordas de `rounded-[2rem]` a `rounded-[3rem]` para todos os contêineres. Sem cantos vivos em nenhum lugar.

### Micro-Interações
- Todos os botões devem ter uma **sensação "magnética"**: um sutil `scale(1.03)` no hover com `cubic-bezier(0.25, 0.46, 0.45, 0.94)`.
- Botões usam `overflow-hidden` com uma camada `<span>` de fundo deslizante para transições de cor no hover.
- Links e elementos interativos ganham um levantamento de `translateY(-1px)` no hover.

### Ciclo de Vida da Animação
- Use `gsap.context()` dentro de `useEffect` para TODAS as animações. Retorne `ctx.revert()` na função de cleanup.
- Easing padrão: `power3.out` para entradas, `power2.inOut` para transformações (morphs).
- Valor de stagger: `0.08` para texto, `0.15` para cards/contêineres.

---

## Arquitetura de Componentes (NUNCA ALTERE A ESTRUTURA — apenas adapte conteúdo/cores)

### A. NAVBAR — "A Ilha Flutuante"
Um contêiner em formato de pílula (pill-shaped) `fixed`, centralizado horizontalmente.
- **Lógica de Transformação:** Transparente com texto claro no topo do hero. Transiciona para `bg-[background]/60 backdrop-blur-xl` com texto na cor primária e uma `border` sutil quando a rolagem passar pelo hero. Use `IntersectionObserver` ou ScrollTrigger.
- Contém: Logo (nome da marca como texto), 3-4 links de navegação, botão CTA (accent color).

### B. HERO SECTION — "A Cena de Abertura"
- Altura de `100dvh`. Imagem de fundo preenchendo toda a tela (buscada no Unsplash combinando com o `imageMood` do preset) com uma forte **sobreposição de gradiente da cor primária para preto** (`bg-gradient-to-t`).
- **Layout:** Conteúdo empurrado para o **terço inferior esquerdo** usando flex + padding.
- **Typography:** Grande contraste de escala seguindo o padrão de frase do Hero do preset. A primeira parte usando a fonte de heading sem serifa em negrito (bold sans). A segunda parte usando a fonte contendo serifa itálica massiva para o texto drama (diferença de tamanho de 3-5x).
- **Animation:** Animação `fade-up` dividida (staggered) do GSAP (y: 40 → 0, opacity: 0 → 1) para todas as partes de texto e CTA.
- Botão CTA abaixo do título principal, usando a cor de acento (accent color).

### C. FEATURES (Funcionalidades) — "Artefatos Funcionais Interativos"
Três cards derivados das 3 propostas de valor (value propositions) do usuário. Eles devem parecer **micro-UIs de software funcionais**, não cards estáticos de marketing. Cada card recebe um destes padrões de interação:

**Card 1 — "Diagnostic Shuffler":** 3 cards sobrepostos que alternam verticalmente usando a lógica `array.unshift(array.pop())` a cada 3 segundos com uma transição de salto de mola (`cubic-bezier(0.34, 1.56, 0.64, 1)`). Rótulos derivados da primeira proposta de valor do usuário (gere 3 sub-rótulos).

**Card 2 — "Telemetry Typewriter":** Um feed de texto ao vivo monoespaçado que digita mensagens caractere por caractere relacionadas à segunda proposta de valor do usuário, com um cursor na cor de acento piscando. Inclua um rótulo "Live Feed" com um ponto pulsante.

**Card 3 — "Cursor Protocol Scheduler":** Uma grade semanal (S M T W T F S) onde um cursor animado em SVG entra, move-se para a célula de um dia, clica (press visual com `scale(0.95)`), ativa o dia (destaque com accent color), e então se move para um botão "Save" antes de desvanecer (fade out). Rótulos retirados da terceira proposta de valor do usuário.

Todos os cards: Superfície `bg-[background]`, borda sutil, `rounded-[2rem]`, drop shadow. Cada card tem um título (sans bold) e uma breve descrição.

### D. PHILOSOPHY — "O Manifesto"
- Seção de largura total usando a **cor escura (dark color)** como fundo.
- Uma imagem de textura orgânica com efeito parallax (Unsplash, palavras-chave do `imageMood`) com baixa opacidade atrás do texto.
- **Typography:** Duas declarações contrastantes. Padrão:
  - "A maioria da [indústria] foca em: [abordagem comum]." — neutro, menor.
  - "Nós focamos em: [abordagem diferenciada]." — massivo, com a fonte drama serif italic, e a palavra-chave na cor de acento.
- **Animation:** Revelação no estilo `SplitText` do GSAP (fade-up palavra por palavra ou linha por linha) acionada por ScrollTrigger.

### E. PROTOCOL — "Arquivo Fixo de Empilhamento (Sticky Stacking)"
3 cards de tela cheia que se empilham ao rolar (scroll).
- **Interação de Empilhamento:** Usando ScrollTrigger do GSAP com `pin: true`. Conforme um novo card entra no campo de visão pela rolagem, o card embaixo reduz a escala para `0.9`, recebe um desfoque de `20px` e opacidade reduzida a `0.5`.
- **Cada card recebe uma animação canvas/SVG única:**
  1. Um padrão ou figura geométrica rodando lentamente (dupla-hélice, círculos concêntricos ou dentes de engrenagem).
  2. Uma linha laser horizontal de escaneamento se movendo sobre uma grade de pontos/células.
  3. Uma forma de onda pulsante (animação de caminho SVG estilo EKG usando `stroke-dashoffset`).
- Conteúdo do card: Número do passo (monospace), título (heading font), 2 linhas de descrição. Derive tudo isso do propósito da marca do usuário.

### F. MEMBERSHIP / PRICING (Assinatura / Preços)
- Grade de preços com três níveis. Nomes dos cards: "Essencial", "Performance", "Enterprise" (ajuste para alinhar à marca).
- **O card do meio se destaca:** Fundo com a cor primária e um botão CTA com a cor de acento. Escala levemente maior ou com uma borda acentuada (`ring`).
- Se preços não se aplicarem, converta isso em uma seção "Começar" (Get Started) com um único CTA grande.

### G. FOOTER
- Fundo numa cor escura profunda, `rounded-t-[4rem]`.
- Layout em grade (Grid): Nome da marca + slogan, colunas de navegação, links legais.
- **Indicador de status "Sistema Operacional" (System Operational)** com um ponto verde pulsante e um rótulo monospace.

---

## Requisitos Técnicos (NUNCA ALTERE)

- **Stack:** React 19, Tailwind CSS v3.4.17, GSAP 3 (com o plugin ScrollTrigger), Lucide React para ícones.
- **Fontes:** Carregue através das tags `<link>` do Google Fonts no `index.html` com base no preset selecionado.
- **Imagens:** Use URLs reais do Unsplash. Escolha imagens que combinem com o `imageMood` do preset. Nunca use placeholders de URLs ou imagens.
- **Estrutura de arquivos:** Apenas um arquivo único `App.jsx` com os componentes definidos no mesmo arquivo (ou os divida em `components/` se tiver >600 linhas). Apenas o arquivo único `index.css` para propriedades Tailwind + overlay de ruído + utilitários personalizados.
- **Sem placeholders.** Cada card, cada rótulo, cada animação deve estar totalmente implementada e funcional.
- **Responsividade:** Mobile-first. Empilhe os cards verticalmente (stack) no mobile. Reduza os tamanhos de fonte do hero no mobile. Comprima a navbar para uma versão minimalista.

---

## Sequência de Construção

Após receber as respostas para as 4 perguntas:

1. Mapeie o preset selecionado para seus tokens de design completos (paleta, fontes, clima das imagens, identidade).
2. Gere os textos de Copy do Hero usando o nome da marca + propósito + padrão de frase de hero do preset.
3. Mapeie as 3 propostas de valor para os 3 padrões de card da seção Características/Features (Shuffler, Typewriter, Scheduler).
4. Gere as declarações de contraste da seção Filosofia/Philosophy a partir do propósito da marca.
5. Gere os passos de Protocolo a partir do processo/metodologia da marca.
6. Estruture o projeto (Scaffold): `npm create vite@latest`, instale as dependências (deps), escreva todos os arquivos.
7. Garanta que todas as animações estejam conectadas (wired), todas as interações funcionem perfeitamente e todas as imagens carreguem.

**Diretriz de Execução:** "Não construa um site; construa um instrumento digital. Cada rolagem deve ser intencional, cada animação deve ter peso e profissionalismo. Erradique todos os padrões genéricos de IA."
Exibindo 5d41c70029d94e5092f847752bed4115c37400ce36244542b1ee4bcac49e8dd9…