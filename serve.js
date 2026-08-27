// Tiny zero-dependency static file server for local preview. Free, no install needed.
const http = require("http");
const fs = require("fs");
const path = require("path");

const port = 8899;
const root = __dirname;
const mime = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png"
};

http.createServer((req, res) => {
  let filePath = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (req.url === "/") filePath = path.join(root, "index.html");
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => console.log("Serving on http://localhost:" + port));
