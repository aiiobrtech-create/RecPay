export type LegalSection = {
  id: string;
  title: string;
  body: string[];
};

export type LegalDocument = {
  slug: "termos-de-uso" | "privacidade";
  eyebrow: string;
  title: string;
  summary: string;
  lastUpdated: string;
  highlights: string[];
  sections: LegalSection[];
};

export const legalEntityChecklist = [
  "Política de retenção definida por categoria de dado: contratos, cobrança, logs, suporte e histórico comercial.",
  "Canal formal de privacidade definido: privacidade@recpay.com.br.",
];

export const legalContact = {
  brandName: "RecPay",
  websiteUrl: "https://recpay.com.br",
  dashboardUrl: "https://app.recpay.com.br",
  supportEmail: "suporte@recpay.com.br",
  privacyEmail: "privacidade@recpay.com.br",
  controllerLabel:
    "Gabrielle Vellozo Camacho Neves, Microempreendedora Individual (MEI), operação responsável pela marca RecPay e pela emissão de proposta, checkout e nota fiscal.",
  registryLabel: "65.748.040/0001-61",
  addressLabel: "Rua João Zarzur, nº 99, apto. 123, Bloco B, Vila São Paulo, Mongaguá - SP, CEP 11730-142.",
  dpoLabel:
    "Canal formal de privacidade e encarregado: privacidade@recpay.com.br. Até a ativação operacional desse endereço, as mensagens podem ser redirecionadas pelo suporte oficial.",
};

export const legalDocuments: Record<LegalDocument["slug"], LegalDocument> = {
  "termos-de-uso": {
    slug: "termos-de-uso",
    eyebrow: "Termos de Uso",
    title: "Condições de uso da plataforma RecPay",
    summary:
      "Estas condições regulam acesso, contratação, faturamento, responsabilidades e limites aplicáveis ao uso da plataforma RecPay e dos serviços correlatos.",
    lastUpdated: "05 de abril de 2026",
    highlights: [
      "Documento desenhado para operação SaaS B2B de recuperação automática de vendas e cobrança recorrente por plano.",
      "Prevê regras de acesso por conta, uso aceitável, suspensão, integrações com terceiros e proteção de propriedade intelectual.",
      "Inclui direito de arrependimento em 7 dias e reembolso nos termos aplicáveis, com canal formal pelo suporte.",
      "Identifica a operação comercial da marca RecPay como Gabrielle Vellozo Camacho Neves, MEI, CNPJ 65.748.040/0001-61.",
    ],
    sections: [
      {
        id: "objeto",
        title: "1. Objeto e escopo",
        body: [
          "A RecPay oferece tecnologia para monitoramento de eventos de checkout, tratamento automatizado de fluxos de recuperação de receita, geração de métricas operacionais, gestão de integrações e disponibilização de painel administrativo para clientes empresariais.",
          "Os serviços podem incluir ingestão de webhooks, processamento em fila, envio de comunicações operacionais, gestão de permissões, recursos analíticos, cobrança recorrente por assinatura e funcionalidades complementares informadas na proposta comercial, no painel ou em materiais oficiais.",
          "O uso da plataforma pressupõe atuação profissional e empresarial. O serviço não se destina a uso doméstico, recreativo ou por menores de idade.",
        ],
      },
      {
        id: "aceite",
        title: "2. Aceite e elegibilidade",
        body: [
          "Ao acessar a plataforma, contratar um plano, criar credenciais ou utilizar qualquer funcionalidade da RecPay, o cliente declara possuir poderes para representar a pessoa jurídica contratante e concorda com estes Termos.",
          "Se o usuário atuar em nome de empresa, produtor, operação digital ou grupo econômico, o aceite vincula a organização representada dentro dos limites de seus poderes.",
          "Caso o usuário não concorde com estes Termos, não deve acessar, configurar ou utilizar a plataforma.",
        ],
      },
      {
        id: "cadastro",
        title: "3. Cadastro, credenciais e contas",
        body: [
          "O cliente deve fornecer informações corretas, completas e atualizadas para contratação, faturamento, configuração da conta, suporte e comunicações oficiais.",
          "Credenciais, tokens, chaves de API, links de acesso, códigos de autenticação e permissões internas são de uso pessoal e intransferível, salvo gestão formal pela empresa contratante.",
          "O cliente deve restringir acesso a usuários autorizados, aplicar boas práticas de segurança e comunicar imediatamente qualquer suspeita de uso indevido, comprometimento de senha, vazamento de token ou acesso não autorizado.",
        ],
      },
      {
        id: "uso-aceitavel",
        title: "4. Uso aceitável e condutas proibidas",
        body: [
          "É vedado utilizar a RecPay para violar leis, direitos de terceiros, regras de plataformas integradas, políticas de mensageria, normas de proteção de dados, normas consumeristas ou obrigações regulatórias aplicáveis ao negócio do cliente.",
          "Também é proibido enviar eventos falsos, simular transações inexistentes, praticar fraude, contornar limites técnicos, tentar obter acesso indevido a contas de terceiros, executar engenharia reversa não autorizada, explorar vulnerabilidades ou interferir na estabilidade da infraestrutura.",
          "O cliente responde pelo conteúdo, pela base jurídica e pela legitimidade dos dados, mensagens, templates, listas, integrações e fluxos comerciais que decidir operar com apoio da plataforma.",
        ],
      },
      {
        id: "integracoes",
        title: "5. Integrações, canais externos e terceiros",
        body: [
          "A RecPay poderá se integrar a gateways, plataformas de checkout, provedores de pagamento, mensageria, hospedagem, analytics, autenticação, suporte e faturamento. Tais serviços têm regras, disponibilidade e políticas próprias.",
          "A contratação da RecPay não substitui contratos, autorizações, templates, aprovações, licenças, contas ou compliance exigidos por terceiros. Cabe ao cliente manter integrações válidas e aderentes às políticas aplicáveis.",
          "Instabilidades, bloqueios, limitações, mudanças de API, suspensão de contas externas ou indisponibilidade de provedores terceiros podem afetar parte do serviço sem que isso configure, por si só, inadimplemento da RecPay.",
        ],
      },
      {
        id: "cobranca",
        title: "6. Planos, cobrança e inadimplência",
        body: [
          "Os planos, franquias, limites técnicos, periodicidade, valores, excedentes, condições promocionais e eventuais serviços adicionais serão aqueles divulgados no checkout, na proposta comercial aceita ou no contrato específico firmado com o cliente.",
          "A cobrança poderá ocorrer por assinatura recorrente, link de pagamento, invoice, cartão, Pix, boleto ou outros meios disponíveis. Tributos, encargos financeiros por atraso e custos de terceiros podem ser cobrados quando previstos contratualmente.",
          "A falta de pagamento, tentativa reiterada de fraude, chargeback indevido ou contestação abusiva poderá resultar em bloqueio de funcionalidades, suspensão de acessos, cobrança administrativa ou rescisão, sem prejuízo das medidas legais cabíveis.",
          "Em contratos enterprise ou sob proposta comercial específica, prevalecem as condições expressamente aceitas por escrito, incluindo prazo mínimo de contratação, onboarding, SLA, suporte dedicado, volumes excedentes, faturamento faturado, multa, reajuste, confidencialidade, segurança, DPA e regras de rescisão, sempre que não conflitarem com normas obrigatórias.",
        ],
      },
      {
        id: "arrependimento-reembolso",
        title: "7. Direito de arrependimento e reembolso",
        body: [
          "Em contratos firmados à distância, quando aplicável o regime consumerista, o cliente poderá exercer o direito de arrependimento no prazo de 7 (sete) dias corridos, nos termos do art. 49 da Lei nº 8.078/1990 (Código de Defesa do Consumidor), contado conforme a lei e a confirmação da contratação ou do pagamento.",
          "Para planos contratados pelo checkout online (autosserviço), o pedido de cancelamento e reembolso dentro do prazo deve ser enviado ao suporte oficial em suporte@recpay.com.br, com identificação da conta e da assinatura. Verificada a elegibilidade, a RecPay providenciará o estorno pelo mesmo meio de pagamento utilizado, observando prazos de processamento de instituições financeiras e do provedor de pagamentos.",
          "O benefício de arrependimento na primeira contratação por conta ou e-mail identificável não impede a aplicação de normas sobre uso indevido, fraude, chargeback abusivo ou descumprimento destes Termos.",
          "Contratos firmados sob proposta comercial, pedido de compra ou instrumento específico (incluindo modalidades enterprise ou volumes negociados) poderão prever condições de rescisão e reembolso distintas quando expressamente aceitas por escrito, respeitadas as normas imperativas aplicáveis.",
        ],
      },
      {
        id: "dados-cliente",
        title: "8. Dados, conteúdo e responsabilidades do cliente",
        body: [
          "O cliente permanece titular ou legítimo controlador dos dados, eventos, listas, mensagens, parâmetros e conteúdos que inserir, transmitir ou processar na plataforma, observadas as hipóteses em que a RecPay atuar como controladora de dados próprios da relação comercial.",
          "Compete ao cliente definir finalidades legítimas, base legal adequada, janela de retenção compatível, regras de opt-out, governança interna e atendimento aos direitos dos titulares quando os dados estiverem ligados à sua operação.",
          "A RecPay poderá adotar filtros, recusas técnicas, limites de volume, mascaramento, logs mínimos e controles de segurança para reduzir risco operacional, fraude, spam, abuso de infraestrutura ou tratamento incompatível com a lei.",
        ],
      },
      {
        id: "propriedade",
        title: "9. Propriedade intelectual",
        body: [
          "A plataforma, o software, a marca, a identidade visual, a documentação, os fluxos, os relatórios, os layouts, os bancos estruturais, os textos institucionais e demais elementos da RecPay são protegidos pela legislação aplicável e permanecem de titularidade da RecPay ou de seus licenciantes.",
          "Nenhuma disposição destes Termos transfere ao cliente direitos de propriedade intelectual, salvo licença limitada, revogável, não exclusiva e intransferível para uso do serviço conforme sua finalidade contratada.",
          "É proibida a reprodução, modificação, distribuição, sublicenciamento, descompilação, criação de obra derivada ou exploração não autorizada de elementos da plataforma, exceto quando expressamente permitida por lei ou por autorização escrita.",
        ],
      },
      {
        id: "disponibilidade",
        title: "10. Disponibilidade, segurança e suporte",
        body: [
          "A RecPay empregará medidas técnicas e administrativas razoáveis para manter a segurança e a continuidade dos serviços, podendo realizar manutenções programadas, ajustes de arquitetura, atualizações, correções e medidas emergenciais de contenção.",
          "Não há garantia de operação totalmente ininterrupta ou livre de falhas, especialmente em razão de dependência de internet, infraestrutura de terceiros, APIs externas, eventos de força maior, incidentes de segurança ou comportamento imprevisível de provedores integrados.",
          "Chamados, janelas de atendimento, tempos de resposta, onboarding, SLA e níveis de suporte podem variar conforme o plano contratado ou instrumento comercial específico.",
        ],
      },
      {
        id: "suspensao",
        title: "11. Suspensão e rescisão",
        body: [
          "A RecPay poderá suspender imediatamente, total ou parcialmente, o acesso à plataforma quando identificar risco relevante de fraude, violação legal, uso abusivo, tentativa de invasão, inadimplência, envio massivo irregular, ordem de autoridade competente ou ameaça à segurança de terceiros.",
          "O cliente poderá encerrar o uso conforme as regras do plano e do meio de contratação, observando ciclos já faturados, cláusulas mínimas de permanência, serviços já prestados e obrigações pendentes.",
          "Encerrada a relação, a RecPay poderá manter dados pelo prazo necessário para cumprimento de obrigação legal, defesa de direitos, prevenção à fraude, guarda mínima de registros e execução de deveres regulatórios.",
        ],
      },
      {
        id: "limitacao",
        title: "12. Limitação de responsabilidade",
        body: [
          "A RecPay não garante aumento específico de conversão, recuperação mínima, faturamento, ROI, aprovação bancária, performance de campanhas, disponibilidade de terceiros, êxito em chargeback ou resultados comerciais determinados.",
          "Na máxima extensão permitida em lei, a responsabilidade da RecPay fica limitada aos danos diretos comprovadamente causados por descumprimento contratual próprio, observados os limites financeiros eventualmente previstos no contrato aplicável.",
          "A RecPay não responde por lucros cessantes, perda de oportunidade, dano indireto, base de dados ilícita do cliente, conteúdo enviado por terceiros, decisão comercial do cliente, bloqueio de canal externo ou falha originada exclusivamente em ambiente sob gestão do contratante.",
        ],
      },
      {
        id: "privacidade",
        title: "13. Privacidade e conformidade",
        body: [
          "O tratamento de dados pessoais relacionado ao uso da plataforma seguirá a Política de Privacidade da RecPay e a legislação aplicável, inclusive a Lei nº 13.709/2018 (LGPD) e, quando pertinente, a Lei nº 12.965/2014 (Marco Civil da Internet).",
          "Em operações B2B, a distribuição de papéis entre controlador e operador poderá variar conforme a atividade: dados de cadastro, suporte, cobrança e antifraude da relação comercial podem ser tratados pela RecPay como controladora; dados operacionais da base do cliente tendem a ser tratados conforme instruções e finalidade definidas pelo contratante.",
          "O cliente deve avaliar se precisa celebrar instrumento complementar de tratamento de dados, cláusulas de confidencialidade, contrato enterprise ou anexo de segurança para o seu caso de uso.",
        ],
      },
      {
        id: "foro",
        title: "14. Lei aplicável e foro",
        body: [
          "Estes Termos são regidos pelas leis da República Federativa do Brasil.",
          "Fica eleito o foro da comarca do domicílio da contratada responsável pela operação da RecPay, salvo disposição contratual específica em sentido diverso ou competência legal inderrogável.",
          "A eventual tolerância a descumprimento não constitui novação nem renúncia de direito.",
        ],
      },
    ],
  },
  privacidade: {
    slug: "privacidade",
    eyebrow: "Política de Privacidade",
    title: "Como a RecPay trata dados pessoais",
    summary:
      "Esta política descreve categorias de dados, finalidades, bases legais, compartilhamentos, retenção, segurança e direitos dos titulares no contexto de uso da plataforma RecPay.",
    lastUpdated: "05 de abril de 2026",
    highlights: [
      "Estrutura alinhada aos deveres de transparência da LGPD, com referência a direitos do titular, controlador, encarregado, retenção e segurança.",
      "Distingue dados próprios da relação comercial da RecPay dos dados tratados na operação dos clientes dentro da plataforma.",
      "Identifica a operação comercial da marca RecPay como Gabrielle Vellozo Camacho Neves, MEI, CNPJ 65.748.040/0001-61.",
    ],
    sections: [
      {
        id: "identificacao",
        title: "1. Quem somos e quando esta política se aplica",
        body: [
          "Esta política se aplica ao tratamento de dados pessoais realizado pela operação responsável pela marca RecPay em seu site institucional, fluxos comerciais, contratação, suporte, onboarding, faturamento, prevenção à fraude, autenticação e uso da plataforma.",
          "Para atividades em que a RecPay decide finalidades e meios do tratamento, ela atua como controladora. Quando tratar dados pessoais em nome e sob instruções de clientes empresariais dentro da plataforma, poderá atuar como operadora, conforme a finalidade envolvida.",
          "A identificação societária da contratada é Gabrielle Vellozo Camacho Neves, Microempreendedora Individual (MEI), inscrita no CNPJ 65.748.040/0001-61, com endereço comercial em Rua João Zarzur, nº 99, apto. 123, Bloco B, Vila São Paulo, Mongaguá - SP, CEP 11730-142.",
        ],
      },
      {
        id: "dados-coletados",
        title: "2. Quais dados podemos tratar",
        body: [
          "Podemos tratar dados cadastrais e de identificação, como nome, e-mail profissional, telefone, empresa, cargo, credenciais, logs de autenticação, dados de cobrança, histórico contratual, tickets de suporte e registros de navegação.",
          "No contexto operacional da plataforma, também podemos tratar identificadores de pedidos, eventos de checkout, dados mínimos de contato, canais acionados, status de tentativa de recuperação, parâmetros de integração, webhooks, registros técnicos e métricas analíticas.",
          "A RecPay adota diretriz de minimização e não solicita dados pessoais excessivos para o objetivo do serviço. Dados sensíveis não devem ser enviados pelo cliente, salvo hipótese legal específica e necessidade estrita devidamente documentada.",
        ],
      },
      {
        id: "finalidades-bases",
        title: "3. Finalidades e bases legais",
        body: [
          "Tratamos dados pessoais para viabilizar proposta e contratação, provisionar contas, autenticar usuários, operar integrações, processar eventos, gerar dashboards, prevenir fraude, responder chamados, cobrar valores devidos, cumprir obrigações legais e resguardar direitos da RecPay.",
          "As bases legais podem incluir execução de contrato e procedimentos preliminares, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse devidamente avaliado e, quando aplicável, consentimento.",
          "Quando a RecPay tratar dados operacionais em nome do cliente, a definição da base legal da atividade-fim normalmente caberá ao próprio cliente controlador, sem prejuízo das bases próprias da RecPay para segurança, registros mínimos, faturamento e compliance.",
        ],
      },
      {
        id: "origem",
        title: "4. Como obtemos os dados",
        body: [
          "Os dados podem ser fornecidos diretamente por titulares, usuários autorizados, representantes do cliente, formulários do site, checkout, suporte, reuniões comerciais e onboarding.",
          "Também podemos receber dados por integrações técnicas, webhooks, APIs, provedores de autenticação, meios de pagamento, plataformas de mensageria, ferramentas de analytics, antifraude, help desk e parceiros operacionais.",
          "Quando dados forem recebidos por indicação, importação, sincronização ou fluxo automatizado enviado pelo cliente, presumimos que a origem e o compartilhamento observam base legal adequada e transparência prévia ao titular.",
        ],
      },
      {
        id: "compartilhamento",
        title: "5. Com quem podemos compartilhar",
        body: [
          "Os dados pessoais podem ser compartilhados com provedores de hospedagem, banco de dados, autenticação, analytics, pagamento, mensageria, e-mail, monitoramento, atendimento, antifraude, infraestrutura, consultoria e outras empresas que apoiem a operação da RecPay.",
          "Também poderemos compartilhar dados com autoridades públicas, órgãos reguladores, Judiciário, escritórios jurídicos, auditores, instituições financeiras e parceiros envolvidos na execução do serviço quando isso for necessário para cumprir obrigação legal, contrato ou exercício regular de direitos.",
          "Sempre que houver operadores ou suboperadores, a RecPay buscará impor deveres compatíveis de segurança, confidencialidade e uso restrito à finalidade contratada.",
        ],
      },
      {
        id: "cookies",
        title: "6. Cookies e tecnologias semelhantes",
        body: [
          "O site institucional e os ambientes online da RecPay podem utilizar cookies estritamente necessários, preferências, métricas, segurança e tecnologias equivalentes para autenticação, desempenho, prevenção a abuso e aprimoramento da experiência.",
          "Cookies não essenciais devem depender da base legal adequada, inclusive consentimento quando exigido. O titular poderá gerenciar preferências no banner aplicável, no navegador ou por mecanismos equivalentes disponibilizados pela RecPay.",
          "A recusa de determinados cookies pode limitar funcionalidades do site ou do painel, especialmente recursos de sessão, personalização, analytics e suporte.",
        ],
      },
      {
        id: "retencao",
        title: "7. Armazenamento, retenção e descarte",
        body: [
          "Os dados pessoais serão armazenados pelo tempo necessário para cumprir as finalidades informadas, executar contrato, responder a solicitações, preservar evidências, atender exigências legais, fiscais, regulatórias e exercer direitos em processos administrativos, arbitrais ou judiciais.",
          "Em regra, dados cadastrais, contratuais, financeiros e de cobrança podem ser mantidos pelo prazo necessário ao cumprimento das obrigações legais e à defesa de direitos; registros técnicos, logs de segurança e evidências de auditoria podem ser preservados pelo período mínimo necessário para prevenção a fraude, resposta a incidentes e integridade operacional; tickets de suporte e comunicações comerciais podem ser guardados enquanto houver histórico útil da relação comercial ou obrigação jurídica pendente.",
          "Encerrado o prazo de retenção, os dados serão eliminados, anonimizados ou sujeitos a bloqueio, conforme a natureza da informação e a base jurídica remanescente, observadas as hipóteses legais de conservação previstas na LGPD.",
        ],
      },
      {
        id: "seguranca",
        title: "8. Segurança da informação",
        body: [
          "A RecPay adota medidas técnicas e administrativas razoáveis para proteger os dados pessoais contra acesso não autorizado, destruição, perda, alteração, vazamento, indisponibilidade e tratamento inadequado.",
          "Entre essas medidas podem estar controles de acesso, segregação por conta, uso de credenciais, criptografia em trânsito, logs, monitoramento, limitação de privilégios, revisão de integrações, mascaramento, backup e políticas internas de segurança.",
          "Nenhum ambiente conectado à internet é absolutamente imune. Por isso, titulares e clientes também devem adotar boas práticas de segurança, como proteção de dispositivos, senhas fortes, MFA e uso restrito de tokens.",
        ],
      },
      {
        id: "transferencia",
        title: "9. Transferência internacional",
        body: [
          "Alguns fornecedores ou infraestruturas utilizados pela RecPay podem processar dados em outros países ou permitir acesso remoto internacional por equipes e sistemas autorizados.",
          "Quando houver transferência internacional de dados pessoais, a RecPay buscará adotar mecanismos compatíveis com a legislação aplicável e avaliar o nível de proteção oferecido pelo destinatário e pelo serviço utilizado.",
          "Ao contratar a plataforma, o cliente reconhece que a arquitetura tecnológica de SaaS pode envolver processamento distribuído e provedores globais, sem prejuízo da adoção de salvaguardas razoáveis.",
        ],
      },
      {
        id: "direitos",
        title: "10. Direitos do titular",
        body: [
          "Nos termos da LGPD, o titular pode solicitar confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade quando aplicável, informação sobre compartilhamentos, revogação do consentimento e revisão de decisões automatizadas, conforme cabível.",
          "Pedidos relacionados a dados tratados pela RecPay como controladora poderão ser encaminhados pelo canal oficial informado nesta política. Pedidos ligados a bases operadas em nome de clientes podem exigir redirecionamento ao respectivo cliente controlador.",
          "A RecPay poderá solicitar elementos razoáveis para verificar identidade, legitimidade do pedido e escopo dos dados antes de atender qualquer requisição.",
        ],
      },
      {
        id: "menores",
        title: "11. Dados de crianças e adolescentes",
        body: [
          "A plataforma RecPay é voltada a relações empresariais e não foi desenvolvida para contratação direta por crianças ou adolescentes.",
          "Se o cliente utilizar a plataforma em contexto que envolva dados de menores, deverá assegurar base legal específica, transparência adequada e estrita observância das regras de proteção aplicáveis.",
          "Caso a RecPay identifique uso incompatível ou coleta indevida nessa hipótese, poderá restringir o tratamento e exigir adequações imediatas.",
        ],
      },
      {
        id: "contato",
        title: "12. Contato, encarregado e atualizações",
        body: [
          "Solicitações sobre privacidade, proteção de dados e exercício de direitos devem ser enviadas ao canal formal de privacidade e encarregado: privacidade@recpay.com.br.",
          "Esta política poderá ser atualizada para refletir mudanças legais, regulatórias, técnicas, operacionais ou contratuais. A versão vigente será sempre a publicada nos canais oficiais da RecPay com a data de última atualização.",
          "Sempre que a alteração impactar de forma relevante a transparência do tratamento ou as condições aplicáveis, a RecPay poderá adotar aviso adicional por e-mail, painel ou outros meios razoáveis.",
        ],
      },
    ],
  },
};
