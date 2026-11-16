const bcrypt = require("bcryptjs");
const db = require("./db");

const [usuario, senha] = process.argv.slice(2);

if (!usuario || !senha) {
  console.error("Uso: npm run admin -- <usuario> <senha>");
  process.exit(1);
}
if (senha.length < 8) {
  console.error("A senha precisa ter pelo menos 8 caracteres.");
  process.exit(1);
}

const lista = db.listarUsuarios();
const hash = bcrypt.hashSync(senha, 10);
const i = lista.findIndex((u) => u.usuario === usuario);

if (i === -1) {
  lista.push({ usuario, senhaHash: hash, criadoEm: new Date().toISOString() });
  console.log(`Administrador "${usuario}" criado.`);
} else {
  lista[i].senhaHash = hash;
  console.log(`Senha de "${usuario}" redefinida.`);
}
db.salvarUsuarios(lista);
