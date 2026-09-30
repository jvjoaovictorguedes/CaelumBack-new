"use strict";

// Wiki do Jogo — primeira leva de artigos cobrindo o ecossistema
// inteiro de Caelum. Conteúdo em texto plano (parágrafos separados por
// linha em branco) — cada artigo pode ser editado/expandido depois
// pelo Painel Admin (Conteúdo → Wiki do Jogo), sem precisar de
// migration nova.
const ARTIGOS = [
  {
    categoria: "Primeiros Passos",
    slug: "bem-vindo-a-caelum",
    titulo: "Bem-vindo a Caelum",
    resumo: "Visão geral do jogo: o que fazer primeiro e como os sistemas se conectam.",
    ordem: 0,
    conteudo: `Caelum é um RPG por navegador onde você cria um personagem, escolhe raça e classe, e evolui explorando um mundo dividido em quatro territórios. Não existe "história principal" no sentido de campanha linear — o jogo é um conjunto de sistemas interligados que você toca no ritmo que quiser: combate PvE (Aventura), coleta de recursos (Expedição), crafting (Forja), economia entre jogadores (Mercado Negro), duelos (PvP), guildas, pesca, e eventos coletivos como o Boss da Guilda e a Ameaça Mundial.

Se você é novo, o Guia do Aventureiro (no menu lateral) te leva pelos primeiros passos na ordem certa: criar personagem, primeira luta na Aventura, primeiro equipamento, primeira coleta na Expedição. Esta Wiki é o complemento — quando você já sabe QUE existe um sistema mas quer entender COMO ele funciona por baixo dos panos (fórmulas, cooldowns, regras que não ficam óbvias só de clicar), este é o lugar.

Regra geral que vale pra quase tudo em Caelum: praticamente nenhuma ação do lado do cliente decide o resultado. Dano, drops, XP, tudo é calculado no servidor a partir do que seu personagem realmente tem equipado/treinado — o cliente só mostra o resultado. Isso significa que não existe "otimização de clique" que valha a pena: o que importa é atributo, equipamento e nível.`,
  },
  {
    categoria: "Personagem",
    slug: "raca-e-classe",
    titulo: "Raça, Classe e Atributos",
    resumo: "Como raça e classe definem seus atributos base e multiplicadores de combate.",
    ordem: 0,
    conteudo: `Ao criar um personagem você escolhe Raça e Classe — as duas são permanentes (não existe reroll). A Raça dá bônus fixos de atributo (Força, Vitalidade, Agilidade, Inteligência, Velocidade) e às vezes uma habilidade racial passiva. A Classe define seu papel em combate (guerreiro corpo-a-corpo, mago de dano mágico, etc.) e os multiplicadores que escalam esses atributos em dano/vida/mana conforme você sobe de nível.

Atributos não são "pontos livres pra distribuir" — eles crescem automaticamente por nível, na proporção definida pela sua Raça+Classe. O que você controla ativamente é equipamento (Forja/Mercado), Habilidades desbloqueadas, e — pras duas classes que têm — o caminho de Evolução de Classe.

Guerreiro e Mago desbloqueiam uma árvore de evolução no nível 40, com 3 caminhos exclusivos cada:
Guerreiro: Berserker (dano puro), Paladino (resistência), Cavaleiro Real (equilíbrio).
Mago: Arquimago Eterno (dano arcano), Nigromante (sustentação), Feiticeiro Arcano (velocidade).

Cada caminho pede sua própria Relíquia de Ascensão (item de missão) e dá um bônus permanente de atributos diferente. A escolha é definitiva — não dá pra trocar de caminho depois de evoluir.`,
  },
  {
    categoria: "Personagem",
    slug: "habilidades-e-cooldown",
    titulo: "Habilidades, Cooldown e Status",
    resumo: "Como poderes ativos consomem mana, entram em cooldown e aplicam efeitos de status.",
    ordem: 1,
    conteudo: `Cada Habilidade (Power) ativa tem um custo de mana e um cooldown medido em turnos — depois de usar, ela fica bloqueada por N turnos antes de poder ser usada de novo (o jogo sempre mostra quantos turnos faltam no ícone da habilidade). Cooldown é POR HABILIDADE, não global: usar uma habilidade não trava as outras.

Muitas habilidades aplicam Efeitos de Status além do dano/cura direto — Queimadura e Sangramento causam dano contínuo (tickam no FIM do turno de quem está com o efeito, não no início), Veneno reduz regeneração, Atordoamento pula o turno do alvo, e assim por diante. Efeitos de status têm duração própria em turnos e não empilham infinitamente — reaplicar geralmente reseta a duração em vez de somar.

O combate calcula tudo isso automaticamente a cada ação: dano base da habilidade, bônus de atributo escalado, mitigação por Defesa do alvo, chance de esquiva pela Agilidade, e por cima disso a resolução de qualquer status já ativo. O jogador só escolhe QUAL ação tomar a cada turno — atacar, usar uma habilidade específica, ou fugir/desistir quando disponível.`,
  },
  {
    categoria: "Aventura",
    slug: "aventura-solo",
    titulo: "Aventura (PvE Solo)",
    resumo: "Zonas, monstros, drops e como a dificuldade escala com seu nível.",
    ordem: 0,
    conteudo: `A Aventura é o loop principal de combate PvE: você escolhe uma Zona (dentro de uma Região do Mapa), enfrenta um monstro sorteado daquela zona, e ganha XP + possivelmente um item de drop ao vencer. Cada zona tem uma faixa de nível recomendada — entrar muito abaixo do nível da zona é perigoso (monstro mais forte que você), muito acima é ineficiente (pouco XP, drop de nível baixo).

O "Perigo" mostrado na tela da zona (Médio/Alto/Extremo) é só informativo: mede quantos níveis abaixo do mínimo da zona você está, mas nunca bloqueia a entrada — é você quem decide o risco. Monstros dentro da mesma zona variam em nível dentro de uma faixa, então até "sua" zona pode eventualmente sortear um adversário mais difícil.

Drops vêm de uma tabela própria por monstro (Espólio de Aventura) — cada monstro tem uma lista de itens possíveis com peso/raridade, então times diferentes de farm em zonas diferentes tendem a produzir materiais diferentes. Isso alimenta tanto o Mercado Negro (venda entre jogadores) quanto a Forja (materiais de fabricação) e o Balcão de Espólios da Guilda dos Aventureiros (troca de itens por reputação).

Aventura em Grupo reaproveita as MESMAS zonas e monstros da Aventura solo, só que escalados: o monstro fica mais forte (mais vida, mais dano) proporcionalmente ao número de aventureiros no grupo além do mínimo, e a recompensa é dividida entre os participantes.`,
  },
  {
    categoria: "Expedição",
    slug: "expedicao-coleta",
    titulo: "Expedição: Mineração, Silvicultura e Exploração",
    resumo: "As 3 profissões de coleta, cooldown global e progressão por nível.",
    ordem: 0,
    conteudo: `Expedição é o sistema de coleta passiva de materiais — 3 profissões independentes em nível/XP (Mineração, Silvicultura, Exploração), cada uma com suas próprias Regiões pra explorar. Cada clique em "coletar" sorteia um resultado (Nada, Comum, Incomum, Raro, Épico, Lendário ou Mítico) com chances que melhoram conforme sua profissão sobe de nível — nível mais alto tanto libera qualidades melhores quanto aumenta a quantidade coletada por vez.

O cooldown entre coletas é GLOBAL entre as 3 profissões: coletar em Mineração também bloqueia Silvicultura e Exploração pelo mesmo tempo (não dá pra intercalar clique nas 3 pra "burlar" o cooldown). O valor exato do cooldown é configurável pelo admin e pode mudar — a tela sempre mostra o relógio real, não confie num número decorado.

Uma pequena chance (independente de profissão/região) faz a coleta virar uma interrupção de monstro em vez do sorteio normal — um combate rápido contra um inimigo calibrado perto do seu nível real de combate, escalado pela dificuldade da região. Vencer dá XP/ouro genéricos; perder não tira o material que você já tinha, só interrompe aquele ciclo de coleta.`,
  },
  {
    categoria: "Forja",
    slug: "forja-visao-geral",
    titulo: "Forja: Fundição, Fabricação e Refinamento",
    resumo: "Como transformar materiais brutos em equipamento, e como refinar o que já tem.",
    ordem: 0,
    conteudo: `A Forja tem 3 etapas conectadas. Fundição transforma Fragmentos (material bruto, geralmente de drop de Aventura/Expedição) em Barras de uma qualidade — leva vários fragmentos da mesma qualidade pra virar uma barra. Fabricação usa Barras (seguindo um Blueprint específico) pra criar um equipamento novo, com qualidade determinada pelo seu nível de Forja e um sorteio ponderado (mesma qualidade da barra é o resultado mais provável, mas dá pra sair uma qualidade acima). Refinamento pega um equipamento JÁ EXISTENTE (seu, equipado) e aumenta seus atributos em níveis (+1, +2, +3...), consumindo Pergaminhos de Melhoria e ouro — refinamento tem chance de falha que cresce quanto mais alto o nível atual, e Pergaminhos de Melhoria específicos podem garantir o sucesso.

Seu nível de Forja (progressão própria, por XP de fabricar/fundir/refinar) determina o teto de qualidade que você consegue produzir — nível baixo só funde/fabrica até Comum/Incomum, nível alto libera Lendário e Mítico.

O Caldeirão (Alquimia) é uma ramificação separada da Forja: usa Blueprints próprios (receitas) pra combinar materiais em Consumíveis e outros produtos, não em equipamento — é o caminho pra poções e itens de suporte, não pra armas/armaduras.`,
  },
  {
    categoria: "Forja",
    slug: "tier-de-equipamento",
    titulo: "Tier de Equipamento",
    resumo: "A camada de qualidade que existe por cima da raridade, ligada ao Blueprint.",
    ordem: 1,
    conteudo: `Além de Raridade (Comum → Mítico, que afeta o VALOR dos atributos), equipamentos fabricáveis na Forja têm um Tier — uma faixa de poder amarrada ao Blueprint usado pra fabricar, não escolhida livremente. Blueprints de tier mais alto pedem barras/materiais mais raros e nível de Forja mais alto pra desbloquear, e produzem equipamentos com teto de atributo mais alto mesmo na mesma raridade.

Na prática isso significa que dois itens "Raro" podem ter força bem diferente se vieram de Blueprints de tier diferentes — o Tier aparece como selo visual no Inventário, na Forja e no Mercado Negro, exatamente pra essa comparação ficar clara antes de comprar ou fabricar.`,
  },
  {
    categoria: "Inventário e Equipamentos",
    slug: "propriedades-de-item",
    titulo: "Propriedades de Item: Arma, Armadura, Consumível",
    resumo: "O que cada tipo de item carrega e como isso afeta seus atributos efetivos.",
    ordem: 0,
    conteudo: `Todo item tem um tipo (Arma, Armadura, Consumível, Vara de Pesca, Material, etc.) e, dependendo do tipo, uma tabela de propriedades específica. Armas têm faixa de dano (mínimo/máximo), tipo de dano (Físico/Mágico) e um bônus de atributo. Armaduras têm Defesa e bônus de atributo próprio. Consumíveis têm efeitos diretos (cura de vida/mana, buffs temporários). Varas de Pesca têm atributos que afetam a mecânica de pesca (não combate).

Equipar um item não usa os valores "base" da tabela de propriedades direto — instâncias de equipamento (cada peça que você tem, individualmente) carregam seu PRÓPRIO nível de refinamento, e os atributos EFETIVOS (o que realmente conta pro seu personagem) são a base escalada por esse refinamento. Por isso duas armas idênticas na Forja podem ter poder bem diferente depois de um tempo de jogo — uma refinada, outra não.

No Mercado Negro e no Inventário, passar o mouse (ou tocar, no mobile) sobre um item mostra descrição E atributos numéricos juntos — inclusive os efetivos já calculados com o refinamento da instância, quando aplicável.`,
  },
  {
    categoria: "Economia",
    slug: "mercado-negro",
    titulo: "Mercado Negro (Comércio entre Jogadores)",
    resumo: "Como funciona a compra e venda direta entre personagens.",
    ordem: 0,
    conteudo: `O Mercado Negro é o sistema de comércio P2P (jogador pra jogador) — qualquer item marcado como negociável pode ser anunciado por um preço em ouro, e outro jogador compra direto, sem leilão nem barganha. Equipamentos são vendidos como instância única (aquela peça específica, com seu refinamento); Materiais e Consumíveis são vendidos em pilha (quantidade).

Ao anunciar, o item sai do seu inventário/equipamento e fica reservado até vender ou você cancelar o anúncio — ele não pode ser usado nem equipado enquanto está anunciado. Ao vender, o ouro vai direto pro vendedor (menos qualquer taxa configurada pelo admin) e o comprador recebe o item na hora.

A tela pública de anúncios (a que todo mundo vê pra comprar) mostra descrição E atributos de cada item ao passar o mouse — os mesmos atributos efetivos que aparecem no Inventário, já com o refinamento da instância calculado, pra dar pra comparar preço com poder real antes de comprar.`,
  },
  {
    categoria: "Guildas",
    slug: "guildas-visao-geral",
    titulo: "Guildas: Estrutura, Rank e Nível",
    resumo: "Como uma guilda se forma, progride de Rank e sobe de Nível.",
    ordem: 0,
    conteudo: `Uma Guilda é um grupo de jogadores com identidade própria (nome, emblema), hierarquia de cargos (Fundador, Oficial, Veterano, Membro, Recruta) e dois eixos de progressão INDEPENDENTES: Nível (sobe com XP de Guilda, gerado por Missões/Boss/atividade) e Rank (F a S, sobe completando Missões de Rank específicas — não é a mesma coisa que Nível).

O Nível de Guilda libera limite de membros maior e é pré-requisito pra comprar Buffs mais fortes no Cardápio da Guilda. O Rank é mais sobre prestígio/progressão de longo prazo — cada Rank pede um número de Missões de Rank concluídas pra promover pro próximo, e Rank S é o topo (não promove mais).

Um membro recém-entrado passa por uma carência (24h por padrão, configurável) antes de contar pra XP de Missão, progresso de Rank, ou receber recompensa de Boss/Buffs — existe especificamente pra evitar entrar numa guilda só pra "roubar" uma recompensa que já tava quase pronta. O Fundador nunca entra em carência (ele é a origem da guilda, não alguém que "entrou" nela).`,
  },
  {
    categoria: "Guildas",
    slug: "boss-da-guilda",
    titulo: "Boss da Guilda (Batalha ao Vivo)",
    resumo: "Como funciona o combate coletivo semanal contra o Boss por Rank.",
    ordem: 1,
    conteudo: `Cada Rank de Guilda (F a S) tem seu próprio Boss configurado — vida total, defesa, janela de tempo pra derrotar, e as recompensas em jogo. Liberar o Boss da semana custa Gold do Tesouro da guilda (uma permissão específica controla quem pode fazer isso). Uma vez liberado, o Boss compartilha a MESMA vida restante entre várias "salas" de batalha ao vivo simultâneas — vários grupos pequenos de membros podem estar batendo nele ao mesmo tempo, cada golpe é salvo na hora.

A batalha em si segue o mesmo modelo de turnos da Aventura em Grupo: cada participante ataca na sua vez, o Boss revida contra 1 alvo aleatório por rodada. O dano do Boss começa baixo e cresce a cada rodada (fica mais perigoso quanto mais a luta se arrasta), até um teto de rodadas — se ninguém derrotar até lá, a tentativa se perde.

Se o Boss cair, a recompensa em Gold/XP de personagem é dividida entre todos que participaram: 25% igualmente entre elegíveis + 75% proporcional ao dano que cada um causou (esses percentuais são configuráveis). Quem causou mais dano no total ainda ganha um prêmio individual extra. A guilda como um todo ganha XP de Guilda fixo, independente de quem participou.`,
  },
  {
    categoria: "Guildas",
    slug: "buffs-e-contribuicao",
    titulo: "Buffs da Guilda e Pontos de Contribuição",
    resumo: "Como o Tesouro financia bônus pra todo mundo, e como se mede quem ajuda mais.",
    ordem: 2,
    conteudo: `O Cardápio de Buffs da Guilda oferece 3 tipos de bônus permanente pra TODOS os membros: XP (bônus percentual de experiência), Gold (bônus percentual de ouro) e Forja (bônus em pontos percentuais que empurram resultados de fabricação "mesma qualidade" pra "+1 qualidade" — nunca afeta Refinamento/Fundição/Pergaminhos). Cada tipo tem 5 níveis, com bônus e custo crescentes, e cada nível exige um Nível de Guilda mínimo pra ficar disponível pra compra — o bônus é TOTAL por nível (não cumulativo entre níveis).

Pontos de Contribuição medem o quanto cada membro contribuiu pra guilda: Missões diárias/semanais/mensais dão uma pontuação fixa, Missões de Rank dão mais quanto mais alto o rank, o Boss da Guilda dá pontos combinando uma base fixa com a participação de dano, e Doações de ouro pro Tesouro também contam (normalizado, com teto por doação pra não virar "comprar contribuição" sem limite). O ranking de Contribuição é o jeito mais direto de ver quem tá carregando a guilda de verdade, além do nível/rank de cada membro individualmente.`,
  },
  {
    categoria: "Guilda dos Aventureiros",
    slug: "guilda-dos-aventureiros",
    titulo: "Guilda dos Aventureiros: Contratos, Balcão e Caçadas",
    resumo: "O sistema NPC de progressão individual, diferente das guildas de jogadores.",
    ordem: 0,
    conteudo: `Não confunda com Guildas (o grupo social de jogadores) — a Guilda dos Aventureiros é um sistema NPC de progressão individual, com seu próprio Rank (F a S) por personagem. Ela reúne 3 sub-sistemas: Contratos (missões individuais que você aceita uma a uma, com objetivos específicos como "mate X monstros" ou "colete Y material"), o Balcão de Espólios (troca itens específicos por Reputação Comercial, que sobe seu Rank de comerciante) e Caçadas (contratos de dificuldade maior, com recompensa melhor, que sobem Reputação de Caçador).

Seu Rank na Guilda dos Aventureiros libera contratos/caçadas de dificuldade maior e recompensas melhores conforme sobe — é uma progressão paralela à de Nível de personagem, pensada pra dar objetivo de curto prazo mesmo depois que farmar Aventura sozinho começa a ficar repetitivo.`,
  },
  {
    categoria: "Taverna",
    slug: "taverna-visao-geral",
    titulo: "Taverna: Descanso, Buffs e Jogos de Azar",
    resumo: "O hub de recuperação e apostas entre uma sessão de jogo e outra.",
    ordem: 0,
    conteudo: `A Taverna reúne 3 coisas que não têm relação direta com combate: Descanso (recupera vida/mana mais rápido que a regeneração passiva normal, por um custo), o Cardápio (buffs temporários comprados com ouro — diferente dos Buffs de Guilda, que são permanentes e pagos pelo Tesouro coletivo) e Jogos de Azar tipo 50/50 (aposta ouro, chance de dobrar ou perder).

Os buffs da Taverna se somam com os da Guilda quando ambos estão ativos — por exemplo, +5% de XP da Guilda e +5% de XP da Taverna viram +10% aplicado de uma vez, não dois multiplicadores separados. Isso vale pra todos os domínios que a Taverna alcança: Aventura, Expedição, Forja e Pesca também recebem os bônus configurados lá.`,
  },
  {
    categoria: "Pesca",
    slug: "pesca-e-navegacao",
    titulo: "Pesca e Navegação",
    resumo: "Zonas marítimas, espécies, iscas e embarcações.",
    ordem: 0,
    conteudo: `Pesca é um sistema separado de Aventura/Expedição, com sua própria progressão. Você escolhe uma Zona de pesca (ligada a um Porto no Mapa do Mundo), equipa uma Vara com uma Isca, e pesca — cada combinação de zona+isca tem uma "pool" de espécies possíveis, cada espécie com peso de sorteio e faixa de dificuldade.

Iscas têm afinidade com espécies específicas — usar a isca certa aumenta a chance daquela espécie aparecer, não é só "sorteio cego". A Vara de Pesca (que é um tipo de item, gerenciado como equipamento normal) tem atributos próprios que afetam a dificuldade efetiva da pescaria — uma vara melhor facilita fisgar peixes mais difíceis.

Pra ir além dos Portos acessíveis a pé, existem Embarcações e Rotas Marítimas — navegar entre pontos do mapa por água, desbloqueando zonas de pesca mais distantes/difíceis. Torneios de Pesca são eventos à parte, com ranking próprio por peso/quantidade pescada numa janela de tempo.`,
  },
  {
    categoria: "PvP",
    slug: "duelo-e-ranking",
    titulo: "Duelo (PvP) e Temporadas Ranqueadas",
    resumo: "Combate direto entre jogadores e como funciona o sistema de temporada.",
    ordem: 0,
    conteudo: `Duelo é o PvP 1x1 de Caelum — desafie outro jogador (ou aceite um desafio) e lute usando as mesmas mecânicas de combate da Aventura (habilidades, cooldown, status), só que contra outro personagem de verdade em vez de um monstro. Fora do modo ranqueado, um duelo é "livre": não afeta nenhuma pontuação, é só pra testar build ou resolver uma implicância.

O modo Ranqueado roda em Temporadas com duração fixa — vitórias/derrotas ranqueadas alimentam uma pontuação de temporada, e ao fim de cada temporada acontece um soft reset (a pontuação não fica igual, mas os extremos se aproximam do centro, pra recomeçar competitivo sem apagar totalmente o progresso). O ranking da temporada atual fica visível na tela de Ranking, separado do Hall das Lendas (que é histórico, entre temporadas passadas).`,
  },
  {
    categoria: "PvP",
    slug: "torneios",
    titulo: "Torneios",
    resumo: "Eventos de eliminação organizados pelo admin, com chaveamento e prêmios.",
    ordem: 1,
    conteudo: `Torneios são eventos à parte do Duelo casual/ranqueado — criados pelo admin, com inscrição, chaveamento por eliminação (séries de confrontos) e prêmio pro(s) vencedor(es). Cada série tem uma checagem de "ready" (confirmar presença) antes de começar; quem não confirma dentro do prazo pode ser desclassificado automaticamente daquela série, pra não travar o chaveamento inteiro esperando um jogador ausente.

Torneios são eventos SEPARADOS do sistema de Temporada Ranqueada — participar de um torneio não afeta sua pontuação de ranking normal, e vice-versa.`,
  },
  {
    categoria: "Eventos Mundiais",
    slug: "ameaca-mundial",
    titulo: "Ameaça Mundial (Boss Global)",
    resumo: "O evento de servidor inteiro: descoberta, combate coletivo e ranking final.",
    ordem: 0,
    conteudo: `A Ameaça Mundial é o maior evento coletivo do jogo — um Boss com vida compartilhada entre TODOS os jogadores do servidor, não só uma guilda. Ele passa por fases: primeiro fica escondido (Cooldown/Dormant) até ser Descoberto por algum jogador jogando Aventura normalmente (a descoberta é baseada num progresso secreto, ninguém sabe exatamente quão perto está até acontecer). Depois de descoberto, ele Acorda automaticamente após um tempo (ou pode ser acordado antes, dependendo da configuração), e vira Ativo — é aí que o combate de verdade começa.

Durante a fase Ativa, qualquer jogador pode entrar na batalha: ataques bÁsicos ou Habilidades (com cooldown próprio, igual ao resto do jogo) causam dano na vida compartilhada do Boss, que muda de Fase conforme a vida cai (cada fase pode ter dano/comportamento diferente, com alertas de texto avisando a transição). A Fúria do Boss cresce ao longo da luta e pode desencadear ações mais fortes quando alta.

Ao derrotar o Boss, as recompensas são distribuídas por participação: quem causou mais dano no total ganha um prêmio especial, quem descobriu o Boss originalmente ganha reconhecimento, e todo participante elegível (que não estava em carência de entrada) leva uma fatia proporcional ao dano que causou. Um Ranking ao vivo mostra os 10 melhores em tempo real durante o combate, e um Histórico guarda os eventos derrotados anteriormente com descobridor/vencedor de cada um.`,
  },
  {
    categoria: "Mundo",
    slug: "mapa-do-mundo",
    titulo: "Mapa do Mundo",
    resumo: "Os 4 territórios e como Aventura, Expedição e Pesca se conectam a eles.",
    ordem: 0,
    conteudo: `O mundo de Caelum é dividido em 4 territórios navegáveis, cada um com sua Capital e uma rede de nós conectados (zonas de Aventura, regiões de Expedição, portos de Pesca). O Mapa mostra essas conexões visualmente — dá pra ver de onde pra onde dá pra ir, e o que existe em cada ponto, sem precisar decorar nomes de zona.

O mapa é mais um índice de navegação/descoberta do que um sistema com mecânica própria: ele não altera dano nem drop, só organiza espacialmente onde cada atividade do jogo (Aventura, Expedição, Pesca, e a Ameaça Mundial quando descoberta numa zona) acontece.`,
  },
  {
    categoria: "Progresso",
    slug: "ranking-hall-das-lendas-bestiario",
    titulo: "Ranking, Hall das Lendas e Bestiário",
    resumo: "As telas de acompanhamento: quem está no topo e o que você já enfrentou.",
    ordem: 0,
    conteudo: `Ranking mostra a classificação ATUAL — posição na Temporada Ranqueada de PvP em andamento, entre outras métricas competitivas vivas. Hall das Lendas é o registro HISTÓRICO: campeões de temporadas passadas, marcos notáveis, conquistas de destaque — um "salão de troféus" que não muda mais depois de fechado, diferente do Ranking que atualiza toda hora.

Bestiário é o catálogo de monstros que você já encontrou (por região/zona) — mostra atributos visíveis, dificuldade relativa e, quando aplicável, os itens que aquele monstro pode dropar. É referência pra decidir se vale a pena farmar uma zona específica atrás de um material puxado por um monstro em particular.`,
  },
  {
    categoria: "Progresso",
    slug: "proezas-unicas",
    titulo: "Proezas Únicas",
    resumo: "Conquistas especiais de \"primeiro a conseguir\", limitadas a um vencedor só.",
    ordem: 1,
    conteudo: `Proezas Únicas são um tipo diferente de conquista: cada uma só pode ser vencida por UM jogador no servidor inteiro — o primeiro a cumprir a condição leva o prêmio (um Legado, geralmente um título/cosmético permanente) e a proeza fecha pra sempre pros outros. São desafios de "primeiro a conseguir", não repetíveis nem paralelos.

Cada Proeza tem sua própria condição de trigger (pode ser vencer um combate específico numa condição incomum, alcançar um marco raro, etc.) verificada automaticamente pelo servidor conforme você joga normalmente — não existe um botão "reivindicar", o sistema detecta e concede na hora que a condição é cumprida de verdade.`,
  },
];

module.exports = {
  async up(queryInterface) {
    const agora = new Date();
    for (const artigo of ARTIGOS) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM wiki_articles WHERE slug = :slug LIMIT 1;`,
        { replacements: { slug: artigo.slug } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Artigo da Wiki "${artigo.slug}" já existe — pulando.`);
        continue;
      }
      await queryInterface.bulkInsert("wiki_articles", [
        {
          categoria: artigo.categoria,
          slug: artigo.slug,
          titulo: artigo.titulo,
          resumo: artigo.resumo,
          conteudo: artigo.conteudo,
          ordem: artigo.ordem,
          imagem_url: null,
          publicado: true,
          created_by_admin_id: null,
          createdAt: agora,
          updatedAt: agora,
        },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("wiki_articles", { slug: ARTIGOS.map((a) => a.slug) });
  },
};
