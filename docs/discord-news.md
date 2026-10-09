# News Caelum — instalação e operação

O bot publica patch notes e mudanças de balanceamento e responde usando PostgreSQL e a Wiki publicada. Não há treinamento automático, leitura das conversas, modelo generativo, nova dependência ou acesso de jogadores ao banco. O backend permanece responsável pelos dados. A integração vem desativada.

## Criar e instalar no Discord

1. Abra https://discord.com/developers/applications e crie **News Caelum** em **New Application**.
2. Em **General Information / Informações gerais**, copie **Application ID** e **Public Key**.
3. Em **Bot**, crie o usuário bot se a tela solicitar. Use **Reset Token / Redefinir token** e guarde o token nos segredos do backend. `Client Secret`, em OAuth2, é outra credencial e não é necessário.
4. Em **OAuth2 → URL Generator**, marque `bot` e `applications.commands`. Use instalação de guilda. Permissões: **Ver canais**, **Enviar mensagens**, **Inserir links**, **Ver histórico de mensagens**. Não precisa Administrador, gerenciar servidor, mencionar todos ou permissões de voz.
5. Abra a URL gerada e selecione seu servidor. Você precisa poder gerenciar esse servidor.
6. Escolha um canal de texto ou de anúncios para notícias. Garanta essas permissões no canal; permissões específicas de canal podem prevalecer sobre as do convite.
7. No Discord, ative **Configurações → Avançado → Modo desenvolvedor**. Clique com o botão direito no servidor e no canal e use **Copiar ID**.
8. Os jogadores precisam poder usar comandos de aplicativos no servidor/canal. Não habilite intents privilegiados: Message Content, Server Members e Presence não são necessários.

## Segredos e configuração do backend

Configure no serviço backend do Railway (ou host equivalente), nunca em `NEXT_PUBLIC_*`, no frontend, no banco de configuração ou em commits:

| Variável | Valor |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Token da seção Bot; secreto |
| `DISCORD_PUBLIC_KEY` | Chave pública hexadecimal de 64 caracteres |
| `DISCORD_APPLICATION_ID` | ID da aplicação |
| `DISCORD_GUILD_ID` | ID do servidor autorizado |
| `DISCORD_NEWS_CHANNEL_ID` | ID do canal de notícias |
| `CAELUM_RELEASE_ENV` | `production`, `staging` ou `development`; padrão development |
| `DISCORD_NEWS_ENABLED` | `true` para permitir a integração; padrão desativada |

Use um bot/servidor/canal separado em desenvolvimento. `NODE_ENV=production` é configuração de execução, não prova que os dados sejam do jogo oficial. O ambiente das notícias vem de `CAELUM_RELEASE_ENV`. Respostas fora de production têm aviso de teste; notícias identificam o ambiente no rodapé. Cada backend aponta somente ao seu próprio banco. Não aponte testes ao PostgreSQL de produção.

Após publicar o código e aplicar a nova migration pelo fluxo normal (`npm start` executa `npm run migrate`):

1. Reinicie/republique o serviço com os segredos.
2. Em **General Information → Interactions Endpoint URL**, coloque `https://SEU_HOST_BACKEND/api/discord/interactions`. Use o host público do backend, não a URL do site frontend nem o proxy BFF. Discord validará a assinatura e o PING. Esse handshake funciona antes da habilitação no painel.
3. No shell do backend com os mesmos segredos, execute `npm run discord:register`. Registra/atualiza apenas os cinco comandos deste bot no servidor configurado; não apaga outros comandos. Token inválido dá 401; falta de acesso dá 403.
4. Abra **Admin → News Caelum · Discord**, informe um motivo e habilite a integração. Requer `discordnews.manage`, concedida inicialmente a SuperAdmin; administradores existentes sem essa role precisam receber a permissão pelo painel de administradores.
5. Publique uma nova nota no editor de Patch Notes, ou use seu ID no painel News Caelum para enviar uma nota existente. Confira a fila e o canal. Os envios automáticos rodam a cada 15 segundos.

Não envie token em chat/screenshots. Se vazar, redefina no Discord, atualize o segredo e reinicie o serviço. Não configure Client Secret, Redirect URI ou OAuth de jogador: este fluxo usa bot e comandos de servidor.

O bot usa HTTPS/REST e interações, sem uma conexão Gateway permanente. Pode aparecer offline na lista de membros; publicação e slash commands funcionam mesmo assim. O worker precisa de backend de longa duração, como Railway. Em Vercel serverless, o worker não inicia: use um serviço persistente para processar a fila.

## Comandos

- `/caelum-ajuda`: comandos, fontes e limites.
- `/caelum-habilidade nome`: consulta atual de dano/cura base, atributo e coeficiente de escalamento, mana e cooldown. Não calcula dano final personalizado nem presume o nível/atributos do jogador.
- `/caelum-mudancas nome`: até quatro alterações aprovadas da habilidade, com data da alteração e valores anteriores/novos. Sem registro aprovado, responde que não há histórico publicado.
- `/caelum-noticias`: três notas visíveis no jogo, excluindo rascunhos e agendamentos futuros.
- `/caelum-guia assunto`: consulta artigos publicados da Wiki. Se houver vários resultados, pede título mais específico.

Comandos respondem apenas ao solicitante (`ephemeral`), sem spam no canal. Nomes ambíguos são apresentados para escolha. Habilidades exclusivas de monstros não entram na consulta de habilidades de personagens. O bot não lê jogadores, senhas, IPs, inventários ou auditorias completas. Alterações diretas via SQL, migrations ou caminhos sem auditoria não produzem automaticamente uma notícia de balanceamento; consultas atuais ainda refletem o catálogo existente.

## Histórico e aprovação

`adminAuditService.registrarAcao` já guardava antes/depois. Agora cria uma proposta `discord_news_changes` na mesma transaction para edições com diferenças em campos públicos permitidos. Nada é inferido a partir de um valor atual.

Catálogos cobertos: Power (habilidades), Item (campos básicos), AdventureMonster (stats fixos/recompensas) e WorldBossConfig (campos básicos/prazo). Não exporta a auditoria inteira nem subestruturas de equipamentos, contas ou parâmetros internos. Novos cadastros sem valor anterior não são tratados como rebalanceamento.

No painel, aprovar registra uma ação auditada, libera o histórico consultável e enfileira um snapshot da notícia; rejeitar impede divulgação, sem desfazer o ajuste no jogo. O histórico registra a data da mudança, não promete que a aprovação tenha aplicado a mudança. A configuração já mudou no seu ambiente antes da aprovação. Propostas não mudam de ambiente e não podem ser aprovadas por um serviço de outro ambiente.

Exemplo: dano base `100 → 120`, escalamento `0,5 → 0,6`. A notícia fala de valores do catálogo; nível de habilidade, classe, buffs e resistências ainda influenciam o dano final.

A captura começa com esta entrega. Não há backfill automático de auditorias antigas nem criação de valores históricos inexistentes. Mudanças do código entre dev/main não transportam registros dos respectivos bancos.

## Patch notes automáticos

Ao instalar a migration, `discord_news_state.capture_since` define o início da captura. Notas criadas ou editadas depois disso entram na fila quando estiverem visíveis pelo mesmo workflow do jogo: Publicado ou Agendado cuja data chegou. Rascunhos e agendamentos futuros não são enviados. Notas históricas intactas não inundam o canal; podem ser incluídas manualmente pelo ID.

Cada patch possui uma chave única de publicação. O primeiro envio guarda seu snapshot e não é repetido após novas edições. Para corrigir uma notícia já enviada, crie uma nova nota de correção. Antes do envio, a disponibilidade do patch é revalidada; se virar rascunho, o envio é cancelado. Um envio cancelado não é automaticamente retomado: publique uma nota nova. Desativar as notícias automáticas pausa a captura de novas notas; envios já enfileirados continuam. Desativar a integração pausa todos os envios e consultas.

## Persistência, falhas e segurança

Tabelas novas: `discord_news_state`, `discord_news_changes`, `discord_news_deliveries`, `discord_news_interactions`. A migration é aditiva, registrada no manifesto e forward-only, preservando histórico. Nenhuma migration antiga é editada.

A fila usa chave única por fonte, lock e `SKIP LOCKED`. Um worker reivindica cada envio. O POST inclui nonce estável e `enforce_nonce`. HTTP 429 usa retry_after limitado; falhas confirmadas ficam Failed para retry pelo Admin. Timeouts, HTTP 5xx, confirmação inválida e crashes após reivindicação ficam Review. Não há retry automático nesses casos, pois Discord e PostgreSQL não compartilham transaction e não é possível garantir exatamente uma entrega em toda falha de rede.

Para Review, confira o canal: se a mensagem existir, copie seu ID e confirme no painel. O backend verifica autoria e nonce ou conteúdo/rodapé da notícia. Se estiver ausente, confirme a ausência; o envio passa para Failed e pode ser reenviado explicitamente. Tudo exige motivo e é auditado. O worker valida que o canal pertence ao servidor configurado antes de publicar.

Interações exigem assinatura Ed25519 sobre o corpo original e timestamp recente, application_id e guild_id corretos, integração habilitada e ID não processado. DMs/outros servidores são rejeitados. Registros de interação armazenam apenas IDs e timestamp para replay/limite por usuário e são removidos após dez minutos enquanto o worker está ativo; tokens de interação e perguntas não são persistidos. Há limite de 20 consultas por usuário por minuto e resposta de fallback antes da janela de 3 segundos do Discord.

Conteúdo é limitado ao tamanho aceito pelo Discord, menções automáticas são desabilitadas, erros não incluem token, resposta privada do Discord ou credenciais. A API administrativa exige autenticação, isAdmin e discordnews.manage. O endpoint de interação fica antes do parser JSON e do middleware de manutenção para que Discord consiga validar a aplicação.

## Validação

`test/discordNews.test.js` verifica diferenças permitidas, assinatura/tampering/expiry, rollback, aprovação única, idempotência de fila, consultas sem rascunhos, valores atuais, workers concorrentes, timeout ambíguo, HTTP 429, servidor/canal incorretos, kill switch, autorização Admin, replay e captura de mais de 100 notas/agendamentos. Todas as publicações de teste usam transporte simulado; nenhum canal real é usado.

O teste de navegador cobre o painel, valores antes/depois, exigência de motivo, aprovação e retorno ao Admin. Build/typecheck e auditorias existentes continuam obrigatórios. A ativação real só pode ser verificada depois de instalar o bot, configurar segredos e publicar o backend com esta versão.
