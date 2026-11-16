const path = require("path");
const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const db = require("./db");
const { RE_PROCESSO, validarProcesso, validarVeiculo, mascararDocumento } = require("./validacao");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const JWT_SEGREDO = db.obterSegredoJwt();
const JWT_VALIDADE = process.env.JWT_EXPIRES_IN || "8h";

function garantirAdministrador() {
  if (db.listarUsuarios().length > 0) return;
  const usuario = process.env.ADMIN_USER || "admin";
  const informada = process.env.ADMIN_PASSWORD;
  const senha = informada || crypto.randomBytes(9).toString("base64url");
  db.salvarUsuarios([{ usuario, senhaHash: bcrypt.hashSync(senha, 10), criadoEm: new Date().toISOString() }]);
  console.log("\n  Primeiro administrador criado.");
  console.log(`  Usuário: ${usuario}`);
  if (!informada) {
    console.log(`  Senha:   ${senha}   (anote agora — ela não será exibida novamente)`);
    console.log("  Para trocar: npm run admin -- <usuario> <nova-senha>\n");
  } else {
    console.log("  Senha:   a definida em ADMIN_PASSWORD\n");
  }
}
garantirAdministrador();

const HASH_FALSO = bcrypt.hashSync("senha-falsa-para-igualar-tempo", 10);

const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;
const tentativas = new Map();

function bloqueado(ip) {
  const t = tentativas.get(ip);
  if (!t) return 0;
  if (t.ate && t.ate > Date.now()) return Math.ceil((t.ate - Date.now()) / 1000);
  if (t.ate && t.ate <= Date.now()) tentativas.delete(ip);
  return 0;
}
function registrarFalha(ip) {
  const t = tentativas.get(ip) || { falhas: 0, ate: 0 };
  t.falhas += 1;
  if (t.falhas >= MAX_FALHAS) t.ate = Date.now() + BLOQUEIO_MS;
  tentativas.set(ip, t);
}

function lerToken(req) {
  const h = req.get("authorization") || "";
  const m = /^Bearer (.+)$/i.exec(h);
  return m ? m[1] : null;
}
function verificarToken(token) {
  try {
    const p = jwt.verify(token, JWT_SEGREDO, { algorithms: ["HS256"] });
    if (p.role === "admin" && db.listarUsuarios().some((u) => u.usuario === p.sub)) return p;
  } catch (e) { }
  return null;
}

function autenticacaoOpcional(req, res, next) {
  const token = lerToken(req);
  req.admin = token ? verificarToken(token) : null;
  next();
}
function exigirAdmin(req, res, next) {
  const token = lerToken(req);
  if (!token) return res.status(401).json({ erro: "Autenticação necessária." });
  const p = verificarToken(token);
  if (!p) return res.status(401).json({ erro: "Sessão inválida ou expirada. Faça login novamente." });
  req.admin = p;
  next();
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin"
  });
  next();
});
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "public")));

function paraCliente(p, admin) {
  return admin ? p : { ...p, documento: mascararDocumento(p.documento) };
}
function achar(lista, numero) {
  return lista.findIndex((p) => p.processo === numero);
}
function numeroValido(req, res, next) {
  if (!RE_PROCESSO.test(req.params.numero)) return res.status(404).json({ erro: "Processo não encontrado." });
  next();
}

app.post("/api/login", async (req, res) => {
  const ip = req.ip;
  const espera = bloqueado(ip);
  if (espera) {
    res.set("Retry-After", String(espera));
    return res.status(429).json({ erro: `Muitas tentativas. Tente novamente em ${Math.ceil(espera / 60)} minuto(s).` });
  }

  const usuario = typeof req.body.usuario === "string" ? req.body.usuario.trim().slice(0, 100) : "";
  const senha = typeof req.body.senha === "string" ? req.body.senha.slice(0, 200) : "";
  const registro = db.listarUsuarios().find((u) => u.usuario === usuario);
  const confere = await bcrypt.compare(senha, registro ? registro.senhaHash : HASH_FALSO);

  if (!registro || !confere) {
    registrarFalha(ip);
    return res.status(401).json({ erro: "Usuário ou senha incorretos." });
  }
  tentativas.delete(ip);
  const token = jwt.sign({ role: "admin" }, JWT_SEGREDO, { algorithm: "HS256", subject: registro.usuario, expiresIn: JWT_VALIDADE });
  res.json({ token, usuario: registro.usuario });
});

app.get("/api/me", exigirAdmin, (req, res) => {
  res.json({ usuario: req.admin.sub, role: req.admin.role });
});

app.get("/api/processos", autenticacaoOpcional, (req, res) => {
  res.json({ processos: db.listarProcessos().map((p) => paraCliente(p, req.admin)) });
});

app.get("/api/processos/:numero", numeroValido, autenticacaoOpcional, (req, res) => {
  const p = db.listarProcessos().find((x) => x.processo === req.params.numero);
  if (!p) return res.status(404).json({ erro: "Processo não encontrado." });
  res.json({ processo: paraCliente(p, req.admin) });
});

app.post("/api/processos", exigirAdmin, (req, res) => {
  const { erros, dados } = validarProcesso(req.body, { exigirNumero: true });
  if (Object.keys(erros).length) return res.status(400).json({ erro: "Dados inválidos.", erros });

  const lista = db.listarProcessos();
  if (achar(lista, dados.processo) !== -1) {
    return res.status(409).json({ erro: `Já existe um processo com o número ${dados.processo}.`, processo: dados.processo });
  }
  const agora = new Date().toISOString();
  const novo = { ...dados, veiculos: dados.veiculos || [], criadoEm: agora, atualizadoEm: agora };
  lista.push(novo);
  db.salvarProcessos(lista);
  res.status(201).json({ processo: novo });
});

app.put("/api/processos/:numero", numeroValido, exigirAdmin, (req, res) => {
  const lista = db.listarProcessos();
  const i = achar(lista, req.params.numero);
  if (i === -1) return res.status(404).json({ erro: "Processo não encontrado." });

  const { erros, dados } = validarProcesso(req.body, { exigirNumero: false });
  if (Object.keys(erros).length) return res.status(400).json({ erro: "Dados inválidos.", erros });

  const atual = lista[i];
  lista[i] = {
    ...atual,
    empresa: dados.empresa,
    documento: dados.documento,
    material: dados.material,
    licenca: dados.licenca,
    validade: dados.validade,
    observacoes: dados.observacoes,
    veiculos: dados.veiculos === undefined ? atual.veiculos : dados.veiculos,
    atualizadoEm: new Date().toISOString()
  };
  db.salvarProcessos(lista);
  res.json({ processo: lista[i] });
});

app.delete("/api/processos/:numero", numeroValido, exigirAdmin, (req, res) => {
  const lista = db.listarProcessos();
  const i = achar(lista, req.params.numero);
  if (i === -1) return res.status(404).json({ erro: "Processo não encontrado." });
  lista.splice(i, 1);
  db.salvarProcessos(lista);
  res.status(204).end();
});

app.post("/api/processos/:numero/veiculos", numeroValido, exigirAdmin, (req, res) => {
  const lista = db.listarProcessos();
  const i = achar(lista, req.params.numero);
  if (i === -1) return res.status(404).json({ erro: "Processo não encontrado." });

  const r = validarVeiculo(req.body);
  if (r.erro) return res.status(400).json({ erro: r.erro });
  if (lista[i].veiculos.some((v) => v.placa === r.veiculo.placa)) {
    return res.status(409).json({ erro: `A placa ${r.veiculo.placa} já está neste processo.` });
  }
  lista[i].veiculos.push(r.veiculo);
  lista[i].atualizadoEm = new Date().toISOString();
  db.salvarProcessos(lista);
  res.status(201).json({ processo: lista[i] });
});

app.delete("/api/processos/:numero/veiculos/:placa", numeroValido, exigirAdmin, (req, res) => {
  const lista = db.listarProcessos();
  const i = achar(lista, req.params.numero);
  if (i === -1) return res.status(404).json({ erro: "Processo não encontrado." });

  const placa = req.params.placa.toUpperCase();
  const j = lista[i].veiculos.findIndex((v) => v.placa === placa);
  if (j === -1) return res.status(404).json({ erro: "Veículo não encontrado neste processo." });
  lista[i].veiculos.splice(j, 1);
  lista[i].atualizadoEm = new Date().toISOString();
  db.salvarProcessos(lista);
  res.json({ processo: lista[i] });
});

app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ erro: "JSON inválido." });
  if (err.type === "entity.too.large") return res.status(413).json({ erro: "Requisição grande demais." });
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`IEMA Licenciamento rodando em http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  });
}

module.exports = app;
