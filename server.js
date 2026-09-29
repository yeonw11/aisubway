const express = require("express");
const cors = require("cors");
const path = require("path");
const { Readable } = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

const SEOUL_API_KEY = process.env.SEOUL_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL =
  process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "aisubway",
    seoulApiConfigured: Boolean(SEOUL_API_KEY),
    anthropicConfigured: Boolean(ANTHROPIC_API_KEY)
  });
});

/* =========================
   CONFIG CHECK
========================= */

app.get("/api/config-check", (req, res) => {
  res.json({
    seoulApiKey: SEOUL_API_KEY ? "configured" : "missing",
    anthropicApiKey: ANTHROPIC_API_KEY ? "configured" : "missing"
  });
});

/* =========================
   SEOUL SUBWAY API
========================= */

let subwayCache = null;
let subwayCacheTime = 0;

async function fetchSubwayData() {
  if (!SEOUL_API_KEY) {
    throw new Error("SEOUL_API_KEY is not configured");
  }

  // 30초 동안은 이미 받아온 전체 데이터를 재사용
  if (
    subwayCache &&
    Date.now() - subwayCacheTime < 30000
  ) {
    return subwayCache;
  }

  const chunkSize = 100;

  // 먼저 첫 100건을 가져와 전체 개수 확인
  const firstUrl =
    `http://swopenapi.seoul.go.kr/api/subway/` +
    `${SEOUL_API_KEY}/json/realtimeStationArrival/0/${chunkSize}/`;

  const firstResponse = await fetch(firstUrl);

  if (!firstResponse.ok) {
    throw new Error(`Seoul API HTTP ${firstResponse.status}`);
  }

  const firstData = await firstResponse.json();

  const firstList = Array.isArray(firstData.realtimeArrivalList)
    ? firstData.realtimeArrivalList
    : [];

  const totalCount =
    Number(firstData.errorMessage?.total) ||
    Number(firstList[0]?.totalCount) ||
    firstList.length;

  let allList = [...firstList];

  // 나머지 데이터를 100건씩 추가로 가져오기
  for (
    let start = chunkSize;
    start < totalCount;
    start += chunkSize
  ) {
    const end = Math.min(start + chunkSize, totalCount);

    const url =
      `http://swopenapi.seoul.go.kr/api/subway/` +
      `${SEOUL_API_KEY}/json/realtimeStationArrival/${start}/${end}/`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `Seoul API range failed: ${start}-${end}`
      );
      continue;
    }

    const data = await response.json();

    const list = Array.isArray(data.realtimeArrivalList)
      ? data.realtimeArrivalList
      : [];

    allList.push(...list);
  }

  subwayCache = {
    errorMessage: {
      ...(firstData.errorMessage || {}),
      total: totalCount
    },
    realtimeArrivalList: allList
  };

  subwayCacheTime = Date.now();

  return subwayCache;
}
/* =========================
   DEBUG
========================= */

app.get("/debug", async (req, res) => {
  try {
    const data = await fetchSubwayData();

    const list = Array.isArray(data.realtimeArrivalList)
      ? data.realtimeArrivalList
      : [];

    res.json({
      status: "ok",
      seoulApiConfigured: Boolean(SEOUL_API_KEY),
      totalCount: data.errorMessage?.total ?? list.length,
      code: data.errorMessage?.code ?? null,
      message: data.errorMessage?.message ?? null,
      preview: list.slice(0, 3)
    });
  } catch (error) {
    console.error("DEBUG ERROR:", error);

    res.status(500).json({
      status: "error",
      message: "서울시 API 호출에 실패했습니다."
    });
  }
});

/* =========================
   FRONTEND SUBWAY DATA
========================= */

app.get("/api/subway", async (req, res) => {
  try {
    const data = await fetchSubwayData();

    const list = Array.isArray(data.realtimeArrivalList)
      ? data.realtimeArrivalList
      : [];

    const trains = list.map((item) => ({
      subwayId: item.subwayId || "",
      station: item.statnNm || "",
      direction: item.updnLine || "",
      lineDir: item.trainLineNm || "",
      trainNo: item.btrainNo || "",
      dest: item.bstatnNm || "",
      location: item.arvlMsg3 || "",
      message: item.arvlMsg2 || "",
      status: item.arvlCd || "",
      seconds: Number(item.barvlDt) || 0,
      recptnDt: item.recptnDt || "",
      trainStatus: item.btrainSttus || ""
    }));

    res.json({
      receivedAt: new Date().toISOString(),
      trains
    });
  } catch (error) {
    console.error("SEOUL API ERROR:", error);

    res.status(502).json({
      error: "서울시 실시간 데이터를 불러오지 못했습니다."
    });
  }
});

/* =========================
   CLAUDE AI STREAMING
========================= */

app.post("/api/claude", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not configured"
    });
  }

  try {
    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1200,
          stream: true,
          system: req.body.system,
          messages: req.body.messages
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ANTHROPIC ERROR:", response.status, errorText);

      return res.status(502).json({
        error: "AI 분석을 완료하지 못했습니다."
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders();

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error("CLAUDE ERROR:", error);

    res.status(502).json({
      error: "AI 분석을 완료하지 못했습니다."
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`aisubway server running on port ${PORT}`);
});
