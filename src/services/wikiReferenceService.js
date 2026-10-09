const { number: n, table, article } = require("./wikiContent");
const combat = require("./combatFormulas");
const { STATUS } = require("../config/statusEffectConfig");
const tierConfig = require("../config/equipmentTierConfig");
function buildReferenceArticles({ catalog, typingConfig, regions, fishingZones, boss, crisis }) {
  const result = [article("referencia-progressao", "Sua jornada em Caelum", "guide", "Guia de progressão", [
    "As escolhas do aventureiro conectam combate, profissões, economia e eventos. Use este roteiro como orientação; cada ficha e cada atividade mostram os requisitos reais do jogo.",
    "## Primeiros passos\n1. Confira sua raça, classe e atributos em [Meu personagem](/dashboard/character).\n2. Aprenda as habilidades disponíveis e organize os slots de combate.\n3. Equipe suas armas e proteções no [Inventário](/dashboard/inventory).\n4. Entre na [Aventura](/dashboard/adventure) em uma região adequada ao seu nível.\n5. Após vencer, consulte a criatura descoberta no [Bestiário](/dashboard/bestiary) e na Wiki.",
    "## Prepare a próxima melhoria\nCompare os atributos dos equipamentos, a faixa de tier e os requisitos da receita. Na [Expedição](/dashboard/expedition), desenvolva as profissões e colete materiais. Use a [Forja](/dashboard/forge) e o Caldeirão para fabricar; receitas por descoberta precisam ser aprendidas antes.",
    "## Escolha uma build\nCompare o atributo de escalamento dos poderes com seus atributos. Diferencie dano físico, mágico e verdadeiro. Vida, mana, defesa, precisão, esquiva e status também importam: dano base sozinho não descreve uma build.",
    "## Avance sem perder o rumo\nConfira os requisitos da evolução de classe antes de investir recursos: a escolha por estágio é definitiva. Desenvolva as habilidades com os custos mostrados no manual e use a [Guilda dos Aventureiros](/dashboard/quests) para acompanhar contratos e objetivos disponíveis.",
    "## Participe do mundo\nExplore [Pesca](/dashboard/fishing), [Guildas](/dashboard/guilds), [PvP](/dashboard/pvp) e [Templo](/dashboard/temple) conforme sua preparação. Quando uma ameaça ou crise for anunciada, acompanhe o evento e a [Reconstrução](/dashboard/quests/reconstruction).",
  ], { resumo: "Do primeiro equipamento às evoluções, profissões e eventos." }),
  article("referencia-equipamentos", "Tier, raridade e refinamento", "guide", "Equipamentos e itens", [
    "Tier representa a faixa de poder do modelo. Raridade representa a qualidade da cópia. Refinamento é uma melhoria da instância de equipamento: dois exemplares do mesmo modelo podem ter números diferentes.",
    table(["Tier", "Multiplicador de referência"], Object.entries(tierConfig.TIER_POWER_MULTIPLIER).sort((a,b) => Number(b[0])-Number(a[0])).map(([tier,value]) => [tier, `${n(value)}×`])),
    "Tier 1 é o topo da escala e Tier 5 é a faixa básica. O tier do modelo não muda quando você fabrica ou refina. Os atributos cadastrados podem ter ajustes específicos; compare as fichas dos itens, não apenas a cor da raridade.",
    table(["Raridade", "Multiplicador padrão de atributos"], Object.entries(tierConfig.RARITY_POWER_MULTIPLIER).map(([rarity,value]) => [rarity, `${n(value)}×`])),
    "As fichas de arma e armadura calculam a prévia por raridade com os ajustes cadastrados para o item. Elas não incluem refinamento, buffs ou bônus da sua classe. A cópia equipada e a tela de atributos mostram o resultado do seu personagem.",
    "Itens anunciados no Mercado não ficam disponíveis para equipar enquanto o anúncio estiver ativo. QuestItems e moedas especiais seguem regras de negociação próprias; não trate todo item como vendável.",
  ], { resumo: "Entenda o modelo, a qualidade da cópia e as melhorias individuais." }),
  article("referencia-fabricacao", "Forja e Alquimia: como fabricar", "guide", "Fabricação", [
    "As fichas desta seção usam os catálogos e as prévias do jogo. Receitas secretas não são reveladas por consultar a Wiki.",
    "## Ferreiro\nModelos automáticos ficam visíveis com o requisito de nível. Modelos que exigem uma Receita precisam ser aprendidos. Confira os materiais na qualidade escolhida, inicie a fabricação e aguarde a coleta. A raridade final da cópia pode melhorar conforme o sorteio da fabricação; o tier permanece o do modelo.",
    "## Fundição e refinamento\nA fundição transforma materiais de mineração em barras, conforme o catálogo da Forja. O refinamento melhora uma cópia de equipamento. Fabricação e refinamento compartilham o slot da Forja; chance, proteção, custo e tempo são mostrados antes de confirmar a ação.",
    "## Caldeirão\nA Alquimia possui nível próprio e prepara consumíveis. Fórmulas por nível são públicas; fórmulas por descoberta só revelam seus ingredientes e resultados quando estão desbloqueadas conforme as regras do Caldeirão. Gold e ingredientes são consumidos na preparação.",
    "Aprender uma receita não fabrica seu resultado imediatamente. Ter uma fórmula no inventário também não significa que ela já foi aprendida. Confira o Livro de Receitas e o Livro de Fórmulas na [Forja](/dashboard/forge).",
  ], { resumo: "Materiais, conhecimento de receitas, qualidade e filas de fabricação." }),
  article("referencia-combate", "Combate: dano, defesa, crítico e esquiva", "combat", "Combate e afinidades", [
    "O valor base de uma arma ou habilidade é parte do cálculo. Atributos, nível, classe, raridade, refinamento e efeitos do encontro podem alterar o resultado antes de descontar vida.",
    "## Defesa\nQuando a mitigação por defesa se aplica, a redução segue defesa / (defesa + 50). Ela reduz o dano sem garantir invulnerabilidade. Tipos de dano e efeitos específicos podem usar outras regras.",
    table(["Defesa", "Vida perdida em um golpe de 100 antes dos demais efeitos"], [0,25,50,100].map(defense => [defense, combat.aplicarMitigacaoDeDefesa(100, { defesa: defense })])),
    "## Crítico e precisão\nVelocidade contribui para a chance de crítico e para superar a esquiva. Agilidade ajuda a esquivar. São probabilidades, não garantias de acerto ou de sobrevivência.",
    table(["Velocidade", "Chance de crítico sem outros bônus"], [0,10,25,100].map(speed => [speed, `${n(combat.probabilidadeDeCritico({ velocidade: speed }) * 100)}%`])),
    "## Status", table(["Status", "Categoria"], Object.values(STATUS).map(s => [s.nomeUi, s.ehDot ? "Dano periódico" : s.bloqueiaAcoes?.length ? "Controle de ações" : "Penalidade"])),
    "Chance, duração, potência e alvo ficam nas fichas das habilidades e armas. Resistências e regras de reaplicação influenciam os status. Compare os efeitos de cura, remoção de status e escudo com o tipo de ameaça que você enfrenta.",
  ], { resumo: "Exemplos calculados com as fórmulas compartilhadas do motor." }),
  article("referencia-afinidades", "Naturezas, afinidades e tipos de arma", "combat", "Combate e afinidades", [
    table(["Modo", "Tipagem aplicada"], [["PvE", typingConfig.pve_enabled ? "Habilitada" : "Desabilitada"], ["PvP", typingConfig.pvp_enabled ? "Habilitada" : "Desabilitada"]]),
    "Natureza do dano e afinidade são coisas distintas. A natureza identifica dano físico, mágico ou verdadeiro; a afinidade identifica o tipo específico, como um elemento. O atributo que escala uma habilidade é uma terceira informação.",
    "## Afinidades cadastradas", table(["Afinidade", "Categoria"], (catalog.DamageAffinityType || []).filter(a => a.ativo).map(a => [a.nome,a.categoria])),
    "## Tipos de arma", table(["Arma", "Natureza padrão", "Afinidade padrão"], (catalog.WeaponType || []).filter(w => w.ativo).map(w => [w.nome,w.default_damage_nature,(catalog.DamageAffinityType || []).find(a => a.id === w.default_affinity_id)?.nome || "Neutra"])),
    "O cadastro da arma ou habilidade pode ajustar o padrão. Nas fichas das criaturas descobertas, consulte os multiplicadores de dano recebido por afinidade: acima de 1 amplia essa parcela do dano; abaixo de 1 reduz. Bônus contra famílias e demais modificadores também podem participar quando o sistema está habilitado.",
    `Os limites atuais de multiplicador da tipagem são **${n(typingConfig.min_multiplier)}× a ${n(typingConfig.max_multiplier)}×**. Esses valores não substituem a ficha da criatura nem representam o dano final do golpe.`,
  ], { resumo: "Veja o catálogo atual e como ler resistências sem revelar criaturas ocultas." })];
  result.push(article("referencia-expedicao", "Expedição e profissões de coleta", "activity", "Atividades e eventos", [
    "Mineração, Silvicultura e Exploração possuem progressão própria. Escolha uma região compatível com a profissão, acompanhe o nível exigido e respeite o tempo até a próxima coleta. A qualidade e os recursos obtidos vêm do sorteio do jogo.",
    table(["Região", "Profissão", "Nível mínimo da profissão"], regions.map(r => [r.nome, {Mineracao:"Mineração",Silvicultura:"Silvicultura",Exploracao:"Exploração"}[r.profissao] || r.profissao, r.nivel_minimo])),
    ...regions.map(r => `## ${r.nome}\n${r.descricao || ""}`),
    "A Expedição fornece materiais para a Forja e o Caldeirão. Podem ocorrer encontros e achados conforme as regras da coleta. Não confunda nível da profissão com nível do personagem. Confira as regiões e bloqueios atuais na [Expedição](/dashboard/expedition).",
  ], { resumo: "Regiões cadastradas e preparação para coletar materiais." }));
  result.push(article("referencia-pesca", "Pesca e navegação", "activity", "Atividades e eventos", [
    "Prepare vara e isca, escolha uma zona e acompanhe as exigências de pesca e embarcação. O equipamento, o ambiente e o comportamento da espécie influenciam a captura.",
    table(["Zona", "Nível de Pesca", "Tier mínimo da embarcação"], fishingZones.map(z => [z.nome,z.nivel_pesca_minimo,z.tier_embarcacao_minimo])),
    ...fishingZones.map(z => `## ${z.nome}\n${z.descricao || ""}`),
    "Capture uma espécie para revelar seus registros no Almanaque Marinho. Esta seção não lista espécies ainda desconhecidas. A captura é validada pelo jogo; a aparência do peixe ou um clique isolado não determina o resultado. Abra a [Pesca](/dashboard/fishing) para escolher o local e participar de torneios quando estiverem disponíveis.",
  ], { resumo: "Equipamento, zonas, requisitos de acesso e descoberta de espécies." }));
  result.push(article("referencia-vida-social", "Economia, guildas, PvP e Templo", "activity", "Atividades e eventos", [
    "## Comércio\nUse o [Mercado Negro](/dashboard/market) para negociar itens permitidos. Preço de anúncio é definido pelo vendedor e não é o mesmo que o valor cadastrado de venda. Verifique quantidade, raridade da cópia, refinamento e eventuais taxas antes de confirmar.",
    "## Guildas\nAs [Guildas](/dashboard/guilds) conectam cooperação, missões, recursos e atividades coletivas. A Guilda dos Aventureiros é outro sistema: em [Contratos](/dashboard/quests), acompanhe rank, reputação e objetivos disponíveis para o personagem.",
    "## PvP\nOs modos de [PvP](/dashboard/pvp) têm regras próprias de fila, participação e recompensas. Uma build eficaz na Aventura pode se comportar de outra forma contra jogadores. Veja quais efeitos estão permitidos no modo e confirme as regras exibidas antes de entrar.",
    "## Templo\nO [Templo](/dashboard/temple) reúne progressão e desafios próprios. Confira os requisitos de entrada, a etapa liberada e os recursos envolvidos antes de confirmar uma atividade. Desbloqueios e recompensas são verificados pelo jogo; a Wiki não libera etapas.",
  ], { resumo: "Como os sistemas sociais e modos de progressão se conectam." }));
  const deadline = boss.combat_expires_at ? new Date(boss.combat_expires_at).toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo"}) : null;
  result.push(article("referencia-ameaca", "Ameaça mundial e reconstrução", "activity", "Atividades e eventos", [
    "Uma ameaça mundial torna-se pública depois da descoberta. A aparição usa sua própria configuração: mudanças posteriores no catálogo não reescrevem um evento já iniciado. O prazo exibido no evento determina o limite para derrotar o boss.",
    boss.nome ? `## Última ameaça revelada: ${boss.nome}\n${boss.lore || boss.descricao || ""}\n\n${table(["Informação pública","Valor"],[["Estado",{DISCOVERED:"Descoberto",ACTIVE:"Em combate",DEFEATED:"Derrotado",FAILED:"Falhou",CANCELLED:"Cancelado"}[boss.status] || boss.status],["Vida global máxima",n(boss.hp_max)],...(deadline ? [["Prazo desta aparição (horário de Brasília)",deadline]] : [])])}` : "Nenhuma ameaça foi revelada no status público consultado.",
    "## Quando ocorre uma crise\nSe a ameaça não for derrotada dentro do prazo e possuir consequências configuradas, uma crise pode aplicar penalidades de XP/gold e restringir zonas. Essas consequências dependem do perfil daquela aparição; não há um prazo único que valha para todos os bosses.",
    "## Reconstrução\nEntregue os materiais aceitos em [Reconstrução de Caelum](/dashboard/quests/reconstruction). O progresso é global e dividido em etapas. As metas e itens aceitos vêm da crise ativa: nem toda etapa usa o mesmo material. Os rankings individuais e de guildas seguem os pontos e regras do evento; as recompensas são as configuradas para ele.",
    crisis.status === "ACTIVE" ? `## Crise ativa: ${crisis.nome}\nEtapa: **${crisis.stage?.nome || "Em andamento"}**.\n\n${table(["Penalidade atual","Percentual"],[["XP",`${n(crisis.effects?.xp_pct)}%`],["Gold",`${n(crisis.effects?.gold_pct)}%`]])}\n\n${table(["Objetivo global da etapa","Meta"],(crisis.stage?.requirements || []).map(r=>[r.nome,n(r.target_progress)]))}` : "Não há uma crise ativa no estado consultado. Consulte a página do evento para acompanhar novas ativações.",
    "A Wiki registra o estado no momento da consulta. Para tempo restante, progresso ao vivo, restrições, contribuições e recompensas, abra a tela do evento.",
  ], { resumo: "Prazo público da aparição, crises, contribuições e recuperação global." }));
  result.push(article("referencia-duvidas", "Dúvidas frequentes do aventureiro", "guide", "Guia de progressão", [
    "## Por que o dano da ficha difere do combate?\nA ficha mostra valores base. Atributos, nível da habilidade, classe, crítico, defesa, status e afinidades entram no resultado final.",
    "## Por que uma criatura não aparece na Wiki?\nÉ preciso registrar a primeira vitória do seu personagem contra ela. Criaturas e vínculos desativados também ficam fora das fichas.",
    "## Por que os drops não somam 100%?\nCada linha de espólio possui seu próprio sorteio. Você pode receber mais de um item ou não receber nenhum.",
    "## Por que não vejo uma receita?\nReceitas por descoberta precisam ser aprendidas. Possuir a fórmula física não significa que ela já foi aprendida. O nível da profissão também pode ser exigido.",
    "## Por que meu equipamento difere de outra cópia?\nRaridade da instância, refinamento, ajustes do catálogo e bônus aplicados podem mudar os atributos. O tier identifica o modelo e não muda com refinamento.",
    "## Ler a Wiki executa uma ação?\nNão. Aprender, comprar, equipar, fabricar, evoluir e contribuir continuam nas telas do jogo, com validação dos requisitos antes de confirmar.",
  ], { resumo: "Respostas sobre dano, drops, descoberta, receitas e equipamentos." }));
  return result;
}
module.exports = { buildReferenceArticles };
