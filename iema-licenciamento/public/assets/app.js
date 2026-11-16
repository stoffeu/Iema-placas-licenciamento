const IEMA_TOKEN_KEY = "iema_token";

function iemaLerToken() {
  try { return localStorage.getItem(IEMA_TOKEN_KEY); } catch (e) { return null; }
}
function iemaSalvarToken(token) {
  try { localStorage.setItem(IEMA_TOKEN_KEY, token); } catch (e) { }
}
function iemaLimparToken() {
  try { localStorage.removeItem(IEMA_TOKEN_KEY); } catch (e) { }
}

function iemaDecodificarToken(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function iemaSessao() {
  const token = iemaLerToken();
  if (!token) return null;
  const p = iemaDecodificarToken(token);
  if (!p || !p.exp || p.exp * 1000 <= Date.now()) {
    iemaLimparToken();
    return null;
  }
  return { usuario: p.sub, expira: p.exp * 1000 };
}
function iemaEstaLogado() {
  return iemaSessao() !== null;
}

function iemaPaginaAtual() {
  return (location.pathname.split("/").pop() || "index.html") + location.search;
}

function iemaExigirAdmin() {
  if (iemaEstaLogado()) return true;
  location.replace("login.html?next=" + encodeURIComponent(iemaPaginaAtual()));
  return false;
}
function iemaSessaoExpirada() {
  iemaLimparToken();
  location.replace("login.html?expirou=1&next=" + encodeURIComponent(iemaPaginaAtual()));
}
function iemaSair() {
  iemaLimparToken();
  location.href = "index.html";
}

async function iemaApi(caminho, { metodo = "GET", corpo } = {}) {
  const headers = {};
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  const token = iemaLerToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  let resp;
  try {
    resp = await fetch(caminho, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined
    });
  } catch (e) {
    const erro = location.protocol === "file:"
      ? "Esta página foi aberta direto do arquivo. Inicie o servidor com npm start e acesse http://localhost:3000."
      : "Não foi possível conectar ao servidor. Verifique se ele está rodando (npm start).";
    return { ok: false, status: 0, dados: { erro } };
  }
  let dados = null;
  try { dados = await resp.json(); } catch (e) { }
  if (!resp.ok && dados === null) {
    dados = { erro: "Este endereço não é o servidor do sistema. Inicie-o com npm start e acesse http://localhost:3000." };
  }
  return { ok: resp.ok, status: resp.status, dados };
}

const iemaLogin = (usuario, senha) => iemaApi("/api/login", { metodo: "POST", corpo: { usuario, senha } });
const iemaListar = () => iemaApi("/api/processos");
const iemaObter = (numero) => iemaApi("/api/processos/" + encodeURIComponent(numero));
const iemaCriar = (dados) => iemaApi("/api/processos", { metodo: "POST", corpo: dados });
const iemaAtualizar = (numero, dados) => iemaApi("/api/processos/" + encodeURIComponent(numero), { metodo: "PUT", corpo: dados });
const iemaExcluir = (numero) => iemaApi("/api/processos/" + encodeURIComponent(numero), { metodo: "DELETE" });
const iemaAdicionarVeiculo = (numero, veiculo) =>
  iemaApi("/api/processos/" + encodeURIComponent(numero) + "/veiculos", { metodo: "POST", corpo: veiculo });
const iemaRemoverVeiculo = (numero, placa) =>
  iemaApi("/api/processos/" + encodeURIComponent(numero) + "/veiculos/" + encodeURIComponent(placa), { metodo: "DELETE" });

function iemaValidarProcesso(valor) { return /^\d{8}$/.test(String(valor || "").trim()); }
function iemaValidarLicenca(valor) { return /^[A-Za-z]{3}-\d{3}\/\d{4}$/.test(String(valor || "").trim()); }
function iemaNormalizarPlaca(valor) { return String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function iemaValidarPlaca(valor) { return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(iemaNormalizarPlaca(valor)); }
function iemaValidarDocumento(valor) {
  const n = String(valor || "").replace(/\D/g, "").length;
  return n === 11 || n === 14;
}

function iemaFormatarDataBR(isoDate) {
  if (!isoDate) return "—";
  const [ano, mes, dia] = isoDate.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : isoDate;
}

function iemaEscapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function iemaRenderAuth() {
  const el = document.getElementById("authSlot");
  if (!el) return;
  const s = iemaSessao();
  if (s) {
    el.innerHTML = `${iemaEscapeHtml(s.usuario)} · <a href="#" id="btnSair">Sair</a>`;
    document.getElementById("btnSair").addEventListener("click", (e) => { e.preventDefault(); iemaSair(); });
  } else {
    el.innerHTML = `<a href="login.html?next=${encodeURIComponent(iemaPaginaAtual())}">Administrador</a>`;
  }
}
document.addEventListener("DOMContentLoaded", iemaRenderAuth);

function iemaNormalizarTexto(str) {
  return String(str == null ? "" : str)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function iemaFiltrar(lista, termo) {
  const t = iemaNormalizarTexto(termo);
  if (!t) return lista;
  const tDigitos = t.replace(/\D/g, "");
  const tAlfaNum = t.replace(/[^a-z0-9]/g, "");

  return lista.filter((p) => {
    const campos = [p.processo, p.empresa, p.licenca, p.material, p.observacoes].map(iemaNormalizarTexto);
    if (campos.some((c) => c.includes(t))) return true;
    if (tDigitos.length >= 3 && String(p.documento).replace(/\D/g, "").includes(tDigitos)) return true;
    return p.veiculos.some((v) =>
      (tAlfaNum && iemaNormalizarPlaca(v.placa).toLowerCase().includes(tAlfaNum)) ||
      iemaNormalizarTexto(v.modelo).includes(t)
    );
  });
}
