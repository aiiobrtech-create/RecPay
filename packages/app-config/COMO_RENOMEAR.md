# Como alterar nome, marca e ID do produto

## 1. Nome visível e ID (recomendado)

Defina no `.env` (cada ambiente):

| Variável | Exemplo | Uso |
|----------|---------|-----|
| `APP_ID` | `minha-marca-api` | Logs, correlação; estável, sem espaços. |
| `APP_DISPLAY_NAME` | `Minha Marca` | UI, e-mails. |
| `APP_SLUG` | `minha-marca` | URLs futuras, subdomínio. |

Nada no código precisa mudar — `getAppIdentity()` em `@re/app-config` lê essas variáveis.

## 2. Padrão quando não há `.env`

Edite **apenas** `packages/app-config/src/defaults.ts` (`APP_DEFAULTS`).

## 3. Nome dos pacotes npm (`@re/...`)

Os pacotes internos usam o escopo `@re` **só como código**. Trocar para `@suamarca` exige:

- renomear `name` em cada `package.json` dos workspaces;
- atualizar `dependencies` que usam `file:../...` (caminhos de pasta não mudam);
- rodar `npm install` na raiz.

Opcional: manter `@re` internamente até o lançamento público da lib.

## 4. Documentos e repositório

Atualize manualmente se desejar alinhar marca:

- `package.json` raiz (`name`, `description`)
- `PROJETO.md` / `CRONOGRAMA.md` (títulos, se quiser)

---

*Fonte única de identidade em runtime: `@re/app-config` + variáveis `APP_*`.*
