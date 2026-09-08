import Image from "next/image";
import Link from "next/link";

type Locale = "pt-BR" | "es" | "pt-PT";
type Kind = "privacy" | "terms";

type Section = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  googlePolicy?: boolean;
};

type Copy = {
  homeHref: string;
  privacyHref: string;
  termsHref: string;
  back: string;
  privacyLabel: string;
  termsLabel: string;
  updated: string;
  contact: string;
  privacy: { title: string; intro: string; sections: Section[] };
  terms: { title: string; intro: string; sections: Section[] };
};

const copies: Record<Locale, Copy> = {
  "pt-BR": {
    homeHref: "/",
    privacyHref: "/privacidade",
    termsHref: "/termos",
    back: "Voltar para o início",
    privacyLabel: "Privacidade",
    termsLabel: "Termos de Uso",
    updated: "Última atualização: 8 de setembro de 2026",
    contact: "Dúvidas ou solicitações: contato@zelogestaointeligente.com.br",
    privacy: {
      title: "Política de Privacidade",
      intro: "Esta Política explica como o Zelo Gestão Inteligente (“Zelo”) coleta, utiliza, armazena, compartilha e protege dados pessoais quando você usa nosso site, painel, atendimento pelo WhatsApp e integrações, incluindo o Google Calendar.",
      sections: [
        {
          title: "1. Responsável e contato",
          paragraphs: [
            "O Zelo Gestão Inteligente é responsável pelo tratamento dos dados descritos nesta Política. Para exercer seus direitos, tirar dúvidas ou solicitar a exclusão de dados, escreva para contato@zelogestaointeligente.com.br.",
          ],
        },
        {
          title: "2. Dados que podemos tratar",
          bullets: [
            "Dados de cadastro e contato, como nome, e-mail, telefone, idioma e informações do plano.",
            "Mensagens, áudios, imagens, documentos e comandos enviados voluntariamente pelo WhatsApp, painel ou suporte.",
            "Informações que você decide organizar no Zelo, como finanças, tarefas, lembretes, metas, agenda, clientes, funcionários, veículos, arquivos e listas de compras.",
            "Dados técnicos e de segurança, como registros de acesso, endereço IP processado para prevenção de abuso, data e hora das operações e identificadores necessários ao funcionamento do serviço.",
            "Situação da assinatura e dados essenciais da compra recebidos da plataforma de pagamento. O Zelo não armazena o número completo do seu cartão.",
          ],
        },
        {
          title: "3. Dados do Google Calendar",
          paragraphs: [
            "A conexão com o Google é opcional e ocorre somente depois de você clicar em “Conectar Google” e autorizar o acesso na tela oficial do Google. O Zelo solicita a permissão calendar.events, limitada à gestão de eventos do calendário.",
            "Com essa permissão, o Zelo pode consultar, criar, atualizar e excluir eventos conforme seus comandos e manter sua agenda sincronizada. Os dados acessados podem incluir título, descrição, datas, horários, local, participantes e informações de videoconferência, como o link do Google Meet associado ao evento.",
            "O Zelo não solicita acesso ao Gmail, aos arquivos do Google Drive ou aos contatos da sua conta Google por meio dessa integração. O Drive disponível dentro da plataforma Zelo é um recurso próprio e separado do Google Drive.",
            "Os tokens de acesso e renovação fornecidos pelo Google são armazenados de forma criptografada e usados somente no servidor para manter a integração que você autorizou.",
          ],
          googlePolicy: true,
        },
        {
          title: "4. Como usamos os dados",
          bullets: [
            "Criar e manter sua conta e entregar as funcionalidades contratadas.",
            "Interpretar e executar seus comandos, organizar informações e apresentar consultas e resumos.",
            "Sincronizar eventos com o Google Calendar e criar links do Google Meet quando solicitado.",
            "Enviar mensagens operacionais, lembretes, avisos de segurança e comunicações relacionadas ao serviço.",
            "Prestar suporte, corrigir falhas, prevenir fraude e abuso e proteger usuários e a plataforma.",
            "Cumprir obrigações legais, regulatórias, fiscais e exercer direitos em processos.",
          ],
        },
        {
          title: "5. Bases legais e consentimento",
          paragraphs: [
            "Tratamos dados para executar o contrato, atender solicitações do usuário, cumprir obrigações legais, proteger interesses legítimos de segurança e, quando necessário, com base no consentimento. A autorização do Google pode ser revogada a qualquer momento.",
          ],
        },
        {
          title: "6. Compartilhamento e operadores",
          paragraphs: [
            "Podemos utilizar fornecedores de hospedagem, banco de dados, inteligência artificial, envio de e-mails, suporte, WhatsApp/Meta, Google e processamento de pagamentos, sempre no limite necessário para operar o Zelo. Também podemos compartilhar dados quando exigido por lei ou para proteger direitos e segurança.",
            "Não vendemos seus dados pessoais. Os dados provenientes das APIs do Google não são compartilhados com anunciantes, corretores de dados ou terceiros para publicidade, criação de perfil comercial, concessão de crédito ou finalidades incompatíveis com a integração autorizada.",
          ],
        },
        {
          title: "7. Uso limitado dos dados do Google",
          paragraphs: [
            "Nosso uso de informações recebidas das APIs do Google Workspace está em conformidade com a Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado. Utilizamos esses dados somente para oferecer e melhorar funcionalidades visíveis ao usuário relacionadas à agenda e às reuniões.",
            "O acesso humano aos dados do Google é proibido, exceto quando você autorizar expressamente para suporte, quando for necessário investigar abuso ou incidente de segurança, quando houver obrigação legal ou quando os dados estiverem agregados e sem identificação para operações internas permitidas.",
          ],
          googlePolicy: true,
        },
        {
          title: "8. Armazenamento e segurança",
          paragraphs: [
            "Adotamos medidas técnicas e administrativas proporcionais ao risco, incluindo criptografia de credenciais sensíveis, conexões protegidas, controle de acesso e separação de dados por conta. Nenhum sistema é absolutamente invulnerável; em caso de incidente relevante, adotaremos as providências legais aplicáveis.",
            "Alguns fornecedores podem processar dados em outros países. Nesses casos, buscamos utilizar prestadores confiáveis e mecanismos adequados de proteção conforme a legislação aplicável.",
          ],
        },
        {
          title: "9. Retenção, desconexão e exclusão",
          paragraphs: [
            "Mantemos os dados enquanto sua conta estiver ativa ou pelo período necessário para prestar o serviço e cumprir obrigações legais. Dados podem permanecer por prazo limitado em cópias de segurança protegidas.",
            "Ao desconectar o Google nas Configurações do Zelo, tentamos revogar a autorização e apagamos do Zelo os tokens armazenados. Eventos já criados no seu Google Calendar permanecem na sua conta Google até que você os exclua.",
            "Você também pode revogar o acesso diretamente na página de segurança da sua Conta Google. Para solicitar a exclusão da conta e dos dados associados ao Zelo, envie um e-mail para contato@zelogestaointeligente.com.br usando o endereço cadastrado.",
          ],
        },
        {
          title: "10. Seus direitos",
          paragraphs: [
            "Nos termos da legislação aplicável, você pode solicitar confirmação e acesso, correção, portabilidade quando cabível, anonimização, bloqueio ou eliminação, informação sobre compartilhamentos, revogação do consentimento e revisão de decisões automatizadas quando aplicável. Podemos solicitar informações para confirmar sua identidade antes de atender ao pedido.",
          ],
        },
        {
          title: "11. Crianças, alterações e contato",
          paragraphs: [
            "O Zelo não é destinado a menores de 18 anos. Podemos atualizar esta Política para refletir mudanças legais ou operacionais; a versão vigente e sua data estarão sempre nesta página. Alterações relevantes serão comunicadas quando exigido.",
            "Contato de privacidade e suporte: contato@zelogestaointeligente.com.br.",
          ],
        },
      ],
    },
    terms: {
      title: "Termos de Uso",
      intro: "Estes Termos regulam o uso do site, painel, atendimento pelo WhatsApp e demais funcionalidades do Zelo Gestão Inteligente. Ao criar uma conta ou utilizar o serviço, você declara que leu e aceitou estas condições.",
      sections: [
        { title: "1. Elegibilidade e aceite", paragraphs: ["Você deve ter pelo menos 18 anos e capacidade legal para contratar. Se utilizar o Zelo em nome de uma empresa, declara possuir autorização para representá-la."] },
        { title: "2. O serviço", paragraphs: ["O Zelo é um assistente de organização pessoal e empresarial que ajuda a registrar e consultar finanças, tarefas, lembretes, agenda, documentos, veículos, funcionários, clientes e listas de compras, por meio do WhatsApp e do painel web. Recursos podem ser aprimorados, substituídos ou descontinuados mediante comunicação quando a mudança for relevante."] },
        { title: "3. Conta e segurança", bullets: ["Forneça informações verdadeiras e atualizadas.", "Mantenha sua senha, códigos de acesso e dispositivos protegidos.", "Cadastre somente números de WhatsApp de pessoas autorizadas.", "Avise imediatamente sobre uso indevido ou acesso não autorizado."] },
        { title: "4. Integração com o Google", paragraphs: ["A conexão com o Google Calendar é opcional. Ao autorizá-la, você permite que o Zelo consulte, crie, atualize e exclua eventos conforme suas solicitações e crie informações de videoconferência do Google Meet. Você pode desconectar a integração nas Configurações ou revogá-la na sua Conta Google.", "Você é responsável por conferir participantes, horários e conteúdo antes de enviar convites ou executar alterações relevantes."] },
        { title: "5. Planos, pagamento e cancelamento", paragraphs: ["Os valores, moedas, períodos, parcelamentos e condições aplicáveis são os apresentados na página de venda e no checkout no momento da contratação. Pagamentos e reembolsos são processados pela plataforma indicada no checkout, como a Hotmart, de acordo com suas regras e com a legislação do consumidor.", "O acesso poderá ser suspenso ou encerrado quando a assinatura estiver vencida, cancelada, estornada ou não renovada. Lembretes e outras mensagens automáticas não são enviados enquanto a conta estiver inativa."] },
        { title: "6. Uso permitido", paragraphs: ["Você não pode usar o Zelo para violar leis ou direitos de terceiros, praticar fraude, enviar conteúdo malicioso ou não autorizado, tentar acessar contas alheias, interferir na segurança da plataforma, sobrecarregar o serviço ou realizar engenharia reversa indevida."] },
        { title: "7. Conteúdo e responsabilidade do usuário", paragraphs: ["Você mantém os direitos sobre o conteúdo que envia e concede ao Zelo apenas a autorização necessária para processá-lo e prestar o serviço. Você é responsável pela legitimidade, precisão e permissões relativas aos dados de terceiros inseridos na plataforma."] },
        { title: "8. Inteligência artificial e limites", paragraphs: ["O Zelo utiliza automação e inteligência artificial e pode interpretar incorretamente uma mensagem ou produzir informação incompleta. Confirme dados importantes, especialmente valores, datas, destinatários e compromissos. O Zelo não substitui aconselhamento contábil, jurídico, financeiro, médico ou profissional."] },
        { title: "9. Disponibilidade e alterações", paragraphs: ["Buscamos manter o serviço disponível e seguro, mas podem ocorrer interrupções por manutenção, falhas de fornecedores, internet ou eventos fora do nosso controle. Não garantimos funcionamento contínuo ou livre de erros."] },
        { title: "10. Suspensão e encerramento", paragraphs: ["Podemos limitar ou suspender o acesso em caso de inadimplência, risco de segurança, fraude, uso abusivo ou violação destes Termos. Você pode deixar de utilizar o serviço e solicitar a exclusão da conta pelo e-mail de suporte, sem prejuízo de obrigações legais de retenção."] },
        { title: "11. Propriedade intelectual", paragraphs: ["A marca Zelo, o software, o design, os textos e demais elementos da plataforma pertencem aos seus respectivos titulares. A assinatura concede uma licença limitada, pessoal, não exclusiva e intransferível para usar o serviço durante o período contratado."] },
        { title: "12. Privacidade", paragraphs: ["O tratamento de dados pessoais segue a Política de Privacidade do Zelo, que integra estes Termos."] },
        { title: "13. Responsabilidade", paragraphs: ["Na extensão permitida por lei, o Zelo não responde por decisões tomadas exclusivamente com base em respostas automatizadas, dados incorretos fornecidos pelo usuário, indisponibilidade de terceiros ou danos indiretos. Nada nestes Termos exclui direitos ou responsabilidades que não possam ser afastados pela legislação aplicável."] },
        { title: "14. Alterações, legislação e contato", paragraphs: ["Podemos atualizar estes Termos. A versão vigente e sua data estarão nesta página, e alterações relevantes serão comunicadas quando necessário. Aplicam-se as leis brasileiras, preservados os direitos obrigatórios do consumidor e a legislação local eventualmente aplicável.", "Contato: contato@zelogestaointeligente.com.br."] },
      ],
    },
  },
  es: {
    homeHref: "/es",
    privacyHref: "/es/privacidad",
    termsHref: "/es/terminos",
    back: "Volver al inicio",
    privacyLabel: "Privacidad",
    termsLabel: "Términos de Uso",
    updated: "Última actualización: 8 de septiembre de 2026",
    contact: "Consultas o solicitudes: contato@zelogestaointeligente.com.br",
    privacy: {
      title: "Política de Privacidad",
      intro: "Esta Política explica cómo Zelo Gestión Inteligente (“Zelo”) recopila, utiliza, almacena, comparte y protege datos personales cuando utilizas nuestro sitio, panel, atención por WhatsApp e integraciones, incluido Google Calendar.",
      sections: [
        { title: "1. Responsable y contacto", paragraphs: ["Zelo Gestión Inteligente es responsable del tratamiento descrito en esta Política. Para ejercer tus derechos, hacer preguntas o solicitar la eliminación de datos, escribe a contato@zelogestaointeligente.com.br."] },
        { title: "2. Datos que podemos tratar", bullets: ["Datos de registro y contacto, como nombre, correo electrónico, teléfono, idioma e información del plan.", "Mensajes, audios, imágenes, documentos y comandos enviados voluntariamente por WhatsApp, panel o soporte.", "Información que decides organizar en Zelo, como finanzas, tareas, recordatorios, metas, agenda, clientes, empleados, vehículos, archivos y listas de compras.", "Datos técnicos y de seguridad, como registros de acceso, dirección IP procesada para prevenir abusos, fecha y hora de las operaciones e identificadores necesarios para prestar el servicio.", "Estado de la suscripción y datos esenciales de la compra recibidos de la plataforma de pago. Zelo no almacena el número completo de tu tarjeta."] },
        { title: "3. Datos de Google Calendar", paragraphs: ["La conexión con Google es opcional y solo se realiza después de que pulsas “Conectar Google” y autorizas el acceso en la pantalla oficial de Google. Zelo solicita el permiso calendar.events, limitado a la gestión de eventos del calendario.", "Con este permiso, Zelo puede consultar, crear, actualizar y eliminar eventos conforme a tus instrucciones y mantener la agenda sincronizada. Los datos pueden incluir título, descripción, fechas, horarios, ubicación, participantes e información de videoconferencia, como el enlace de Google Meet asociado al evento.", "Zelo no solicita acceso a Gmail, a tus archivos de Google Drive ni a los contactos de tu cuenta mediante esta integración. El Drive disponible dentro de Zelo es una función propia e independiente de Google Drive.", "Los tokens de acceso y renovación proporcionados por Google se almacenan cifrados y se utilizan únicamente en el servidor para mantener la integración autorizada."], googlePolicy: true },
        { title: "4. Cómo usamos los datos", bullets: ["Crear y mantener tu cuenta y prestar las funciones contratadas.", "Interpretar y ejecutar tus instrucciones, organizar información y mostrar consultas y resúmenes.", "Sincronizar eventos con Google Calendar y crear enlaces de Google Meet cuando lo solicites.", "Enviar mensajes operativos, recordatorios, avisos de seguridad y comunicaciones relacionadas con el servicio.", "Prestar soporte, corregir fallos, prevenir fraude y abuso y proteger a usuarios y plataforma.", "Cumplir obligaciones legales y ejercer derechos en procedimientos."] },
        { title: "5. Bases legales y consentimiento", paragraphs: ["Tratamos datos para ejecutar el contrato, atender solicitudes, cumplir obligaciones legales, proteger intereses legítimos de seguridad y, cuando corresponda, con tu consentimiento. La autorización de Google puede revocarse en cualquier momento."] },
        { title: "6. Proveedores y transferencias", paragraphs: ["Podemos utilizar proveedores de alojamiento, base de datos, inteligencia artificial, correo electrónico, soporte, WhatsApp/Meta, Google y procesamiento de pagos, solo en la medida necesaria para operar Zelo. También podemos comunicar datos cuando lo exija la ley o sea necesario para proteger derechos y seguridad.", "No vendemos datos personales. Los datos procedentes de las APIs de Google no se comparten con anunciantes, corredores de datos ni terceros para publicidad, perfilado comercial, concesión de crédito o fines incompatibles con la integración autorizada."] },
        { title: "7. Uso limitado de datos de Google", paragraphs: ["Nuestro uso de la información recibida de las APIs de Google Workspace cumple la Política de Datos de Usuario de los Servicios de API de Google, incluidos los requisitos de Uso Limitado. Solo usamos esos datos para ofrecer y mejorar funciones visibles relacionadas con la agenda y las reuniones.", "El acceso humano a datos de Google está prohibido, salvo cuando lo autorices expresamente para soporte, sea necesario investigar abusos o incidentes de seguridad, exista una obligación legal o se utilicen datos agregados y no identificables para operaciones internas permitidas."], googlePolicy: true },
        { title: "8. Almacenamiento y seguridad", paragraphs: ["Adoptamos medidas técnicas y organizativas proporcionales al riesgo, como cifrado de credenciales sensibles, conexiones protegidas, control de acceso y separación de datos por cuenta. Ningún sistema es absolutamente invulnerable; ante un incidente relevante adoptaremos las medidas exigidas por la ley.", "Algunos proveedores pueden tratar datos en otros países. En esos casos procuramos utilizar proveedores confiables y mecanismos adecuados de protección conforme a la legislación aplicable."] },
        { title: "9. Conservación, desconexión y eliminación", paragraphs: ["Conservamos los datos mientras tu cuenta esté activa o durante el tiempo necesario para prestar el servicio y cumplir obligaciones legales. Algunos datos pueden permanecer temporalmente en copias de seguridad protegidas.", "Al desconectar Google en la Configuración de Zelo, intentamos revocar la autorización y eliminamos de Zelo los tokens almacenados. Los eventos ya creados permanecen en tu Google Calendar hasta que los elimines.", "También puedes revocar el acceso desde la página de seguridad de tu Cuenta de Google. Para solicitar la eliminación de tu cuenta y sus datos, escribe desde el correo registrado a contato@zelogestaointeligente.com.br."] },
        { title: "10. Tus derechos", paragraphs: ["Según la legislación aplicable, puedes solicitar acceso, rectificación, eliminación, limitación, oposición, portabilidad cuando corresponda y retirar el consentimiento. Podemos pedir información para verificar tu identidad antes de responder."] },
        { title: "11. Menores, cambios y contacto", paragraphs: ["Zelo no está destinado a menores de 18 años. Podemos actualizar esta Política por cambios legales u operativos; la versión vigente y su fecha estarán siempre en esta página y comunicaremos los cambios importantes cuando sea necesario.", "Contacto de privacidad y soporte: contato@zelogestaointeligente.com.br."] },
      ],
    },
    terms: {
      title: "Términos de Uso",
      intro: "Estos Términos regulan el uso del sitio, panel, atención por WhatsApp y demás funciones de Zelo Gestión Inteligente. Al crear una cuenta o utilizar el servicio declaras que los has leído y aceptado.",
      sections: [
        { title: "1. Requisitos y aceptación", paragraphs: ["Debes tener al menos 18 años y capacidad legal para contratar. Si utilizas Zelo en nombre de una empresa, declaras que estás autorizado para representarla."] },
        { title: "2. El servicio", paragraphs: ["Zelo es un asistente de organización personal y empresarial que ayuda a registrar y consultar finanzas, tareas, recordatorios, agenda, documentos, vehículos, empleados, clientes y listas de compras mediante WhatsApp y el panel web. Las funciones pueden mejorarse, sustituirse o discontinuarse, con aviso cuando el cambio sea relevante."] },
        { title: "3. Cuenta y seguridad", bullets: ["Proporciona información verdadera y actualizada.", "Protege tu contraseña, códigos de acceso y dispositivos.", "Vincula únicamente números de WhatsApp de personas autorizadas.", "Informa inmediatamente cualquier uso indebido o acceso no autorizado."] },
        { title: "4. Integración con Google", paragraphs: ["La conexión con Google Calendar es opcional. Al autorizarla, permites que Zelo consulte, cree, actualice y elimine eventos según tus instrucciones y genere información de videoconferencia de Google Meet. Puedes desconectarla en Configuración o revocarla desde tu Cuenta de Google.", "Eres responsable de comprobar participantes, horarios y contenido antes de enviar invitaciones o realizar cambios importantes."] },
        { title: "5. Planes, pagos y cancelación", paragraphs: ["Los precios, monedas, periodos, cuotas y condiciones aplicables son los mostrados en la página de venta y en el checkout al contratar. Los pagos y reembolsos se procesan por la plataforma indicada, como Hotmart, conforme a sus reglas y a la legislación del consumidor.", "El acceso puede suspenderse o finalizar si la suscripción vence, se cancela, se reembolsa o no se renueva. Los recordatorios y otros mensajes automáticos no se envían mientras la cuenta está inactiva."] },
        { title: "6. Uso permitido", paragraphs: ["No puedes utilizar Zelo para infringir leyes o derechos de terceros, cometer fraude, enviar contenido malicioso o no autorizado, acceder a cuentas ajenas, interferir en la seguridad, sobrecargar el servicio ni realizar ingeniería inversa indebida."] },
        { title: "7. Contenido y responsabilidad del usuario", paragraphs: ["Conservas los derechos sobre el contenido que envías y concedes a Zelo únicamente la autorización necesaria para procesarlo y prestar el servicio. Eres responsable de la legitimidad, exactitud y permisos relativos a datos de terceros que introduzcas."] },
        { title: "8. Inteligencia artificial y límites", paragraphs: ["Zelo utiliza automatización e inteligencia artificial y puede interpretar incorrectamente un mensaje o generar información incompleta. Comprueba los datos importantes, especialmente valores, fechas, destinatarios y compromisos. Zelo no sustituye asesoramiento contable, jurídico, financiero, médico ni profesional."] },
        { title: "9. Disponibilidad y cambios", paragraphs: ["Intentamos mantener el servicio disponible y seguro, pero pueden producirse interrupciones por mantenimiento, proveedores, internet o hechos fuera de nuestro control. No garantizamos un funcionamiento continuo o libre de errores."] },
        { title: "10. Suspensión y terminación", paragraphs: ["Podemos limitar o suspender el acceso por impago, riesgo de seguridad, fraude, abuso o incumplimiento de estos Términos. Puedes dejar de utilizar el servicio y solicitar la eliminación de la cuenta por correo, sin perjuicio de las obligaciones legales de conservación."] },
        { title: "11. Propiedad intelectual", paragraphs: ["La marca Zelo, el software, el diseño, los textos y demás elementos pertenecen a sus respectivos titulares. La suscripción concede una licencia limitada, personal, no exclusiva e intransferible durante el periodo contratado."] },
        { title: "12. Privacidad", paragraphs: ["El tratamiento de datos personales se rige por la Política de Privacidad de Zelo, que forma parte de estos Términos."] },
        { title: "13. Responsabilidad", paragraphs: ["En la medida permitida por la ley, Zelo no responde por decisiones basadas exclusivamente en respuestas automatizadas, datos incorrectos aportados por el usuario, indisponibilidad de terceros o daños indirectos. Nada en estos Términos excluye derechos o responsabilidades inderogables."] },
        { title: "14. Cambios, ley y contacto", paragraphs: ["Podemos actualizar estos Términos. La versión vigente y su fecha estarán en esta página y comunicaremos cambios relevantes cuando sea necesario. Se aplican las leyes brasileñas, sin perjuicio de los derechos obligatorios del consumidor y de la legislación local que corresponda.", "Contacto: contato@zelogestaointeligente.com.br."] },
      ],
    },
  },
  "pt-PT": {
    homeHref: "/pt",
    privacyHref: "/pt/privacidade",
    termsHref: "/pt/termos",
    back: "Voltar ao início",
    privacyLabel: "Privacidade",
    termsLabel: "Termos de Utilização",
    updated: "Última atualização: 8 de setembro de 2026",
    contact: "Dúvidas ou pedidos: contato@zelogestaointeligente.com.br",
    privacy: {
      title: "Política de Privacidade",
      intro: "Esta Política explica como o Zelo Gestão Inteligente (“Zelo”) recolhe, utiliza, armazena, partilha e protege dados pessoais quando utilizas o nosso site, painel, atendimento pelo WhatsApp e integrações, incluindo o Google Calendar.",
      sections: [
        { title: "1. Responsável e contacto", paragraphs: ["O Zelo Gestão Inteligente é responsável pelo tratamento descrito nesta Política. Para exercer os teus direitos, colocar dúvidas ou pedir a eliminação de dados, escreve para contato@zelogestaointeligente.com.br."] },
        { title: "2. Dados que podemos tratar", bullets: ["Dados de registo e contacto, como nome, e-mail, telefone, idioma e informações do plano.", "Mensagens, áudios, imagens, documentos e comandos enviados voluntariamente pelo WhatsApp, painel ou suporte.", "Informações que decides organizar no Zelo, como finanças, tarefas, lembretes, metas, agenda, clientes, funcionários, veículos, ficheiros e listas de compras.", "Dados técnicos e de segurança, como registos de acesso, endereço IP processado para prevenir abusos, data e hora das operações e identificadores necessários ao serviço.", "Estado da subscrição e dados essenciais da compra recebidos da plataforma de pagamento. O Zelo não armazena o número completo do teu cartão."] },
        { title: "3. Dados do Google Calendar", paragraphs: ["A ligação ao Google é opcional e só acontece depois de clicares em “Ligar Google” e autorizares o acesso no ecrã oficial do Google. O Zelo solicita a permissão calendar.events, limitada à gestão de eventos do calendário.", "Com esta permissão, o Zelo pode consultar, criar, atualizar e eliminar eventos conforme as tuas instruções e manter a agenda sincronizada. Os dados podem incluir título, descrição, datas, horas, local, participantes e informações de videoconferência, como a ligação do Google Meet associada ao evento.", "O Zelo não solicita acesso ao Gmail, aos ficheiros do Google Drive nem aos contactos da tua conta através desta integração. O Drive disponível no Zelo é uma funcionalidade própria e separada do Google Drive.", "Os tokens de acesso e renovação fornecidos pelo Google são armazenados de forma encriptada e utilizados apenas no servidor para manter a integração autorizada."], googlePolicy: true },
        { title: "4. Como utilizamos os dados", bullets: ["Criar e manter a tua conta e fornecer as funcionalidades contratadas.", "Interpretar e executar as tuas instruções, organizar informações e apresentar consultas e resumos.", "Sincronizar eventos com o Google Calendar e criar ligações do Google Meet quando pedires.", "Enviar mensagens operacionais, lembretes, avisos de segurança e comunicações do serviço.", "Prestar suporte, corrigir falhas, prevenir fraude e abuso e proteger utilizadores e plataforma.", "Cumprir obrigações legais e exercer direitos em processos."] },
        { title: "5. Fundamentos legais e consentimento", paragraphs: ["Tratamos dados para executar o contrato, responder aos teus pedidos, cumprir obrigações legais, proteger interesses legítimos de segurança e, quando necessário, com o teu consentimento. A autorização do Google pode ser revogada a qualquer momento."] },
        { title: "6. Prestadores e transferências", paragraphs: ["Podemos utilizar prestadores de alojamento, base de dados, inteligência artificial, e-mail, suporte, WhatsApp/Meta, Google e processamento de pagamentos, apenas no limite necessário para operar o Zelo. Também podemos comunicar dados quando exigido por lei ou para proteger direitos e segurança.", "Não vendemos dados pessoais. Os dados provenientes das APIs do Google não são partilhados com anunciantes, corretores de dados ou terceiros para publicidade, definição de perfis comerciais, concessão de crédito ou fins incompatíveis com a integração autorizada."] },
        { title: "7. Utilização limitada dos dados do Google", paragraphs: ["A nossa utilização de informações recebidas das APIs do Google Workspace cumpre a Política de Dados do Utilizador dos Serviços de API do Google, incluindo os requisitos de Utilização Limitada. Utilizamos esses dados apenas para fornecer e melhorar funcionalidades visíveis relacionadas com agenda e reuniões.", "O acesso humano aos dados do Google é proibido, salvo quando o autorizares expressamente para suporte, quando for necessário investigar abuso ou incidente de segurança, quando existir obrigação legal ou quando forem utilizados dados agregados e não identificáveis para operações internas permitidas."], googlePolicy: true },
        { title: "8. Armazenamento e segurança", paragraphs: ["Adotamos medidas técnicas e organizativas proporcionais ao risco, incluindo encriptação de credenciais sensíveis, ligações protegidas, controlo de acesso e separação de dados por conta. Nenhum sistema é absolutamente invulnerável; perante um incidente relevante, adotaremos as medidas exigidas pela lei.", "Alguns prestadores podem tratar dados noutros países. Nesses casos, procuramos utilizar prestadores de confiança e mecanismos adequados de proteção conforme a legislação aplicável."] },
        { title: "9. Conservação, desligação e eliminação", paragraphs: ["Conservamos os dados enquanto a tua conta estiver ativa ou pelo período necessário para prestar o serviço e cumprir obrigações legais. Alguns dados podem permanecer temporariamente em cópias de segurança protegidas.", "Ao desligares o Google nas Configurações do Zelo, tentamos revogar a autorização e eliminamos do Zelo os tokens armazenados. Os eventos já criados permanecem no teu Google Calendar até os eliminares.", "Também podes revogar o acesso na página de segurança da tua Conta Google. Para pedir a eliminação da conta e dos dados associados, escreve a partir do e-mail registado para contato@zelogestaointeligente.com.br."] },
        { title: "10. Os teus direitos", paragraphs: ["Nos termos da legislação aplicável, podes pedir acesso, retificação, apagamento, limitação, oposição, portabilidade quando aplicável e retirar o consentimento. Podemos solicitar informações para confirmar a tua identidade antes de responder."] },
        { title: "11. Menores, alterações e contacto", paragraphs: ["O Zelo não se destina a menores de 18 anos. Podemos atualizar esta Política devido a alterações legais ou operacionais; a versão vigente e a respetiva data estarão sempre nesta página e comunicaremos alterações relevantes quando necessário.", "Contacto de privacidade e suporte: contato@zelogestaointeligente.com.br."] },
      ],
    },
    terms: {
      title: "Termos de Utilização",
      intro: "Estes Termos regulam a utilização do site, painel, atendimento pelo WhatsApp e restantes funcionalidades do Zelo Gestão Inteligente. Ao criares uma conta ou utilizares o serviço, declaras que os leste e aceitaste.",
      sections: [
        { title: "1. Elegibilidade e aceitação", paragraphs: ["Deves ter pelo menos 18 anos e capacidade legal para contratar. Se utilizares o Zelo em nome de uma empresa, declaras ter autorização para a representar."] },
        { title: "2. O serviço", paragraphs: ["O Zelo é um assistente de organização pessoal e empresarial que ajuda a registar e consultar finanças, tarefas, lembretes, agenda, documentos, veículos, funcionários, clientes e listas de compras através do WhatsApp e do painel web. As funcionalidades podem ser melhoradas, substituídas ou descontinuadas, com aviso quando a alteração for relevante."] },
        { title: "3. Conta e segurança", bullets: ["Fornece informações verdadeiras e atualizadas.", "Protege a tua senha, códigos de acesso e dispositivos.", "Associa apenas números de WhatsApp de pessoas autorizadas.", "Comunica imediatamente qualquer utilização indevida ou acesso não autorizado."] },
        { title: "4. Integração com o Google", paragraphs: ["A ligação ao Google Calendar é opcional. Ao autorizá-la, permites que o Zelo consulte, crie, atualize e elimine eventos de acordo com as tuas instruções e gere informações de videoconferência do Google Meet. Podes desligá-la nas Configurações ou revogá-la na tua Conta Google.", "És responsável por confirmar participantes, horários e conteúdo antes de enviar convites ou executar alterações importantes."] },
        { title: "5. Planos, pagamentos e cancelamento", paragraphs: ["Os preços, moedas, períodos, prestações e condições aplicáveis são os apresentados na página de venda e no checkout no momento da contratação. Pagamentos e reembolsos são processados pela plataforma indicada, como a Hotmart, segundo as respetivas regras e a legislação do consumidor.", "O acesso pode ser suspenso ou terminado quando a subscrição vencer, for cancelada, reembolsada ou não renovada. Lembretes e outras mensagens automáticas não são enviados enquanto a conta estiver inativa."] },
        { title: "6. Utilização permitida", paragraphs: ["Não podes utilizar o Zelo para violar leis ou direitos de terceiros, cometer fraude, enviar conteúdo malicioso ou não autorizado, aceder a contas alheias, interferir na segurança, sobrecarregar o serviço ou realizar engenharia inversa indevida."] },
        { title: "7. Conteúdo e responsabilidade do utilizador", paragraphs: ["Manténs os direitos sobre o conteúdo que envias e concedes ao Zelo apenas a autorização necessária para o processar e prestar o serviço. És responsável pela legitimidade, exatidão e autorizações relativas a dados de terceiros inseridos na plataforma."] },
        { title: "8. Inteligência artificial e limites", paragraphs: ["O Zelo utiliza automação e inteligência artificial e pode interpretar incorretamente uma mensagem ou apresentar informação incompleta. Confirma dados importantes, sobretudo valores, datas, destinatários e compromissos. O Zelo não substitui aconselhamento contabilístico, jurídico, financeiro, médico ou profissional."] },
        { title: "9. Disponibilidade e alterações", paragraphs: ["Procuramos manter o serviço disponível e seguro, mas podem ocorrer interrupções por manutenção, prestadores, internet ou acontecimentos fora do nosso controlo. Não garantimos funcionamento contínuo ou livre de erros."] },
        { title: "10. Suspensão e cessação", paragraphs: ["Podemos limitar ou suspender o acesso por falta de pagamento, risco de segurança, fraude, abuso ou violação destes Termos. Podes deixar de utilizar o serviço e pedir a eliminação da conta por e-mail, sem prejuízo das obrigações legais de conservação."] },
        { title: "11. Propriedade intelectual", paragraphs: ["A marca Zelo, o software, o design, os textos e os restantes elementos pertencem aos respetivos titulares. A subscrição concede uma licença limitada, pessoal, não exclusiva e intransmissível durante o período contratado."] },
        { title: "12. Privacidade", paragraphs: ["O tratamento de dados pessoais rege-se pela Política de Privacidade do Zelo, que faz parte destes Termos."] },
        { title: "13. Responsabilidade", paragraphs: ["Na medida permitida por lei, o Zelo não responde por decisões baseadas exclusivamente em respostas automatizadas, dados incorretos fornecidos pelo utilizador, indisponibilidade de terceiros ou danos indiretos. Nada nestes Termos exclui direitos ou responsabilidades que não possam ser afastados."] },
        { title: "14. Alterações, lei e contacto", paragraphs: ["Podemos atualizar estes Termos. A versão vigente e a data estarão nesta página e comunicaremos alterações relevantes quando necessário. Aplicam-se as leis brasileiras, sem prejuízo dos direitos obrigatórios do consumidor e da legislação local aplicável.", "Contacto: contato@zelogestaointeligente.com.br."] },
      ],
    },
  },
};

export default function LegalDocument({ locale, kind }: { locale: Locale; kind: Kind }) {
  const copy = copies[locale];
  const document = copy[kind];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">
      <header className="border-b border-white/10 bg-slate-950">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href={copy.homeHref} aria-label="Zelo — início">
            <Image src="/brand/zelo-wordmark-light.png" alt="Zelo" width={640} height={293} className="h-7 w-auto" priority />
          </Link>
          <Link href={copy.homeHref} className="text-sm font-semibold text-slate-300 transition hover:text-white">
            ← {copy.back}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="border-b border-slate-100 pb-8">
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              Zelo Gestão Inteligente
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{document.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{document.intro}</p>
            <p className="mt-4 text-xs font-medium text-slate-400">{copy.updated}</p>
          </div>

          <div className="space-y-9 pt-8">
            {document.sections.map(section => (
              <section key={section.title}>
                <h2 className="text-xl font-bold text-slate-900">{section.title}</h2>
                {section.paragraphs?.map(paragraph => (
                  <p key={paragraph} className="mt-3 leading-7 text-slate-600">{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul className="mt-3 list-disc space-y-2 pl-6 leading-7 text-slate-600">
                    {section.bullets.map(item => <li key={item}>{item}</li>)}
                  </ul>
                )}
                {section.googlePolicy && (
                  <p className="mt-3 text-sm">
                    <a
                      href="https://developers.google.com/terms/api-services-user-data-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 hover:text-amber-800"
                    >
                      Google API Services User Data Policy
                    </a>
                  </p>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Zelo Gestão Inteligente</p>
          <nav className="flex flex-wrap items-center justify-center gap-5">
            <Link href={copy.privacyHref} className="hover:text-slate-950">{copy.privacyLabel}</Link>
            <Link href={copy.termsHref} className="hover:text-slate-950">{copy.termsLabel}</Link>
            <a href="mailto:contato@zelogestaointeligente.com.br" className="hover:text-slate-950">{copy.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
