/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  useInView,
  animate,
} from 'motion/react';
import { 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Minus, 
  ChevronDown, 
  Rocket, 
  Brain, 
  Users, 
  ShieldCheck,
  CreditCard,
  QrCode,
  ShoppingCart,
  TrendingUp,
  BarChart3,
  Menu,
  X,
  Star,
  Quote,
  Activity,
  Zap,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

/** Painel `@re/web` (login Supabase na raiz). Override: `VITE_DASHBOARD_URL` no `.env` da LP. */
const DASHBOARD_URL =
  (import.meta.env.VITE_DASHBOARD_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? 'http://127.0.0.1:5173' : 'https://app.recpay.com.br');

const STRIPE_MODE = ((): 'test' | 'live' => {
  const raw = (import.meta.env.VITE_STRIPE_MODE as string | undefined)?.trim().toLowerCase();
  return raw === 'live' ? 'live' : 'test';
})();

const STRIPE_CHECKOUT_LINKS = {
  test: {
    essential: {
      monthly: (import.meta.env.VITE_STRIPE_TEST_LINK_ESSENTIAL_MONTHLY as string | undefined)?.trim() || '',
      yearly: (import.meta.env.VITE_STRIPE_TEST_LINK_ESSENTIAL_YEARLY as string | undefined)?.trim() || '',
    },
    growth: {
      monthly: (import.meta.env.VITE_STRIPE_TEST_LINK_GROWTH_MONTHLY as string | undefined)?.trim() || '',
      yearly: (import.meta.env.VITE_STRIPE_TEST_LINK_GROWTH_YEARLY as string | undefined)?.trim() || '',
    },
  },
  live: {
    essential: {
      monthly:
        (import.meta.env.VITE_STRIPE_LIVE_LINK_ESSENTIAL_MONTHLY as string | undefined)?.trim() ||
        (import.meta.env.VITE_STRIPE_LINK_ESSENTIAL_MONTHLY as string | undefined)?.trim() ||
        '',
      yearly:
        (import.meta.env.VITE_STRIPE_LIVE_LINK_ESSENTIAL_YEARLY as string | undefined)?.trim() ||
        (import.meta.env.VITE_STRIPE_LINK_ESSENTIAL_YEARLY as string | undefined)?.trim() ||
        '',
    },
    growth: {
      monthly:
        (import.meta.env.VITE_STRIPE_LIVE_LINK_GROWTH_MONTHLY as string | undefined)?.trim() ||
        (import.meta.env.VITE_STRIPE_LINK_GROWTH_MONTHLY as string | undefined)?.trim() ||
        '',
      yearly:
        (import.meta.env.VITE_STRIPE_LIVE_LINK_GROWTH_YEARLY as string | undefined)?.trim() ||
        (import.meta.env.VITE_STRIPE_LINK_GROWTH_YEARLY as string | undefined)?.trim() ||
        '',
    },
  },
} as const;

const SALES_CONTACT_URL =
  (import.meta.env.VITE_SALES_CONTACT_URL as string | undefined)?.trim() || '#cta-final';

const PROBLEMA_ITEMS = [
  {
    id: 'card',
    title: 'Cartão recusado',
    description:
      'Antifraude e instabilidade bancária barram bons clientes. Sem uma segunda tentativa rápida, o pedido morre e você perde o CAC investido.',
    cta: 'Ver fluxo após recusa',
    anchor: '#como-funciona',
    Icon: CreditCard,
  },
  {
    id: 'pix',
    title: 'PIX expirado',
    description:
      'A intenção de compra é real, mas o prazo acaba. Quem não recebe lembrete no tempo certo costuma não voltar sozinho.',
    cta: 'Ver lembrete e novo PIX',
    anchor: '#como-funciona',
    Icon: QrCode,
  },
  {
    id: 'abandonment',
    title: 'Abandono no checkout',
    description:
      'Dúvida de última hora ou distração. Reagir nos primeiros minutos muda o resultado — quem espera 24h perde calor da venda.',
    cta: 'Ver reengajamento automático',
    anchor: '#como-funciona',
    Icon: ShoppingCart,
  },
] as const;

const BENEFIT_ITEMS: {
  Icon: typeof Rocket;
  title: string;
  desc: string;
}[] = [
  {
    Icon: Rocket,
    title: 'Implementação em minutos',
    desc: 'Sem código complexo. Integração nativa com as principais gateways de pagamento do Brasil.',
  },
  {
    Icon: Brain,
    title: 'Retry inteligente',
    desc: 'A engine tenta novamente a cobrança em janelas com maior probabilidade de aprovação.',
  },
  {
    Icon: Users,
    title: 'Foco no sucesso',
    desc: 'Sua equipe deixa de perseguir cada caso no manual e ganha tempo para estratégia e escala.',
  },
  {
    Icon: ShieldCheck,
    title: 'Compliance total',
    desc: 'Operação alinhada à LGPD e a boas práticas de segurança em pagamentos.',
  },
];

/**
 * IntersectionObserver em mobile costuma falhar com margin negativa + amount alto:
 * o bloco fica em `hidden` (opacity 0) e a página parece “em branco” até dar refresh.
 * Margin positiva amplia a área de detecção; amount baixo exige menos pixels visíveis.
 */
const viewportEnter = { once: true, margin: '0px 0px 200px 0px' as const, amount: 0.01 as const };

/** Provas sociais — depoimentos fictícios para demonstração de UI; métricas com linguagem de referência. */
const SOCIAL_STATS = [
  { label: 'Tempo até o 1º acionamento', value: '< 2 min', hint: 'mediana operacional' },
  {
    label: 'Recusas no pagamento (referência de mercado)',
    value: '15–25%',
    hint: 'faixa citada em pesquisas de e-commerce BR; varia por operação',
  },
  { label: 'Operações acompanhadas', value: '500+', hint: 'base acompanhada' },
] as const;

const SOCIAL_TESTIMONIALS = [
  {
    id: 't1',
    quote:
      'O retry deixou de ser tentativa e virou processo. Menos esforço manual e mais pedidos pagos com rastreio claro.',
    name: 'Operação parceira',
    role: 'Depoimento',
    company: 'Uso ilustrativo',
    rating: 5,
  },
  {
    id: 't2',
    quote:
      'A intenção de compra já existia. O ganho veio quando a recuperação começou a acontecer no timing certo.',
    name: 'Operação digital',
    role: 'Financeiro',
    company: 'Caso ilustrativo',
    rating: 5,
  },
  {
    id: 't3',
    quote:
      'O painel deu clareza sobre o que estava vazando no checkout e o que de fato voltou para o caixa.',
    name: 'Operação de alto volume',
    role: 'Operações',
    company: 'Caso ilustrativo',
    rating: 5,
  },
] as const;

/** Eventos de exemplo do tipo exibido no painel (demonstração visual, não dados ao vivo). */
const ACTIVITY_FEED_ITEMS = [
  { type: 'retry', text: 'Cartão aprovado na 2ª tentativa', detail: 'R$ 342,90 · Visa', time: 'há 1 min' },
  { type: 'pix', text: 'PIX reenviado e confirmado', detail: 'Cliente · Grande SP', time: 'há 3 min' },
  { type: 'cart', text: 'Carrinho recuperado via WhatsApp', detail: 'Infoproduto · order #84**', time: 'há 4 min' },
  { type: 'retry', text: 'Novo link de pagamento gerado', detail: 'Boleto → PIX', time: 'há 6 min' },
  { type: 'pix', text: 'Lembrete disparado — PIX em aberto', detail: 'R$ 97,00 · expira em 18 min', time: 'há 8 min' },
] as const;

const SOCIAL_SECTORS = [
  'E-commerce',
  'Suplementos',
  'Moda',
  'SaaS B2B',
  'Infoprodutos',
  'Cosméticos',
  'Eletrônicos',
  'Marketplaces',
] as const;

/** Entrada em grupo sem stagger — dois painéis no mesmo instante. */
const enterSync = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0, delayChildren: 0 },
  },
} as const;

/** Desconto sobre o total anual vs 12× mensal (ex.: 20% = paga 9,6 meses pelo ano). */
const ANNUAL_DISCOUNT_FRAC = 0.2;

const PRICING_PLANS = [
  {
    name: 'Essencial',
    description: 'Para estruturar recuperação com volume moderado.',
    monthlyPrice: 197,
    features: [
      'Até 100 recuperações/mês',
      'Webhooks no limite do plano',
      'Painel e métricas',
      'Suporte por e-mail',
    ],
    cta: 'Assinar Essencial',
    highlighted: false,
  },
  {
    name: 'Growth',
    description: 'O equilíbrio entre escala e custo — o mais escolhido.',
    monthlyPrice: 497,
    features: [
      'Até 300 recuperações/mês',
      'Mais eventos que o Essencial',
      'Retry + WhatsApp',
      'API e webhook com token',
      'Suporte prioritário',
    ],
    cta: 'Assinar Growth',
    highlighted: true,
  },
  {
    name: 'Scale',
    description: 'Volume alto, multi-tenant e requisitos enterprise.',
    monthlyPrice: 997,
    features: [
      'Limites e excedente no contrato',
      'Pacote fechado com o comercial',
      'Times e permissões (quem vê o quê)',
      'SLA e onboarding',
      'Customer success',
    ],
    cta: 'Falar com vendas',
    highlighted: false,
  },
] as const;

function resolvePricingHref(planName: (typeof PRICING_PLANS)[number]['name'], cycle: 'monthly' | 'yearly') {
  const links = STRIPE_CHECKOUT_LINKS[STRIPE_MODE];
  switch (planName) {
    case 'Essencial':
      return links.essential[cycle];
    case 'Growth':
      return links.growth[cycle];
    case 'Scale':
      return SALES_CONTACT_URL;
    default:
      return '';
  }
}

function monthlyEquivalent(monthlyList: number) {
  return Math.round(monthlyList * (1 - ANNUAL_DISCOUNT_FRAC));
}

function yearlyCharge(monthlyList: number) {
  return Math.round(monthlyList * (1 - ANNUAL_DISCOUNT_FRAC) * 12);
}

function ConversionRateCounter({ rate, className }: { rate: number; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '0px 0px 120px 0px', amount: 0.01 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    if (reduce) {
      setDisplay(rate);
      return;
    }
    const ctrl = animate(0, rate, {
      duration: 1.25,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => ctrl.stop();
  }, [isInView, rate, reduce]);

  return (
    <motion.div
      ref={ref}
      className={cn('font-headline text-2xl font-bold tabular-nums sm:text-3xl md:text-4xl', className)}
      initial={{ opacity: 0, y: reduce ? 0 : 28 }}
      animate={
        isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 28 }
      }
      transition={{ duration: reduce ? 0.2 : 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      Taxa de Conversão: {display.toFixed(1)}%
    </motion.div>
  );
}

function useEnterVariants() {
  const reduce = useReducedMotion();
  return useMemo(
    () => ({
      stagger: {
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduce ? 0 : 0.08,
            delayChildren: reduce ? 0 : 0.04,
          },
        },
      },
      item: {
        hidden: { opacity: 0, y: reduce ? 0 : 28 },
        show: {
          opacity: 1,
          y: 0,
          transition: reduce
            ? { duration: 0.2 }
            : { type: 'spring' as const, stiffness: 300, damping: 28 },
        },
      },
    }),
    [reduce],
  );
}

/** Normaliza o ponteiro na viewport (-1…1) com suavização; desliga com prefers-reduced-motion. */
function usePointerSpring(reduce: boolean) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 90, damping: 26, mass: 0.35 });
  const springY = useSpring(y, { stiffness: 90, damping: 26, mass: 0.35 });

  useEffect(() => {
    if (reduce) {
      x.set(0);
      y.set(0);
      return;
    }
    const onMove = (e: MouseEvent) => {
      x.set((e.clientX / window.innerWidth - 0.5) * 2);
      y.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduce, x, y]);

  return { x: springX, y: springY };
}

function ScrollReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-[100] h-[3px] w-full bg-primary"
      style={{ scaleX, transformOrigin: '0% 50%' }}
      aria-hidden
    />
  );
}

function HeroDashboardMockup({
  enter,
}: {
  enter: ReturnType<typeof useEnterVariants>;
}) {
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sMx = useSpring(mx, { stiffness: 280, damping: 32 });
  const sMy = useSpring(my, { stiffness: 280, damping: 32 });
  const rotateX = useTransform(sMy, [-1, 1], [5, -5]);
  const rotateY = useTransform(sMx, [-1, 1], [-5, 5]);

  const onCardPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  const onCardLeave = () => {
    mx.set(0);
    my.set(0);
  };

  const chartPulse = !reduce;

  return (
    <motion.div
      ref={cardRef}
      initial="hidden"
      whileInView="show"
      viewport={viewportEnter}
      variants={enter.item}
      onPointerMove={onCardPointer}
      onPointerLeave={onCardLeave}
      style={
        reduce
          ? undefined
          : {
              rotateX,
              rotateY,
              transformPerspective: 1100,
              transformStyle: 'preserve-3d' as const,
            }
      }
      className="group relative mx-auto mt-12 max-w-4xl rounded-2xl border border-slate-100 bg-white p-4 shadow-2xl will-change-transform sm:mt-20 sm:rounded-[2.5rem] sm:p-8"
    >
      <div className="mb-5 flex items-center justify-between gap-2 sm:mb-8">
        <span className="truncate font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant sm:text-xs sm:tracking-widest">
          RECPAY_DASHBOARD_v2
        </span>
        <div className="flex gap-2">
          <div className="h-3 w-3 rounded-full bg-red-400/20" />
          <div className="h-3 w-3 rounded-full bg-primary/20" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-left sm:rounded-2xl sm:p-6">
          <span className="font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant sm:text-xs">
            Receita recuperável
          </span>
          <div className="mt-2 font-headline text-2xl font-bold text-primary sm:text-3xl">R$ 142.850,00</div>
          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '75%' }}
              transition={{ duration: 1.5, delay: 0.5 }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </div>

        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-left sm:rounded-2xl sm:p-6">
          <span className="font-headline text-[10px] font-bold uppercase tracking-widest text-red-600 sm:text-xs">Vazamento diário</span>
          <div className="mt-2 font-headline text-2xl font-bold text-red-600 sm:text-3xl">R$ 12.400,00</div>
          <div className="mt-2 flex items-center gap-1 text-xs font-bold text-red-600/70">
            <TrendingUp size={14} /> +4.2% vs ontem
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-6 md:col-span-2 md:gap-4 md:rounded-2xl md:p-10">
          {chartPulse ? (
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
              <BarChart3 size={48} className="text-primary/30" />
            </motion.div>
          ) : (
            <BarChart3 size={48} className="text-primary/30" />
          )}
          <p className="text-sm font-medium text-on-surface-variant">Processamento de fluxo em tempo real...</p>
        </div>
      </div>
    </motion.div>
  );
}

function BenefitsSection({
  enter,
}: {
  enter: ReturnType<typeof useEnterVariants>;
}) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sMx = useSpring(mx, { stiffness: 70, damping: 24 });
  const sMy = useSpring(my, { stiffness: 70, damping: 24 });
  const auroraX = useTransform(sMx, [-1, 1], [-28, 28]);
  const auroraY = useTransform(sMy, [-1, 1], [-18, 18]);

  useEffect(() => {
    const el = sectionRef.current;
    if (reduce || !el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mx.set(((e.clientX - r.left) / Math.max(r.width, 1) - 0.5) * 2);
      my.set(((e.clientY - r.top) / Math.max(r.height, 1) - 0.5) * 2);
    };
    const reset = () => {
      mx.set(0);
      my.set(0);
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', reset);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', reset);
    };
  }, [reduce, mx, my]);

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-on-surface px-4 py-14 text-white sm:px-6 sm:py-20 lg:py-24">
      <motion.div
        className="pointer-events-none absolute -left-1/4 -right-1/4 -top-1/2 bottom-0 z-0 min-h-[120%]"
        style={reduce ? undefined : { x: auroraX, y: auroraY }}
        aria-hidden
      >
        <div className="benefits-aurora h-full min-h-[120%] w-full" />
      </motion.div>
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-on-surface via-on-surface/40 to-on-surface"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        aria-hidden
      />

      <motion.div
        className="relative z-10 mx-auto max-w-7xl"
        initial="hidden"
        whileInView="show"
        viewport={viewportEnter}
        variants={enter.stagger}
      >
        <motion.div className="mb-10 sm:mb-14 lg:mb-16" variants={enter.item}>
          <span className="inline-flex items-center gap-2 font-headline text-[10px] font-bold uppercase tracking-widest text-primary sm:text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Benefícios
          </span>
          <h2 className="mt-3 max-w-4xl font-headline text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl lg:text-5xl">
            Mais receita, menos retrabalho, mais controle.
          </h2>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {BENEFIT_ITEMS.map((item) => {
            const Icon = item.Icon;
            return (
              <motion.article
                key={item.title}
                variants={enter.item}
                whileHover={{
                  y: -10,
                  transition: { type: 'spring', stiffness: 420, damping: 28 },
                }}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-lg shadow-black/20 backdrop-blur-sm transition-colors hover:border-primary/35 hover:bg-white/[0.1] sm:p-7"
              >
                <div className="mb-5 inline-flex rounded-xl bg-primary/15 p-3 text-primary ring-1 ring-primary/25 transition-transform duration-300 group-hover:scale-110 group-hover:ring-primary/40">
                  <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="mb-2 font-headline text-lg font-bold text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-white/65">{item.desc}</p>
                <div
                  className="pointer-events-none absolute inset-x-6 bottom-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-all duration-300 group-hover:scale-x-100 group-hover:opacity-100"
                  aria-hidden
                />
              </motion.article>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}

function SocialProofSection({ enter }: { enter: ReturnType<typeof useEnterVariants> }) {
  const reduce = useReducedMotion();
  const [feedIdx, setFeedIdx] = useState(0);
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setFeedIdx((i) => (i + 1) % ACTIVITY_FEED_ITEMS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setQuoteIdx((i) => (i + 1) % SOCIAL_TESTIMONIALS.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [reduce]);

  const activeFeed = ACTIVITY_FEED_ITEMS[feedIdx];
  const featured = SOCIAL_TESTIMONIALS[quoteIdx];

  return (
    <section
      id="provas"
      className="scroll-mt-20 grid-lines border-y border-slate-200/80 bg-surface px-4 py-14 sm:scroll-mt-28 sm:px-6 sm:py-20 lg:py-24"
      aria-labelledby="provas-heading"
    >
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="mb-10 text-center sm:mb-14"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          <motion.span variants={enter.item} className="font-headline text-xs font-bold uppercase tracking-widest text-primary">
            Provas
          </motion.span>
          <motion.h2
            id="provas-heading"
            variants={enter.item}
            className="mt-3 font-headline text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl lg:text-5xl"
          >
            Quem vende em escala sente no caixa.
          </motion.h2>
          <motion.p variants={enter.item} className="mx-auto mt-3 max-w-2xl text-sm text-on-surface-variant sm:mt-4 sm:text-base">
            Faixas de mercado para contexto, depoimentos ilustrativos e um fluxo que lembra o painel — métricas reais vêm do seu rastreio.
          </motion.p>
        </motion.div>

        <motion.div
          className="mb-10 grid gap-4 sm:mb-12 sm:grid-cols-3 sm:gap-5"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          {SOCIAL_STATS.map((s) => (
            <motion.div
              key={s.label}
              variants={enter.item}
              className="rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm sm:rounded-3xl sm:p-6"
            >
              <p className="font-headline text-[10px] font-bold uppercase tracking-wider text-on-surface-variant sm:text-xs">{s.label}</p>
              <p className="mt-2 font-headline text-2xl font-bold tracking-tight text-primary sm:text-3xl">{s.value}</p>
              <p className="mt-2 text-xs text-on-surface-variant">{s.hint}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="mb-10 overflow-hidden rounded-2xl border border-slate-100 bg-white/90 py-3 sm:mb-12 sm:rounded-full sm:py-3.5"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportEnter}
          transition={{ duration: 0.4 }}
        >
          <p className="sr-only">Setores de atuação</p>
          <div className="flex items-center gap-6 whitespace-nowrap px-4 animate-marquee sm:gap-10 md:gap-12">
            {[1, 2].map((dup) => (
              <div
                key={dup}
                className="flex items-center gap-6 font-headline text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80 sm:gap-10 sm:text-xs sm:tracking-widest md:gap-12"
              >
                {SOCIAL_SECTORS.map((sec) => (
                  <span key={`${dup}-${sec}`} className="inline-flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
                    {sec}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="grid gap-8 lg:grid-cols-12 lg:gap-10 lg:items-stretch"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          <motion.div
            variants={enter.item}
            className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-on-surface p-5 text-white shadow-xl sm:rounded-3xl sm:p-7 lg:col-span-5"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/25 blur-3xl" aria-hidden />
            <div className="relative z-[1] flex items-center gap-2 font-headline text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
              <Activity className="h-4 w-4 text-primary" aria-hidden />
              Atividade (exemplo de painel)
            </div>
            <p className="relative z-[1] mt-1 text-xs text-white/55">
              Ilustração do tipo de evento exibido ao vivo — não é feed real desta página.
            </p>

            <div className="relative z-[1] mt-6 min-h-[7.5rem] sm:min-h-[8rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFeed.text + feedIdx}
                  initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduce ? 0 : -8 }}
                  transition={{ duration: reduce ? 0.12 : 0.28 }}
                  className="rounded-xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-md bg-primary/20 px-2 py-0.5 font-headline text-[10px] font-bold uppercase tracking-wide text-primary">
                      {activeFeed.type === 'retry' ? 'Retry' : activeFeed.type === 'pix' ? 'PIX' : 'Recuperação'}
                    </span>
                    <span className="shrink-0 text-[10px] text-white/45 sm:text-xs">{activeFeed.time}</span>
                  </div>
                  <p className="mt-3 font-headline text-sm font-semibold leading-snug sm:text-base">{activeFeed.text}</p>
                  <p className="mt-1 text-xs text-white/55">{activeFeed.detail}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="relative z-[1] mt-4 flex flex-wrap gap-2">
              {ACTIVITY_FEED_ITEMS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Mostrar evento ${i + 1}`}
                  onClick={() => setFeedIdx(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === feedIdx ? 'w-8 bg-primary' : 'w-1.5 bg-white/25 hover:bg-white/40',
                  )}
                />
              ))}
            </div>
          </motion.div>

          <motion.div
            variants={enter.item}
            className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-lg sm:rounded-3xl sm:p-8 lg:col-span-7"
          >
            <Quote className="absolute right-5 top-5 h-10 w-10 text-primary/[0.12] sm:h-14 sm:w-14" aria-hidden />
            <div>
              <div className="flex items-center gap-1 text-primary" aria-hidden>
                {Array.from({ length: featured.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-primary/15 sm:h-5 sm:w-5" strokeWidth={1.5} />
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.blockquote
                  key={featured.id}
                  initial={{ opacity: 0, y: reduce ? 0 : 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduce ? 0 : -8 }}
                  transition={{ duration: reduce ? 0.15 : 0.35 }}
                  className="relative z-[1] mt-4 text-lg font-medium leading-relaxed text-on-surface sm:text-xl"
                >
                  “{featured.quote}”
                </motion.blockquote>
              </AnimatePresence>
            </div>
            <div className="relative z-[1] mt-8 flex flex-col gap-1 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-headline font-bold text-on-surface">{featured.name}</p>
                <p className="text-sm text-on-surface-variant">
                  {featured.role} · {featured.company}
                </p>
              </div>
              <div className="flex gap-1.5 pt-2 sm:pt-0">
                {SOCIAL_TESTIMONIALS.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={`Depoimento ${i + 1}`}
                    aria-current={quoteIdx === i}
                    onClick={() => setQuoteIdx(i)}
                    className={cn(
                      'h-2 rounded-full transition-all',
                      quoteIdx === i ? 'w-8 bg-primary' : 'w-2 bg-slate-200 hover:bg-slate-300',
                    )}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          className="mt-10 grid gap-5 md:grid-cols-3 lg:mt-12 lg:gap-6"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          {SOCIAL_TESTIMONIALS.map((t) => (
            <motion.article
              key={t.id}
              variants={enter.item}
              className="flex flex-col rounded-2xl border border-slate-100 bg-slate-50/80 p-5 transition-colors hover:border-primary/25 hover:bg-white sm:p-6"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary font-headline text-sm font-bold text-white"
                  aria-hidden
                >
                  {t.name
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join('')}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-headline text-sm font-bold text-on-surface">{t.name}</p>
                  <p className="truncate text-xs text-on-surface-variant">{t.role}</p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-on-surface-variant">“{t.quote.slice(0, 118)}{t.quote.length > 118 ? '…' : ''}”</p>
              <div className="mt-4 flex items-center gap-1 text-primary" aria-hidden>
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-primary/12" strokeWidth={1.5} />
                ))}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// --- Components ---

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6 md:pt-4"
      aria-label="Navegação principal"
    >
      <div className="relative mx-auto max-w-7xl">
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-[2rem] border border-transparent px-4 py-2.5 transition-all duration-500 sm:rounded-[2.25rem] sm:px-5 sm:py-3 md:gap-4',
            isScrolled ? 'nav-liquid-glass nav-liquid-glass--scrolled' : 'bg-transparent',
          )}
        >
          <a href="#" className="flex min-w-0 shrink items-center gap-2" aria-label="RecPay — início">
            <img src="/brand/logo-c.svg" alt="RecPay" className="h-7 w-auto max-w-[min(200px,46vw)] sm:h-8" width={160} height={45} />
          </a>

          <div className="hidden md:flex md:flex-1 md:items-center md:justify-center md:gap-8 md:text-sm md:font-medium">
            <a href="#problema" className="text-on-surface-variant transition-colors hover:text-primary">
              Problema
            </a>
            <a href="#como-funciona" className="text-on-surface-variant transition-colors hover:text-primary">
              Como funciona
            </a>
            <a href="#simulador" className="text-on-surface-variant transition-colors hover:text-primary">
              Simulador
            </a>
            <a href="#provas" className="text-on-surface-variant transition-colors hover:text-primary">
              Provas
            </a>
            <a href="#planos" className="text-on-surface-variant transition-colors hover:text-primary">
              Planos
            </a>
            <a href="#faq" className="text-on-surface-variant transition-colors hover:text-primary">
              FAQ
            </a>
          </div>

          <div className="hidden shrink-0 md:flex md:items-center md:gap-4">
            <a
              href={DASHBOARD_URL}
              className="font-semibold text-on-surface-variant transition-colors hover:text-primary"
            >
              Login
            </a>
            <a
              href="#planos"
              className="rounded-full bg-primary px-5 py-2.5 font-headline text-sm font-bold text-white transition-all hover:opacity-90 sm:px-6"
            >
              Ver planos
            </a>
          </div>

          <button
            type="button"
            className="shrink-0 rounded-xl p-2 text-on-surface md:hidden"
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="nav-liquid-glass nav-liquid-glass--panel absolute left-0 right-0 top-[calc(100%+10px)] z-50 flex max-h-[min(70vh,calc(100dvh-8rem))] flex-col gap-3 overflow-y-auto rounded-[1.25rem] p-4 sm:gap-4 sm:rounded-[2.25rem] sm:p-5 md:hidden"
            >
              <a href="#problema" onClick={() => setIsMobileMenuOpen(false)} className="text-lg font-medium">
                Problema
              </a>
              <a href="#como-funciona" onClick={() => setIsMobileMenuOpen(false)} className="text-lg font-medium">
                Como funciona
              </a>
              <a href="#simulador" onClick={() => setIsMobileMenuOpen(false)} className="text-lg font-medium">
                Simulador
              </a>
              <a href="#provas" onClick={() => setIsMobileMenuOpen(false)} className="text-lg font-medium">
                Provas
              </a>
              <a href="#planos" onClick={() => setIsMobileMenuOpen(false)} className="text-lg font-medium">
                Planos
              </a>
              <a href="#faq" onClick={() => setIsMobileMenuOpen(false)} className="text-lg font-medium">
                FAQ
              </a>
              <hr className="border-slate-200" />
              <a
                href={DASHBOARD_URL}
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-left text-lg font-medium"
              >
                Login
              </a>
              <a
                href="#planos"
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-full bg-primary px-6 py-3 text-center font-bold text-white"
              >
                Ver planos
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
};

/**
 * Fração da perda no checkout que vira recuperação no cenário ilustrativo.
 * Alinhado à faixa ~10–20% do vazamento em materiais de mercado (ver docs/PRECIFICACAO.md) — não é teto nem garantia.
 */
const SIM_RECUPERACAO_FRAC = 0.2;

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Cenário inicial alinhado a infoprodutor: poucas dezenas de vendas/mês e ticket médio típico (receita ≈ dezenas de mil R$). */
const SIM_DEFAULT_VENDAS = 45;
const SIM_DEFAULT_TICKET = 397;

const Simulator = () => {
  const enter = useEnterVariants();
  const [vendas, setVendas] = useState(SIM_DEFAULT_VENDAS);
  const [ticket, setTicket] = useState(SIM_DEFAULT_TICKET);
  const [taxaFalha, setTaxaFalha] = useState(22);

  const metrics = useMemo(() => {
    const receitaMensal = vendas * ticket;
    const perdaMensal = receitaMensal * (taxaFalha / 100);
    const recuperacaoPotencial = perdaMensal * SIM_RECUPERACAO_FRAC;
    const recuperacaoAnualProjetada = recuperacaoPotencial * 12;
    return { receitaMensal, perdaMensal, recuperacaoPotencial, recuperacaoAnualProjetada };
  }, [vendas, ticket, taxaFalha]);

  const { receitaMensal, perdaMensal, recuperacaoPotencial, recuperacaoAnualProjetada } = metrics;

  return (
    <section id="simulador" className="grid-lines bg-surface-container-low px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="mb-8 text-center sm:mb-16"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          <motion.span variants={enter.item} className="text-primary font-bold tracking-widest text-xs uppercase font-headline">
            Simulador
          </motion.span>
          <motion.h2
            variants={enter.item}
            className="mt-3 font-headline text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl lg:text-5xl"
          >
            Veja quanto dinheiro pode estar ficando para trás.
          </motion.h2>
          <motion.p variants={enter.item} className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant sm:mt-4 sm:text-base">
            O destaque é a <strong className="text-on-surface font-headline">perda mensal</strong> no checkout (falha, abandono, PIX). A recuperação abaixo usa uma faixa típica de conversão da perda em receita recuperada — o resultado real depende do seu funil e da operação.
          </motion.p>
        </motion.div>

        <motion.div
          className="grid gap-8 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:gap-12 sm:rounded-[3rem] sm:p-8 lg:grid-cols-2 lg:p-16"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          <motion.div variants={enter.item} className="flex flex-col gap-6 sm:gap-10">
            <p className="-mb-1 text-xs text-on-surface-variant sm:-mb-2 sm:text-sm">
              Receita bruta mensal estimada:{' '}
              <strong className="text-on-surface font-headline">R$ {formatBRL(receitaMensal)}</strong>
              <span className="block mt-1 text-on-surface-variant/90">
                (vendas × ticket — poucas vendas com ticket alto equivalem a muitas vendas baratas)
              </span>
            </p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-bold text-on-surface font-headline sm:text-base">Vendas por mês</label>
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold font-headline">{vendas.toLocaleString('pt-BR')}</span>
              </div>
              <input 
                type="range" min="5" max="1200" step="5" value={vendas}
                onChange={(e) => setVendas(Number(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Muitos criadores ficam entre <strong className="text-on-surface font-medium">dezenas</strong> de vendas por mês — ajuste para o seu caso.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-bold text-on-surface font-headline sm:text-base">Ticket médio (R$)</label>
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold font-headline">R$ {ticket}</span>
              </div>
              <input 
                type="range" min="50" max="2000" step="50" value={ticket}
                onChange={(e) => setTicket(Number(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-bold leading-snug text-on-surface font-headline sm:text-base">
                  Perda no checkout (% da receita)
                </label>
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold font-headline">{taxaFalha}%</span>
              </div>
              <input 
                type="range" min="5" max="45" step="1" value={taxaFalha}
                onChange={(e) => setTaxaFalha(Number(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Inclui falha de pagamento, abandono e PIX expirado — o que não vira receita mesmo com tráfego aquecido.
              </p>
            </div>
          </motion.div>

          <motion.div
            variants={enter.item}
            className="relative flex min-h-[240px] flex-col justify-between overflow-hidden rounded-2xl bg-primary p-5 text-white sm:min-h-[280px] sm:rounded-3xl sm:p-8"
          >
            <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
            
            <div className="relative z-[1]">
              <span className="text-xs font-bold uppercase tracking-widest opacity-90 font-headline sm:text-sm">
                Perda mensal no checkout
              </span>
              <div className="mt-3 font-headline text-3xl font-bold tabular-nums tracking-tighter sm:mt-4 sm:text-5xl lg:text-6xl">
                R$ {formatBRL(perdaMensal)}
              </div>
              <p className="mt-3 max-w-md text-xs leading-relaxed opacity-85 sm:mt-4 sm:text-sm">
                Estimativa do que deixa de entrar por mês com os percentuais ao lado. É o valor que mais impacta seu caixa — e o que a recuperação tenta trazer de volta.
              </p>

              <div className="mt-6 border-t border-white/20 pt-6 sm:mt-8 sm:pt-8">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 font-headline sm:text-xs">
                  Quanto pode voltar para o caixa (mês)
                </span>
                <div className="mt-2 text-3xl font-bold tracking-tight font-headline tabular-nums sm:text-4xl lg:text-5xl">
                  R$ {formatBRL(recuperacaoPotencial)}
                </div>
                <p className="mt-2 text-xs opacity-80 max-w-md leading-relaxed">
                  Cenário ilustrativo: {Math.round(SIM_RECUPERACAO_FRAC * 100)}% da perda acima — número orientativo; o real depende do funil e da operação.
                </p>
                <div className="mt-6 rounded-xl bg-white/10 p-4 sm:p-5">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-90 font-headline sm:text-xs">
                    Projeção em 12 meses (mesmo cenário)
                  </span>
                  <div className="mt-2 text-xl font-bold font-headline tabular-nums sm:text-2xl">
                    R$ {formatBRL(recuperacaoAnualProjetada)}
                  </div>
                  <p className="mt-1 text-[11px] opacity-75 leading-relaxed">
                    Soma simples do valor mensal — para dimensionar impacto, não previsão contratual.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

const FAQ = () => {
  const enter = useEnterVariants();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const questions = [
    {
      q: "Eu já uso checkout. Por que eu precisaria disso?",
      a: "Porque checkout sozinho não recupera automaticamente as falhas nem mostra quanto voltou para o seu caixa."
    },
    {
      q: 'Como eu sei se vale a pena?',
      a: 'Pela receita recuperada em reais. O simulador dimensiona o vazamento e o painel mostra o retorno da operação com base no seu funil.',
    },
    {
      q: "Serve para operações com várias marcas ou contas?",
      a: "Sim. A estrutura atende operações com múltiplas contas mantendo rastreio e visibilidade do que foi recuperado."
    },
    {
      q: "Isso reduz trabalho manual?",
      a: "Sim. O foco é tirar a recuperação do improviso e transformar as tentativas em processo com menos retrabalho."
    }
  ];

  return (
    <section id="faq" className="grid-lines bg-surface-container-low px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-3xl">
        <motion.div
          className="mb-8 text-center sm:mb-16"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          <motion.span variants={enter.item} className="text-primary font-bold tracking-widest text-xs uppercase font-headline">
            FAQ
          </motion.span>
          <motion.h2 variants={enter.item} className="mt-3 font-headline text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl">
            Respostas curtas para objeções reais.
          </motion.h2>
        </motion.div>

        <motion.div
          className="space-y-4"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          {questions.map((item, i) => (
            <motion.div key={i} variants={enter.item} className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              <button 
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left text-sm font-bold text-on-surface font-headline sm:p-6 sm:text-base"
              >
                <span className="min-w-0 flex-1 leading-snug">{item.q}</span>
                <motion.div
                  animate={{ rotate: openIndex === i ? 45 : 0 }}
                  className="shrink-0 text-primary"
                >
                  <Plus size={20} />
                </motion.div>
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 text-sm leading-relaxed text-on-surface-variant sm:px-6 sm:pb-6">
                      {item.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

function PricingSection() {
  const enter = useEnterVariants();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const isStripeTestMode = STRIPE_MODE === 'test';

  return (
    <section
      id="planos"
      className="scroll-mt-20 grid-lines bg-surface px-4 py-14 sm:scroll-mt-28 sm:px-6 sm:py-20 lg:py-24"
      aria-labelledby="planos-heading"
    >
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="mb-8 text-center sm:mb-12 lg:mb-16"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          <motion.span variants={enter.item} className="font-headline text-xs font-bold uppercase tracking-widest text-primary">
            Planos
          </motion.span>
          <motion.h2
            id="planos-heading"
            variants={enter.item}
            className="mt-3 font-headline text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl lg:text-5xl"
          >
            Transforme perdas do checkout em receita previsível.
          </motion.h2>
          <motion.p variants={enter.item} className="mx-auto mt-4 max-w-2xl text-on-surface-variant">
            Se você já perde vendas no checkout, recuperar uma parte disso já pode pagar o plano.
          </motion.p>

          <motion.div variants={enter.item} className="mt-10 flex flex-col items-center gap-3">
            <div
              className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
              role="group"
              aria-label="Período de cobrança"
            >
              <button
                type="button"
                onClick={() => setCycle('monthly')}
                aria-pressed={cycle === 'monthly'}
                className={cn(
                  'rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors sm:px-6 sm:py-2.5',
                  cycle === 'monthly' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setCycle('yearly')}
                aria-pressed={cycle === 'yearly'}
                className={cn(
                  'rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors sm:px-6 sm:py-2.5',
                  cycle === 'yearly' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                Anual{' '}
                <span className={cycle === 'yearly' ? 'text-white/90' : 'text-primary'}>(−20%)</span>
              </button>
            </div>
            <p className="text-center text-xs text-on-surface-variant">
              {cycle === 'yearly'
                ? 'Valores por mês equivalente; cobrança única anual no checkout.'
                : 'Cobrança mensal recorrente; cancele quando quiser conforme contrato.'}
            </p>
            <p
              className={cn(
                'rounded-full px-3 py-1 text-center text-xs font-semibold uppercase tracking-[0.18em]',
                isStripeTestMode ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900',
              )}
            >
              Stripe em modo {isStripeTestMode ? 'teste' : 'live'}
            </p>
            {isStripeTestMode ? (
              <p className="max-w-xl text-center text-xs text-on-surface-variant">
                Configure os links `VITE_STRIPE_TEST_LINK_*` para testar o checkout sem abrir links de produÃ§Ã£o.
              </p>
            ) : null}
          </motion.div>
        </motion.div>

        <motion.div
          className="grid gap-6 lg:grid-cols-3 lg:gap-5 lg:items-stretch"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          {PRICING_PLANS.map((plan) => {
            const listMonthly = plan.monthlyPrice;
            const displayPerMonth = cycle === 'monthly' ? listMonthly : monthlyEquivalent(listMonthly);
            const yearlyTotal = yearlyCharge(listMonthly);
            const href = resolvePricingHref(plan.name, cycle);
            const isDisabled = !href;
            return (
              <motion.article
                key={plan.name}
                variants={enter.item}
                className={cn(
                  'flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-shadow sm:rounded-3xl sm:p-8',
                  plan.highlighted
                    ? 'relative border-primary shadow-xl shadow-primary/15 ring-2 ring-primary/25 lg:scale-[1.02] lg:z-10'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-md',
                )}
              >
                {plan.highlighted ? (
                  <span className="absolute right-5 top-5 z-10 inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 font-headline text-xs font-bold uppercase tracking-wide text-primary sm:right-8 sm:top-8">
                    Mais popular
                  </span>
                ) : null}
                <h3 className="font-headline text-xl font-bold text-on-surface">{plan.name}</h3>
                <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-on-surface-variant">{plan.description}</p>

                <div className="mt-8 border-b border-slate-100 pb-8">
                  <div className="flex items-baseline gap-1">
                    <span className="font-headline text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
                      R$ {formatBRL(displayPerMonth)}
                    </span>
                    <span className="text-on-surface-variant">/mês</span>
                  </div>
                  {cycle === 'yearly' && (
                    <p className="mt-2 text-sm text-on-surface-variant">
                      <span className="line-through opacity-60">12× R$ {formatBRL(listMonthly)}</span>
                      <span className="mx-2 text-on-surface">→</span>
                      <span className="font-semibold text-primary">R$ {formatBRL(yearlyTotal)}/ano</span> à vista
                    </p>
                  )}
                  {cycle === 'monthly' && (
                    <p className="mt-2 text-sm text-on-surface-variant">Faturamento mensal.</p>
                  )}
                </div>

                <ul className="mt-8 flex flex-1 flex-col gap-3 text-sm text-on-surface-variant">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={href || '#planos'}
                  aria-disabled={isDisabled}
                  target={href && href.startsWith('http') ? '_blank' : undefined}
                  rel={href && href.startsWith('http') ? 'noreferrer' : undefined}
                  className={cn(
                    'mt-10 block w-full rounded-full py-4 text-center font-headline text-sm font-bold transition-all',
                    isDisabled && 'cursor-not-allowed opacity-60',
                    plan.highlighted
                      ? 'bg-primary text-white shadow-lg shadow-primary/25 hover:opacity-95'
                      : 'border border-slate-200 bg-white text-on-surface hover:border-primary/40 hover:bg-primary/5',
                  )}
                  onClick={(event) => {
                    if (!isDisabled) return;
                    event.preventDefault();
                  }}
                >
                  {isDisabled && plan.name !== 'Scale' ? 'Configurar checkout de teste' : plan.cta}
                </a>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

export default function App() {
  const enter = useEnterVariants();
  const [activePain, setActivePain] = useState(0);
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const ctaSectionRef = useRef<HTMLElement>(null);
  const pointer = usePointerSpring(!!reduceMotion);

  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroBlobScrollY = useTransform(heroScrollProgress, (p) => (reduceMotion ? 0 : p * 72));

  const blob1x = useTransform(pointer.x, [-1, 1], [-36, 36]);
  const blob1y = useTransform(pointer.y, [-1, 1], [-28, 28]);
  const blob1yCombined = useTransform([blob1y, heroBlobScrollY], ([py, sy]) => Number(py) + Number(sy));
  const blob2x = useTransform(pointer.x, [-1, 1], [24, -24]);
  const blob2y = useTransform(pointer.y, [-1, 1], [20, -20]);

  const { scrollYProgress: ctaScrollProgress } = useScroll({
    target: ctaSectionRef,
    offset: ['start 0.9', 'end 0.1'],
  });
  const ctaGlowY = useTransform(ctaScrollProgress, [0, 1], [16, -16]);
  const ctaGlowOpacity = useTransform(ctaScrollProgress, [0, 0.45, 1], [0.35, 0.55, 0.35]);

  return (
    <div className="min-h-screen overflow-x-hidden selection:bg-primary/20 selection:text-primary">
      <ScrollReadingProgress />
      <Navbar />

      {/* Hero Section */}
      <header ref={heroRef} className="relative grid-lines overflow-hidden px-4 pb-12 pt-28 sm:px-6 sm:pb-16 sm:pt-36 md:pb-20 md:pt-40">
        <motion.div
          className="pointer-events-none absolute left-[12%] top-24 h-[min(420px,55vw)] w-[min(420px,55vw)] rounded-full bg-primary/[0.09] blur-3xl"
          style={reduceMotion ? undefined : { x: blob1x, y: blob1yCombined }}
          aria-hidden
        />
        <motion.div
          className="pointer-events-none absolute right-[8%] top-[28%] h-[min(340px,48vw)] w-[min(340px,48vw)] rounded-full bg-primary-container/[0.14] blur-3xl"
          style={reduceMotion ? undefined : { x: blob2x, y: blob2y }}
          aria-hidden
        />
        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <motion.div
            className="flex flex-col items-center gap-8"
            initial="hidden"
            animate="show"
            variants={enter.stagger}
          >
            <motion.div variants={enter.item} className="flex flex-col items-center gap-3 sm:gap-4">
              <span className="inline-flex max-w-[min(100%,22rem)] items-center justify-center rounded-full bg-primary/10 px-3 py-1.5 text-center font-headline text-[10px] font-bold uppercase leading-tight tracking-wider text-primary sm:max-w-none sm:px-4 sm:text-xs sm:tracking-widest">
                RECUPERAÇÃO AUTOMÁTICA DE VENDAS
              </span>

              <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((i) => (
                    <img
                      key={i}
                      src={`https://picsum.photos/seed/user${i}/64/64`}
                      alt=""
                      className="h-8 w-8 rounded-full border-2 border-white"
                      referrerPolicy="no-referrer"
                    />
                  ))}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary-container text-[10px] font-bold text-white">
                    +1k
                  </div>
                </div>
                <span className="max-w-[20rem] text-center text-[11px] font-medium leading-snug text-on-surface-variant sm:max-w-none sm:text-left sm:text-xs">
                  Confiado por +1.000 operações de alto volume
                </span>
              </div>
            </motion.div>

            <motion.h1
              variants={enter.item}
              className="max-w-4xl font-headline text-3xl font-bold leading-[1.12] tracking-tighter text-on-surface sm:text-5xl md:text-7xl"
            >
              Você está deixando dinheiro na mesa no <span className="text-primary">checkout</span> — e nem percebe.
            </motion.h1>

            <motion.p variants={enter.item} className="max-w-2xl text-base leading-relaxed text-on-surface-variant sm:text-xl">
              Cartão recusado, PIX expirado e abandono fazem você perder receita todos os dias. Nosso sistema reage por você e mostra quanto voltou para o seu caixa.
            </motion.p>

            <motion.div variants={enter.item} className="flex w-full max-w-md flex-col justify-center gap-3 sm:max-w-none sm:flex-row sm:gap-4">
              <a
                href="#planos"
                className="rounded-full bg-primary px-6 py-3.5 text-center font-headline text-base font-bold text-white shadow-xl shadow-primary/20 transition-all hover:scale-105 sm:px-10 sm:py-4 sm:text-lg"
              >
                Ver planos e valores
              </a>
              <a
                href="#como-funciona"
                className="rounded-full border border-primary/20 px-6 py-3.5 text-center font-headline text-base font-bold text-primary transition-all hover:bg-primary/5 sm:px-10 sm:py-4 sm:text-lg"
              >
                Ver como funciona
              </a>
            </motion.div>
          </motion.div>

          <HeroDashboardMockup enter={enter} />
        </div>
      </header>

      {/* Ticker */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={viewportEnter}
        transition={{ duration: 0.45 }}
        className="overflow-hidden bg-on-surface py-4 sm:py-6"
        aria-label="Destaques do produto"
      >
        <div className="flex items-center gap-6 whitespace-nowrap animate-marquee sm:gap-10 md:gap-12">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-6 font-headline text-[10px] font-bold uppercase tracking-wider text-white/60 sm:gap-10 sm:text-xs sm:tracking-widest md:gap-12"
            >
              <span>Falhas detectadas em tempo real</span>
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span>PIX expirado e cartão recusado</span>
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span>Abandono de carrinho</span>
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span>Retry automático inteligente</span>
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span>Analytics de conversão</span>
              <div className="h-2 w-2 rounded-full bg-primary" />
            </div>
          ))}
        </div>
      </motion.section>

      {/* Problema Section */}
      <section id="problema" className="grid-lines bg-surface px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            className="mb-8 sm:mb-12 lg:mb-16"
            initial="hidden"
            whileInView="show"
            viewport={viewportEnter}
            variants={enter.stagger}
          >
            <motion.span variants={enter.item} className="font-headline text-xs font-bold uppercase tracking-widest text-primary">
              Problema
            </motion.span>
            <motion.h2
              variants={enter.item}
              className="mt-3 max-w-3xl font-headline text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl lg:text-5xl"
            >
              Você investe para vender. O checkout falha. E o dinheiro não volta.
            </motion.h2>
            <motion.p variants={enter.item} className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant sm:mt-4 sm:text-base">
              Toque em um cenário para ver o foco da recuperação — o mesmo funil pode falhar por motivos diferentes.
            </motion.p>
          </motion.div>

          <motion.div
            className="grid items-start gap-8 sm:gap-12 lg:grid-cols-12"
            initial="hidden"
            whileInView="show"
            viewport={viewportEnter}
            variants={enter.stagger}
          >
            <motion.div
              className="flex flex-col gap-4 lg:col-span-7"
              aria-label="Cenários de perda no checkout"
              variants={enter.item}
            >
              {PROBLEMA_ITEMS.map((item, i) => {
                const isActive = activePain === i;
                const Icon = item.Icon;
                return (
                  <article
                    key={item.id}
                    className={cn(
                      'group rounded-2xl border border-slate-200/90 transition-all duration-200',
                      isActive
                        ? 'border-slate-200 bg-white shadow-lg shadow-slate-200/40 ring-2 ring-primary/20'
                        : 'bg-slate-50/90 hover:border-slate-300 hover:bg-white hover:shadow-md',
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={isActive}
                      aria-expanded={isActive}
                      onClick={() => setActivePain(i)}
                      className={cn(
                        'w-full rounded-2xl p-4 text-left transition-colors sm:p-6 md:p-8',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      )}
                    >
                      <div className="flex gap-4 sm:gap-5">
                        <span
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold font-headline transition-colors',
                            isActive ? 'bg-primary text-white' : 'bg-white text-primary ring-1 ring-slate-200 group-hover:ring-primary/30',
                          )}
                          aria-hidden
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-base font-bold font-headline text-on-surface sm:text-lg md:text-xl">{item.title}</h3>
                            <Icon
                              className={cn(
                                'h-6 w-6 shrink-0 transition-colors',
                                isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary',
                              )}
                              strokeWidth={isActive ? 2.25 : 2}
                              aria-hidden
                            />
                          </div>
                          <p className="mt-3 text-sm sm:text-base text-on-surface-variant leading-relaxed">{item.description}</p>
                        </div>
                      </div>
                    </button>
                    {isActive && (
                      <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-8 sm:py-4">
                        <a
                          href={item.anchor}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-primary font-headline underline-offset-4 hover:underline"
                        >
                          {item.cta}
                          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                        </a>
                      </div>
                    )}
                  </article>
                );
              })}
            </motion.div>

            <motion.div className="sticky top-24 sm:top-32 lg:col-span-5" variants={enter.item}>
              <div className="relative overflow-hidden rounded-2xl bg-on-surface p-6 text-white sm:rounded-[2.5rem] sm:p-10">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <XCircle size={120} />
                </div>
                <h4 className="mb-5 font-headline text-xl font-bold sm:mb-8 sm:text-2xl">O Custo da Inércia</h4>
                <div className="space-y-8">
                  <div className="flex gap-4">
                    <div className="h-12 w-1.5 rounded-full bg-primary" />
                    <div>
                      <div className="font-headline text-4xl font-bold">15–25%</div>
                      <div className="mt-1 font-headline text-xs font-bold uppercase tracking-widest text-white/50">
                        Tentativas recusadas (faixa em pesquisas de e-commerce BR)
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="h-12 w-1.5 rounded-full bg-red-500" />
                    <div>
                      <div className="font-headline text-4xl font-bold">20–30%</div>
                      <div className="mt-1 font-headline text-xs font-bold uppercase tracking-widest text-white/50">
                        Recusas por fraude: parcela pode ser falso positivo (faixa citada)
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-8 text-[11px] leading-relaxed text-white/45">
                  Referências de mercado para dimensionar vazamento; não são métricas da sua operação nem promessa de resultado.
                </p>
                <div className="mt-12 p-6 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-sm italic font-medium opacity-80">
                    "Muitas operações investem pesado em tráfego, mas perdem dinheiro na etapa mais crítica: o pagamento."
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Simulator Section */}
      <Simulator />

      {/* Como Funciona Section */}
      <section id="como-funciona" className="grid-lines bg-surface px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            className="mb-10 flex flex-col gap-6 sm:mb-16 sm:gap-8 lg:flex-row lg:items-end lg:justify-between"
            initial="hidden"
            whileInView="show"
            viewport={viewportEnter}
            variants={enter.stagger}
          >
            <motion.div variants={enter.item} className="max-w-2xl">
              <span className="font-headline text-xs font-bold uppercase tracking-widest text-primary">Como funciona</span>
              <h2 className="mt-3 font-headline text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl lg:text-5xl">
                Da falha ao valor recuperado.
              </h2>
            </motion.div>
            <motion.p variants={enter.item} className="max-w-sm text-sm text-on-surface-variant sm:text-base">
              Nossa engine trabalha em background, sem afetar a performance do seu site ou a experiência do usuário.
            </motion.p>
          </motion.div>

          <motion.div
            className="grid gap-8 md:grid-cols-3"
            initial="hidden"
            whileInView="show"
            viewport={viewportEnter}
            variants={enter.stagger}
          >
            {[
              {
                step: "1",
                title: "Detecta",
                desc: "Monitoramos cada requisição no seu checkout. Identificamos instantaneamente quando um cartão é negado ou um PIX não é pago.",
                img: "https://picsum.photos/seed/detect/800/600"
              },
              {
                step: "2",
                title: "Aciona",
                desc: "Nossa IA envia no WhatsApp uma mensagem personalizada com um novo link de pagamento, no momento ideal para recuperar a venda.",
                img: "https://picsum.photos/seed/action/800/600"
              },
              {
                step: "3",
                title: "Mostra",
                desc: "Você acompanha em tempo real cada venda recuperada e o impacto direto na sua receita através do painel.",
                img: "https://picsum.photos/seed/results/800/600"
              }
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={enter.item}
                className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-5 transition-all hover:bg-slate-100 sm:gap-6 sm:rounded-3xl sm:p-10"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-headline text-2xl font-bold text-white">
                  {item.step}
                </div>
                <div>
                  <h3 className="mb-2 font-headline text-xl font-bold sm:mb-3 sm:text-2xl">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-on-surface-variant sm:text-base">{item.desc}</p>
                </div>
                <div className="mt-auto pt-8">
                  <img
                    src={item.img}
                    alt=""
                    className="h-48 w-full rounded-2xl object-cover grayscale transition-all duration-500 group-hover:grayscale-0"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <BenefitsSection enter={enter} />

      <SocialProofSection enter={enter} />

      {/* Antes e Depois Section */}
      <section className="grid-lines overflow-hidden bg-surface px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            className="mb-8 text-center sm:mb-16"
            initial="hidden"
            whileInView="show"
            viewport={viewportEnter}
            variants={enter.item}
          >
            <h2 className="font-headline text-2xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              O impacto da automação no seu fluxo.
            </h2>
          </motion.div>

          <motion.div
            className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-xl sm:rounded-[3rem] lg:grid-cols-2"
            initial="hidden"
            whileInView="show"
            viewport={viewportEnter}
            variants={enterSync}
          >
            <motion.div variants={enter.item} className="flex flex-col gap-6 bg-slate-50 p-6 sm:gap-8 sm:p-12 lg:p-16">
              <span className="inline-flex rounded-full bg-red-100 px-4 py-1 font-headline text-xs font-bold uppercase tracking-widest text-red-600">
                Antes
              </span>
              <div className="space-y-6">
                {[
                  "O cliente sai do checkout sem retorno",
                  "Equipe tenta contato manual depois",
                  "Tentativas de cobrança inconsistentes"
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-4 text-on-surface/50 font-medium">
                    <XCircle size={20} className="text-red-400" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-10">
                <div className="font-headline text-2xl font-bold tabular-nums text-on-surface/20 sm:text-3xl md:text-4xl">
                  Recuperação: 0%
                </div>
              </div>
            </motion.div>

            <motion.div variants={enter.item} className="relative flex flex-col gap-6 overflow-hidden bg-white p-6 sm:gap-8 sm:p-12 lg:p-16">
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
              <span className="inline-flex px-4 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-widest font-headline">Depois (RecPay)</span>
              <div className="space-y-6">
                {[
                  "Intervenção automática em milissegundos",
                  "WhatsApp enviado em até 2 minutos",
                  "Retry baseado em comportamento"
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-4 font-bold">
                    <CheckCircle2 size={20} className="text-primary" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-10">
                <div className="font-headline text-2xl font-bold tabular-nums text-primary sm:text-3xl md:text-4xl">
                  Recuperação estimada: 20% da perda
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <PricingSection />

      {/* FAQ Section */}
      <FAQ />

      {/* CTA Final */}
      <section ref={ctaSectionRef} className="bg-surface px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <motion.div
          className="relative mx-auto flex max-w-5xl flex-col items-center overflow-hidden rounded-2xl bg-primary p-6 text-center shadow-2xl sm:rounded-[3rem] sm:p-12 lg:p-20"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-container" aria-hidden />
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.22)_0%,transparent_58%)] sm:rounded-[3rem]"
            style={reduceMotion ? undefined : { y: ctaGlowY, opacity: ctaGlowOpacity }}
            aria-hidden
          />
          <motion.span
            variants={enter.item}
            className="relative z-10 block font-headline text-xs font-bold uppercase tracking-widest text-white/70"
          >
            CTA final
          </motion.span>
          <motion.h2
            variants={enter.item}
            className="relative z-10 mb-6 mt-4 font-headline text-2xl font-bold leading-snug tracking-tight text-white sm:mb-10 sm:mt-6 sm:text-4xl sm:leading-tight lg:text-6xl"
          >
            Se sua operação perde vendas no checkout, você pode recuperar isso automaticamente.
          </motion.h2>
          <motion.div variants={enter.item} className="relative z-10 flex w-full max-w-md flex-col justify-center gap-3 sm:max-w-none sm:flex-row sm:gap-4">
            <a
              href="#planos"
              className="rounded-full bg-white px-6 py-3.5 text-center text-base font-bold text-primary shadow-lg transition-all hover:scale-105 sm:px-10 sm:py-5 sm:text-lg"
            >
              Ver planos
            </a>
            <a
              href="#simulador"
              className="rounded-full border border-white/20 bg-white/10 px-6 py-3.5 text-center text-base font-bold text-white transition-all hover:bg-white/20 sm:px-10 sm:py-5 sm:text-lg"
            >
              Simular recuperação
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
        <motion.div
          className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 md:flex-row"
          initial="hidden"
          whileInView="show"
          viewport={viewportEnter}
          variants={enter.stagger}
        >
          <motion.div variants={enter.item} className="flex flex-col items-center gap-2 md:items-start">
            <img src="/brand/logo-b.svg" alt="RecPay" className="h-7 w-auto max-w-[180px]" width={160} height={45} />
            <p className="text-sm text-on-surface-variant">© {new Date().getFullYear()} RecPay. Todos os direitos reservados.</p>
          </motion.div>
          <motion.nav
            variants={enter.item}
            className="flex flex-wrap justify-center gap-8 text-sm font-medium"
            aria-label="Rodapé"
          >
            <a href="#" className="text-on-surface-variant transition-colors hover:text-primary">
              Termos de Uso
            </a>
            <a href="#" className="text-on-surface-variant transition-colors hover:text-primary">
              Privacidade
            </a>
            <a href="#" className="text-on-surface-variant transition-colors hover:text-primary">
              Contato
            </a>
            <a href="#" className="text-on-surface-variant transition-colors hover:text-primary">
              Documentação
            </a>
          </motion.nav>
        </motion.div>
      </footer>
    </div>
  );
}
