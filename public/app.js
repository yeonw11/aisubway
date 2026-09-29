const LINES={1001:["1호선","#0052A4"],1002:["2호선","#00A84D"],1003:["3호선","#EF7C1C"],1004:["4호선","#00A5DE"],1005:["5호선","#996CAC"],1006:["6호선","#CD7C2F"],1007:["7호선","#747F00"],1008:["8호선","#E6186C"],1009:["9호선","#BDB092"],1063:["경의중앙선","#77C4A3"],1065:["공항철도","#0090D2"],1067:["경춘선","#178C72"],1075:["수인분당선","#F5A200"],1077:["신분당선","#D4003B"],1092:["우이신설선","#B0CE18"],1032:["GTX-A","#9A6292"]};
const $=s=>document.querySelector(s),ln=t=>(LINES[t.subwayId]||["기타","#8aa0bd"])[0],lc=t=>(LINES[t.subwayId]||["기타","#8aa0bd"])[1];
const S={trains:[],line:null,q:"",station:null,sort:["seconds",1],page:0,prev:new Map(),hover:null,stats:null},PER=15,BASE="#38bdf8";
const fmt = s => {
  if (s > 0) {
    return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, "0")}초`;
  }

  return "도착/진입 중";
};
const setAccent=c=>document.documentElement.style.setProperty("--active-line-color",c||BASE);
const el=(t,a={},h="")=>Object.assign(document.createElement(t),a,{innerHTML:h});
const view=()=>S.trains.filter(t=>(!S.line||ln(t)===S.line)&&(!S.q||t.station.includes(S.q)));
setInterval(()=>$("#clock").textContent=new Date().toLocaleTimeString("ko-KR"),1000);

// 야경 빌딩
$("#bld").innerHTML=Array.from({length:26},(_,i)=>{const h=30+(i*37%60),x=i*27;return `<rect x="${x}" y="${138-h}" width="22" height="${h}"/><rect x="${x+5}" y="${146-h}" width="3" height="4" fill="${i%3?"#38bdf8":"#fbbf24"}"><animate attributeName="opacity" values=".2;.9;.2" dur="${2.2+i%5}s" repeatCount="indefinite"/></rect>`}).join("");

// 데이터
async function load(){
  if(location.protocol==="file:"){$("#notice").hidden=false;$("#live").textContent="OFFLINE";$("#live").className="live err";render();return}
  $("#refresh").disabled=true;
  try{
const r=await fetch("/api/subway");if(!r.ok)throw 0;const d=await r.json();

S.trains=d.trains;

if (!S.station && S.trains.length) {
  S.station = S.trains[0].station;
}

$("#live").textContent="LIVE";$("#live").className="live";
    $("#upd").textContent=new Date(d.receivedAt).toLocaleTimeString("ko-KR");
  }catch{$("#live").textContent="DATA ERROR";$("#live").className="live err";$("#upd").textContent="실시간 데이터를 불러오지 못했습니다."}
  $("#refresh").disabled=false;render();
}

function render(){renderFilters();renderKpi();renderTable();renderMap();renderDetail();renderViz()}

function renderFilters(){
  const names=["전체",...new Set(S.trains.map(ln))];
  $("#filters").replaceChildren(...names.map(n=>{const c=(Object.values(LINES).find(l=>l[0]===n)||[0,BASE])[1];
    const b=el("button",{className:"chip"+((S.line||"전체")===n?" on":"")},n);b.style.setProperty("--c",c);b.onclick=()=>selectLine(n==="전체"?null:n);return b}));
}
function selectLine(n){S.line=S.line===n?null:n;S.page=0;setAccent(S.line?colorOf(S.line):null);const b=$("#lineBadge");b.hidden=!S.line;b.textContent=S.line||"";render()}
const colorOf=n=>(Object.values(LINES).find(l=>l[0]===n)||[0,BASE])[1];

let kpiPrev={};
function countTo(node,val,txt){const k=node.dataset.k,from=kpiPrev[k]||0;kpiPrev[k]=val;if(typeof val!=="number"||matchMedia("(prefers-reduced-motion:reduce)").matches){node.textContent=txt;return}
  const t0=performance.now();(function f(t){const p=Math.min(1,(t-t0)/600);node.textContent=Math.round(from+(val-from)*p);if(p<1)requestAnimationFrame(f);else node.textContent=txt})(t0)}
function renderKpi(){
  const v=view(),ok=v.filter(t=>t.seconds>0),min=ok.reduce((a,t)=>Math.min(a,t.seconds),1e9);
  const items=[["수집된 도착정보",v.length,null,"현재 필터 기준"],["데이터가 있는 역",new Set(v.map(t=>t.station)).size,null,"고유 역명"],["포함된 노선",new Set(v.map(ln)).size,null,"고유 호선"],[
  "가장 빠른 도착",
  min < 1e9 ? min : 0,
  min < 1e9
    ? fmt(min)
    : (v.length ? "도착/진입 중" : "N/A"),
  "API 도착 예정 초 값"
],["5분 이내 도착",ok.filter(t=>t.seconds<=300).length,null,"도착 예정 300초 이하"]];
  if(!$("#kpis").children.length)$("#kpis").innerHTML=items.map((_,i)=>`<div class="kpi"><span></span><b data-k="${i}"></b><small></small></div>`).join("");
  [...$("#kpis").children].forEach((c,i)=>{const [a,val,txt,sub]=items[i];c.querySelector("span").textContent=a;c.querySelector("small").textContent=sub;countTo(c.querySelector("b"),val,txt??String(val))})
}

function renderTable(){
  const cols=[["호선",t=>ln(t)],["역명","station"],["방향","direction"],["현재 위치","location"],["종착역","dest"],["도착 예정","seconds"],["도착 상태","message"],["수신 시간","recptnDt"]];
  $("#tbl thead").innerHTML="<tr>"+cols.map((c,i)=>`<th data-i="${i}">${c[0]}</th>`).join("")+"</tr>";
  document.querySelectorAll("#tbl th").forEach(th=>th.onclick=()=>{const k=cols[th.dataset.i][1];S.sort=[k,S.sort[0]===k?-S.sort[1]:1];renderTable()});
  const g=t=>typeof S.sort[0]==="function"?S.sort[0](t):t[S.sort[0]],rows=view().sort((a,b)=>{const x=g(a),y=g(b),ax=x===0&&S.sort[0]==="seconds"?1e9:x,ay=y===0&&S.sort[0]==="seconds"?1e9:y;return(ax>ay?1:ax<ay?-1:0)*S.sort[1]});
  const pages=Math.max(1,Math.ceil(rows.length/PER));S.page=Math.min(S.page,pages-1);
  const nxt=new Map();
  $("#tbl tbody").replaceChildren(...rows.slice(S.page*PER,S.page*PER+PER).map(t=>{const key=t.trainNo+t.station+t.direction;nxt.set(key,t.seconds);
    const tr=el("tr",{className:(t.station===S.station?"sel ":"")+(S.prev.size&&!S.prev.has(key)?"fresh":"")},
      `<td><i class="dot" style="background:${lc(t)}"></i>${ln(t)}</td><td class="st">${t.station}</td><td>${t.direction}</td><td>${t.location||"-"}</td><td>${t.dest||"-"}</td><td class="mono ${t.seconds>0&&t.seconds<60?"fast":t.seconds>=300?"slow":""}">${fmt(t.seconds)}</td><td>${t.message||"-"}</td><td class="mono">${(t.recptnDt||"").slice(11,19)||"-"}</td>`);
    tr.querySelector(".st").onclick=()=>pick(t.station);return tr}));
  S.prev=nxt;$("#pgi").textContent=`${S.page+1} / ${pages} (${rows.length}건)`;
}
$("#prev").onclick=()=>{S.page=Math.max(0,S.page-1);renderTable()};$("#next").onclick=()=>{S.page++;renderTable()};
$("#q").oninput=e=>{S.q=e.target.value.trim();S.page=0;render()};
function pick(st){S.station=st;render();$("#stTitle").scrollIntoView({behavior:"smooth"})}

// 노선 개략도
const PATHS={};let n=0;
function renderMap(){
  const names=[...new Set(S.trains.map(ln))].filter(x=>x!=="기타"),m=$("#map");if(!names.length){m.innerHTML="";return}
  m.innerHTML=names.map((nm,i)=>{const y=30+i*(200/Math.max(names.length-1,1)),c=colorOf(nm);
    return `<path class="ln${S.line===nm?" sel":""}" data-l="${nm}" id="p${i}" style="--c:${c};stroke:${c}" d="M30 ${y} C 200 ${y-22}, 350 ${y+22}, 670 ${y}"/>`}).join("")+"<g id=\"stns\"></g>";
  const g=m.querySelector("#stns");
  names.forEach((nm,i)=>{const p=m.querySelector("#p"+i),L=p.getTotalLength(),sts=[...new Set(S.trains.filter(t=>ln(t)===nm).map(t=>t.station))].slice(0,10);
    sts.forEach((s,j)=>{const pt=p.getPointAtLength(L*(j+.5)/sts.length),c=el("circle",{className:"stn"});c.setAttribute("cx",pt.x);c.setAttribute("cy",pt.y);c.setAttribute("r",5);c.style.setProperty("--c",colorOf(nm));c.dataset.s=s;c.dataset.l=nm;g.appendChild(c)})});
}
const tip=$("#tip");let tx=0,ty=0,cx=0,cy=0;
function lineInfo(nm){const v=S.trains.filter(t=>ln(t)===nm),ok=v.filter(t=>t.seconds>0),avg=ok.length?Math.round(ok.reduce((a,t)=>a+t.seconds,0)/ok.length):0,f=ok.sort((a,b)=>a.seconds-b.seconds)[0];
  return `<b>${nm}</b><br>수집 열차: ${v.length||"데이터 없음"}<br>조회 역: ${new Set(v.map(t=>t.station)).size||"N/A"}<br>평균 도착: ${avg?fmt(avg):"N/A"}<br>가장 빠른 도착: ${f?f.station+" "+fmt(f.seconds):"N/A"}`}
function stnInfo(s,nm){const t=S.trains.filter(x=>x.station===s&&ln(x)===nm&&x.seconds>0).sort((a,b)=>a.seconds-b.seconds)[0];
  return `<b>${s}</b> ${nm}<br>`+(t?`다음 열차: ${fmt(t.seconds)}<br>현재 위치: ${t.location||"N/A"}<br>방향: ${t.direction} (${t.dest||"N/A"}행)`:"현재 도착정보 없음")}
const map=$("#map");
map.addEventListener("pointermove",e=>{const t=e.target,nm=t.dataset&&t.dataset.l;
  if(!nm){out();return}
  map.classList.add("hov");map.querySelectorAll(".ln").forEach(p=>p.classList.toggle("hi",p.dataset.l===nm));setAccent(colorOf(nm));
  tip.style.setProperty("--c",colorOf(nm));tip.innerHTML=t.dataset.s?stnInfo(t.dataset.s,nm):lineInfo(nm);tip.hidden=false;tx=e.clientX+16;ty=e.clientY+16;
  if(tx+tip.offsetWidth>innerWidth-8)tx=e.clientX-16-tip.offsetWidth;if(ty+tip.offsetHeight>innerHeight-8)ty=e.clientY-16-tip.offsetHeight});
function out(){map.classList.remove("hov");map.querySelectorAll(".hi").forEach(p=>p.classList.remove("hi"));setAccent(S.line?colorOf(S.line):null);tip.hidden=true}
map.addEventListener("pointerleave",out);
map.addEventListener("click",e=>{const d=e.target.dataset;if(!d||!d.l)return;if(d.s){pick(d.s)}else selectLine(d.l)});
(function ease(){cx+=(tx-cx)*.18;cy+=(ty-cy)*.18;tip.style.transform=`translate(${cx}px,${cy}px)`;requestAnimationFrame(ease)})();
addEventListener("pointermove",e=>{if(matchMedia("(prefers-reduced-motion:reduce)").matches)return;const r=document.documentElement.style;r.setProperty("--px",((e.clientX/innerWidth-.5)*8).toFixed(1)+"px");r.setProperty("--py",((e.clientY/innerHeight-.5)*6).toFixed(1)+"px")});

// 상세
function renderDetail(){
  $("#stTitle").textContent=`선택 역 상세: ${S.station}`;$("#target").textContent="대상: "+S.station+(S.line?" / "+S.line:"");
  const v=S.trains.filter(t=>t.station===S.station&&(!S.line||ln(t)===S.line)).sort((a,b)=>(a.seconds||1e9)-(b.seconds||1e9));
  $("#detail").innerHTML=v.length?`<div class="cards">${v.map(t=>`<div class="dc" style="--c:${lc(t)}"><b>${ln(t)}</b> · ${t.direction}<br>다음 열차: <span class="mono">${fmt(t.seconds)}</span><br>현재 위치: ${t.location||"N/A"}<br>종착역: ${t.dest||"N/A"}<br>${t.message||"-"}<br><small class="mono">수신 ${(t.recptnDt||"").slice(11,19)||"-"}</small></div>`).join("")}</div>`:"현재 도착정보 없음";
}

// 시각화
function bars(id,rows){const m=Math.max(1,...rows.map(r=>r[1]));$(id).innerHTML=rows.map(r=>`<div class="hb"><span>${r[0]}</span><i style="width:${r[1]/m*100}%;--c:${r[2]||"var(--accent)"}"></i><span class="mono">${r[1]}</span></div>`).join("")||"데이터 없음"}
function renderViz(){const v=view(),by={},st={};v.forEach(t=>{by[ln(t)]=(by[ln(t)]||0)+1;st[t.station]=(st[t.station]||0)+1});
  bars("#v1",Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,c])=>[k,c,colorOf(k)]));
  const b=[0,0,0,0];v.filter(t=>t.seconds>0).forEach(t=>b[t.seconds<120?0:t.seconds<300?1:t.seconds<600?2:3]++);
  bars("#v2",[["0~2분",b[0]],["2~5분",b[1]],["5~10분",b[2]],["10분 이상",b[3]]]);
  bars("#v3",Object.entries(st).sort((a,b)=>b[1]-a[1]).slice(0,10))}

// Claude 분석
const hist=()=>JSON.parse(localStorage.getItem("hist")||"[]");
function renderHist(){$("#hist").innerHTML=hist().map(h=>`<li>${h.time} · ${h.station}${h.line?" ("+h.line+")":""} · ${h.tags.map(t=>`<span class="tag">${t}</span>`).join("")}<br>${h.summary}</li>`).join("")}
$("#run").onclick=async()=>{
  const b=$("#run"),o=$("#out");if(b.disabled)return;b.disabled=true;o.textContent="";o.classList.add("stream");$("#tags").innerHTML="";
  const v=S.trains.filter(t=>t.station===S.station&&(!S.line||ln(t)===S.line)).sort((a,b)=>(a.seconds||1e9)-(b.seconds||1e9));
  const data=`대상 역: ${S.station}\n선택 노선: ${S.line||"전체"}\n현재 시각: ${new Date().toLocaleString("ko-KR")}\n도착정보 ${v.length}건:\n`+v.slice(0,20).map(t=>`- ${ln(t)} ${t.direction} 종착 ${t.dest||"N/A"} / 도착예정 ${t.seconds?fmt(t.seconds):"N/A"} / 위치 ${t.location||"N/A"} / 메시지 ${t.message||"N/A"} / 열차 ${t.trainNo||"N/A"} / 수신 ${t.recptnDt||"N/A"}`).join("\n");
  let text="",ended=false;
  try{
    const r=await fetch("/api/claude",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({system:"당신은 서울 지하철 실시간 도착정보 요약 도우미입니다. 제공된 데이터에 있는 값만 사용해 한국어로 답하세요. 혼잡도, 사고·지연·장애 원인, 미래 예측, 데이터에 없는 사실은 절대 쓰지 마세요. 답변은 반드시 '현재 서울시 실시간 도착정보 데이터를 기준으로 분석했습니다.' 문장으로 시작하세요.",messages:[{role:"user",content:`다음 실시간 도착정보로 ① 현황 요약 ② 가장 빨리 도착하는 열차 ③ 도착 패턴 요약 ④ 이용자가 참고할 실시간 정보 ⑤ 데이터 부족 여부 만 간결히 작성하세요.\n\n${data}`}]})});
    if(!r.ok||!r.body)throw 0;const rd=r.body.getReader(),dec=new TextDecoder();let buf="";
    for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});const parts=buf.split("\n");buf=parts.pop();
      for(const l of parts)if(l.startsWith("data:")){try{const j=JSON.parse(l.slice(5));if(j.type==="content_block_delta"&&j.delta.text){text+=j.delta.text;o.textContent=text}if(j.type==="message_stop")ended=true}catch{}}}
    if(!text)throw 0;if(!ended)throw "cut";
    const sec=v.map(t=>t.seconds).filter(x=>x>0),tags=[v.length?"실시간 "+v.length+"건":"정보부족"];if(sec.length&&Math.min(...sec)<=60)tags.push("1분 내 도착");if(v.length&&!sec.length)tags.push("도착시간 없음");
    $("#tags").innerHTML=tags.map(t=>`<span class="tag">${t}</span>`).join("");
    localStorage.setItem("hist",JSON.stringify([{time:new Date().toLocaleTimeString("ko-KR"),station:S.station,line:S.line,tags,summary:text.replace(/\s+/g," ").slice(0,60)+"…"},...hist()].slice(0,5)));renderHist();
  }catch(e){o.textContent=(text?text+"\n\n":"")+(e==="cut"?"AI 응답이 중간에 중단되었습니다. 다시 시도해주세요.":"AI 분석을 완료하지 못했습니다.")}
  o.classList.remove("stream");b.disabled=false;
};
$("#refresh").onclick=load;renderHist();load();setInterval(load,30000);
