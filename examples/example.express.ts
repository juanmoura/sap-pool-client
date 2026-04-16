import { SapClient } from "@itssolutions/sap-pool-client";

const pool = new SapClient({
  user: "seu_usuario",
  passwd: "sua_senha",
  ashost: "localhost",
  sysnr: "00",
  client: "100",
  lang: "PT",
});

// exporta sempre a mesma instância
module.exports = pool;
