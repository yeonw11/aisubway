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
   서울시 API 한 구간 요청
========================= */

async function fetchRange(start, end) {
  const url =
    `http://swopenapi.seoul.go.kr/api/subway/` +
    `${SEOUL_API_KEY}/json/realtimeStationArrival/${start}/${end}/`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Seoul API HTTP ${response.status} (${start}-${end})`
    );
  }

  const data = await response.json();

  if (!data || typeof data !== "object") {
    throw new Error(
      `Invalid Seoul API response (${start}-${end})`
    );
  }

  if (
    data.errorMessage &&
    data.errorMessage.code &&
    data.errorMessage.code !== "INFO-000"
  ) {
    throw new Error(
      `${data.errorMessage.code}: ${data.errorMessage.message}`
    );
  }

  return data;
}

/* =========================
   전체 실시간 데이터 요청
   서울시 제한: 1회 최대 1000건
========================= */

async function fetchSubwayData() {
  if (!SEOUL_API_KEY) {
    throw new Error("SEOUL_API_KEY is not configured");
  }

  // 30초 캐시
  if (
    subwayCache &&
    Date.now() - subwayCacheTime < CACHE_MS
  ) {
    return subwayCache;
  }

  // 첫 1000건
  const firstData = await fetchRange(0, 1000);

  const firstList = Array.isArray(
    firstData.realtimeArrivalList
  )
    ? firstData.realtimeArrivalList
    : [];

  if (!firstList.length) {
    throw new Error(
      "Seoul API returned an empty first page"
    );
  }

  // 전체 건수
  const totalCount =
    Number(firstData.errorMessage?.total) ||
    Number(firstList[0]?.totalCount) ||
    firstList.length;

  let allList = [...firstList];

  // 1000건을 넘는 경우 나머지 페이지 생성
  const requests = [];

  for (
    let start = 1000;
    start < totalCount;
    start += 1000
  ) {
    const end = Math.min(
      start + 1000,
      totalCount
    );

    requests.push(
      fetchRange(start, end)
    );
  }

  // 나머지 페이지 병렬 요청
  const pages = await Promise.all(requests);

  for (const page of pages) {
    if (
      Array.isArray(page.realtimeArrivalList)
    ) {
      allList.push(
        ...page.realtimeArrivalList
      );
    }
  }

  if (!allList.length) {
    throw new Error(
      "No subway arrival data received"
    );
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
