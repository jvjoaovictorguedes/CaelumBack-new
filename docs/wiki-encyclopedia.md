# Wiki e enciclopédia

## Fonte e análise

A implementação foi conferida com a exportação fornecida pelo responsável pelo jogo, marcada como produção em 2026-10-09T00:35:56Z. Contém 80 monstros ativos, 20 zonas ativas, 80 vínculos, 278 drops, 1.400 itens, 366 poderes, duas classes, seis raças e 34 artigos. Todas as 20 tabelas esperadas estavam presentes. O arquivo não é incorporado ao repositório ou usado como snapshot de gameplay.

O artigo publicado `classe-multiplicador` diverge dos valores exportados: Guerreiro está configurado com vida 1,5×, mana 1,2×, físico 1,5× e mágico 0,5×; Mago com vida 1,2×, mana 1,5×, físico 0,5× e mágico 1,5×. A referência nova consulta esses campos diretamente. Os textos editados pelo Admin são preservados.

## Contrato

`GET /api/wiki/encyclopedia` exige autenticação e personagem pertencente à conta (`carregarPersonagemAtual`). Não aceita id de personagem enviado pelo cliente. Retorna `data.artigos` com três manuais e fichas de criaturas.

Criaturas exigem `character_monster_kills.primeira_derrota_em` preenchida para o personagem autenticado. Só são apresentadas criaturas ativas com vínculo ativo em zona ativa. Não retorna catálogo desconhecido, placeholders ou total de criaturas ocultas. Nenhuma descoberta é criada por consultar a Wiki.

Cada ficha tem descrição cadastrada, região e história regional, vida, nível, faixa de dano básico, defesa, agilidade, velocidade, XP/gold base, drops, habilidades (dano/cura base, escalamento, mana e recarga com overrides), família e afinidades públicas. Receitas são ocultadas como no Bestiário. Chances ppm preservam precisão até 0,0001%. Não promete dano final ou recompensa final: efeitos, modo, tipagem e bônus/penalidades podem alterar o resultado.

Consultas de catálogos são agrupadas. Conteúdo de fichas e multiplicadores é gerado novamente a cada requisição; nenhum seed, migração ou alteração em produção é necessário. Artigos do Admin mantêm as rotas existentes e a regra publicado=true.

## Interface

Página inicial da Wiki: manual e cartões das criaturas descobertas, busca sem distinção de acentos, ficha detalhada e retorno. Cores marrom/dourado e fonte medieval já existente no jogo. Fonte de conteúdo compartilhada com a prévia do Admin. Estados de carregamento, falha com nova tentativa e primeira descoberta vazia.

## Validação

Testes cobrem isolamento por personagem, primeira vitória, zonas desativadas, ausência de descobertas, precisão de drops, receitas ocultas, alterações refletidas na consulta seguinte e overrides zero. Suíte anterior de artigos também validada. Exportação de produção exercitada em memória com descobertas simuladas para validar as 80 fichas; essa simulação não é comportamento de runtime. Nenhum dado de produção foi alterado.

## Classes e evoluções

A enciclopédia também retorna cartões `kind: class`, um por classe ativa. As fichas apresentam papel, atributos principais, multiplicadores, árvore de estágios, origem de cada evolução, requisitos atuais, bônus de atributos e habilidades vinculadas, com custo, recarga, dano/cura base e escalamento. A descrição e os valores são lidos do cadastro do ambiente.

Os requisitos vêm exclusivamente de `class_evolution_requirements`, como na validação do motor. As colunas legadas de nível/item/gold/caça em `class_evolution_paths` não são usadas: a exportação de produção mostrou níveis legados 40 com requisitos V2 50. Gold e itens são descritos como consumidos, e requisitos não implementados não são prometidos como funcionais. A Wiki não afirma que o personagem já atende aos requisitos; o progresso e a ação de evoluir continuam na tela de evolução.

Evoluções desativadas, órfãs ou descendentes de pais desativados/incompatíveis não entram na ficha. Nomes de alvos de caça não descobertos são ocultados. Habilidades exclusivas de monstros ou de proezas únicas não são anunciadas como desbloqueios da evolução. A ficha distingue concessão automática e ativação dependente de slot livre. Nenhuma migração ou concessão de habilidade é executada.

## Habilidades

Cartões `kind: skill` apresentam um manual de aprendizado/evolução e fichas de habilidades. O catálogo inclui habilidades públicas vinculadas a classes ativas, raças, evoluções ativas com linhagem válida, naturezas/árvores mágicas ou livros ativos válidos, além das habilidades já aprendidas pelo personagem autenticado. Poderes exclusivos de monstros nunca entram nessa seção; poderes `UNIQUE_FEAT` só aparecem para quem já os aprendeu. Poderes sem origem pública e ainda não aprendidos ficam ocultos.

Cada ficha reúne descrição, tipo, natureza do dano, dano/cura base, escalamento, mana e recarga; caminhos de aquisição, nível de aprendizado, compra, requisitos de livros e evolução mágica; estado de aprendizado do próprio personagem; status ativos e modificadores ativos com unidades, chance ppm, condição, gatilho, alvo, duração, reaplicação e contextos permitidos. Referências a habilidades prévias ainda não públicas não revelam seus nomes. A Wiki não promete que o jogador está elegível nem concede habilidades.

A curva de evolução e os custos usam diretamente `abilityLevelService`, incluindo o nome atual do Fragmento de Alma. A interface permite filtrar habilidades ativas, passivas e aprendidas. Mostra inicialmente até 12 cartões por filtro, com opção de abrir os demais. A tipografia de todas as tabelas da Wiki foi ampliada para 18px, com mais espaço nas células e rolagem horizontal em telas estreitas.

As novas seções continuam usando exclusivamente o banco do ambiente do backend: nenhum catálogo de produção é importado no banco dev. A exportação fornecida é referência de análise, não um snapshot servido ao jogador.
