const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const SEOUL_API_KEY = process.env.SEOUL_API_KEY;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "aisubway",
    seoulApiConfigured: Boolean(SEOUL_API_KEY)
  });
});

/* =========================
   CONFIG CHECK
========================= */

app.get("/api/config-check", (req, res) => {
  res.json({
    seoulApiKey: SEOUL_API_KEY ? "configured" : "missing"
  });
});
/* =========================
   CACHE
========================= */

let subwayCache = null;
let subwayCacheTime = 0;

const CACHE_MS = 30000;

/* =========================
   SEOUL SUBWAY API
========================= */

async function fetchSubwayData() {
  if (!SEOUL_API_KEY) {
    throw new Error("SEOUL_API_KEY is not configured");
  }

  // 30초 동안은 기존 전체 데이터 재사용
  if (
    subwayCache &&
    Date.now() - subwayCacheTime < CACHE_MS
  ) {
    return subwayCache;
  }

  const chunkSize = 100;

  // 첫 100건
  const firstUrl =
    `http://swopenapi.seoul.go.kr/api/subway/` +
    `${SEOUL_API_KEY}/json/realtimeStationArrival/0/100/`;

  const firstResponse = await fetch(firstUrl);

  if (!firstResponse.ok) {
    throw new Error(
      `Seoul API HTTP ${firstResponse.status}`
    );
  }

  const firstData = await firstResponse.json();

  const firstList = Array.isArray(
    firstData.realtimeArrivalList
  )
    ? firstData.realtimeArrivalList
    : [];

  if (!firstList.length) {
    throw new Error(
      firstData?.errorMessage?.message ||
      "Seoul API returned an empty first page"
    );
  }

  const totalCount =
    Number(firstData.errorMessage?.total) ||
    Number(firstList[0]?.totalCount) ||
    firstList.length;

  let allList = [...firstList];

  // 나머지 데이터를 100건씩 순서대로 추가
  for (
    let start = chunkSize;
    start < totalCount;
    start += chunkSize
  ) {
    const end = Math.min(
      start + chunkSize,
      totalCount
    );

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

    const list = Array.isArray(
      data.realtimeArrivalList
    )
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

    const list = Array.isArray(
      data.realtimeArrivalList
    )
      ? data.realtimeArrivalList
      : [];

    res.json({
      status: "ok",
      seoulApiConfigured: Boolean(SEOUL_API_KEY),
      expectedTotal:
        data.errorMessage?.total ?? null,
      loadedCount: list.length,
      code:
        data.errorMessage?.code ?? null,
      message:
        data.errorMessage?.message ?? null,
      preview: list.slice(0, 3)
    });

  } catch (error) {
    console.error(
      "DEBUG ERROR:",
      error.message
    );

    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

/* =========================
   FRONTEND DATA
========================= */

app.get("/api/subway", async (req, res) => {
  try {
    const data = await fetchSubwayData();

    const list = Array.isArray(
      data.realtimeArrivalList
    )
      ? data.realtimeArrivalList
      : [];

    const trains = list.map(item => ({
      subwayId: item.subwayId || "",
      station: item.statnNm || "",
      direction: item.updnLine || "",
      lineDir: item.trainLineNm || "",
      trainNo: item.btrainNo || "",
      dest: item.bstatnNm || "",
      location: item.arvlMsg3 || "",
      message: item.arvlMsg2 || "",
      status: item.arvlCd || "",
      seconds:
        Number(item.barvlDt) || 0,
      recptnDt: item.recptnDt || "",
      trainStatus:
        item.btrainSttus || ""
    }));

    res.json({
      receivedAt:
        new Date().toISOString(),
      count: trains.length,
      trains
    });

  } catch (error) {
    console.error(
      "SEOUL API ERROR:",
      error.message
    );

    res.status(502).json({
      error: "seoul_api_error",
      message: error.message
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `aisubway server running on port ${PORT}`
    );
  }
);
