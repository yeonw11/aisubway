const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "aisubway",
    seoulApiConfigured: Boolean(process.env.SEOUL_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY)
  });
});

app.get("/api/config-check", (req, res) => {
  res.json({
    seoulApiKey: process.env.SEOUL_API_KEY ? "configured" : "missing",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ? "configured" : "missing"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`aisubway server running on port ${PORT}`);
});
