// =====================================================
// Apps Script 웹앱 URL
// 배포 후 받은 URL로 교체하세요
// =====================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz5YsOf8T0ehx-IhZ3D702lU53L20BzLCeS0d7OrjFVE0iZvqgFvFDvir7MdPkHezyfOw/exec";

// =====================================================
// Firebase 설정
// =====================================================
const firebaseConfig = {
  apiKey: "AIzaSyBJYjgM5bF-i0spqmYFzwSz0rXrSJsFXH4",
  authDomain: "jefferson-davis-c40d1.firebaseapp.com",
  databaseURL: "https://jefferson-davis-c40d1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jefferson-davis-c40d1",
  storageBucket: "jefferson-davis-c40d1.firebasestorage.app",
  messagingSenderId: "981476340214",
  appId: "1:981476340214:web:2a641f7f79c27ad4b2d7d7",
  measurementId: "G-YJ3GKC67YM"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let currentUser = null;
let currentUtterance = null;
let visitedRegions = {}; // { sanitizedKey: { regionName, story, visitedAt } }

// ===================== 화면 요소 =====================
const loginScreen   = document.getElementById('loginScreen');
const mainScreen    = document.getElementById('mainScreen');
const myPageScreen  = document.getElementById('myPageScreen');
const storyModal    = document.getElementById('storyModal');

// =====================================================
// Realtime Database 키 안전화
// RTDB 경로에는 . # $ [ ] / 사용 불가
// =====================================================
function sanitizeDocId(regionName) {
  return regionName
    .replace(/\//g, '-')
    .replace(/\s+/g, '_')
    .replace(/[.#$\[\]]/g, '')
    .substring(0, 200);
}

// ===================== Google 로그인 =====================
document.getElementById('googleLoginBtn').addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .catch(err => showError(err.message));
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  auth.signOut();
});

// ===================== 로그인 상태 감지 =====================
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    document.getElementById('userEmail').innerText = user.email;
    loginScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    myPageScreen.classList.add('hidden');
    initMap();
    refreshMap();
    loadVisitedRegions();
  } else {
    currentUser = null;
    loginScreen.classList.remove('hidden');
    mainScreen.classList.add('hidden');
    myPageScreen.classList.add('hidden');
  }
});

// ===================== 지역명 영→한 매핑 =====================
const COUNTRY_NAME_KO = {
  "South Korea": "대한민국", "Republic of Korea": "대한민국", "Korea": "대한민국",
  "China": "중국", "Japan": "일본",
  "United States of America": "미국", "United States": "미국", "USA": "미국",
  "Mexico": "멕시코", "Brazil": "브라질", "Peru": "페루",
  "France": "프랑스", "Germany": "독일", "Italy": "이탈리아",
  "Spain": "스페인", "United Kingdom": "영국", "UK": "영국", "Greece": "그리스",
  "Turkey": "튀르키예", "Russia": "러시아", "India": "인도",
  "Iran": "이란", "Iraq": "이라크", "Egypt": "이집트", "Israel": "이스라엘",
  "Vietnam": "베트남", "Mongolia": "몽골", "Indonesia": "인도네시아",
  "Cambodia": "캄보디아", "Ethiopia": "에티오피아", "Australia": "호주",
  "Canada": "캐나다", "Argentina": "아르헨티나", "Chile": "칠레",
  "Colombia": "콜롬비아", "Saudi Arabia": "사우디아라비아", "Pakistan": "파키스탄",
  "Bangladesh": "방글라데시", "Thailand": "태국", "Malaysia": "말레이시아",
  "Philippines": "필리핀", "Myanmar": "미얀마", "Nepal": "네팔",
  "Afghanistan": "아프가니스탄", "Ukraine": "우크라이나", "Poland": "폴란드",
  "Netherlands": "네덜란드", "Belgium": "벨기에", "Sweden": "스웨덴",
  "Norway": "노르웨이", "Denmark": "덴마크", "Finland": "핀란드",
  "Portugal": "포르투갈", "Austria": "오스트리아", "Switzerland": "스위스",
  "Czech Republic": "체코", "Romania": "루마니아", "Hungary": "헝가리",
  "Morocco": "모로코", "Algeria": "알제리", "South Africa": "남아프리카공화국",
  "Kenya": "케냐", "Nigeria": "나이지리아", "Sudan": "수단",
  "Libya": "리비아", "New Zealand": "뉴질랜드"
};

function buildRegionLabel(feature) {
  const props = feature.properties;
  const provinceName = props.name || props.gn_name || props.woe_name || '알수없음';
  const countryNameEn = props.admin || props.geonunit || '';
  const countryNameKo = COUNTRY_NAME_KO[countryNameEn] || countryNameEn;

  if (countryNameKo) {
    return `${countryNameKo} ${provinceName}`.trim();
  }
  return provinceName.trim();
}

// ===================== 지도 초기화 =====================
const GEOJSON_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson";

let leafletMap = null;
let geoLayer = null;
const countryLayers = {}; // { 지역레이블: layer }

function initMap() {
  if (leafletMap) return;

  leafletMap = L.map('leafletMap', {
    worldCopyJump: false,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0,
    minZoom: 2
  }).setView([20, 30], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
    noWrap: true
  }).addTo(leafletMap);

  fetch(GEOJSON_URL)
    .then(res => res.json())
    .then(geojson => {
      geoLayer = L.geoJSON(geojson, {
        className: 'country-layer',
        onEachFeature: (feature, layer) => {
          const label = buildRegionLabel(feature);
          countryLayers[label] = layer;

          layer.on('click', () => {
            openStoryModal(label);
          });

          // 방문한 지역이면 즉시 녹색으로 표시
          const key = sanitizeDocId(label);
          if (visitedRegions[key]) {
            layer.setStyle({ fillColor: '#27ae60', fillOpacity: 0.35, color: '#27ae60' });
          }
        }
      }).addTo(leafletMap);
    })
    .catch(err => {
      console.error('지도 데이터를 불러오지 못했습니다:', err);
    });
}

function refreshMap() {
  if (leafletMap) {
    setTimeout(() => leafletMap.invalidateSize(), 100);
  }
}

function markVisited(regionName) {
  const layer = countryLayers[regionName];
  if (layer) {
    layer.setStyle({ fillColor: '#27ae60', fillOpacity: 0.35, color: '#27ae60' });
  }
}

// =====================================================================
// 고정 스토리 테이블 (독일, 프랑스, 이탈리아 등 포함)
// =====================================================================
const FIXED_STORIES = {
  "독일 Bavaria": `1923년 11월 8일, 뮌헨의 뷔르거브로이켈러 맥주홀에서 아돌프 히틀러가 쿠데타를 선언했어요. 바로 그 유명한 '맥주홀 폭동(Beer Hall Putsch)'이랍니다. 히틀러는 권총을 천장에 쏘며 "국민혁명이 시작됐다!"고 외쳤지만, 다음 날 경찰에게 진압되어 체포되고 말았어요. 하지만 감옥 안에서 《나의 투쟁》을 집필하며 오히려 전국적인 유명인사가 되었고, 10년 후 결국 독일의 권력을 손에 쥐게 됐답니다.`,
  "독일 Berlin": `1945년 4월 30일, 소련군이 베를린을 포위한 가운데 히틀러는 지하 총통 벙커에서 스스로 목숨을 끊었어요. 불과 며칠 뒤인 5월 2일, 베를린 수비대는 항복했고 12년간 유럽을 공포에 몰아넣은 나치 제국은 완전히 무너졌답니다. 소련군 병사가 국회의사당 지붕에 붉은 깃발을 꽂는 장면은 2차 세계대전 유럽 전선의 종전을 알리는 역사의 상징이 됐어요.`,
  "독일 Saxony": `드레스덴은 '엘베강의 피렌체'라 불릴 만큼 아름다운 도시였어요. 그런데 1945년 2월 13일부터 15일, 영국·미국 공군의 폭격기 수천 대가 도심을 불바다로 만들었답니다. 사망자는 2만 5천 명에 달했고, 고딕 성당과 바로크 궁전들이 잿더미로 변했어요. 전쟁이 거의 끝나가던 시점의 폭격이라 '과연 필요했는가'라는 논쟁이 지금도 이어지고 있어요.`,
  "독일 Nuremberg": `뉘른베르크는 나치 당대회의 무대였지만, 전쟁이 끝난 뒤 역사의 법정이 열린 곳이기도 해요. 1945년 11월부터 1946년 10월까지, 괴링·리벤트로프 등 나치 전범 24명이 이 도시의 법정에서 전쟁범죄와 반인도적 범죄로 재판을 받았답니다. 이 '뉘른베르크 재판'은 개인이 국가 명령을 이유로 전쟁범죄를 면죄받을 수 없다는 국제법의 초석을 놓았어요.`,
  "폴란드 Masovian Voivodeship": `1939년 9월 1일 새벽, 독일군 전차와 폭격기가 국경을 넘어 폴란드를 침공했어요. 이틀 뒤 영국과 프랑스가 독일에 선전포고하면서 2차 세계대전이 공식 시작됐답니다. 불과 27일 만에 수도 바르샤바가 함락됐고, 동쪽에서는 소련군도 침공해 폴란드는 두 강대국에 의해 분할 점령됐어요. 그 후 바르샤바는 점령 기간 내내 처절한 저항의 도시로 남았답니다.`,
  "폴란드 Lesser Poland Voivodeship": `크라쿠프 인근 오시비엥침, 독일어로 '아우슈비츠'. 나치는 이곳에 인류 역사상 가장 거대한 절멸 수용소를 세웠어요. 1940년부터 1945년까지 유대인·폴란드인·소련군 포로 등 약 110만 명이 이곳에서 목숨을 잃었답니다. 수용소 정문의 철제 글귀 '노동이 너희를 자유케 하리라(Arbeit macht frei)'는 역사상 가장 잔혹한 거짓말로 기억돼요.`,
  "프랑스 Normandy": `1944년 6월 6일 새벽, 역사상 최대 규모의 상륙작전이 펼쳐졌어요. 미국·영국·캐나다군 15만 6천 명이 노르망디 해안 다섯 곳에 동시 상륙했답니다. 오마하 해변에서만 미군 2,000여 명이 전사했지만, 연합군은 교두보를 확보했고 이 날이 나치 독일 붕괴의 결정적 전환점이 됐어요. D-Day, 6·6은 지금도 '자유를 위한 희생'의 대명사로 불린답니다.`,
  "프랑스 Île-de-France": `1940년 6월 14일, 독일군이 무혈 입성한 파리의 거리엔 나치 깃발이 에펠탑 옆에 나부꼈어요. 프랑스는 불과 46일 만에 항복했고, 이후 4년간 독일에 점령됐답니다. 하지만 런던으로 망명한 드골 장군은 BBC 라디오를 통해 "프랑스는 전투에서 졌을지 몰라도 전쟁에서 진 게 아니다!"라고 외쳤고, 프랑스 레지스탕스는 지하에서 저항을 이어갔어요.`,
  "영국 England": `1940년 여름부터 가을, 독일 공군은 영국을 굴복시키기 위해 매일 런던과 공업도시들을 폭격했어요. '런던 대공습(The Blitz)'이라 불린 이 폭격으로 4만 명 이상의 민간인이 숨졌지만, 영국인들은 지하철 역에서 잠을 자면서도 굴복하지 않았답니다. 처칠은 "우리는 절대 항복하지 않는다"고 선언했고, 영국 공군은 독일의 제공권 장악을 끝내 막아냈어요.`,
  "러시아 Moscow Oblast": `1941년 10월, 히틀러의 독일군은 모스크바 외곽 불과 15km까지 진격했어요. 스탈린은 도시를 떠나지 않았고, 붉은 광장에서 열병식을 마친 소련군 병사들은 곧바로 최전선으로 향했답니다. 그해 겨울 영하 40도의 혹한과 소련군의 반격으로 독일군은 모스크바를 끝내 함락하지 못했어요. 이 '모스크바 전투'의 실패가 독일의 동부전선 패배의 시작이었답니다.`,
  "러시아 Volgograd Oblast": `1942년 8월부터 1943년 2월까지, 스탈린그라드에서 인류 역사상 가장 참혹한 시가전이 벌어졌어요. 독일 제6군 30만 명이 포위됐고, 영하 30도의 혹한 속에서 두 군대가 건물 하나하나를 두고 싸웠답니다. 결국 독일군 사령관 파울루스가 항복하면서 약 85만 명이 전사한 이 전투는 2차 세계대전의 진정한 전환점이 됐어요. 히틀러의 불패 신화가 이곳에서 무너졌답니다.`,
  "러시아 Leningrad Oblast": `1941년 9월부터 1944년 1월까지, 독일군은 872일간 레닌그라드(현 상트페테르부르크)를 완전 포위했어요. 식량 공급이 끊긴 도시에서 시민들은 하루 빵 125그램으로 버텼고, 굶주림과 추위로 약 80만 명의 민간인이 사망했답니다. 하지만 시민들은 끝까지 항복하지 않았고, 쇼스타코비치는 포위된 도시 안에서 교향곡 제7번을 작곡해 세계에 저항의 메시지를 전했어요.`,
  "우크라이나 Kyiv City": `1941년 9월, 키이우 인근 바비야르 계곡에서 나치 친위대는 이틀 동안 유대인 3만 3,771명을 총살했어요. 이는 단일 학살 사건으로는 홀로코스트 최대 규모 중 하나랍니다. 독일군은 증거를 없애기 위해 나중에 시신을 파내 소각까지 했어요. 소련 시절엔 이 학살이 오랫동안 묻혀 있었지만, 지금은 키이우 한복판에 추모비가 세워져 희생자들을 기리고 있답니다.`,
  "미국 Massachusetts": `1773년 12월 16일 밤, 보스턴 항구에서 미국 독립의 도화선이 당겨졌어요. 영국의 차(茶) 세금에 분노한 식민지 주민들이 인디언으로 위장하고 배에 올라 영국 동인도회사 차 상자 342개를 바다에 던져버렸답니다. '보스턴 차 사건(Boston Tea Party)'이라 불린 이 사건에 격분한 영국이 보복 법령을 내리자, 식민지 전체가 단결하여 1775년 독립전쟁이 시작됐어요.`,
  "미국 Hawaii": `1941년 12월 7일 일요일 아침, 일본 해군 항공대 353대가 진주만을 기습 공격했어요. 2시간도 안 되는 공습으로 전함 4척이 침몰하고 2,403명의 미군이 전사했답니다. 다음 날 루스벨트 대통령은 "치욕의 날(A date which will live in infamy)"이라는 연설과 함께 일본에 선전포고했고, 미국은 2차 세계대전에 본격 참전하게 됐어요.`,
  "미국 New Mexico": `1945년 7월 16일 새벽 5시 29분, 뉴멕시코 사막 '트리니티' 실험장에서 인류 역사상 첫 핵폭탄 폭발 실험이 성공했어요. '맨해튼 프로젝트'의 완성이었답니다. 폭발을 지켜본 물리학자 오펜하이머는 힌두 경전의 구절을 떠올렸어요: "이제 나는 죽음이요, 세계의 파괴자가 되었다." 3주 후, 이 기술은 히로시마와 나가사키에 실전 사용됐어요.`,
  "미국 Tennessee": `테네시주 오크리지는 1942년까지 지도에 없던 도시예요. 맨해튼 프로젝트의 핵심 시설인 우라늄 농축 공장을 짓기 위해 비밀리에 건설됐거든요. 7만 5천 명의 노동자가 이 도시에서 일했지만, 그들 대부분은 자신이 핵폭탄 재료를 만들고 있다는 사실을 전쟁이 끝날 때까지 몰랐다고 해요. 핵시대를 연 역사의 현장이 바로 이 작은 도시였답니다.`,
  "일본 Hiroshima": `1945년 8월 6일 오전 8시 15분, '리틀 보이'라는 이름의 우라늄 폭탄이 히로시마 상공 600m에서 폭발했어요. 섬광과 동시에 반경 2km 안의 건물이 모두 사라졌고, 당일 약 7만 명이 사망했답니다. 연말까지 방사선 피해로 사망자는 14만 명에 달했어요. 히로시마는 인류가 핵무기의 실상을 처음 목격한 도시로, 지금도 '피폭의 기억'을 세계에 전하고 있답니다.`,
  "이탈리아 Lazio": `1943년 7월, 연합군이 시칠리아에 상륙하자 이탈리아 파시스트 대평의회는 무솔리니를 축출하고 체포했어요. 그런데 히틀러가 SS 특공대를 보내 감금된 무솔리니를 극적으로 탈출시켰답니다. 구출된 무솔리니는 북부 이탈리아에 독일의 꼭두각시 정권을 세웠지만, 1945년 4월 도주하다 파르티잔에게 붙잡혀 처형됐어요. 그의 시신은 밀라노 광장에 거꾸로 매달려 전시됐답니다.`,
  "대한민국 South Gyeongsang": `1592년 임진왜란, 이순신 장군은 한산도 앞바다에서 '학익진(鶴翼陣)' 전술로 일본 수군을 포위해 대파했어요. 판옥선과 거북선을 앞세운 이 전투에서 일본 전선 59척이 격침됐답니다. 바다의 제해권을 빼앗긴 일본은 육군의 보급로가 끊겨 결국 전라도 진출에 실패했고, 이 한산도 대첩이 임진왜란의 판세를 뒤집는 결정적 전환점이 됐어요.`,
  "대한민국 Seoul": `1950년 6월 25일 새벽, 북한군이 38선을 넘어 기습 남침했어요. 불과 3일 만에 서울이 함락됐고, 한강 인도교는 피란민이 건너는 도중에 폭파됐답니다. 그 후 서울은 전쟁 동안 네 번이나 주인이 바뀌었어요. 9월 인천상륙작전 성공으로 수복됐다가 중국군 개입으로 다시 빼앗기고, 결국 1951년 3월에야 최종 수복됐답니다. 이 도시가 겪은 전쟁의 상처는 지금도 도시 곳곳에 남아 있어요.`
};

// ===================== 이야기 모달 =====================
function openStoryModal(regionName) {
  storyModal.classList.remove('hidden');
  document.getElementById('storyRegionName').innerText = '📍 ' + regionName;
  document.getElementById('storyText').innerText = '';
  document.getElementById('playTtsBtn').classList.add('hidden');
  document.getElementById('stopTtsBtn').classList.add('hidden');
  document.getElementById('storyLoading').classList.add('hidden');

  const key = sanitizeDocId(regionName);

  // 이미 방문한 지역이면 캐시된 이야기 사용
  if (visitedRegions[key]) {
    showStory(visitedRegions[key].story);
    return;
  }

  // 고정 스토리가 있으면 즉시 표시 (API 호출 없음)
  if (FIXED_STORIES[regionName]) {
    const story = FIXED_STORIES[regionName];
    showStory(story);
    saveVisitedRegion(regionName, story);
    markVisited(regionName);
    return;
  }

  // 고정 스토리 없으면 → Apps Script 경유 Gemini API 호출
  document.getElementById('storyLoading').classList.remove('hidden');

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ regionName: regionName })
  })
    .then(res => res.json())
    .then(data => {
      document.getElementById('storyLoading').classList.add('hidden');

      if (data.error) {
        document.getElementById('storyText').innerText = '오류가 발생했어요: ' + data.error;
        return;
      }

      showStory(data.story);
      saveVisitedRegion(regionName, data.story);
      markVisited(regionName);
    })
    .catch(err => {
      document.getElementById('storyLoading').classList.add('hidden');
      document.getElementById('storyText').innerText = '네트워크 오류가 발생했어요: ' + err.message;
    });
}

function showStory(story) {
  document.getElementById('storyText').innerText = story;
  document.getElementById('playTtsBtn').classList.remove('hidden');
  document.getElementById('stopTtsBtn').classList.remove('hidden');
}

document.getElementById('closeModalBtn').addEventListener('click', () => {
  storyModal.classList.add('hidden');
  stopTts();
});

// ===================== TTS =====================
document.getElementById('playTtsBtn').addEventListener('click', () => {
  const text = document.getElementById('storyText').innerText;
  stopTts();
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.lang = 'ko-KR';
  currentUtterance.rate = 1.0;
  speechSynthesis.speak(currentUtterance);
});

document.getElementById('stopTtsBtn').addEventListener('click', stopTts);

function stopTts() {
  speechSynthesis.cancel();
}

// ===================== Firebase Realtime Database 저장/불러오기 =====================
function saveVisitedRegion(regionName, story) {
  if (!currentUser) {
    console.error('저장 실패: 로그인된 사용자가 없습니다.');
    return;
  }

  const key = sanitizeDocId(regionName);
  const data = {
    regionName: regionName,
    story: story,
    visitedAt: new Date().toISOString() // ISO 문자열로 보존
  };

  db.ref('users/' + currentUser.uid + '/visited_regions/' + key)
    .set(data)
    .then(() => {
      visitedRegions[key] = data;
      console.log('✅ RTDB 저장 성공:', regionName);
    })
    .catch(err => {
      console.error('❌ RTDB 저장 오류:', err.code, err.message);
    });
}

function loadVisitedRegions() {
  if (!currentUser) return;

  db.ref('users/' + currentUser.uid + '/visited_regions')
    .once('value')
    .then(snapshot => {
      visitedRegions = {};
      const data = snapshot.val();
      if (data) {
        Object.entries(data).forEach(([key, item]) => {
          visitedRegions[key] = item;
          const displayName = item.regionName || key.replace(/_/g, ' ');
          markVisited(displayName);
        });
      }
      console.log('✅ RTDB 방문 기록', Object.keys(visitedRegions).length + '건 불러옴');
    })
    .catch(err => {
      console.error('❌ RTDB 불러오기 오류:', err.code, err.message);
    });
}

// ===================== 마이페이지 =====================
document.getElementById('myPageBtn').addEventListener('click', () => {
  mainScreen.classList.add('hidden');
  myPageScreen.classList.remove('hidden');
  renderMyPage();
});

document.getElementById('backToMapBtn').addEventListener('click', () => {
  myPageScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  refreshMap();
});

function renderMyPage() {
  const totalRegions = Object.keys(countryLayers).length;
  const visitedCount = Object.keys(visitedRegions).length;
  document.getElementById('progressText').innerText =
    `🌍 전체 ${totalRegions}개 지역 중 ${visitedCount}개 탐험 완료!`;

  const listEl = document.getElementById('visitedList');
  listEl.innerHTML = '';

  if (visitedCount === 0) {
    listEl.innerHTML = '<p class="hint">아직 탐험한 지역이 없어요. 지도에서 지역을 클릭해보세요!</p>';
    return;
  }

  // ⚠️ [수정 포인트] ISO 문자열을 안전하게 Date 객체로 파싱하여 정렬
  const entries = Object.entries(visitedRegions).sort((a, b) => {
    const aTime = a[1].visitedAt ? new Date(a[1].visitedAt) : new Date(0);
    const bTime = b[1].visitedAt ? new Date(b[1].visitedAt) : new Date(0);
    return bTime - aTime;
  });

  entries.forEach(([key, item]) => {
    const displayName = item.regionName || key.replace(/_/g, ' ');
    const div = document.createElement('div');
    div.className = 'visited-item';

    const dateStr = item.visitedAt ? new Date(item.visitedAt).toLocaleDateString('ko-KR') : '';

    div.innerHTML = `
      <h4>📍 ${displayName}</h4>
      <p>${item.story}</p>
      <div class="date">${dateStr}</div>
    `;

    div.addEventListener('click', () => {
      myPageScreen.classList.add('hidden');
      mainScreen.classList.remove('hidden');
      refreshMap();
      openStoryModal(displayName);
    });

    listEl.appendChild(div);
  });
}

function showError(msg) {
  document.getElementById('loginError').innerText = msg;
}
