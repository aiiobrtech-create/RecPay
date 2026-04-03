# Recovery Engine Brasil — definição do projeto

Documento **obrigatório de referência** para qualquer desenvolvimento neste repositório. Descreve o produto, a arquitetura acordada e regras **não negociáveis** de **segurança** e **escalabilidade**. Alterações arquiteturais relevantes devem ser refletidas aqui.

---

## 1. O que é o produto

**SaaS B2B** de recuperação automática de receita para infoprodutores: detectar falha de pagamento (via webhooks de plataformas como Hotmart, Kiwify, Hubla), processar em tempo quase real, acionar canal (ex.: WhatsApp) com alternativa de pagamento e registrar conversões como **recuperações**.

**Público:** várias empresas (clientes), cada uma como **tenant** isolado logicamente.

**Contexto comercial complementar:** ver `saa_s_recovery_engine_brasil_documento_completo.md`.

---

## 2. Princípios globais (sempre)

1. **Segurança desde o primeiro commit** — não adiar RLS, segredos, validação de webhooks ou minimização de dados.
2. **Escalabilidade por desenho** — APIs stateless, trabalho pesado assíncrono, idempotência, limites e observabilidade; evitar atalhos que quebrem com 10× ou 100× de volume.
3. **Multi-tenant explícito** — todo dado de negócio pertence a um `tenant_id`; nenhuma query sem critério de tenant no backend.
4. **Defesa em profundidade** — o front não é fronteira de segurança; banco (RLS) + backend + rede + segredos.

---

## 3. Arquitetura do repositório (monorepo)

| Caminho | Responsabilidade |
|---------|------------------|
| `apps/api` | HTTP: webhooks (rápido), REST/dashboard, autenticação de API pública, rate limit. |
| `apps/worker` | Filas, processamento de eventos, motor de decisão, ações (WhatsApp etc.), jobs agendados. |
| `packages/core` | Domínio compartilhado, tipos, evento canônico, regras puras. |
| `packages/db` | Acesso a dados, migrações, repositórios. |
| `packages/integrations` | Adaptadores por plataforma (assinatura + normalização). |
| `packages/app-config` | Nome, slug e ID do produto (`APP_*` / defaults); evitar hardcode de marca no código. |

**Fluxo lógico:** Webhook → validação → persistência mínima / enfileiramento → worker → decisão → ação → tracking.

---

## 4. Modelo de implantação e dados

- **Um deploy** (ou poucos serviços: API + worker) atendendo **todos os tenants**, salvo acordo **enterprise** com isolamento dedicado.
- **Banco:** PostgreSQL (alvo operacional: **Supabase** ou Postgres equivalente). Tabelas multi-tenant com **`tenant_id`** em todas as entidades de negócio.
- **Isolamento:** **Row Level Security (RLS)** no Postgres alinhada ao `tenant_id` (e à identidade do usuário no dashboard). O backend com **service role** só onde inevitável e sempre com checagem explícita de tenant quando apropriado.
- **Segredos:** variáveis de ambiente / secret manager; **nunca** commitar credenciais. Chave **service_role** do Supabase **somente** em serviços server-side (API/worker).

---

## 5. Regras rígidas de segurança

### 5.1 Autenticação e autorização

- Sessões/API tokens com expiração; refresh com política clara.
- **RBAC** por tenant (ex.: owner, admin, operador, leitura). Toda rota protegida valida **quem** e **de qual tenant**.
- Não expor IDs internos sequenciais como única barreira; usar UUIDs onde fizer sentido e sempre validar permissão.

### 5.2 Multi-tenant e banco

- **Proibido** endpoint ou job que liste ou altere dados sem filtro por `tenant_id` (ou sem RLS que garanta o mesmo).
- Migrações e seeds não podem desabilitar RLS em produção.
- Testes automatizados devem incluir cenários **cross-tenant** (garantir que A não acessa B).

### 5.3 Webhooks

- Validar **assinatura** (ou mecanismo oficial) de **cada** integração antes de processar.
- Limitar tamanho do body; timeout agressivo na camada de entrada; rejeitar content-types inesperados.
- **Idempotência** por chave derivada do provedor (ou header) para evitar duplicação de efeitos colaterais.
- Não logar payload completo em produção; se necessário para debug, mascarar PII e usar nível restrito.

### 5.4 API pública e HTTP

- **HTTPS** obrigatório em produção.
- **Rate limiting** por IP e por tenant/API key onde aplicável.
- **CORS** restrito a origens conhecidas (não `*` com credenciais).
- Cabeçalhos de segurança adequados (HSTS, etc.) no edge ou no servidor.
- Validação de entrada com schema explícito (ex.: Zod) em todas as entradas mutáveis.

### 5.5 Dados pessoais (LGPD)

- **Minimização:** coletar só o necessário para recuperação e faturamento.
- **Retenção:** políticas por tipo de dado (eventos brutos vs agregados); documentar prazos.
- **Logs:** sem e-mail/telefone em claro quando evitável; preferir hash ou truncamento em logs de aplicação.
- Prever fluxos de **acesso/retificação/exclusão** pelo titular (mesmo que operação assistida no início).

### 5.6 WhatsApp e mensagens

- Uso de **templates** aprovados e políticas da plataforma; registro de opt-out/supressão.
- Limites de frequência por cliente/lead para reduzir abuso e bloqueio de conta.

### 5.7 Dependências e supply chain

- Lockfile versionado; auditoria periódica (`npm audit` / ferramentas CI).
- CI obrigatório: lint, testes, build antes de merge na branch principal.

### 5.8 Segredos e configuração

- Arquivo `.env` apenas local; `.env.example` sem valores reais.
- Rotação de chaves de webhook e API em caso de vazamento ou offboarding.

---

## 6. Regras de escalabilidade e resiliência

### 6.1 Aplicação

- **API stateless:** sem estado de sessão em memória do processo; sessão em JWT/cookie assinado ou store externo.
- **Trabalho assíncrono:** processamento pesado e chamadas externas (WhatsApp, regras longas) no **worker** via fila; webhook responde rápido (ex.: 2xx após persistir/enfileirar).
- **Idempotência** em consumidores de fila e em gravações críticas (recuperações, cobrança).

### 6.2 Dados e PostgreSQL

- **Índices** planejados para consultas reais (dashboard, relatórios por tenant e período).
- Evitar N+1; usar paginação em listagens; limites máximos de `limit` na API.
- Crescimento de `events`: prever **particionamento por tempo** ou arquivamento quando o volume justificar.
- Conexões: pool adequado (PgBouncer / pooler do Supabase); não abrir conexão nova por request sem necessidade.

### 6.3 Filas e jobs

- Retries com **backoff** e **dead-letter queue** para análise humana.
- Jobs agendados **idempotentes** (mesmo job duas vezes não deve cobrar duas vezes nem disparar spam).

### 6.4 Observabilidade

- **Logs estruturados** com `request_id` / `event_id` / `tenant_id` (onde seguro).
- Métricas: latência de webhook, profundidade da fila, taxa de erro por integração, taxa de processamento.
- Alertas para fila crescendo, erro sustentado em worker, falha de assinatura de webhook.

### 6.5 Limites e custo

- Por tenant: limites de eventos/mês ou tier de plano aplicados no worker/API.
- Timeouts e circuit breaker em chamadas a terceiros (WhatsApp, plataformas).

### 6.6 Deploy e operações

- Ambientes separados: **dev**, **staging**, **prod**; dados de produção não em staging sem anonimização.
- Backups automáticos do banco; teste periódico de restore (definir RPO/RTO alvo).

---

## 7. Definição de pronto (DoD) sugerida

Antes de considerar uma feature “pronta” para produção:

- [ ] Entradas validadas; sem SQL dinâmico inseguro.
- [ ] Efeitos colaterais idempotentes onde houver retentativa.
- [ ] Dados multi-tenant com `tenant_id` e políticas/validações coerentes.
- [ ] Nenhum segredo novo no repositório; documentação em `.env.example` se necessário.
- [ ] Logs sem vazamento de PII desnecessário.

---

## 8. Governança deste documento

- **Banco / Supabase:** alterações feitas por **CLI e artefatos no Git** (migrações Drizzle, SQL em `packages/db/sql`, `npm run db:push`, **`npm run db:rls`**, `npm run check:db`), não pelo Table Editor como fluxo principal.
- Este arquivo é a **fonte da verdade** para decisões de segurança e escalabilidade do código neste monorepo.
- **Cronograma e etapas** com regras de entrada/saída: ver **`CRONOGRAMA.md`**.
- Desvios temporários (ex.: MVP com RLS simplificada) devem ser **explícitos**, **documentados aqui ou em issue vinculada**, com data de correção.
- Revisitar este documento em marcos (primeiro cliente pago, 10 tenants, pico de lançamento).

---

*Última atualização: documento inicial de projeto, segurança e escalabilidade.*
