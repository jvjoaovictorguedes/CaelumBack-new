// Player-facing reference: live catalogs, restricted to this character's discoveries.
const { Op } = require('sequelize');
const modelNames = {
  Monster:'AdventureMonster', Zone:'AdventureZone', Link:'AdventureZoneMonster',
  Kill:'CharacterMonsterKill', Loot:'AdventureMonsterLoot', Item:'Item',
  Ability:'MonsterAbility', Power:'Power', Class:'Class', Race:'Race',
  LearnedAbility:'CharacterAbilities', ClassAbility:'ClassAbilities', RaceAbility:'RaceAbilities',
  NatureAbility:'NatureAbilities', MagicEvolution:'Evolution', PowerBook:'PowerBook', StatusEffect:'PowerStatusEffect', CombatEffect:'PowerCombatEffect',
  EvolutionPath:'ClassEvolutionPath', EvolutionRequirement:'ClassEvolutionRequirement', EvolutionAbility:'ClassEvolutionAbility',
};
const text = value => String(value ?? '').replace(/[|\r\n]/g, ' ').replace(/[<>]/g, '');
const number = value => Number(value ?? 0).toLocaleString('pt-BR', {maximumFractionDigits:4});
const table = (head, rows) => `| ${head.join(' | ')} |\n| ${head.map(()=> '---').join(' | ')} |\n${rows.map(row=>`| ${row.map(text).join(' | ')} |`).join('\n')}`;
function article(slug, titulo, categoria, conteudo, extra={}) {
  return {id:slug,slug,titulo,categoria,conteudo,resumo:extra.resumo ?? null,imagem_url:null,ordem:0,...extra};
}
function creatureArticle(monster, locations, drops, abilities, kills) {
  const attributes = [['Nível',monster.nivel],['Vida',monster.vida_maxima],['Dano básico mínimo',monster.dano_min],['Dano básico máximo',monster.dano_max],['Defesa',monster.defesa],['Agilidade',monster.agilidade],['Velocidade',monster.velocidade],['XP base',monster.xp_recompensa],['Gold base',monster.ouro_recompensa]].map(([label,value])=>[label,number(value)]);
  const content = [
    monster.descricao || 'A história desta criatura ainda não foi registrada pelos cronistas de Caelum.',
    '## Atributos e recompensas',table(['Atributo','Valor base'],attributes),
    'O dano básico é a faixa cadastrada da criatura, antes dos efeitos de combate. Defesa, esquiva, crítico, habilidades, afinidades e modificadores podem alterar a vida perdida. XP e gold são recompensas base: bônus, penalidades de crise e regras do modo de combate podem mudar o valor recebido.',
    ...(monster.typing ? ['## Família e afinidades', `Família: **${text(monster.typing.family?.nome)||'Não definida'}**. Ataque básico: **${text(monster.typing.basicNature)}**, afinidade **${text(monster.typing.affinity?.nome)||'Neutra'}**.`,table(['Dano recebido de','Multiplicador','Efetividade'],monster.typing.defenses.map(d=>[d.nome,`${number(d.multiplier)}×`,d.effectivenessLabel])), 'Estes são os perfis cadastrados. Sua aplicação depende de a tipagem estar ativada no modo de combate.'] : []),
    '## Onde encontrar',table(['Região','Aparição','Nível mínimo do aventureiro'],locations.map(({zone,link})=>[zone.nome,link.tipo_aparicao,Math.max(zone.nivel_jogador_minimo||1,link.nivel_jogador_minimo||1)])),
    ...locations.filter(({zone})=>zone.descricao).map(({zone})=>`### ${text(zone.nome)}\n${zone.descricao}`),
    '## Espólios',drops.length ? table(['Item','Chance base','Quantidade'],drops.map(({loot,item})=>[item.nome,`${number(loot.chance_ppm/10000)}%`,`${loot.quantidade_min}–${loot.quantidade_max}`])) : 'Nenhum espólio público registrado.',
    'Cada linha de espólio possui seu próprio sorteio. Os percentuais são chances base e não precisam somar 100%. Receitas permanecem ocultas, como no Bestiário.',
    '## Habilidades',...abilities.map(({ability,power})=>`### ${text(power.nome)}\n${power.descricao}\n\n${table(['Propriedade','Valor'],[['Tipo',power.tipo_poder],['Natureza',power.tipo_dano],['Dano base',number(power.dano_base)],['Cura base',number(power.cura_base)],['Escalamento',`${number(power.valor_escala)} × ${power.escala_atributo}`],['Mana',number(ability.custo_mana_override ?? power.custo_mana)],['Recarga (turnos)',number(ability.cooldown_override ?? power.cooldown)]])}`),
    ...(abilities.length ? ['Dano base e escalamento são componentes da habilidade; o resultado depende da execução no combate e dos efeitos aplicados.'] : ['Nenhuma habilidade cadastrada para esta criatura.']),
    `## Seu registro\nVitórias registradas: **${number(kills)}**.`,
  ].join('\n\n');
  return article(`criatura-${monster.id}`,monster.nome,'Criaturas descobertas',content,{kind:'monster',nivel:monster.nivel,imagem_url:monster.imagem_url,resumo:monster.descricao});
}
async function buildEncyclopedia(characterId, models) {
  const [kills, zones, classes, races] = await Promise.all([
    models.Kill.findAll({where:{id_personagem:characterId,primeira_derrota_em:{[Op.ne]:null}},raw:true}),
    models.Zone.findAll({where:{ativa:true},order:[['ordem','ASC']],raw:true}),
    models.Class.findAll({where:{ativo:true},order:[['ordem_exibicao','ASC']],raw:true}),
    models.Race.findAll({order:[['id','ASC']],raw:true}),
  ]);
  const articles = [article('referencia-atributos','Atributos e preparação','Manual do aventureiro',[
    'Em Caelum, conhecer o inimigo e preparar o personagem faz parte da aventura. Equipe suas armas, distribua os pontos e escolha habilidades que cresçam com seus melhores atributos.',
    table(['Atributo','Como ajuda'],[['Força','Aumenta o ataque básico e habilidades que escalam com Força.'],['Vitalidade','Aumenta a vida máxima.'],['Inteligência','Aumenta a mana máxima e habilidades que escalam com Inteligência.'],['Agilidade','Ajuda a esquivar quando supera a precisão do atacante.'],['Velocidade','Contribui para precisão e chance de crítico; também participa da iniciativa em modos que usam essa regra.']]),
    '## Vida e mana\nAntes dos demais bônus, a vida usa (30 + 6 × Vitalidade + 5 × níveis acima do primeiro) × multiplicador de vida da classe. A mana usa (20 + 5 × Inteligência + 4 × níveis acima do primeiro) × multiplicador de mana da classe. Os resultados são arredondados.',
    '## Crítico e esquiva\nSem efeitos adicionais, a chance de crítico é 5% + 0,4 ponto percentual por ponto de Velocidade, limitada a 40%. O multiplicador básico de crítico é 1,5. Agilidade e Velocidade do atacante influenciam a chance de o alvo esquivar. Equipamentos, buffs e habilidades podem modificar essas regras.',
    '## Antes de partir\nConfira vida e mana, equipe seus itens e organize as habilidades nos slots de combate. Leia a natureza do dano e o atributo de escalamento de cada poder: uma habilidade mágica pode escalar com um atributo diferente de Inteligência.',
  ].join('\n\n'),{kind:'guide'}), article('referencia-classes','Classes e raças: valores atuais','Manual do aventureiro',[
    'Os números abaixo vêm do catálogo atual do servidor. Compare os multiplicadores com os atributos em que pretende investir.',
    table(['Classe','Vida','Mana','Dano físico','Dano mágico'],classes.map(c=>[c.nome,...['multiplicador_vida_por_nivel','multiplicador_mana_por_nivel','multiplicador_dano_fisico','multiplicador_dano_magico'].map(k=>`${number(c[k])}×`)])),
    ...classes.map(c=>`## ${text(c.nome)}\n${c.descricao||''}\n\nAtributo principal: **${text(c.atributo_principal)||'Não definido'}**. Secundário: **${text(c.atributo_secundario)||'Não definido'}**.`),
    '## Raças',...races.map(r=>`### ${text(r.nome_masculino)} / ${text(r.nome_feminino)}\n${r.descricao_masculina||r.descricao_feminina||'Sem história registrada.'}\n\n${table(['Atributo','Bônus racial'],['forca','vitalidade','agilidade','inteligencia','velocidade'].map(k=>[k,number(r['bonus_'+k])]))}`),
  ].join('\n\n'),{kind:'guide'}), article('referencia-aventura','Exploração e recompensas','Manual do aventureiro',[
    'As regiões guardam criaturas, histórias e espólios próprios. Vença uma criatura na Aventura para registrar sua descoberta: só então sua ficha aparece nesta enciclopédia.',
    '## Regiões',table(['Região','Nível recomendado','Nível mínimo para entrar'],zones.map(z=>[z.nome,`${z.nivel_monstro_min}–${z.nivel_monstro_max}`,z.nivel_jogador_minimo||1])),
    ...zones.map(z=>`### ${text(z.nome)}\n${z.descricao||''}`),
    '## Entenda os números\nA faixa recomendada da zona não substitui o nível mínimo exigido para entrar. Algumas criaturas também têm um nível mínimo de aparição. O nível e os atributos base do monstro vêm da sua ficha; variações específicas de modos de combate e efeitos são calculadas pelo motor.',
    '## Espólios e progressão\nXP e gold apresentados na ficha são valores base. Os drops são sorteados individualmente e podem não ocorrer, ou ocorrer juntos. Bônus, maestria e penalidades globais podem alterar recompensas. Use os materiais na Forja, negocie no Mercado Negro e consulte os artigos publicados para aprender os demais sistemas.',
  ].join('\n\n'),{kind:'guide'})];
  articles.push(...await require("./wikiClassService").getClassArticles(classes, kills, models));
  articles.push(...await require("./wikiPowerService").getPowerArticles(characterId, classes, races, models));
  if(!kills.length)return articles;
  const monsters=await models.Monster.findAll({where:{ativo:true,nome:{[Op.in]:kills.map(k=>k.nome_monstro)}},order:[['nivel','ASC'],['nome','ASC']],raw:true});
  if(!monsters.length||!zones.length)return articles;
  const ids=monsters.map(m=>m.id);
  const links=await models.Link.findAll({where:{ativo:true,id_monstro:{[Op.in]:ids},id_area:{[Op.in]:zones.map(z=>z.id)}},raw:true});
  const visibleIds=[...new Set(links.map(l=>l.id_monstro))];
  if(!visibleIds.length)return articles;
  const [loots,abilities]=await Promise.all([
    models.Loot.findAll({where:{ativo:true,id_monstro:{[Op.in]:visibleIds}},raw:true}),
    models.Ability.findAll({where:{ativo:true,id_monstro:{[Op.in]:visibleIds}},raw:true}),
  ]);
  const [items,powers]=await Promise.all([
    loots.length ? models.Item.findAll({where:{id:{[Op.in]:loots.map(l=>l.id_item)},tipo_item:{[Op.ne]:'Receita'}},raw:true}) : [],
    abilities.length ? models.Power.findAll({where:{id:{[Op.in]:abilities.map(a=>a.id_power)}},raw:true}) : [],
  ]);
  const byId=rows=>new Map(rows.map(row=>[row.id,row]));
  const zoneMap=byId(zones),itemMap=byId(items),powerMap=byId(powers),killMap=new Map(kills.map(k=>[k.nome_monstro,k]));
  for(const m of monsters){const locations=links.filter(l=>l.id_monstro===m.id).map(link=>({link,zone:zoneMap.get(link.id_area)}));if(!locations.length)continue;
    if(models.typing){const profile=models.typing.monsterProfile(m);m.typing={family:profile.family,basicNature:profile.basicNature,affinity:models.typing.affinity(profile.basicAffinityId),defenses:models.typing.publicDefense({combatTyping:profile})};}
    articles.push(creatureArticle(m,locations,loots.filter(l=>l.id_monstro===m.id&&itemMap.has(l.id_item)).map(loot=>({loot,item:itemMap.get(loot.id_item)})),abilities.filter(a=>a.id_monstro===m.id&&powerMap.has(a.id_power)).map(ability=>({ability,power:powerMap.get(ability.id_power)})),killMap.get(m.nome).quantidade));
  }
  return articles;
}
async function getEncyclopedia(characterId){const models=Object.fromEntries(Object.entries(modelNames).map(([key,name])=>[key,require(`../models/${name}`)]));models.typing=require("./combatTypingService");await models.typing.catalog();const entries=await buildEncyclopedia(characterId,models);return [...entries,...await require("./wikiLibraryService").getLibrary(characterId,entries,models.typing)];}
module.exports={getEncyclopedia,buildEncyclopedia,creatureArticle};
