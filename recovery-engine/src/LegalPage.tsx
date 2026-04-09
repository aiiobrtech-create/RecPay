import { ArrowLeft, CheckCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { useEffect, useMemo } from "react";
import { legalContact, legalDocuments, legalEntityChecklist, type LegalDocument } from "./legal-content";

function sectionLink(documentRef: LegalDocument, sectionId: string) {
  return `/#/${documentRef.slug}#${sectionId}`;
}

export function LegalPage({ slug }: { slug: LegalDocument["slug"] }) {
  const doc = legalDocuments[slug];

  useEffect(() => {
    document.title = `${doc.title} | ${legalContact.brandName}`;
    const nestedAnchor = window.location.hash.split("#")[2];
    if (!nestedAnchor) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    requestAnimationFrame(() => {
      const target = document.getElementById(nestedAnchor);
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [doc, slug]);

  const toc = useMemo(
    () =>
      doc.sections.map((section) => ({
        id: section.id,
        title: section.title,
        href: sectionLink(doc, section.id),
      })),
    [doc],
  );

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="border-b border-slate-200 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-opacity hover:opacity-80"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para a página principal
            </a>
            <div>
              <p className="font-headline text-xs font-bold uppercase tracking-[0.22em] text-primary">{doc.eyebrow}</p>
              <h1 className="mt-3 max-w-4xl font-headline text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                {doc.title}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-on-surface-variant sm:text-lg">{doc.summary}</p>
            </div>
          </div>

          <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm shadow-sm sm:min-w-[280px]">
            <div>
              <span className="block text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Última atualização</span>
              <strong className="mt-1 block text-base text-on-surface">{doc.lastUpdated}</strong>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Canal oficial</span>
              <a className="mt-1 inline-flex items-center gap-2 font-semibold text-primary" href={`mailto:${legalContact.supportEmail}`}>
                {legalContact.supportEmail}
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 className="font-headline text-xl font-bold text-on-surface">Base jurídica para publicação final</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
                O texto abaixo cobre a estrutura jurídica principal, incluindo identificação societária, retenção, contratos enterprise e canal formal de privacidade.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
            <p className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-primary">Identificação institucional</p>
            <div className="mt-5 grid gap-4 text-sm leading-6 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <span className="block font-semibold text-on-surface">Marca / produto</span>
                <span className="text-on-surface-variant">{legalContact.brandName}</span>
              </div>
              <div>
                <span className="block font-semibold text-on-surface">Operação comercial</span>
                <span className="text-on-surface-variant">{legalContact.brandName}</span>
              </div>
              <div>
                <span className="block font-semibold text-on-surface">CNPJ</span>
                <span className="text-on-surface-variant">{legalContact.registryLabel}</span>
              </div>
              <div>
                <span className="block font-semibold text-on-surface">Privacidade / encarregado</span>
                <span className="text-on-surface-variant">{legalContact.dpoLabel}</span>
              </div>
              <div className="sm:col-span-2 xl:col-span-4">
                <span className="block font-semibold text-on-surface">Endereço</span>
                <span className="text-on-surface-variant">{legalContact.addressLabel}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-primary">Pontos centrais</p>
              <div className="mt-5 grid gap-3">
                {doc.highlights.map((highlight) => (
                  <div key={highlight} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-on-surface">
                    {highlight}
                  </div>
                ))}
              </div>
            </section>

            {doc.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <h2 className="font-headline text-2xl font-bold tracking-tight sm:text-3xl">{section.title}</h2>
                <div className="mt-5 space-y-4 text-[15px] leading-7 text-on-surface-variant">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
            <p className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-primary">Navegação</p>
            <nav className="mt-4 flex flex-col gap-2" aria-label="Índice do documento">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="rounded-2xl px-3 py-3 text-sm leading-5 text-on-surface-variant transition-colors hover:bg-slate-50 hover:text-primary"
                >
                  {item.title}
                </a>
              ))}
            </nav>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-on-surface-variant">
              <p className="font-semibold text-on-surface">Referências internas</p>
              <p className="mt-2">
                Este conteúdo foi estruturado para refletir o modelo SaaS descrito comercialmente pela RecPay e alinhado aos deveres de transparência da LGPD e do Marco Civil.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <a href={legalContact.websiteUrl} className="font-semibold text-primary">
                  Site institucional
                </a>
                <a href={legalContact.dashboardUrl} className="font-semibold text-primary">
                  Painel da plataforma
                </a>
                <a href={`mailto:${legalContact.privacyEmail}`} className="font-semibold text-primary">
                  Canal de privacidade
                </a>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
