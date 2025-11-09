// index.js (v2)
const { Command } = require("commander");
const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const program = new Command();
program
  .requiredOption("-h, --host <host>")
  .requiredOption("-p, --port <port>")
  .requiredOption("-c, --cache <dir>");
program.parse(process.argv);
const { host, port, cache } = program.opts();

if (!fsSync.existsSync(cache)) fsSync.mkdirSync(cache, { recursive: true });

const contentTypeJpeg = { "Content-Type": "image/jpeg" };
const contentTypeText = { "Content-Type": "text/plain" };
const fileForCode = (code) => path.join(cache, `${code}.jpg`);
const codeFromUrl = (u) => (u || "/").replace(/^\/+/, "").trim();

const server = http.createServer(async (req, res) => {
  const method = req.method.toUpperCase();
  const code = codeFromUrl(req.url);

  if (!/^\d{3}$/.test(code)) {
    res.writeHead(404, contentTypeText); return res.end("Not Found");
  }

  const fp = fileForCode(code);

  try {
    if (method === "GET") {
      const buf = await fs.readFile(fp);
      res.writeHead(200, contentTypeJpeg); return res.end(buf);
    }

    if (method === "PUT") {
      const chunks = []; for await (const ch of req) chunks.push(ch);
      await fs.writeFile(fp, Buffer.concat(chunks));
      res.writeHead(201, contentTypeText); return res.end("Created");
    }

    if (method === "DELETE") {
      await fs.unlink(fp);
      res.writeHead(200, contentTypeText); return res.end("Deleted");
    }

    res.writeHead(405, contentTypeText); return res.end("Method Not Allowed");
  } catch (_) {
    res.writeHead(404, contentTypeText); return res.end("Not Found");
  }
});

server.listen(Number(port), host, () => {
  console.log(`http://${host}:${port} (cache: ${cache})`);
});
