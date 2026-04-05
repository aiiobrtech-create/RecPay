import { Fragment, type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowsClockwise,
  Buildings,
  ChartLineUp,
  ChatCircleDots,
  Coins,
  CreditCard,
  CursorClick,
  Gauge,
  Lightning,
  Lock,
  PlayCircle,
  Pulse,
  QrCode,
  ShoppingCart,
  TrendUp,
} from "@phosphor-icons/react";

type PainKey = "card" | "pix" | "abandonment";

const painPanels: Record<
  PainKey,
  {
    label: string;
    title: string;
    body: string;
    action: string;
  }
> = {
  card: {
    label: "Cartão recusado",
    title: "Antifraude e instabilidade bancária barram bons clientes.",
    body: "Sem uma segunda tentativa rápida, o pedido morre e o CAC investido se perde junto com a venda.",
    action: "Recupera a chance enquanto a intenção de compra ainda está quente.",
  },
  pix: {
    label: "PIX expirado",
    title: "A intenção de compra é real, mas o prazo acaba.",
    body: "Sem lembrete no tempo certo, o cliente não volta e a venda esfria no último passo do checkout.",
    action: "Reengaja no momento ideal com novo caminho de pagamento.",
  },
  abandonment: {
    label: "Abandono no checkout",
    title: "Dúvida de última hora ou distração mudam o desfecho.",
    body: "Reagir nos primeiros minutos faz diferença. Quem espera perde o timing da venda e deixa receita escapar.",
    action: "Aciona a recuperação antes que a oportunidade esfrie.",
  },
};

const faqs = [
  {
    question: "Eu já tenho checkout. Por que precisaria disso?",
    answer: "Porque checkout sozinho não recupera falha, PIX expirado e abandono automaticamente nem mostra quanto voltou para o caixa.",
  },
  {
    question: "Como eu sei se vale a pena?",
    answer: "Pela receita recuperada em reais. O simulador dimensiona o vazamento e o painel mostra o retorno real da operação.",
  },
  {
    question: "Serve para operações com várias marcas ou contas?",
    answer: "Sim. A operação pode acompanhar diferentes contas e marcas sem perder visibilidade do que foi recuperado.",
  },
  {
    question: "Isso reduz trabalho manual?",
    answer: "Sim. O objetivo é tirar a recuperação do improviso, reduzir tentativas manuais e transformar isso em processo.",
  },
];

const revealSelector = "[data-reveal]";

type TickerItem = {
  Icon: ComponentType<{ size?: number; weight?: "duotone" | "regular" | "bold" | "fill" }>;
  label: string;
};

const tickerItems: TickerItem[] = [
  { Icon: Pulse, label: "Falhas detectadas em tempo real" },
  { Icon: QrCode, label: "PIX expirado e cartão recusado" },
  { Icon: ShoppingCart, label: "Abandono no último passo" },
  { Icon: ArrowsClockwise, label: "Recuperação automática" },
  { Icon: Coins, label: "Resultado em R$ no painel" },
  { Icon: Buildings, label: "Multi-tenant por operação" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function LandingPageApp() {
  const [pain, setPain] = useState<PainKey>("card");
  const [beforeAfter, setBeforeAfter] = useState<"before" | "after">("after");
  const [openFaq, setOpenFaq] = useState(0);
  const [monthlySales, setMonthlySales] = useState(420);
  const [averageTicket, setAverageTicket] = useState(297);
  const [lossRate, setLossRate] = useState(12);
  const [recoveryRate, setRecoveryRate] = useState(28);
  const [toolCost, setToolCost] = useState(497);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const progress = total > 0 ? window.scrollY / total : 0;
      setScrollProgress(progress);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>(revealSelector);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        }
      },
      { threshold: 0.16 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const simulation = useMemo(() => {
    const gross = monthlySales * averageTicket;
    const leaked = gross * (lossRate / 100);
    const recovered = leaked * (recoveryRate / 100);
    const roi = toolCost > 0 ? recovered / toolCost : 0;
    const dailyLeak = leaked / 30;

    return { gross, leaked, recovered, roi, dailyLeak };
  }, [averageTicket, lossRate, monthlySales, recoveryRate, toolCost]);

  const currentPain = painPanels[pain];

  return (
    <div className="lp-shell">
      <div className="lp-progress" style={{ transform: `scaleX(${scrollProgress})` }} />
      <div className="lp-noise" aria-hidden="true" />

      <header className="lp-nav">
        <a className="lp-brand" href="#hero" aria-label="RecPay">
          <img src="/brand/logo-c.svg" alt="RecPay" className="lp-brand-logo" width={160} height={45} />
        </a>

        <nav className="lp-nav-links" aria-label="Navegação principal">
          <a href="#problema">Problema</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#simulador">Simulador</a>
          <a href="#faq">FAQ</a>
        </nav>

        <a className="lp-nav-cta" href="#cta-final">
          Agendar demo
        </a>
      </header>

      <main>
        <section className="hero-section" id="hero">
          <div className="hero-copy" data-reveal>
            <div className="hero-badge">RECUPERAÇÃO AUTOMÁTICA DE VENDAS</div>
            <p className="hero-subtitle">+1k confiado por +1.000 operações de alto volume</p>
            <h1>Você está deixando dinheiro na mesa no checkout — e nem percebe.</h1>
            <p className="hero-subtitle">
              Cartão recusado, PIX expirado e abandono fazem você perder receita todos os dias. Nosso sistema reage
              por você e mostra quanto voltou para o seu caixa.
            </p>

            <div className="hero-actions">
              <a className="btn-primary" href="#cta-final">
                Ver planos e valores
                <ArrowRight size={18} />
              </a>
              <a className="btn-secondary" href="#como-funciona">
                <PlayCircle size={18} />
                Ver como funciona
              </a>
            </div>
          </div>

          <div className="hero-visual" data-reveal>
            <div className="signal-orbit">
              <div className="orbit-ring orbit-ring-a" />
              <div className="orbit-ring orbit-ring-b" />
              <div className="orbit-ring orbit-ring-c" />
              <div className="signal-core">
                <span>RECPAY</span>
              </div>
              <div className="signal-node node-a">
                <CreditCard size={16} weight="duotone" />
                Cartão
              </div>
              <div className="signal-node node-b">
                <CursorClick size={16} weight="duotone" />
                Checkout
              </div>
              <div className="signal-node node-c">
                <ChatCircleDots size={16} weight="duotone" />
                Ação
              </div>
            </div>

            <div className="hero-float-card card-income">
              <small>Receita recuperável</small>
              <strong>{formatCurrency(simulation.recovered)}</strong>
              <span>cenário mensal estimado</span>
            </div>

            <div className="hero-float-card card-leak">
              <small>Vazamento diário</small>
              <strong>{formatCurrency(simulation.dailyLeak)}</strong>
              <span>se nada for feito</span>
            </div>
          </div>
        </section>

        <div className="logo-ticker-bleed" data-reveal>
          <section
            className="logo-ticker-section"
            aria-label="Capacidades: detecção de falhas, PIX e cartão, abandono, recuperação automática, métricas em reais e multi-tenant"
          >
            <div className="logo-ticker" aria-hidden="true">
              <div className="logo-ticker-track">
                {[0, 1].map((loop) => (
                  <Fragment key={loop}>
                    {tickerItems.map(({ Icon, label }, index) => (
                      <div key={`${loop}-${index}`} className="logo-ticker-item">
                        <span className="logo-ticker-icon" aria-hidden="true">
                          <Icon size={22} weight="duotone" />
                        </span>
                        <span className="logo-ticker-label">{label}</span>
                      </div>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="section problem-section" id="problema">
          <div className="section-heading" data-reveal>
            <span>Problema</span>
            <h2>Você investe para vender. O checkout falha. E o dinheiro não volta.</h2>
            <p>Toque em um cenário para ver o foco da recuperação. O mesmo funil pode falhar por motivos diferentes.</p>
          </div>

          <div className="pain-grid">
            <div className="pain-tabs" data-reveal>
              {Object.entries(painPanels).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  className={`pain-tab ${pain === key ? "active" : ""}`}
                  onClick={() => setPain(key as PainKey)}
                >
                  {value.label}
                </button>
              ))}
            </div>

            <article className="pain-panel" data-reveal>
              <div className="pain-panel-top">
                <span className="pain-panel-chip">{currentPain.label}</span>
                <WarningPulse />
              </div>
              <h3>{currentPain.title}</h3>
              <p>{currentPain.body}</p>
              <div className="pain-action">
                <Lightning size={18} />
                {currentPain.action}
              </div>
            </article>

            <article className="pain-card" data-reveal>
              <ShoppingCart size={26} />
              <h3>Quem chegou no checkout já mostrou intenção real de compra.</h3>
              <p>Pequenas falhas nessa etapa geram perdas grandes, silenciosas e recorrentes no seu caixa.</p>
            </article>
          </div>
        </section>

        <section className="section simulator-section" id="simulador">
          <div className="section-heading" data-reveal>
            <span>Simulador</span>
            <h2>Veja quanto dinheiro pode estar ficando para trás.</h2>
            <p>
              O destaque é a perda mensal no checkout. A recuperação abaixo usa uma faixa típica de conversão da
              perda em receita recuperada.
            </p>
          </div>

          <div className="simulator-layout">
            <div className="simulator-controls" data-reveal>
              <RangeControl label="Vendas por mês" value={monthlySales} min={80} max={2500} step={10} onChange={setMonthlySales} />
              <RangeControl label="Ticket médio" value={averageTicket} min={47} max={2000} step={10} prefix="R$ " onChange={setAverageTicket} />
              <RangeControl label="Percentual de perda no checkout" value={lossRate} min={2} max={30} suffix="%" onChange={setLossRate} />
              <RangeControl label="Percentual de recuperação" value={recoveryRate} min={5} max={60} suffix="%" onChange={setRecoveryRate} />
              <RangeControl label="Investimento mensal estimado" value={toolCost} min={197} max={3000} step={50} prefix="R$ " onChange={setToolCost} />
            </div>

            <div className="simulator-results" data-reveal>
              <div className="metric-card metric-card-lg">
                <small>Perda mensal no checkout</small>
                <strong>{formatCurrency(simulation.leaked)}</strong>
                <span>estimativa do que deixa de entrar por mês com os percentuais ao lado</span>
              </div>
              <div className="metric-card">
                <small>Quanto pode voltar para o caixa (mês)</small>
                <strong>{formatCurrency(simulation.recovered)}</strong>
                <span>cenário ilustrativo; o real depende do funil e da operação</span>
              </div>
              <div className="metric-card">
                <small>Projeção em 12 meses</small>
                <strong>{formatCurrency(simulation.recovered * 12)}</strong>
                <span>soma simples do valor mensal para dimensionar impacto</span>
              </div>
              <div className="metric-card metric-card-pulse">
                <small>Receita bruta mensal estimada</small>
                <strong>{formatCurrency(simulation.gross)}</strong>
                <span>base de cálculo do cenário</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section flow-section" id="como-funciona">
          <div className="section-heading" data-reveal>
            <span>Como funciona</span>
            <h2>Da falha ao valor recuperado.</h2>
            <p>Nossa engine trabalha em background, sem afetar a performance do seu site ou a experiência do usuário.</p>
          </div>

          <div className="flow-grid">
            <FlowCard
              icon={<Gauge size={22} />}
              title="Detecta"
              text="Monitoramos cada requisição no seu checkout e identificamos instantaneamente cartão negado ou PIX não pago."
            />
            <FlowCard
              icon={<Lightning size={22} />}
              title="Aciona"
              text="Nossa IA envia no WhatsApp uma mensagem personalizada com um novo link de pagamento, no momento ideal."
            />
            <FlowCard
              icon={<ChartLineUp size={22} />}
              title="Mostra"
              text="Você acompanha em tempo real cada venda recuperada e o impacto direto na sua receita através do painel."
            />
          </div>
        </section>

        <section className="section outcomes-section">
          <div className="section-heading" data-reveal>
            <span>Benefícios</span>
            <h2>Mais receita, menos retrabalho, mais controle.</h2>
          </div>

          <div className="outcomes-grid">
            <BenefitCard icon={<TrendUp size={22} />} title="Implementação em minutos" text="Sem código complexo. Integração nativa com as principais gateways de pagamento do Brasil." />
            <BenefitCard icon={<CursorClick size={22} />} title="Retry inteligente" text="A engine tenta novamente a cobrança em janelas com maior probabilidade de aprovação." />
            <BenefitCard icon={<ChartLineUp size={22} />} title="Foco no resultado" text="Sua equipe para de perder tempo com tentativas manuais e foca no que realmente escala." />
            <BenefitCard icon={<Lock size={22} />} title="Compliance total" text="Operação alinhada à LGPD e a boas práticas de segurança em pagamentos." />
          </div>
        </section>

        <section className="section before-after-section">
          <div className="section-heading" data-reveal>
            <span>Antes e depois</span>
            <h2>Antes a venda falhava. Agora ela entra em recuperação.</h2>
          </div>

          <div className="before-after-toggle" data-reveal>
            <button type="button" className={beforeAfter === "before" ? "active" : ""} onClick={() => setBeforeAfter("before")}>
              Antes
            </button>
            <button type="button" className={beforeAfter === "after" ? "active" : ""} onClick={() => setBeforeAfter("after")}>
              Depois
            </button>
          </div>

          <div className="before-after-panel" data-reveal>
            {beforeAfter === "before" ? (
              <ul>
                <li>O cliente sai do checkout sem retorno.</li>
                <li>Equipe tenta contato manual depois.</li>
                <li>Tentativas de cobrança inconsistentes.</li>
              </ul>
            ) : (
              <ul>
                <li>Intervenção automática em milissegundos.</li>
                <li>WhatsApp enviado em até 2 minutos.</li>
                <li>Retry baseado em comportamento.</li>
              </ul>
            )}
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="section-heading" data-reveal>
            <span>FAQ</span>
            <h2>Respostas curtas para objeções reais.</h2>
          </div>

          <div className="faq-list" data-reveal>
            {faqs.map((faq, index) => {
              const open = openFaq === index;
              return (
                <article key={faq.question} className={`faq-item ${open ? "open" : ""}`}>
                  <button type="button" onClick={() => setOpenFaq(open ? -1 : index)}>
                    <span>{faq.question}</span>
                    <ArrowRight size={18} />
                  </button>
                  <div className="faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="section final-cta-section" id="cta-final" data-reveal>
          <div className="final-cta-card">
            <div>
              <span>CTA final</span>
              <h2>Se sua operação perde vendas no checkout, você pode recuperar isso automaticamente.</h2>
              <p>Veja onde sua receita está vazando e simule o impacto no seu caixa.</p>
            </div>
            <div className="final-cta-actions">
              <a className="btn-primary" href="#simulador">
                Ver planos
                <ArrowRight size={18} />
              </a>
              <a className="btn-secondary" href="#simulador">
                Simular recuperação
              </a>
            </div>
          </div>
        </section>
      </main>

      <a className="sticky-mobile-cta" href="#cta-final">
        Ver planos
      </a>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  prefix = "",
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <div className="range-control-top">
        <span>{label}</span>
        <strong>
          {prefix}
          {value}
          {suffix}
        </strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function FlowCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="flow-card" data-reveal>
      <div className="flow-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function BenefitCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="benefit-card" data-reveal>
      <div className="benefit-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function WarningPulse() {
  return (
    <div className="warning-pulse" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
