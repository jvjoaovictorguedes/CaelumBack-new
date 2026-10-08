const { sequelize } = require("../config/database");
const M = require("../models/worldCrisisModels");
const crisis = require("./worldCrisisService");
const { fail, number } = require("./worldCrisisConfigService");
function usefulQuantity(quantity, remaining, source) {
  const accepted = Math.min(
    quantity,
    Math.ceil(remaining / source.progress_per_unit),
  );
  const progress = Math.min(remaining, accepted * source.progress_per_unit);
  return {
    accepted_quantity: accepted,
    remaining_quantity: quantity - accepted,
    progress_units: progress,
    ranking_points: Math.floor(
      (progress * source.ranking_points_per_unit) / source.progress_per_unit,
    ),
    capped_by_requirement: progress < accepted * source.progress_per_unit,
  };
}
async function contribute(characterId, input) {
  number(input.quantity, 1, 1000000, "Quantidade", true);
  number(input.item_id, 1, 2147483647, "Item", true);
  number(input.event_id, 1, 2147483647, "Evento", true);
  if (
    typeof input.request_id !== "string" ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(input.request_id)
  )
    throw fail("Identificação da doação inválida.");
  return sequelize.transaction(async (transaction) => {
    const event = await M.Event.findByPk(input.event_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!event) throw fail("Crise não encontrada.", 404);
    const prior = await M.Contribution.findOne({
      where: {
        event_id: event.id,
        character_id: characterId,
        request_id: input.request_id,
      },
      transaction,
    });
    if (prior) {
      if (
        prior.item_id !== input.item_id ||
        prior.response.requested_quantity !== input.quantity ||
        prior.requirement_key !== input.requirement_key ||
        prior.stage_key !== input.stage_key
      )
        throw fail("Identificação já utilizada com outra doação.", 409);
      return { ...prior.response, replayed: true };
    }
    if (event.status !== "ACTIVE" || event.contributions_paused)
      throw fail("Contribuições indisponíveis.", 409);
    if (input.stage_key !== event.current_stage_key)
      throw fail("A etapa mudou. Atualize antes de contribuir.", 409);
    const requirement = crisis
      .stage(event)
      .requirements.find((r) => r.key === input.requirement_key);
    const source = requirement?.resolved_items.find(
      (i) => i.id === input.item_id,
    );
    if (!source) throw fail("Item não aceito para este requisito.");
    const progress = await M.Progress.findOne({
      where: {
        event_id: event.id,
        stage_key: event.current_stage_key,
        requirement_key: requirement.key,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const remaining =
      Number(progress.target_progress) - Number(progress.current_progress);
    if (remaining <= 0) throw fail("Este requisito já foi concluído.", 409);
    const useful = usefulQuantity(input.quantity, remaining, source);
    await require("./inventoryService").removeStack(
      characterId,
      input.item_id,
      useful.accepted_quantity,
      transaction,
    );
    let participation = await M.Participation.findOne({
      where: { event_id: event.id, character_id: characterId },
      transaction,
    });
    if (!participation)
      participation = await M.Participation.create(
        { event_id: event.id, character_id: characterId },
        { transaction },
      );
    const member = await require("../models/GuildMember").findByPk(
      characterId,
      { transaction },
    );
    if (!participation.ranking_guild_id && member) {
      participation.ranking_guild_id = member.id_guild;
      await participation.save({ transaction });
    }
    if (
      participation.ranking_guild_id &&
      !(await M.GuildSnapshot.findOne({
        where: { event_id: event.id, guild_id: participation.ranking_guild_id },
        transaction,
      }))
    ) {
      const guild = await require("../models/Guild").findByPk(
        participation.ranking_guild_id,
        { transaction },
      );
      await M.GuildSnapshot.create(
        {
          event_id: event.id,
          guild_id: guild.id,
          guild_name_snapshot: guild.nome,
          member_count_snapshot: Math.max(
            1,
            await require("../models/GuildMember").count({
              where: { id_guild: guild.id },
              transaction,
            }),
          ),
          existed_at_start: false,
        },
        { transaction },
      );
    }
    const response = {
      ...useful,
      event_id: event.id,
      stage_key: event.current_stage_key,
      requirement_key: requirement.key,
      requested_quantity: input.quantity,
      ranking_guild_id: participation.ranking_guild_id,
    };
    await M.Contribution.create(
      {
        event_id: event.id,
        stage_key: event.current_stage_key,
        requirement_key: requirement.key,
        character_id: characterId,
        guild_id_at_contribution: member?.id_guild ?? null,
        ranking_guild_id: participation.ranking_guild_id,
        item_id: input.item_id,
        quantity: useful.accepted_quantity,
        progress_units: useful.progress_units,
        ranking_points: useful.ranking_points,
        request_id: input.request_id,
        response,
      },
      { transaction },
    );
    progress.current_progress =
      Number(progress.current_progress) + useful.progress_units;
    if (Number(progress.current_progress) >= Number(progress.target_progress))
      progress.completed_at = new Date();
    await progress.save({ transaction });
    const transitioned = await crisis.advance(event, transaction);
    if (!transitioned)
      crisis.afterCommit(transaction, event.id, "worldcrisis:progress");
    return response;
  });
}
async function requirements(characterId) {
  const event = await crisis.latest();
  if (!event) return [];
  const inventory = await require("../models/CharacterInventory").findAll({
    where: { id_personagem: characterId },
    raw: true,
  });
  return crisis
    .stage(event)
    .requirements.map((r) => ({
      ...r,
      items: r.resolved_items.map((i) => ({
        ...i,
        owned: inventory.find((x) => x.id_item === i.id)?.quantidade ?? 0,
      })),
    }));
}
module.exports = { contribute, requirements, usefulQuantity };
