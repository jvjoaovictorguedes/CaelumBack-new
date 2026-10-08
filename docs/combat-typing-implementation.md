# Tipagens, afinidades e famílias — V1 para testes em dev

Implementação baseada em `Caelum_Sistema_Tipagem_Afinidades_Familias_Claude.docx`, sobre o motor consolidado. A autorização do usuário abrangeu sistema, telas, conteúdo inicial e publicação em `dev`. O documento é uma especificação; os valores de balanceamento não definidos nele são propostas explícitas para teste.

## Dados e migrations

Novas migrations, posteriores à sequência já aplicada, registradas no manifest arquitetural:

1. `20270206010002-combat-typing-expand-neutral.js`: nove tabelas de domínio, associações nullable, permissões administrativas, 11 afinidades, 9 tipos de arma e 10 famílias. Backfill dos seis tipos de arma legados e das Powers físicas (`INHERIT_WEAPON`), sem mudar atributos, intervalos de dano ou natureza cadastrada. Perfis efetivos neutros nesta etapa.
2. `20270206010003-combat-typing-buff-data.js`: mapeamento persistido dos tipos legados e campos de buff defensivo por afinidade em Powers. Novas armas e Powers criadas pelas APIs legadas recebem configuração compatível pelos hooks dos models.
3. `20270206010004-combat-typing-initial-content.js`: fase separada de conteúdo. Classifica os 40 monstros conhecidos nas migrations do projeto, configura ataques básicos e perfis defensivos iniciais por família. Cria especialização de Martelo de +20% contra Construtos. Guarda imagens anteriores dos dados em `combat_typing_content_backup` para rollback. Não altera criaturas previamente classificadas nem cria monstros ausentes.

Catálogos: Corte, Perfuração, Impacto, Fogo, Gelo, Raio, Água, Terra, Vento, Luz e Trevas; Espada, Machado, Adaga, Lança, Martelo, Cutelo, Cajado, Livro e Orbe; Humanoide, Besta, Inseto, Planta, Aquático, Morto-vivo, Espírito, Construto, Dragão e Demônio. Afinidade neutra é `null`, não um registro `NEUTRAL`.

Armaduras e Powers especiais existentes não receberam resistências/elementos por inferência do nome. Equipamentos defensivos começam sem modificadores; Powers mágicas continuam neutras até cadastro explícito. Bosses possuem os mesmos campos e catálogos, mas a família opcional não foi inventada para seus cadastros.

## Motor e contratos

`combatTypingService` concentra os resolvers de perfil ofensivo, perfil defensivo, afinidades, especialização, componentes, classificação e breakdown. O `combatActionEngine` integra essa camada; os adaptadores de Solo, Party, Expedição, Guild Boss e World Boss usam o mesmo `resolveDamage`. Não há fórmula de afinidade no frontend nem regra de combate baseada no nome de uma criatura/item.

Ordem: dano bruto já escalado/critado pelo motor existente → defesa → afinidade → especialização aditiva com cap → modificadores finais → arredondamento por componente → soma. Escudos e perda efetiva de vida continuam nos adaptadores existentes. Dano verdadeiro ignora defesa/afinidades e não recebe classificação; especialização contra família permanece um mecanismo independente. Power `Nenhum` não gera componente de dano.

Ataque básico mágico usa Inteligência e multiplicador mágico de classe no PvE. Ataques físicos preservam a fórmula/RNG anterior. Ataques de monstros com dano fixo preservam a fonte cadastrada. Armas com elemento nativo e buffs de encantamento adicionam componentes independentes, sem converter o dano físico. Buffs defensivos são agregados pelo mesmo resolver e respeitam caps. Imbue começa a afetar os ataques seguintes e dura pelos turnos do portador.

Override individual prevalece sobre a família; entrada ausente fica em 1x. Equipamentos somam percentuais por peça, incluindo cópias do mesmo item, e recalculam após equipar/retirar. Especializações do tipo, arma e Power somam antes do cap. Duplicação administrativa de item copia componentes, resistências e especializações na mesma transação.

Snapshots novos de encontro preservam o perfil de equipamento/monstro. World Boss congela o perfil defensivo junto ao snapshot do evento. Catálogos/bonificações têm cache de cinco segundos, invalidado após alterações administrativas; config é lida do cache operacional existente. Mudanças de configuração global e especializações podem afetar encontros já iniciados, conforme a configuração atual, enquanto o perfil defensivo congelado permanece no snapshot.

DTO de dano: `totalDamage`, componentes com natureza, afinidade, multiplicador, label, bônus contra família, dano final e família do alvo. Tipos frontend ficam no mecanismo de contratos existente (`src/types/contracts/combatTyping.ts`). Breakdown apresenta o dano resolvido; dano efetivo perdido na vida pode ser menor por escudo/overkill.

## Administração e jogador

`/dashboard/admin/combat-typing` disponibiliza CRUD por ativação/desativação dos catálogos, perfis, associação aos dados existentes, especializações, configuração e simulador. Perfis inválidos não são gravados parcialmente. Referências inexistentes/inativas, duplicatas e incompatibilidades de natureza/afinidade são rejeitadas. Não existe exclusão física pela API administrativa; FKs bloqueiam exclusão de entidades em uso. Escritas exigem motivo e permissão `combat_typing.manage`; leitura usa `combat_typing.view`. A migration concede ambas apenas ao SuperAdmin existente. Auditoria de alterações inclui subentidades relacionadas na mesma transação.

Os editores de monstros, itens, Powers, Guild Boss e World Boss reutilizam `TypingEditor`. Monstro mostra Herdado / Override / Efetivo; famílias permitem consultar tipos de arma especializados. Campos ofensivos ficam ocultos para Powers de dano verdadeiro/nenhum. O simulador recebe dano bruto já escalado, arma/Power e alvo, e usa o resolver real no backend; não é uma simulação completa de combate com RNG/IA/turnos.

Personagem exibe resistências calculadas pelo servidor; inventário mostra natureza, afinidade, componente elemental, especialização e comparação de resistências ao equipar. Tooltips de Powers explicam herança/elemento/encantamento. Combates mostram breakdown. Bestiário revela família, ataque e afinidades apenas na lista já descoberta; endpoint auxiliar público não revela tipagem de Powers exclusivas de monstros.

## Flags e balanceamento inicial

Config: `GameSetting` chave `combat_typing.config`, editada pelo painel. Defaults: PvE ligado; PvP desligado; multiplicador mínimo 0,05x/máximo 3x; bônus contra família limitado a +50%; Efetivo a partir de 1,15x; Enfraquecido até 0,90x; Ineficaz até 0,60x; demais valores Neutros. Labels são editáveis. PvP/ranked/torneio permanecem neutros mesmo se uma configuração externa tentar ligar a flag da V1.

Perfis iniciais são uma proposta para dev: Construtos seguem o exemplo do documento (resistência a Corte/Perfuração/Terra, vulnerabilidade a Impacto/Vento); outras famílias recebem valores moderados explicitados na migration de conteúdo. A família de Lodo Vivo, Hidra e criaturas híbridas é uma escolha de conteúdo revisável no Admin. Nenhuma distribuição de dano/drop/recompensa foi recalibrada automaticamente. Métricas agregadas de resolução, dano e labels são consultáveis na API Admin, locais ao processo e reiniciadas com o servidor.

## Evidências e operação

- Suíte completa backend: 1.335 testes aprovados, zero falhas/skips.
- Após ajustes finais: regressão direcionada de 68 testes e grupo adicional de 14 testes de tipagem/HTTP e uma última execução de 24 testes após os ajustes de comparação, clone e Guild Boss, todos aprovados. Grupos sobrepostos; não somar como testes únicos.
- 500 snapshots neutros comparados com a mitigação/arredondamento anteriores; RNG físico preservado; teste separado comprova correção da arma mágica. A correção mágica é intencional e não entra na promessa de equivalência do cálculo básico físico.
- HTTP Admin verifica permissões, unicidade, rollback de perfil inválido, auditoria de subentidades e simulação real. Tests cobrem herança, componentes, buffs, caps, clone e contexto de produção/PvP.
- Migrations em banco existente e banco vazio local, repetição sem pendências, rollback das três migrations e reaplicação aprovados. Em banco vazio: 11 afinidades, 9 tipos, 10 famílias e 40 monstros tipados.
- Frontend: 17 testes, typecheck, lint, build e smoke real Next/Chromium aprovados. Smoke cobre navegação/sessão, Turnstile simulado, breakdown Party e editor administrativo com colunas Herdado/Override/Efetivo.
- Auditorias de migrations/economia e resolução de imports aprovadas. Nenhuma migration histórica foi editada. Nenhuma consulta/alteração no Postgres de produção foi feita.

Publicar Front e Back juntos; o startup normal aplica as migrations. Encontros existentes sem perfil novo continuam neutros até um novo encontro; equipamentos de personagens são resolvidos normalmente no carregamento seguinte. Para rollback operacional, desligar PvE na configuração. Para rollback de schema, retirar o código novo antes de executar downs e respaldar alterações administrativas: o down de conteúdo remove os perfis que criou, e o de schema remove os dados novos. Armas catalogadas sem representação no ENUM legado bloqueiam o rollback de schema até ajuste explícito.

Compatibilidade: campos/ENUM legados continuam presentes, mas o catálogo é a fonte para os tipos novos. A remoção física final dos legados não foi feita neste deploy para preservar clientes/scripts antigos e permitir rollback; deve ser uma migration Contract separada após testar dev e confirmar o fim da janela de compatibilidade. DoT tipado, imunidade, absorção, conversão elemental, reações combinadas e PvP com afinidades não foram incluídos.
