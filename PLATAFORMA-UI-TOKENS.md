# Plataforma UI Tokens

## Fontes

```css
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap");

@font-face {
  font-family: "Arcadia Text";
  src: url("https://demo.mercury.com/webfonts/ArcadiaText-Variable.woff2") format("woff2");
}

@font-face {
  font-family: "Arcadia Display";
  src: url("https://demo.mercury.com/webfonts/ArcadiaDisplay-Variable.woff2") format("woff2");
}

@font-face {
  font-family: "PP Neue Montreal";
  src: url("https://demo.mercury.com/webfonts/PPNeueMontreal-Variable.woff") format("woff");
}
```

```css
--font-text: "Arcadia Text", "PP Neue Montreal", "Inter", system-ui, sans-serif;
--font-display: "Arcadia Display", "Arcadia Text", "PP Neue Montreal", "Inter", system-ui, sans-serif;
```

## Cores base

```css
--bg: #f2f4f8;
--card: #ffffff;
--ink: #0f172a;
--muted: #64748b;
--line: #e2e8f0;
--line-strong: #cbd5e1;
--sidebar: #0b1220;
--sidebar-muted: #8b9bb4;
--brand: #3b82f6;
--brand-ink: #1e40af;
--success: #16a34a;
--warning: #d97706;
--danger: #dc2626;
--neutral: #64748b;
```

## Cores dark / Sovereign

```css
--sidebar-bg: #0d0e10;
--sidebar-edge: rgba(68, 70, 84, 0.2);
--sidebar-hover: #1b1c1e;
--sidebar-active: #4d68eb;
--card: #1b1c1e;
```

## Tokens de data viz

```css
--chart-grid: #e2e8f0;
--ds-data-visualization-line-primary: var(--brand);
--ds-data-visualization-area-primary-gradient-start: rgba(59, 130, 246, 0.38);
--ds-data-visualization-area-primary-gradient-stop: rgba(59, 130, 246, 0.02);
--ds-data-visualization-line-secondary: #16a34a;
--ds-data-visualization-area-secondary-gradient-start: rgba(34, 197, 94, 0.36);
--ds-data-visualization-area-secondary-gradient-stop: rgba(34, 197, 94, 0.02);
--ds-money-in: #15803d;
--ds-money-out: #b45309;
```

## Tokens semânticos

```css
--ds-background-default: var(--bg);
--ds-background-secondary: var(--card);
--ds-text-default: var(--ink);
--ds-text-secondary: var(--muted);
--ds-text-tertiary: #64748b;
--ds-text-emphasized: #0f172a;
--ds-text-heading: #0f172a;
--ds-icon-primary: var(--brand);
--ds-icon-secondary: #64748b;
--ds-icon-tertiary: #94a3b8;
--ds-border-subtle: var(--line);
```

## Raios e sombra

```css
--radius-lg: 16px;
--radius-md: 12px;
--shadow-soft: 0 14px 30px rgba(15, 23, 42, 0.06);
```

## Ícones

### Material Symbols

```css
.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
}
```

### Ícones usados na navegação

```txt
home
receipt_long
credit_card
chat
account_circle
account_balance_wallet
help
settings
menu
close
search
notifications
history
account_balance
chat_bubble
swap_horiz
request_quote
more_horiz
expand_more
tune
data_object
```

## Estrutura principal

```css
.app-shell
.sidebar
.content
.topbar
.surface
.metric-card
.trend-card
.account-card
.settings-page
.account-page
.sovereign-shell
.sovereign-topbar
.sovereign-grid
.sovereign-lower
```

## Classes de navegação

```css
.side-nav
.side-link
.side-link.active
.sidebar-settings
.settings-trigger
.sovereign-mobile-menu-fab
.sovereign-sidebar-backdrop
```

## Classes de formulário e dropdown

```css
.account-field
.account-label
.account-input
.tenant-select
.tenant-combobox
.tenant-combobox-trigger
.tenant-combobox-menu
.re-dropdown
.re-dropdown-trigger
.re-dropdown-menu
.re-dropdown-option
```

## Classes de cards e blocos

```css
.account-bento
.account-bento-main
.account-bento-aside
.account-card-head
.account-card-title
.account-card-icon
.account-readonly
.account-webhook-box
.account-stack
.account-usage
.account-usage-block
```

## Classes de ações

```css
.btn
.btn-primary
.btn-secondary
.btn-tertiary
.icon-btn
.collapse-btn
.account-btn
.account-btn-primary
.account-btn-secondary
```

## Classes do dashboard Sovereign

```css
.sovereign-heading
.sovereign-heading-actions
.sovereign-range-quick
.sovereign-range-btn
.sovereign-balance
.sovereign-label
.sovereign-chip-row
.sovereign-chart
.sovereign-bars
.sovereign-actions-grid
.sovereign-action-card
.sovereign-action-icon
.sovereign-accounts
.sovereign-account-item
.sovereign-account-main
.sovereign-account-icon
.sovereign-account-meta
.sovereign-transactions
.sovereign-table-head
.sovereign-row
.sovereign-merchant
.sovereign-merchant-avatar
.sovereign-method-chip
.sovereign-load-more
.sovereign-fab
```

## Classes de estado

```css
.pill
.pill-success
.pill-danger
.pill-neutral
.attempt-status-chip
.inline-help
.ok
.todo
.is-positive
.is-negative
```

## Arquivos-fonte

```txt
apps/web/src/styles.css
apps/web/src/App.tsx
apps/web/src/AuthGateChrome.tsx
```
