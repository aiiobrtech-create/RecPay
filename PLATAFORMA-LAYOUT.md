# Layout da Plataforma

Documento de referencia do layout da plataforma interna, focado no dashboard e nas telas operacionais do produto.

Escopo deste arquivo:

- estrutura da interface da plataforma
- navegacao principal
- composicao das telas
- estilo visual predominante
- comportamento responsivo

Este documento nao descreve a landing page.

---

## 1. Visao geral

A plataforma foi estruturada como um painel SaaS operacional com navegação lateral fixa e area principal de conteudo.

Existem duas linhas visuais no frontend:

- `Sovereign mode`
  painel editorial escuro, mais sofisticado e mais proximo de uma interface executiva
- `layout legado`
  painel tradicional com topbar, surfaces e cards funcionais

No estado atual do codigo, o dashboard de referencia usa `useReferenceDashboard = true`, entao o layout principal considerado para a plataforma e o `Sovereign mode`.

---

## 2. Estrutura global

### Shell principal

O app usa uma estrutura base com:

- `sidebar`
- `content`

Arquivo principal de referencia:

- [App.tsx](/E:/bk%20danilo/PROJECT/app%20recuperacao/apps/web/src/App.tsx)
- [styles.css](/E:/bk%20danilo/PROJECT/app%20recuperacao/apps/web/src/styles.css)

### Organizacao espacial

- barra lateral fixa ou em drawer, dependendo da largura da tela
- conteudo principal ocupando o restante da viewport
- secoes montadas em blocos verticais com cards e paineis
- forte uso de grids para areas analiticas e operacionais

---

## 3. Navegacao principal

O menu lateral da plataforma esta organizado em:

- `Painel`
- `Tentativas de recuperação`
- `Integrações`
- `Mensagens`
- `Conta`
- `Configurações`
- `Suporte`

Chaves internas da navegacao:

- `dashboard`
- `attempts`
- `integrations`
- `messages`
- `account`
- `settings`
- `support`

### Comportamento da sidebar

- no desktop, funciona como coluna lateral persistente
- em resolucoes menores, vira drawer lateral com backdrop
- existe suporte a estado colapsado no layout legado
- no modo Sovereign mobile/tablet, ha um botao FAB para abrir o menu

---

## 4. Identidade visual da plataforma

### Direcao estetica

O dashboard principal segue uma identidade:

- escura
- editorial
- financeira
- premium
- orientada a leitura executiva

### Caracteristicas visuais

- fundo escuro com cards em superficies elevadas
- sidebar com destaque de ativo em azul
- tipografia forte em headings
- cards com bordas suaves e profundidade discreta
- icones de Material Symbols em toda a navegacao e acao
- chips, pills e estados para sinalizar contexto operacional

### Tokens e linguagem visual

No CSS aparecem sinais claros dessa intencao:

- sidebar escura
- destaque azul para item ativo
- cards escuros para conteudo
- contraste entre texto principal e texto mutado
- topbar mais limpa e institucional

---

## 5. Tela de Painel

### Papel da tela

E a visao executiva da operacao de recuperacao.

### Blocos principais

#### Topbar Sovereign

Contem:

- botao de menu em telas menores
- busca global
- acoes de notificacao, historico e ajuda
- acesso rapido a conta

#### Heading principal

Exibe:

- titulo `Painel de Recuperação`
- subtitulo com status temporal
- filtros rapidos de periodo:
  `7 dias`, `30 dias`, `90 dias`, `Este mês`
- acoes de atualizar e baixar relatorios

#### Card de destaque financeiro

Bloco principal com:

- valor total recuperado
- variacao recente
- grafico resumido em barras
- estado de leitura executiva

#### Grade de acoes rapidas

Cards de acao para:

- recuperação via WhatsApp
- reprocessar tentativas
- alternativa de pagamento
- entrada de webhook

#### Canais de recuperacao

Bloco lateral/resumido mostrando:

- WhatsApp como canal principal
- alternativa de pagamento
- entrada de webhook

Cada item mistura:

- icone
- nome do canal
- descricao curta
- metrica resumida

#### Tentativas recentes

Tabela resumida com:

- data
- provedor
- metrica
- etapa
- valor

Inclui:

- filtro por etapa
- chips visuais de status
- CTA para ver historico completo

#### FAB de suporte

No painel Sovereign existe um botao flutuante para chat/suporte.

---

## 6. Tela de Tentativas

### Papel da tela

E a area de historico operacional detalhado.

### Conteudo esperado

- header da pagina
- bloco de filtros
- card com tabela de tentativas
- paginacao e controle de volume exibido
- busca textual
- filtro por status e periodo

### Linguagem visual

- cards largos
- foco em leitura tabular
- hierarquia de texto mais funcional
- estrutura menos conceitual e mais operacional

---

## 7. Tela de Integrações

### Papel da tela

Centralizar provedores, canais e configuracoes de entrada/saida operacional.

### Elementos principais

- header da pagina
- botoes de carregar e salvar configuracoes
- selecao de plataforma de vendas
- definicao de webhook provider preferido
- URL atual de webhook
- checklist de estado da integracao

### Objetivo de UX

Deixar claro:

- qual provedor esta ativo
- se a conta esta configurada
- se o webhook foi gerado
- se a operacao foi salva

---

## 8. Tela de Mensagens

### Papel da tela

Gerenciar o conteudo das mensagens WhatsApp e seus cenarios de disparo.

### Estrutura

- header da pagina
- acoes de salvar, bootstrapar e adicionar fluxo
- selecao de fluxo ou template
- editor da mensagem principal
- bloco de variaveis clicaveis
- variacoes A/B com pesos
- preview lateral do WhatsApp

### Caracteristicas de layout

- composicao em bento/grid
- coluna principal para edicao
- coluna lateral para pre-visualizacao
- foco em formularios e simulacao do resultado visual

---

## 9. Tela de Conta

### Papel da tela

Concentrar informacoes da conta, empresa, seguranca e uso atual.

### Blocos principais

#### Dados de contato

- nome do responsavel
- e-mail
- telefone
- WhatsApp
- cargo

#### Perfil da empresa

- nome da empresa
- CNPJ
- dominio/site
- identificador da conta

#### Segurança e acesso

- URL de webhook atual
- permissao/membership da conta
- informacoes de acesso

#### Uso atual

- eventos usados
- tentativas usadas
- medidores visuais de consumo
- percentual total do periodo

#### Barra de acoes fixa no rodape

- carregar dados
- girar webhook
- salvar dados da conta

---

## 10. Tela de Configurações

### Papel da tela

Controlar parametros operacionais da conta.

### Itens principais

- identificador da conta
- plataforma de vendas
- URL de webhook gerada
- limites da conta
- politicas operacionais de contato e recuperacao

### UX predominante

- formularios em cards
- acoes claras no topo
- mensagem de ajuda quando nenhuma conta esta selecionada

---

## 11. Suporte e auth gate

### Suporte

Existe uma tela/area de suporte acessivel pela navegacao e por atalhos.

### Auth gate

Quando autenticacao esta habilitada, a plataforma usa uma tela de entrada com layout proprio:

- bloco visual de marca
- coluna de formulario
- estilo escuro e institucional

Esse gate nao segue a mesma composicao do painel principal.

---

## 12. Componentes recorrentes do layout

Os componentes visuais que se repetem na plataforma sao:

- sidebar com icones
- topbar com busca e acoes
- cards de conta
- surfaces para agrupamento
- dropdowns customizados
- tabelas operacionais
- chips e pills de status
- botoes primarios, secundarios e terciarios
- medidores de uso
- grids tipo bento para configuracoes e mensagens

---

## 13. Comportamento responsivo

### Desktop

- sidebar fixa
- conteudo em grades de 2 a 3 colunas
- topbar completa
- tabelas e cards lado a lado

### Tablet

- menu lateral pode virar drawer
- topbar quebra para acomodar acoes
- cards reorganizam em menos colunas

### Mobile

- drawer lateral com backdrop
- botao flutuante para abrir menu
- CTA e acoes simplificadas
- cards empilhados verticalmente
- manutencao da legibilidade operacional

---

## 14. Resumo da arquitetura visual

Se fosse resumir o layout da plataforma em poucas linhas:

- `sidebar operacional + painel executivo`
- `tema escuro premium`
- `mistura de visao financeira com controle operacional`
- `cards, grids e tabelas como estrutura base`
- `navegacao lateral como eixo principal da experiencia`

---

## 15. Arquivos de referencia

Arquivos mais importantes para esse layout:

- [App.tsx](/E:/bk%20danilo/PROJECT/app%20recuperacao/apps/web/src/App.tsx)
- [styles.css](/E:/bk%20danilo/PROJECT/app%20recuperacao/apps/web/src/styles.css)
- [AuthGateChrome.tsx](/E:/bk%20danilo/PROJECT/app%20recuperacao/apps/web/src/AuthGateChrome.tsx)

---

## 16. Observacao importante

Hoje a entrada do app web foi trocada para a landing page em:

- [main.tsx](/E:/bk%20danilo/PROJECT/app%20recuperacao/apps/web/src/main.tsx)

Ou seja:

- o layout descrito neste documento continua existindo no codigo da plataforma
- mas nao esta sendo renderizado como entrada principal neste momento

Se quiser, o proximo passo pode ser:

1. separar oficialmente `LP` e `dashboard` em rotas diferentes
2. criar um `design system` resumido da plataforma em outro `.md`
3. mapear a plataforma em wireframe textual por tela
