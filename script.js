// =====================================================
// Apps Script 웹앱 URL
// 배포 후 받은 URL로 교체하세요
// =====================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx0MJs1E35KWDHBKapXPkfNaIIV7vh94hiW9GLZQQfAGhP-sQ_LSvUhe8kYFjyjGUe71A/exec";

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
const db = firebase.firestore();

let currentUser = null;
let currentUtterance = null;
let visitedRegions = {}; // { sanitizedKey: { regionName, story, visitedAt } }

// ===================== 화면 요소 =====================
const loginScreen   = document.getElementById('loginScreen');
const mainScreen    = document.getElementById('mainScreen');
const myPageScreen  = document.getElementById('myPageScreen');
const storyModal    = document.getElementById('storyModal');

// =====================================================
// Firestore 문서 ID 안전화
// Firestore 문서 ID에는 슬래시(/)가 불가, 공백 등 특수문자도 문제 발생
// 원본 지역명 → 안전한 키로 변환
// =====================================================
function sanitizeDocId(regionName) {
  // 공백 → '_', 슬래시 → '-', 그 외 특수문자 → 제거
  return regionName
    .replace(/\//g, '-')
    .replace(/\s+/g, '_')
    .replace(/[.#$\[\]]/g, '')
    .substring(0, 200); // Firestore 문서 ID 최대 길이 제한
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

function showError(msg) {
  document.getElementById('loginError').innerText = msg;
}

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
  "South Korea": "대한민국",
  "Republic of Korea": "대한민국",
  "China": "중국",
  "Japan": "일본",
  "United States of America": "미국",
  "United States": "미국",
  "Mexico": "멕시코",
  "Brazil": "브라질",
  "Peru": "페루",
  "France": "프랑스",
  "Germany": "독일",
  "Italy": "이탈리아",
  "Spain": "스페인",
  "United Kingdom": "영국",
  "Greece": "그리스",
  "Turkey": "튀르키예",
  "Russia": "러시아",
  "India": "인도",
  "Iran": "이란",
  "Iraq": "이라크",
  "Egypt": "이집트",
  "Israel": "이스라엘",
  "Vietnam": "베트남",
  "Mongolia": "몽골",
  "Indonesia": "인도네시아",
  "Cambodia": "캄보디아",
  "Ethiopia": "에티오피아",
  "Australia": "호주",
  "Canada": "캐나다",
  "Argentina": "아르헨티나",
  "Chile": "칠레",
  "Colombia": "콜롬비아",
  "Saudi Arabia": "사우디아라비아",
  "Pakistan": "파키스탄",
  "Bangladesh": "방글라데시",
  "Thailand": "태국",
  "Malaysia": "말레이시아",
  "Philippines": "필리핀",
  "Myanmar": "미얀마",
  "Nepal": "네팔",
  "Afghanistan": "아프가니스탄",
  "Ukraine": "우크라이나",
  "Poland": "폴란드",
  "Netherlands": "네덜란드",
  "Belgium": "벨기에",
  "Sweden": "스웨덴",
  "Norway": "노르웨이",
  "Denmark": "덴마크",
  "Finland": "핀란드",
  "Portugal": "포르투갈",
  "Austria": "오스트리아",
  "Switzerland": "스위스",
  "Czech Republic": "체코",
  "Romania": "루마니아",
  "Hungary": "헝가리",
  "Morocco": "모로코",
  "Algeria": "알제리",
  "South Africa": "남아프리카공화국",
  "Kenya": "케냐",
  "Nigeria": "나이지리아",
  "Sudan": "수단",
  "Libya": "리비아",
  "New Zealand": "뉴질랜드"
};

function buildRegionLabel(feature) {
  const props = feature.properties;
  const provinceName = props.name || props.gn_name || props.woe_name || '알수없음';
  const countryNameEn = props.admin || props.geonunit || '';
  const countryNameKo = COUNTRY_NAME_KO[countryNameEn] || countryNameEn;

  if (countryNameKo) {
    return `${countryNameKo} ${provinceName}`;
  }
  return provinceName;
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

  // 처음 방문 → Apps Script 경유 Gemini API 호출
  document.getElementById('storyLoading').classList.remove('hidden');

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    // CORS 우회: Apps Script는 text/plain으로 받아도 JSON 파싱 가능
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

// ===================== Firestore 저장/불러오기 =====================
function saveVisitedRegion(regionName, story) {
  if (!currentUser) {
    console.error('저장 실패: 로그인된 사용자가 없습니다.');
    return;
  }

  const key = sanitizeDocId(regionName);
  console.log('💾 Firestore 저장 시도:', regionName, '→ key:', key, '/ uid:', currentUser.uid);

  const data = {
    regionName: regionName,
    story: story,
    visitedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection('users')
    .doc(currentUser.uid)
    .collection('visited_regions')
    .doc(key)
    .set(data)
    .then(() => {
      visitedRegions[key] = { regionName, story, visitedAt: new Date() };
      console.log('✅ Firestore 저장 성공:', regionName);
    })
    .catch(err => {
      console.error('❌ Firestore 저장 오류 코드:', err.code);
      console.error('❌ Firestore 저장 오류 메시지:', err.message);
      if (err.message && (err.message.includes('has not been used') || err.code === 'permission-denied')) {
        alert(
          'Firestore 저장 실패

' +
          'Firebase 콘솔에서 Firestore Database를 활성화해야 합니다.

' +
          '① https://console.firebase.google.com 접속
' +
          '② 프로젝트 선택 → Firestore Database 클릭
' +
          '③ 데이터베이스 만들기 버튼 클릭 후 활성화
' +
          '④ 보안 규칙: allow read, write: if true; 로 설정'
        );
      }
    });
}

function loadVisitedRegions() {
  if (!currentUser) return;

  db.collection('users')
    .doc(currentUser.uid)
    .collection('visited_regions')
    .get()
    .then(snapshot => {
      visitedRegions = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        visitedRegions[doc.id] = data;

        // data.regionName(원본)이 있으면 그걸로, 없으면 doc.id를 복원해서 사용
        const displayName = data.regionName || doc.id.replace(/_/g, ' ');
        markVisited(displayName);
      });
      console.log(`✅ 방문 기록 ${snapshot.size}건 불러옴`);
    })
    .catch(err => {
      console.error('❌ Firestore 불러오기 오류:', err.code, err.message);
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

  // 최신 방문순 정렬
  const entries = Object.entries(visitedRegions).sort((a, b) => {
    const aTime = a[1].visitedAt && a[1].visitedAt.toDate ? a[1].visitedAt.toDate() : new Date(0);
    const bTime = b[1].visitedAt && b[1].visitedAt.toDate ? b[1].visitedAt.toDate() : new Date(0);
    return bTime - aTime;
  });

  entries.forEach(([key, item]) => {
    const displayName = item.regionName || key.replace(/_/g, ' ');
    const div = document.createElement('div');
    div.className = 'visited-item';

    const dateStr = item.visitedAt && item.visitedAt.toDate
      ? item.visitedAt.toDate().toLocaleDateString('ko-KR')
      : '';

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
