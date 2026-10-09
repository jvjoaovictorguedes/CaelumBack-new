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
