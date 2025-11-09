// index.js
const { Command } = require("commander");
const http = require("http");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");
const superagent = require("superagent");

// ---------------------
// 1) Парсинг аргументів
// ---------------------
const program = new Command();
program
  .requiredOption("-h, --host <host>", "адреса сервера (обов'язково)")     // вимога
  .requiredOption("-p, --port <port>", "порт сервера (обов'язково)")       // вимога
  .requiredOption("-c, --cache <dir>", "шлях до кеш-директорії (обов'язково)"); // вимога
program.parse(process.argv);
const { host, port, cache } = program.opts();

// створити кеш-теку, якщо немає (вимога)
if (!fssync.existsSync(cache)) {
  fssync.mkdirSync(cache, { recursive: true });
}

// ---------------------
// 2) Допоміжні функції
// ---------------------
function getCodeFromUrl(urlPath) {
  // /200 -> "200" ; видаляємо початковий "/"
  const code = (urlPath || "/").replace(/^\/+/, "").trim();
  return code;
}

function filePathForCode(code) {
  return path.join(cache, `${code}.jpg`);
}

function sendPlain(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain" });
  res.end(text);
}

function sendJpeg(res, buf) {
  res.writeHead(200, { "Content-Type": "image/jpeg" });
  res.end(buf);
}

// ---------------------
// 3) HTTP-сервер
// ---------------------
const server = http.createServer(async (req, res) => {
  try {
    const method = req.method.toUpperCase();
    const code = getCodeFromUrl(req.url);

    // Валідація коду мінімальна: хочемо щось на кшталт 3 цифри/більше
    if (!code || !/^\d{3}$/.test(code)) {
      return sendPlain(res, 404, "Not Found");
    }

    const fp = filePathForCode(code);

    if (method === "GET") {
      // 1) спробувати прочитати з кешу
      try {
        const data = await fs.readFile(fp);
        return sendJpeg(res, data); // 200 OK
      } catch {
        // 2) якщо немає у кеші — тягнемо з http.cat (вимога Частина 3)
        try {
          const url = `https://http.cat/${code}`;
          const response = await superagent.get(url).buffer(true).parse((res, cb) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => cb(null, Buffer.concat(chunks)));
          });
          const img = response.body;
          // зберегти в кеш (щоб наступного разу брати з диску)
          await fs.writeFile(fp, img);
          return sendJpeg(res, img); // 200 OK
        } catch {
          return sendPlain(res, 404, "Not Found"); // вимога
        }
      }
    }

    if (method === "PUT") {
      // зчитати тіло запиту та зберегти як картинку
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      await fs.writeFile(fp, body);
      res.writeHead(201, { "Content-Type": "text/plain" }); // вимога: 201 Created
      return res.end("Created");
    }

    if (method === "DELETE") {
      try {
        await fs.unlink(fp);
        return sendPlain(res, 200, "Deleted"); // вимога: 200 OK
      } catch {
        return sendPlain(res, 404, "Not Found"); // вимога
      }
    }

    // інші методи — 405 Method Not Allowed (вимога)
    res.writeHead(405, { "Content-Type": "text/plain" });
    return res.end("Method Not Allowed");
  } catch (err) {
    // загальний непередбачуваний збій
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

// запуск згідно з отриманими --host/--port (вимога)
server.listen(Number(port), host, () => {
  console.log(`Server is listening at http://${host}:${port} (cache: ${cache})`);
});
