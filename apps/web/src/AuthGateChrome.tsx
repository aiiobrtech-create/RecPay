import type { ReactNode } from "react";

export type AuthGateTheme = "dark" | "light";

type Props = {
  theme: AuthGateTheme;
  /** Texto superior opcional (ex.: contexto do fluxo). */
  eyebrow?: string;
  title: string;
  children: ReactNode;
  /** Ação secundária ao lado do título (ex.: link para site). */
  headerAside?: ReactNode;
};

export function AuthGateChrome({ theme, eyebrow, title, children, headerAside }: Props) {
  const year = new Date().getFullYear();

  return (
    <div className={`auth-gate-root theme-${theme}`}>
      <div className="auth-gate-sovereign-grid">
        <main className="auth-gate-main auth-gate-main--form">
          <div className="auth-gate-form-shell">
            <div className="auth-gate-form-inner">
              <div className="brand brand-row auth-gate-brand-row">
                <span className="brand-mark" aria-hidden="true">
                  <img src="/brand/icon-b.svg" alt="" width={36} height={36} />
                </span>
                <div className="brand-text">
                  <strong>RecPay</strong>
                  <small>Painel operacional</small>
                </div>
              </div>

              <div className="auth-gate-headline-row">
                <div className="auth-gate-headline-text">
                  {eyebrow ? <p className="auth-gate-card-eyebrow">{eyebrow}</p> : null}
                  <h1 className="auth-gate-card-title">{title}</h1>
                </div>
                {headerAside ? <div className="auth-gate-head-aside">{headerAside}</div> : null}
              </div>

              <div className="auth-gate-body">{children}</div>
            </div>

            <footer className="auth-gate-form-footer">
              <span>© {year} RecPay</span>
              <nav className="auth-gate-form-footer-links" aria-label="Rodapé do acesso">
                <a href="mailto:suporte@recoveryengine.com.br">Ajuda</a>
                <span className="auth-gate-footer-sep" aria-hidden="true">
                  ·
                </span>
                <a href="https://recoveryengine.com.br" target="_blank" rel="noreferrer noopener">
                  Política de privacidade
                </a>
              </nav>
            </footer>
          </div>
        </main>

        <aside className="auth-gate-aside" aria-label="RecPay — valor do produto">
          <div className="auth-gate-hero-visual" aria-hidden="true">
            <div className="auth-gate-hero-visual-inner">
              <img src="/brand/logo-b.svg" alt="" className="auth-gate-hero-logo" width={120} height={40} />
              <div className="auth-gate-hero-faux-ui">
                <span className="auth-gate-hero-pill">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    monitoring
                  </span>
                  Recuperação em tempo real
                </span>
              </div>
            </div>
          </div>

          <div className="auth-gate-aside-copy">
            <h2 className="auth-gate-aside-title">Recupere vendas perdidas no checkout</h2>
            <p className="auth-gate-aside-lead">
              Integração com plataformas, mensagens e cadência sob seu controle — com histórico e números para a operação.
            </p>
            <a className="auth-gate-aside-more" href="https://recoveryengine.com.br" target="_blank" rel="noreferrer noopener">
              Saiba mais
              <span className="material-symbols-outlined" aria-hidden="true">
                open_in_new
              </span>
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
