// Separa "cargo" (rótulo hierárquico) de "permissão" (o que ele pode
// fazer), como pede o documento de design — sem isso qualquer regra vira
// um "if (cargo === 'Oficial')" espalhado pelo controller, impossível de
// customizar por guilda depois.
const GuildRolePermission = require("../models/GuildRolePermission");

const HIERARQUIA = ["Fundador", "Oficial", "Veterano", "Membro", "Recruta"];

// Matriz padrão — usada sempre que a guilda não tiver uma linha de
// override em GuildRolePermissions pra aquele cargo+permissão.
const PADRAO = {
  Fundador: {
    convidar: true,
    aceitar_candidatura: true,
    expulsar: true,
    promover_rebaixar: true,
    editar_identidade: true,
    editar_cargos: true,
    autorizar_gastos: true,
    liberar_boss: true,
    comprar_beneficios: true,
  },
  Oficial: {
    convidar: true,
    aceitar_candidatura: true,
    expulsar: true,
    promover_rebaixar: true,
    editar_identidade: true,
    editar_cargos: false,
    autorizar_gastos: false,
    liberar_boss: false,
    comprar_beneficios: false,
  },
  Veterano: {
    convidar: true,
    aceitar_candidatura: false,
    expulsar: false,
    promover_rebaixar: false,
    editar_identidade: false,
    editar_cargos: false,
    autorizar_gastos: false,
    liberar_boss: false,
    comprar_beneficios: false,
  },
  Membro: {
    convidar: false,
    aceitar_candidatura: false,
    expulsar: false,
    promover_rebaixar: false,
    editar_identidade: false,
    editar_cargos: false,
    autorizar_gastos: false,
    liberar_boss: false,
    comprar_beneficios: false,
  },
  Recruta: {
    convidar: false,
    aceitar_candidatura: false,
    expulsar: false,
    promover_rebaixar: false,
    editar_identidade: false,
    editar_cargos: false,
    autorizar_gastos: false,
    liberar_boss: false,
    comprar_beneficios: false,
  },
};

function nivelHierarquico(cargo) {
  const indice = HIERARQUIA.indexOf(cargo);
  return indice === -1 ? HIERARQUIA.length : indice;
}

// Um cargo só pode agir sobre cargos hierarquicamente abaixo dele — nunca
// sobre si mesmo ou acima (regra de segurança do documento, seção 4).
function podeGerenciarCargo(cargoAtor, cargoAlvo) {
  return nivelHierarquico(cargoAtor) < nivelHierarquico(cargoAlvo);
}

async function temPermissao(idGuild, cargo, permissao) {
  if (cargo === "Fundador") return true;
  const override = await GuildRolePermission.findOne({
    where: { id_guild: idGuild, cargo, permissao },
  });
  if (override) return override.permitido;
  return Boolean(PADRAO[cargo]?.[permissao]);
}

module.exports = {
  HIERARQUIA,
  PADRAO,
  podeGerenciarCargo,
  temPermissao,
};
