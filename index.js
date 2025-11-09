// index.js (v3, final)
const { Command } = require("commander");
const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const superagent = require("superagent");

const program = new Command();
program
  .requiredOption("-h, --host <host>")
  .requiredOption("-p, --port <port>")
  .requiredOption("-c, --cache <dir>");
program.parse(process.argv);
const { host, port, cache } = program.opts();

if (!fsSync.existsSync(cache)) fsSync.mkdirSync(cache, { recursive: true });

const CT_JPEG = { "Content-Type": "image/jpeg" };
const CT_TEXT = { "Content-Type": "text/plain" };
const fileForCode = (code) => path.join(cache, `${code}.jpg`);
const codeFromUrl = (u) => (u || "/").replace(/^\/+/, "").trim();

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method.toUpperCase();
    const code = codeFromUrl(req.url);
    if (!/^\d{3}$/.test(code)) {
      res.writeHead(404, CT_TEXT); return res.end("Not Found");
    }
    const fp = fileForCode(code);

    if (method === "GET") {
      // 1) спроба віддати з кешу
      try {
        const buf = await fs.readFile(fp);
        res.writeHead(200, CT_JPEG); return res.end(buf);
      } catch {
        // 2) cache miss -> тягнемо з http.cat, зберігаємо, віддаємо
        try {
          const url = `https://http.cat/${code}`;
          const response = await superagent
            .get(url).buffer(true)
            .parse((ires, cb) => {
              const chunks = [];
              ires.on("data", (c) => chunks.push(c));
              ires.on("end", () => cb(null, Buffer.concat(chunks)));
            });
          const img = response.body;
          await fs.writeFile(fp, img);
          res.writeHead(200, CT_JPEG); return res.end(img);
        } catch {
          res.writeHead(404, CT_TEXT); return res.end("Not Found");
        }
      }
    }

    if (method === "PUT") {
      const chunks = []; for await (const ch of req) chunks.push(ch);
      await fs.writeFile(fp, Buffer.concat(chunks));
      res.writeHead(201, CT_TEXT); return res.end("Created");
    }

    if (method === "DELETE") {
      try {
        await fs.unlink(fp);
        res.writeHead(200, CT_TEXT); return res.end("Deleted");
      } catch {
        res.writeHead(404, CT_TEXT); return res.end("Not Found");
      }
    }

    res.writeHead(405, CT_TEXT); return res.end("Method Not Allowed");
  } catch {
    res.writeHead(500, CT_TEXT); return res.end("Internal Server Error");
  }
});

server.listen(Number(port), host, () => {
  console.log(`Server: http://${host}:${port} (cache: ${cache})`);
});
