const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.IEMA_DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const ARQ_PROCESSOS = path.join(DATA_DIR, "processos.json");
const ARQ_USUARIOS = path.join(DATA_DIR, "usuarios.json");
const ARQ_SEGREDO = path.join(DATA_DIR, "jwt.secret");

function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return padrao;
    throw new Error(`Não foi possível ler ${arquivo}: ${e.message}`);
  }
}

function gravarJson(arquivo, obj) {
  const tmp = arquivo + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, arquivo);
}

function obterSegredoJwt() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    return fs.readFileSync(ARQ_SEGREDO, "utf8").trim();
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const segredo = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(ARQ_SEGREDO, segredo, { mode: 0o600 });
    return segredo;
  }
}

function listarUsuarios() {
  return lerJson(ARQ_USUARIOS, []);
}
function salvarUsuarios(lista) {
  gravarJson(ARQ_USUARIOS, lista);
}

function seedProcessos() {
  const agora = new Date().toISOString();
  return [
    {
      processo: "82249932",
      empresa: "Postos Horizonte Combustíveis Ltda.",
      documento: "15.223.908/0001-77",
      material: "Resíduos Perigosos",
      licenca: "LAU-215/2026",
      validade: "2028-08-22",
      observacoes: "",
      veiculos: [
        { placa: "RHZ4A12", modelo: "Caminhão-tanque" },
        { placa: "RHZ8B77", modelo: "Caminhão-tanque" }
      ],
      criadoEm: agora,
      atualizadoEm: agora
    },
    {
      processo: "71138820",
      empresa: "Agropecuária Boa Vista S.A.",
      documento: "08.771.345/0001-02",
      material: "Resíduos não Perigosos",
      licenca: "LAU-092/2025",
      validade: "2026-12-05",
      observacoes: "",
      veiculos: [{ placa: "BVT2C09", modelo: "Caminhão caçamba" }],
      criadoEm: agora,
      atualizadoEm: agora
    },
    {
      processo: "64502210",
      empresa: "Hospital Regional Santa Clara",
      documento: "22.410.667/0001-55",
      material: "Resíduos da Saúde",
      licenca: "LAU-334/2024",
      validade: "2026-02-11",
      observacoes: "",
      veiculos: [
        { placa: "SCL5D41", modelo: "Veículo de coleta — Resíduos de Saúde" },
        { placa: "SCL5D42", modelo: "Veículo de coleta — Resíduos de Saúde" }
      ],
      criadoEm: agora,
      atualizadoEm: agora
    }
  ];
}

function listarProcessos() {
  const lista = lerJson(ARQ_PROCESSOS, null);
  if (lista === null) {
    const seed = seedProcessos();
    gravarJson(ARQ_PROCESSOS, seed);
    return seed;
  }
  return lista;
}
function salvarProcessos(lista) {
  gravarJson(ARQ_PROCESSOS, lista);
}

module.exports = {
  obterSegredoJwt,
  listarUsuarios,
  salvarUsuarios,
  listarProcessos,
  salvarProcessos
};
