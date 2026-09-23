// Dados de conteúdo da Expansão Aventura Beta (10 áreas / 40 monstros /
// ~90 espólios) — Especificacao_Expansao_Aventura_Beta_Caelum_Claude.docx.
// Centralizado aqui (em vez de espalhado pelas migrations) pra ter um
// único lugar de referência com os nomes/perfis/drops exatos da spec, e
// pras migrations de conteúdo poderem gerar os INSERTs a partir disto em
// vez de repetir a mesma tabela em cada arquivo.
//
// §25/§26: multiplicadores dos 9 monstros já existentes são PRESERVADOS
// como estavam (nunca sobrescritos); os 31 novos usam o arquétipo da
// spec (§25) como ponto de partida, ajustado pelo "perfil" de cada linha
// da tabela de área — número inicial pro Beta, a calibrar depois via
// simulador (§41), não um valor final.
//
// §19/§21: cada Comum recebe 2 drops (Principal 65%, Secundário 20%);
// cada Raro recebe 3 (Principal 100%, Secundário 45%, Especial 8%) —
// rolagem independente por entrada (AdventureMonsterLoot.chance_ppm),
// nunca uma escolha exclusiva entre os drops de um mesmo monstro.
const CHANCE_PPM = {
  principalComum: 650000,
  secundarioComum: 200000,
  principalRaro: 1000000,
  secundarioRaro: 450000,
  especialRaro: 80000,
};

// Faixa de raridade/valor de venda por área (§24: baixo nas áreas
// iniciais, subindo gradualmente; Especial de Raro sempre uma raridade
// acima do Principal da própria área, "alto, mas não substituir
// crafting"). Índice = ordem final da área (1-10, ver AREAS abaixo).
const FAIXA_POR_AREA = {
  1: { principal: "Comum", pVenda: 12, secundario: "Comum", sVenda: 8, especial: "Incomum", eVenda: 60 },
  2: { principal: "Comum", pVenda: 16, secundario: "Comum", sVenda: 11, especial: "Raro", eVenda: 95 },
  3: { principal: "Incomum", pVenda: 26, secundario: "Comum", sVenda: 16, especial: "Raro", eVenda: 120 },
  4: { principal: "Incomum", pVenda: 32, secundario: "Incomum", sVenda: 20, especial: "Raro", eVenda: 150 },
  5: { principal: "Raro", pVenda: 45, secundario: "Incomum", sVenda: 26, especial: "Epico", eVenda: 220 },
  6: { principal: "Raro", pVenda: 58, secundario: "Incomum", sVenda: 32, especial: "Epico", eVenda: 280 },
  7: { principal: "Raro", pVenda: 72, secundario: "Raro", sVenda: 42, especial: "Epico", eVenda: 360 },
  8: { principal: "Epico", pVenda: 130, secundario: "Raro", sVenda: 55, especial: "Epico", eVenda: 450 },
  9: { principal: "Epico", pVenda: 190, secundario: "Raro", sVenda: 75, especial: "Lendario", eVenda: 650 },
  10: { principal: "Epico", pVenda: 260, secundario: "Raro", sVenda: 100, especial: "Lendario", eVenda: 900 },
};

// As 10 áreas na ordem final (§5) — `existente` marca as 3 que já
// existiam (IDs preservados, só range/ordem mudam, §6); as outras 7 são
// inserções novas.
const AREAS = [
  { ordem: 1, nome: "Campos dos Viajantes", min: 1, max: 5, tema: "Planícies e início da jornada", existente: false,
    descricao: "As primeiras léguas fora de Valenor — trilhas batidas, pouco perigo, mas o bastante pra ensinar o básico." },
  { ordem: 2, nome: "Bosque de Sussurros", min: 6, max: 10, tema: "Floresta sombria", existente: true },
  { ordem: 3, nome: "Pântano da Lua Morta", min: 11, max: 15, tema: "Brejo, venenos e corrupção natural", existente: false,
    descricao: "Água parada, ar pesado — quase tudo que vive aqui aprendeu a machucar devagar." },
  { ordem: 4, nome: "Estrada dos Exilados", min: 16, max: 20, tema: "Fronteira e ameaças humanas", existente: false,
    descricao: "A última estrada vigiada antes da fronteira — depois dela, só quem foi expulso de algum lugar." },
  { ordem: 5, nome: "Ruínas de Cinza", min: 21, max: 25, tema: "Ruínas, mortos e culto", existente: false,
    descricao: "O que sobrou de uma cidade que ninguém mais nomeia — os cultos preferem assim." },
  { ordem: 6, nome: "Terras Devastadas", min: 26, max: 30, tema: "Cinzas, guerra e elementais", existente: true },
  { ordem: 7, nome: "Garganta de Ferro", min: 31, max: 35, tema: "Montanhas e tribos brutais", existente: false,
    descricao: "Um desfiladeiro estreito demais pra dois exércitos — sobrou pras tribos que já vivem lá." },
  { ordem: 8, nome: "Cavernas Rúnicas", min: 36, max: 40, tema: "Cristais, runas e sentinelas", existente: false,
    descricao: "Uma mina antiga que virou santuário — os cristais ainda cantam quando alguém se aproxima." },
  { ordem: 9, nome: "Abismo Dracônico", min: 41, max: 45, tema: "Obsidiana, fogo e sangue dracônico", existente: false,
    descricao: "A rocha derrete antes de esfriar de novo — nada que mora aqui teme fogo." },
  { ordem: 10, nome: "Covil do Minotauro", min: 46, max: 50, tema: "Labirinto e conteúdo final do Beta", existente: true },
];

// Monstros por área, na ordem Comum/Comum/Comum/Raro de cada tabela da
// spec (§9-§18). `existente: true` marca os 9 que já existem no banco —
// nome/perfil preservados, drops[0] reaproveita o item legado (§22),
// mult NÃO é usado pra eles (o código de migration mantém o valor atual).
const MONSTROS = [
  // Área 1 — Campos dos Viajantes (1-5)
  { area: "Campos dos Viajantes", nome: "Rato das Campinas", tipo: "Comum",
    descricao: "Pequeno, rápido e sem noção nenhuma de perigo — ataca em bando antes de pensar duas vezes.",
    mult: [0.75, 0.85, 1.30, 1.30], drops: ["Cauda de Rato", "Dente de Roedor"] },
  { area: "Campos dos Viajantes", nome: "Javali Selvagem", tipo: "Comum",
    descricao: "Carrega com tudo na primeira investida — quem erra a esquiva sente o resto da luta.",
    mult: [1.05, 1.15, 0.95, 0.95], drops: ["Couro de Javali", "Presa de Javali"] },
  { area: "Campos dos Viajantes", nome: "Goblin Batedor", tipo: "Comum",
    descricao: "Rouba o que pode e foge pro mato ao primeiro sinal de vantagem perdida.",
    mult: [0.92, 1.05, 1.15, 1.15], drops: ["Orelha de Goblin", "Fivela Saqueada"] },
  { area: "Campos dos Viajantes", nome: "Lobo Alfa da Campina", tipo: "Raro",
    descricao: "Lidera uma alcateia que ninguém mais vê chegar — só sente o resultado.",
    mult: [1.75, 1.35, 1.30, 1.30], drops: ["Presa do Alfa", "Pele do Alfa", "Coração da Alcateia"] },

  // Área 2 — Bosque de Sussurros (6-10) — 3 existentes + 1 novo Comum
  { area: "Bosque de Sussurros", nome: "Lobo das Sombras", tipo: "Comum", existente: true,
    drops: ["Presa de Lobo Sombrio", "Pele Sombria"] },
  { area: "Bosque de Sussurros", nome: "Aranha Venenosa", tipo: "Comum", existente: true,
    drops: ["Teia de Aranha Venenosa", "Glândula de Veneno"] },
  { area: "Bosque de Sussurros", nome: "Goblin Saqueador", tipo: "Comum",
    descricao: "Já não é batedor — voltou em grupo, com mais confiança e menos cautela.",
    mult: [0.88, 1.00, 1.20, 1.20], drops: ["Bolsa de Saque Goblin", "Insígnia Goblin"] },
  { area: "Bosque de Sussurros", nome: "Espectro Sussurrante", tipo: "Raro", existente: true,
    drops: ["Véu Espectral", "Essência Espectral", "Fragmento de Alma"] },

  // Área 3 — Pântano da Lua Morta (11-15)
  { area: "Pântano da Lua Morta", nome: "Sapo Venenoso", tipo: "Comum",
    descricao: "Não persegue ninguém — só espera o veneno fazer o trabalho por ele.",
    mult: [0.88, 1.15, 0.90, 0.95], drops: ["Glândula Tóxica", "Pele Úmida"] },
  { area: "Pântano da Lua Morta", nome: "Serpente do Brejo", tipo: "Comum",
    descricao: "Some na lama e volta a atacar de um ângulo que ninguém esperava.",
    mult: [0.85, 1.05, 1.20, 1.20], drops: ["Presa de Serpente", "Escama Lamacenta"] },
  { area: "Pântano da Lua Morta", nome: "Lodo Vivo", tipo: "Comum",
    descricao: "Absorve o golpe antes de devolver — pesado, lento, difícil de convencer a parar.",
    mult: [1.35, 1.00, 0.80, 0.75], drops: ["Núcleo de Lodo", "Gelatina Arcana"] },
  { area: "Pântano da Lua Morta", nome: "Hidra Jovem", tipo: "Raro",
    descricao: "Perde pedaço e continua vindo — a regeneração dela é mais rápida do que parece justo.",
    mult: [2.00, 1.35, 0.80, 0.78], drops: ["Escama de Hidra", "Presa de Hidra", "Glândula Regenerativa"] },

  // Área 4 — Estrada dos Exilados (16-20) — 1 existente + 3 novos
  { area: "Estrada dos Exilados", nome: "Bandido Errante", tipo: "Comum", existente: true,
    drops: ["Adaga Enferrujada do Bandido", "Lenço de Saqueador"] },
  { area: "Estrada dos Exilados", nome: "Arqueiro Renegado", tipo: "Comum",
    descricao: "Prefere manter distância e deixar a flecha fazer a aproximação por ele.",
    mult: [1.00, 1.20, 1.05, 1.10], drops: ["Flecha Quebrada", "Braçadeira de Couro"] },
  { area: "Estrada dos Exilados", nome: "Cão de Guerra", tipo: "Comum",
    descricao: "Treinado pra morder e não soltar — o dono já não está por perto, mas o treino continua.",
    mult: [1.05, 1.15, 1.10, 1.10], drops: ["Presa de Cão de Guerra", "Coleira Reforçada"] },
  { area: "Estrada dos Exilados", nome: "Capitão Mercenário", tipo: "Raro",
    descricao: "Já lutou dos dois lados de guerra nenhuma valia a pena — só o contrato importa.",
    mult: [1.85, 1.45, 1.05, 1.05], drops: ["Insígnia Mercenária", "Fragmento de Armadura", "Selo do Capitão"] },

  // Área 5 — Ruínas de Cinza (21-25) — 1 existente + 3 novos
  { area: "Ruínas de Cinza", nome: "Cultista Renegado", tipo: "Comum", existente: true,
    drops: ["Amuleto do Cultista", "Tecido Ritual"] },
  { area: "Ruínas de Cinza", nome: "Esqueleto Guardião", tipo: "Comum",
    descricao: "Guarda um posto que não existe mais — nenhuma ordem chegou pra dizer que pode parar.",
    mult: [1.40, 1.05, 0.82, 0.80], drops: ["Osso Antigo", "Placa Óssea"] },
  { area: "Ruínas de Cinza", nome: "Aparição Cinzenta", tipo: "Comum",
    descricao: "Só existe pela metade — o golpe dela acerta antes de o resto do corpo decidir aparecer.",
    mult: [0.95, 1.15, 1.15, 1.15], drops: ["Essência Cinzenta", "Véu Mortuário"] },
  { area: "Ruínas de Cinza", nome: "Cavaleiro Amaldiçoado", tipo: "Raro",
    descricao: "Morreu numa guerra esquecida e nunca aceitou a derrota — a armadura apodreceu, a fúria não.",
    mult: [2.05, 1.50, 0.90, 0.88], drops: ["Fragmento de Armadura Negra", "Brasão Corrompido", "Coração Amaldiçoado"] },

  // Área 6 — Terras Devastadas (26-30) — 3 novos + 1 existente Raro
  { area: "Terras Devastadas", nome: "Hiena das Cinzas", tipo: "Comum",
    descricao: "Caça em bando pelo que sobrou da guerra — carniça ou aventureiro descuidado, tanto faz.",
    mult: [0.90, 1.00, 1.22, 1.22], drops: ["Presa Cinzenta", "Pele Queimada"] },
  { area: "Terras Devastadas", nome: "Escorpião de Cinzas", tipo: "Comum",
    descricao: "O ferrão carrega um pouco do fogo que queimou a região inteira.",
    mult: [1.00, 1.22, 1.02, 1.05], drops: ["Ferrão de Escorpião", "Carapaça Carbonizada"] },
  { area: "Terras Devastadas", nome: "Elemental de Cinzas", tipo: "Comum",
    descricao: "Nasceu do que a guerra deixou pra trás — cinza viva, sem forma fixa nenhuma.",
    mult: [0.95, 1.25, 0.95, 1.00], drops: ["Cinza Elemental", "Núcleo Incandescente"] },
  { area: "Terras Devastadas", nome: "Golem de Pedra", tipo: "Raro", existente: true,
    drops: ["Núcleo de Pedra Rúnica", "Fragmento Rúnico", "Coração Rúnico Perfeito"] },

  // Área 7 — Garganta de Ferro (31-35) — 1 existente + 3 novos
  { area: "Garganta de Ferro", nome: "Orc Guerreiro", tipo: "Comum", existente: true,
    drops: ["Presa de Orc", "Couro de Guerra Orc"] },
  { area: "Garganta de Ferro", nome: "Harpia da Garganta", tipo: "Comum",
    descricao: "Usa o vento estreito do desfiladeiro pra atacar de cima antes de qualquer um perceber.",
    mult: [0.95, 1.05, 1.28, 1.30], drops: ["Pena de Harpia", "Garra Curva"] },
  { area: "Garganta de Ferro", nome: "Troll das Pedras", tipo: "Comum",
    descricao: "A pele dele já parece pedra — o cansaço de tentar quebrar chega antes do dele.",
    mult: [1.50, 1.20, 0.78, 0.78], drops: ["Pele de Troll", "Dente de Troll"] },
  { area: "Garganta de Ferro", nome: "Chefe Orc Sangrento", tipo: "Raro",
    descricao: "Uniu as tribos da Garganta sob um único totem — e um único apetite por sangue.",
    mult: [2.10, 1.55, 1.05, 1.08], drops: ["Presa do Chefe Orc", "Totem de Guerra Orc", "Coração Berserker"] },

  // Área 8 — Cavernas Rúnicas (36-40)
  { area: "Cavernas Rúnicas", nome: "Morcego Cristalino", tipo: "Comum",
    descricao: "Ecoa entre os cristais da caverna — o som chega antes dele, mas raramente dá tempo de reagir.",
    mult: [1.00, 1.10, 1.30, 1.32], drops: ["Asa Cristalina", "Presa de Cristal"] },
  { area: "Cavernas Rúnicas", nome: "Aranha de Pedra", tipo: "Comum",
    descricao: "Se confunde com a própria rocha até o momento errado de chegar perto demais.",
    mult: [1.55, 1.10, 0.85, 0.82], drops: ["Carapaça Pétrea", "Fio Mineral"] },
  { area: "Cavernas Rúnicas", nome: "Sentinela Rúnica", tipo: "Comum",
    descricao: "Construída por quem escavou essas cavernas primeiro — ainda cumpre a ordem original.",
    mult: [1.70, 1.25, 0.80, 0.85], drops: ["Placa Rúnica", "Fragmento de Sentinela"] },
  { area: "Cavernas Rúnicas", nome: "Guardião Rúnico Ancestral", tipo: "Raro",
    descricao: "A runa mais antiga da caverna — nenhuma sentinela comum chega perto do que ele guarda.",
    mult: [2.20, 1.50, 0.85, 0.90], drops: ["Núcleo Rúnico Ancestral", "Olho de Mana", "Coração Rúnico Superior"] },

  // Área 9 — Abismo Dracônico (41-45) — 1 existente + 3 novos
  { area: "Abismo Dracônico", nome: "Draconídeo Jovem", tipo: "Comum", existente: true,
    drops: ["Escama Jovem de Dragão", "Garra Draconídea"] },
  { area: "Abismo Dracônico", nome: "Basilisco de Pedra", tipo: "Comum",
    descricao: "O olhar dele é mais perigoso que a mordida — poucos aguentam encarar de volta.",
    mult: [1.80, 1.30, 0.80, 0.82], drops: ["Escama de Basilisco", "Olho Petrificante"] },
  { area: "Abismo Dracônico", nome: "Salamandra de Obsidiana", tipo: "Comum",
    descricao: "Nasce e morre entre rocha derretida — o fogo dela nunca esfria de verdade.",
    mult: [1.10, 1.40, 0.95, 1.00], drops: ["Pele de Obsidiana", "Glândula Ígnea"] },
  { area: "Abismo Dracônico", nome: "Draco de Obsidiana", tipo: "Raro",
    descricao: "Um dragão jovem que escolheu o abismo antes de aprender a temer qualquer coisa.",
    mult: [2.20, 1.60, 1.10, 1.12], drops: ["Escama de Obsidiana", "Garra do Abismo", "Coração Dracônico de Obsidiana"] },

  // Área 10 — Covil do Minotauro (46-50) — 3 novos + 1 existente Raro
  { area: "Covil do Minotauro", nome: "Ogro do Labirinto", tipo: "Comum",
    descricao: "Perdeu-se no labirinto há tanto tempo que já não lembra de outro lugar pra estar.",
    mult: [1.65, 1.35, 0.80, 0.78], drops: ["Couro de Ogro", "Dente de Ogro"] },
  { area: "Covil do Minotauro", nome: "Guardião Taurino", tipo: "Comum",
    descricao: "Escolhido pelo próprio Minotauro pra vigiar as passagens mais estreitas do covil.",
    mult: [1.90, 1.30, 0.78, 0.75], drops: ["Chifre Taurino", "Placa do Labirinto"] },
  { area: "Covil do Minotauro", nome: "Draconídeo Veterano", tipo: "Comum",
    descricao: "Sobreviveu ao Abismo e chegou ao Covil ainda mais perigoso do que saiu de lá.",
    mult: [1.60, 1.50, 1.05, 1.08], drops: ["Escama Dracônica Reforçada", "Sangue Dracônico"] },
  { area: "Covil do Minotauro", nome: "Minotauro", tipo: "Raro", existente: true,
    drops: ["Chifre de Minotauro Ancestral", "Couro de Minotauro", "Coração do Labirinto"] },
];

// Item legado (já existia antes da expansão) -> descrição/raridade/valor
// originais, preservados tal qual (§22/§47: nunca reescrever o que já
// existe). Usado só pelas migrations pra saber quais dos `drops` acima
// NÃO precisam de um novo Item.
const ITENS_LEGADOS = new Set([
  "Presa de Lobo Sombrio", "Teia de Aranha Venenosa", "Véu Espectral",
  "Adaga Enferrujada do Bandido", "Amuleto do Cultista", "Núcleo de Pedra Rúnica",
  "Presa de Orc", "Escama Jovem de Dragão", "Chifre de Minotauro Ancestral",
]);

// Descrições curtas por item novo (§23: família do drop já sugere o uso
// — arma/armadura/catalisador/consumível/arcano — texto aqui só dá
// identidade, a FUNÇÃO real vem de onde o item é usado na Forja depois).
const DESCRICAO_ITEM = {
  "Cauda de Rato": "Pequena e flexível — serve mais de componente do que de troféu.",
  "Dente de Roedor": "Afiado o bastante pra render uma ponta decente numa lâmina pequena.",
  "Couro de Javali": "Grosso e resistente — a primeira escolha de quem começa na Forja.",
  "Presa de Javali": "Curva e pesada na base — bom começo pra uma arma de impacto.",
  "Orelha de Goblin": "Prova de caçada mais do que material útil — ainda assim, vale uma moeda.",
  "Fivela Saqueada": "Metal barato, mas metal — a Forja não desperdiça nada.",
  "Presa do Alfa": "Maior que qualquer presa comum da região — carrega peso de liderança.",
  "Pele do Alfa": "Ainda quente quando arrancada — os outros lobos sentem o cheiro à distância.",
  "Coração da Alcateia": "Bate um pouco mais devagar depois de morto — ninguém sabe explicar direito.",
  "Pele Sombria": "Absorve luz em vez de refletir — difícil de tingir, fácil de reconhecer.",
  "Glândula de Veneno": "Ainda ativa por horas depois da extração — manuseio exige cuidado.",
  "Bolsa de Saque Goblin": "Cheia de quinquilharias — quase sempre vale mais fundida que vendida inteira.",
  "Insígnia Goblin": "Marca de um bando específico — colecionadores pagam mais que ferreiros.",
  "Essência Espectral": "Fria ao toque mesmo em pleno verão — um resíduo do que o Espectro já foi.",
  "Fragmento de Alma": "Pulsa fraco, como se ainda lembrasse de ter sido alguém.",
  "Glândula Tóxica": "A base de muitos venenos de combate vendidos na Forja alquímica.",
  "Pele Úmida": "Nunca seca de verdade — usada em revestimentos resistentes à corrosão.",
  "Presa de Serpente": "Oca por dentro — o mesmo canal que injetava veneno agora serve de forma.",
  "Escama Lamacenta": "Suja até depois de lavada várias vezes — parte da identidade do material.",
  "Núcleo de Lodo": "Mantém uma leve pulsação mágica mesmo fora do corpo original.",
  "Gelatina Arcana": "Semitransparente, instável — usada em catalisadores de baixo custo.",
  "Escama de Hidra": "Cresce de volta se cortada rápido demais — melhor extrair com calma.",
  "Presa de Hidra": "Guarda um resquício do veneno regenerativo da criatura.",
  "Glândula Regenerativa": "Ingrediente raro de poções de cura — a Forja alquímica paga bem por ela.",
  "Lenço de Saqueador": "Usado pra cobrir o rosto — ainda cheira a poeira da Estrada.",
  "Flecha Quebrada": "Boa o bastante pra reaproveitar a ponta em outra arma.",
  "Braçadeira de Couro": "Protege o antebraço do próprio recuo do arco — reforçada, mas leve.",
  "Presa de Cão de Guerra": "Marcada por um treino que ainda não terminou de vez.",
  "Coleira Reforçada": "Metal grosso, fivela ainda travada — ninguém tirou de propósito.",
  "Insígnia Mercenária": "Sem brasão de reino nenhum — só o símbolo de um contrato cumprido.",
  "Fragmento de Armadura": "Peça avulsa, ainda em bom estado — serve de referência pra Forja.",
  "Selo do Capitão": "Autentica ordens de um comando que já não existe mais.",
  "Tecido Ritual": "Costurado com símbolos que nenhum sacerdote reconhecido admitiria conhecer.",
  "Osso Antigo": "Mais duro que osso comum — algo no ritual que o ergueu mudou a estrutura.",
  "Placa Óssea": "Fundida ao resto do esqueleto — precisa de força pra separar inteira.",
  "Essência Cinzenta": "Quase não pesa nada — como segurar um pouco de fumaça sólida.",
  "Véu Mortuário": "Tecido que nunca envelhece nem apodrece — ninguém sabe fabricar um novo.",
  "Fragmento de Armadura Negra": "Escurecida por algo além de fogo — a Forja trata com cautela.",
  "Brasão Corrompido": "O símbolo original já não dá pra reconhecer sob a corrupção.",
  "Coração Amaldiçoado": "Continua batendo um ritmo errado, fora de compasso com tudo ao redor.",
  "Presa Cinzenta": "Impregnada de cinza fina que não sai por mais que se lave.",
  "Pele Queimada": "Endurecida pelo calor constante da região — surpreendentemente resistente.",
  "Ferrão de Escorpião": "Ainda guarda um resíduo de calor mesmo horas depois da extração.",
  "Carapaça Carbonizada": "Quebradiça por fora, firme por dentro — exige mão de obra experiente.",
  "Cinza Elemental": "Se recusa a esfriar completamente — reage fraco ao toque direto.",
  "Núcleo Incandescente": "Um pequeno foco de calor próprio, útil em fornalhas de Forja.",
  "Fragmento Rúnico": "Carrega parte de uma runa maior — ilegível sozinho, útil em conjunto.",
  "Coração Rúnico Perfeito": "Raro até pra um Golem — a maioria racha antes de atingir esse estado.",
  "Couro de Guerra Orc": "Curtido em campanha — rígido o bastante pra parar um corte raso.",
  "Pena de Harpia": "Leve e resistente — usada em penachos e componentes de precisão.",
  "Garra Curva": "O formato ideal pra uma lâmina de gancho ou adaga curva.",
  "Pele de Troll": "Regenera devagar mesmo depois de separada do corpo — manuseio delicado.",
  "Dente de Troll": "Maior que o de qualquer criatura comum da Garganta.",
  "Presa do Chefe Orc": "Marcada com entalhes de vitórias — cada corte, uma batalha vencida.",
  "Totem de Guerra Orc": "Carregado à frente das tribos unidas antes de cada ataque.",
  "Coração Berserker": "Bate acelerado mesmo depois de parado — resquício da fúria de combate.",
  "Asa Cristalina": "Translúcida, quase frágil — mas não quebra com facilidade.",
  "Presa de Cristal": "Cresceu absorvendo o mineral da caverna em vez de osso comum.",
  "Carapaça Pétrea": "Praticamente indistinguível da rocha ao redor até ser removida.",
  "Fio Mineral": "Fino como seda, resistente como metal — raro fora das Cavernas Rúnicas.",
  "Placa Rúnica": "Gravada com símbolos que ainda emitem um brilho fraco.",
  "Fragmento de Sentinela": "Parte do mecanismo interno — engenharia que ninguém mais sabe replicar.",
  "Núcleo Rúnico Ancestral": "A runa mais antiga já registrada nas Cavernas — reage à magia próxima.",
  "Olho de Mana": "Continua brilhando fraco mesmo fora do corpo do Guardião.",
  "Coração Rúnico Superior": "Versão rara e mais densa do núcleo comum das sentinelas da caverna.",
  "Garra Draconídea": "Curva e afiada — precisa de mão firme pra trabalhar sem lascar.",
  "Escama de Basilisco": "Mantém um resíduo do olhar petrificante mesmo depois de removida.",
  "Olho Petrificante": "Guardado com cuidado — ainda reage fraco à luz direta.",
  "Pele de Obsidiana": "Quente ao toque mesmo fria — nunca perde de vez o calor do Abismo.",
  "Glândula Ígnea": "Reage com uma faísca ao menor contato com ar puro.",
  "Escama de Obsidiana": "Mais densa que a de um Draconídeo comum — quase impossível de rachar.",
  "Garra do Abismo": "Carrega um resquício do calor do lugar onde a criatura nasceu.",
  "Coração Dracônico de Obsidiana": "Ainda pulsa fogo fraco — a Forja trata como material de Tier alto.",
  "Couro de Ogro": "Grosso e irregular — precisa de bastante trabalho antes de virar armadura.",
  "Dente de Ogro": "Maior que a maioria das lâminas comuns — serve de base pra armas pesadas.",
  "Chifre Taurino": "Curvo e denso — menos raro que o Chifre Ancestral, mas ainda valioso.",
  "Placa do Labirinto": "Marcada com o desenho das passagens que o Guardião memorizou.",
  "Escama Dracônica Reforçada": "Mais espessa que a de um Draconídeo Jovem — sobreviveu ao Abismo inteiro.",
  "Sangue Dracônico": "Continua quente por muito tempo fora do corpo — usado em Forja avançada.",
  "Couro de Minotauro": "Denso o bastante pra parar golpes que atravessariam qualquer couro comum.",
  "Coração do Labirinto": "Diz-se que é o próprio coração do labirinto, não só do Minotauro.",
};

module.exports = {
  CHANCE_PPM,
  FAIXA_POR_AREA,
  AREAS,
  MONSTROS,
  ITENS_LEGADOS,
  DESCRICAO_ITEM,
};
