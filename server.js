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
   CONFIG
========================= */

app.get("/api/config-check", (req, res) => {
  res.json({
    seoulApiKey: SEOUL_API_KEY ? "configured" : "missing"
  });
});

/* =========================
   FALLBACK DATA
========================= */

const FALLBACK_STATIONS = [
  { station: "서울역", subwayId: "1001" },
  { station: "시청", subwayId: "1001" },
  { station: "종각", subwayId: "1001" },
  { station: "종로3가", subwayId: "1001" },
  { station: "동대문", subwayId: "1001" },
  { station: "신설동", subwayId: "1001" },
  { station: "청량리", subwayId: "1001" },
  { station: "회기", subwayId: "1001" },

  { station: "강남", subwayId: "1002" },
  { station: "역삼", subwayId: "1002" },
  { station: "선릉", subwayId: "1002" },
  { station: "삼성", subwayId: "1002" },
  { station: "잠실", subwayId: "1002" },
  { station: "건대입구", subwayId: "1002" },
  { station: "성수", subwayId: "1002" },
  { station: "왕십리", subwayId: "1002" },
  { station: "신촌", subwayId: "1002" },
  { station: "홍대입구", subwayId: "1002" },

  { station: "경복궁", subwayId: "1003" },
  { station: "안국", subwayId: "1003" },
  { station: "충무로", subwayId: "1003" },
  { station: "압구정", subwayId: "1003" },
  { station: "신사", subwayId: "1003" },

  { station: "혜화", subwayId: "1004" },
  { station: "명동", subwayId: "1004" },
  { station: "서울역", subwayId: "1004" },
  { station: "사당", subwayId: "1004" },
  { station: "동작", subwayId: "1004" },

  { station: "광화문", subwayId: "1005" },
  { station: "여의도", subwayId: "1005" },
  { station: "공덕", subwayId: "1005" },
  { station: "왕십리", subwayId: "1005" },

  { station: "이태원", subwayId: "1006" },
  { station: "한강진", subwayId: "1006" },
  { station: "공덕", subwayId: "1006" },

  { station: "고속터미널", subwayId: "1007" },
  { station: "건대입구", subwayId: "1007" },
  { station: "노원", subwayId: "1007" },

  { station: "잠실", subwayId: "1008" },
  { station: "천호", subwayId: "1008" },

  { station: "여의도", subwayId: "1009" },
  { station: "고속터미널", subwayId: "1009" },
  { station: "신논현", subwayId: "1009" },

  { station: "회기", subwayId: "1063" },
  { station: "왕십리", subwayId: "1063" },
  { station: "청량리", subwayId: "1063" },
  { station: "홍대입구", subwayId: "1063" },

  { station: "회기", subwayId: "1067" },
  { station: "청량리", subwayId: "1067" },

  { station: "왕십리", subwayId: "1075" },
  { station: "선릉", subwayId: "1075" },

  { station: "강남", subwayId: "1077" },
  { station: "신논현", subwayId: "1077" }
];

const DESTINATIONS = [
  "서울역",
  "청량리",
  "인천",
  "신도림",
  "성수",
  "잠실",
  "강남",
  "사당",
  "당고개",
  "오금"
];

function makeFallbackData() {
  const trains = [];

  for (let i = 0; i < 3105; i++) {
    const s =
      FALLBACK_STATIONS[
        i % FALLBACK_STATIONS.length
      ];

    const seconds =
      20 + ((i * 37) % 900);

    trains.push({
      subwayId: s.subwayId,
      station: s.station,
      direction:
        i % 2 === 0 ? "상행" : "하행",
      lineDir:
        DESTINATIONS[
          i % DESTINATIONS.length
        ] + "행",
      trainNo: String(1000 + i),
      dest:
        DESTINATIONS[
          i % DESTINATIONS.length
        ],
      location:
        i % 3 === 0
          ? "전역 출발"
          : i % 3 === 1
          ? "전역 도착"
          : "진입 중",
      message:
        seconds < 60
          ? "곧 도착"
          : `${Math.ceil(seconds / 60)}분 후 도착`,
      status:
        seconds < 60 ? "1" : "0",
      seconds,
      recptnDt:
        new Date().toISOString(),
      trainStatus: ""
    });
  }

  return trains;
}

/* =========================
   LIVE API
========================= */

let cache = null;
let cacheTime = 0;

async function fetchLiveData() {
  if (!SEOUL_API_KEY) {
    return null;
  }

  if (
    cache &&
    Date.now() - cacheTime < 60000
  ) {
    return cache;
  }

  try {
    const url =
      `http://swopenapi.seoul.go.kr/api/subway/` +
      `${SEOUL_API_KEY}/json/realtimeStationArrival/0/100/`;

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    const list = Array.isArray(
      data.realtimeArrivalList
    )
      ? data.realtimeArrivalList
      : [];

    if (!list.length) {
      return null;
    }

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

    cache = trains;
    cacheTime = Date.now();

    return trains;

  } catch (error) {
    console.error(
      "LIVE API ERROR:",
      error.message
    );

    return null;
  }
}

/* =========================
   DEBUG
========================= */

app.get("/debug", async (req, res) => {
  const live = await fetchLiveData();

  if (live && live.length) {
    return res.json({
      status: "ok",
      source: "live",
      loadedCount: live.length,
      preview: live.slice(0, 3)
    });
  }

  const fallback =
    makeFallbackData();

  res.json({
    status: "ok",
    source: "fallback-demo",
    loadedCount:
      fallback.length,
    preview:
      fallback.slice(0, 3)
  });
});

/* =========================
   FRONTEND DATA
========================= */

app.get("/api/subway", async (req, res) => {
  const live =
    await fetchLiveData();

  if (live && live.length) {
    return res.json({
      receivedAt:
        new Date().toISOString(),
      source: "live",
      count: live.length,
      trains: live
    });
  }

  const fallback =
    makeFallbackData();

  res.json({
    receivedAt:
      new Date().toISOString(),
    source: "fallback-demo",
    count:
      fallback.length,
    trains:
      fallback
  });
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
