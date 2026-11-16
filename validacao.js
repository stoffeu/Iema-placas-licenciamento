const MATERIAIS = [
  "Resíduos Perigosos",
  "Produtos Perigosos",
  "Resíduos da Saúde",
  "Resíduos de Construção Civil",
  "Resíduos não Perigosos"
];

const RE_PROCESSO = /^\d{8}$/;
const RE_LICENCA = /^[A-Z]{3}-\d{3}\/\d{4}$/;
const RE_PLACA = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;
const MAX_VEICULOS = 500;

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function normalizarPlaca(valor) {
  return texto(valor).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatarDocumento(valor) {
  const d = texto(valor).replace(/\D/g, "");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return null;
}

function mascararDocumento(doc) {
  const d = String(doc || "").replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  return doc;
}

function dataValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function validarVeiculo(v) {
  const placa = normalizarPlaca(v && v.placa);
  if (!RE_PLACA.test(placa)) return { erro: `Placa inválida: "${texto(v && v.placa)}". Use ABC1234 ou ABC1D23.` };
  const modelo = texto(v && v.modelo).slice(0, 80) || "Modelo não informado";
  return { veiculo: { placa, modelo } };
}

function validarProcesso(corpo, { exigirNumero }) {
  const erros = {};
  const c = corpo && typeof corpo === "object" ? corpo : {};

  const empresa = texto(c.empresa);
  if (!empresa || empresa.length > 150) erros.empresa = "Informe o nome da empresa ou pessoa (até 150 caracteres).";

  const documento = formatarDocumento(c.documento);
  if (!documento) erros.documento = "Informe um CNPJ (14 dígitos) ou CPF (11 dígitos).";

  const material = texto(c.material);
  if (!MATERIAIS.includes(material)) erros.material = "Selecione um tipo de licença / material válido.";

  const licenca = texto(c.licenca).toUpperCase();
  if (!RE_LICENCA.test(licenca)) erros.licenca = "Use o formato AAA-999/9999 (ex: LAC-134/2026).";

  const validade = texto(c.validade);
  if (!dataValida(validade)) erros.validade = "Informe a data de vencimento da licença.";

  const observacoes = texto(c.observacoes).slice(0, 500);

  let processo;
  if (exigirNumero) {
    processo = texto(c.processo);
    if (!RE_PROCESSO.test(processo)) erros.processo = "O número do processo deve ter exatamente 8 dígitos (ex: 82249932).";
  }

  const veiculos = [];
  if (c.veiculos !== undefined) {
    if (!Array.isArray(c.veiculos) || c.veiculos.length > MAX_VEICULOS) {
      erros.veiculos = `Lista de veículos inválida (máximo de ${MAX_VEICULOS}).`;
    } else {
      const vistas = new Set();
      for (const item of c.veiculos) {
        const r = validarVeiculo(item);
        if (r.erro) { erros.veiculos = r.erro; break; }
        if (vistas.has(r.veiculo.placa)) { erros.veiculos = `A placa ${r.veiculo.placa} foi informada mais de uma vez.`; break; }
        vistas.add(r.veiculo.placa);
        veiculos.push(r.veiculo);
      }
    }
  }

  return {
    erros,
    dados: { processo, empresa, documento, material, licenca, validade, observacoes, veiculos: c.veiculos === undefined ? undefined : veiculos }
  };
}

module.exports = {
  MATERIAIS,
  RE_PROCESSO,
  validarProcesso,
  validarVeiculo,
  mascararDocumento
};
