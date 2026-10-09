# Liberação do Templo e receitas da Expedição

## Templo

O admin existente `/dashboard/admin/temple` possui o controle de disponibilidade para jogadores, protegido por `temple.manage`. A configuração persistida é `GameSetting` `temple.enabled` (booleano), com padrão **false**, inclusive quando a linha não existe. Não há liberação automática por ambiente ou por implantação.

Desabilitar oculta menu e arena, redireciona acesso direto à página, bloqueia HTTP e socket e interrompe scheduler/progresso das Provações. O catálogo administrativo permanece acessível. Nenhum evento, sigilo, equipamento ou recompensa existente é apagado. As datas não são prorrogadas: ao habilitar, o calendário original volta a ser processado. Para testes em dev, habilite pelo admin conectado ao banco de dev. Produção permanece desabilitada até uma liberação explícita em seu próprio admin.

## Expedição

`/dashboard/admin/expedition` contém **Achado raro de receitas**. Padrão: 1.000 PPM = 0,1% por coleta não interrompida, adicional ao recurso normal, em todas as regiões/profissões. Se o sorteio ocorrer, escolhe uma receita elegível uniformemente. Não é uma chance de 0,1% independente para cada receita.

`GameSetting` `expedition.recipeFind` guarda `{chance_ppm,item_ids}`. `item_ids: null` inclui todas as receitas físicas ativas vinculadas a uma ForgeRecipe ativa ou a uma fórmula AlchemyRecipe ativa por descoberta. Novas receitas vinculadas entram automaticamente. Uma lista explícita restringe os achados aos itens selecionados. Zero PPM ou lista vazia desabilita o achado. Itens órfãos/desativados e fórmulas sem item físico não entram no sorteio. O salvamento é validado e auditado; runtime lê a configuração do banco, inclusive entre réplicas.

As receitas físicas devem ser cadastradas no admin de Itens e vinculadas ao aprendizado no admin da Forja/Alquimia. Não precisam de um ExpeditionResource. Recursos de coleta comuns podem agora ser adicionados a uma região pelo seletor **Adicionar recurso à região**, com peso relativo. Esse peso não é a chance do achado raro de receita.

## Promoção

Preservar o News Caelum e o exportador de catálogo que já existem em main ao integrar dev. As migrações de Templo, Guilda e puzzle devem acompanhar o backend; o comando de início do projeto executa `npm run migrate`. Estas alterações de controle reutilizam GameSetting e não criam migrações adicionais. A comparação/integração no Git não comprova o deploy ativo nem modifica diretamente o banco de produção.

## Patch notes públicos

A migration `20270213010001-patch-note-public-rollout.js` registra, uma única vez, a nota Caelum `2026.10.08` como Publicado no próprio banco de cada deploy. O conteúdo em `docs/releases/2026-10-08-public.md` inclui somente mudanças visíveis. A reversão não apaga o histórico publicado. O worker News Caelum já captura novas notas publicadas se o bot e `auto_patch_notes` estiverem habilitados; não se força nem se altera a configuração atual do Discord.
